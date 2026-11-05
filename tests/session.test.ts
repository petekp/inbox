import { expect, test } from 'claude-code/testing'

import { flattenConversation } from '../hooks/conversation'
import { emptySession } from '../hooks/session-files'
import { noteCommandOutput } from '../hooks/session-turns'
import { sessionView } from '../hooks/session-view'
import { askOverConversation, reconcileUpdateStatus, runUpdates } from '../hooks/session-host'
import { cutOffUpdate } from '../hooks/mod-sessions'
import type { CallKind, CatchUpReply } from '../hooks/session-host'
import { CLAUDE_CODE } from '../hooks/model-text'
import { STATUS_SYSTEM } from '../hooks/status-prompt'
import type { StatusCall } from '../hooks/status-records'
import { footerStatus } from '../hooks/view'
import type { Session } from '../types'
import { fakeHost } from './session-fake-host'
import { runSessionScript } from './session-script'
import { LEDGER_REPLY, finishTurn } from './session-helpers'

test('one scripted session runs through the shared session functions', async () => {
  await runSessionScript(fakeHost, (actual, expected, label) => expect(actual, label).toEqual(expected))
})

test('a command that prints local URLs notes each once, and gh pr create links the PR it names', () => {
  const printed = 'Local: http://localhost:5173/app\nAlso http://localhost:5173/app and http://api.localhost:3000.\n'
  const served = noteCommandOutput(emptySession(), 'npm run dev', printed)
  expect(served.turn.activity).toEqual([
    'URL in output: http://localhost:5173/app',
    'URL in output: http://api.localhost:3000.',
  ])
  expect(served.ledger.prs).toEqual([])

  const opened = noteCommandOutput(served, 'gh pr create --fill', 'https://github.com/acme/app/pull/12\n')
  expect(opened.ledger.prs).toEqual(['acme/app#12'])
  expect(opened.turn.activity).toEqual(served.turn.activity)

  const echoed = noteCommandOutput(opened, 'echo done', 'https://github.com/acme/app/pull/99\n')
  expect(echoed).toBe(opened)
})

test('a PR already linked keeps its place when gh pr create names it again with a new one', () => {
  const linked = noteCommandOutput(emptySession(), 'gh pr create', 'https://github.com/acme/app/pull/1\n')
  const second = noteCommandOutput(linked, 'gh pr create', 'https://github.com/acme/app/pull/2\n')
  const again = noteCommandOutput(second, 'gh pr create', 'https://github.com/acme/app/pull/1\n')
  expect(again.ledger.prs).toEqual(['acme/app#1', 'acme/app#2'])
})

const UNANSWERED: StatusCall = { exchange: { kind: 'catch-up', conversation: '' }, ask: async () => null }

const reading = (reply: CatchUpReply, calls: { catchUps: number; asks: number }) => ({
  ask: async () => (calls.asks++, null),
  catchUp: async () => (calls.catchUps++, reply),
})

test('a failed update catches up over the whole conversation instead of retrying its exchange', async () => {
  const calls = { catchUps: 0, asks: 0 }
  const { host } = fakeHost(async () => null)
  await host.update(s => {
    const finished = finishTurn(s, 'Which runtime?')

    return { ...finished, presence: { ...finished.presence, ledgerState: 'failed' as const } }
  })
  await runUpdates({
    ...host,
    ...reading({ kind: 'reply', text: LEDGER_REPLY, source: 'Person: go', statusCall: UNANSWERED, heard: null }, calls),
  })

  const after = await host.read()
  expect(calls).toEqual({ catchUps: 1, asks: 0 })
  expect(after.pending).toEqual([])
  expect(after.ledger.items.map(i => i.ask)).toEqual(['Use Node or Python?'])
  expect(after.presence).toMatchObject({ ledgerState: 'current', turnsApplied: 1, isUpdating: false })
})

test('a conversation that cannot be read runs the pending exchanges, and ends the run when none are left', async () => {
  const calls = { catchUps: 0, asks: 0 }
  const { host } = fakeHost(async () => LEDGER_REPLY)
  await host.update(s => ({ ...s, presence: { ...s.presence, ledgerState: 'behind' as const } }))
  await runUpdates({ ...host, catchUp: reading({ kind: 'unreadable' }, calls).catchUp })
  expect(calls.catchUps).toBe(1)
  expect((await host.read()).presence.isUpdating).toBe(false)

  await host.update(s => finishTurn(s, 'Which runtime?'))
  await runUpdates({ ...host, catchUp: reading({ kind: 'unreadable' }, calls).catchUp })
  expect(calls.catchUps).toBe(2)
  expect((await host.read()).ledger.items.map(i => i.ask)).toEqual(['Use Node or Python?'])
})

test('a catch-up that gets no usable answer ends the run, and the next update tries it again', async () => {
  const calls = { catchUps: 0, asks: 0 }
  const { host } = fakeHost(async () => null)
  await host.update(s => ({ ...s, presence: { ...s.presence, ledgerState: 'behind' as const } }))
  await runUpdates({
    ...host,
    ...reading(
      {
        kind: 'reply',
        text: 'not a ledger',
        source: null,
        statusCall: UNANSWERED,
        heard: { text: 'not a ledger', report: { model: 'sonnet' }, thrown: null, ms: 30 },
      },
      calls,
    ),
  })
  expect(calls.catchUps).toBe(1)
  expect((await host.read()).presence.ledgerState).toBe('failed')
  expect((await host.read()).callFailures.ledger.lastFailure).toMatchObject({
    reads: 'catch-up',
    isRetry: null,
    cause: 'unparseable',
  })

  const noAnswer = {
    text: null,
    report: { model: 'sonnet', error: 'aborted', cause: 'error' as const },
    thrown: null,
    ms: 5,
  }
  await runUpdates({ ...host, ...reading({ kind: 'failed', heard: noAnswer }, calls) })
  expect(calls.catchUps).toBe(2)
  expect((await host.read()).callFailures.ledger.lastFailure).toMatchObject({
    reads: 'catch-up',
    cause: 'error',
    error: 'aborted',
  })
})

test('an exchange that ends during a catch-up is still run afterward', async () => {
  const { host } = fakeHost(async () => LEDGER_REPLY)
  await host.update(s => ({ ...s, presence: { ...s.presence, ledgerState: 'behind' as const } }))
  await runUpdates({
    ...host,
    catchUp: async () => {
      await host.update(s => finishTurn(s, 'Which runtime?'))
      return { kind: 'reply', text: 'NONE', source: null, statusCall: UNANSWERED, heard: null }
    },
  })

  const after = await host.read()
  expect(after.pending).toEqual([])
  expect(after.ledger.items.map(i => i.ask)).toEqual(['Use Node or Python?'])
})

test('a dropped reply keeps the warning through later good updates, until a catch-up covers it', async () => {
  const calls = { catchUps: 0, asks: 0 }
  let answer: string | null = null
  const { host } = fakeHost(async () => answer)
  await host.update(s => finishTurn(s, 'Which runtime?'))
  await runUpdates(host)
  await runUpdates(host)
  expect((await host.read()).pending).toEqual([])
  expect((await host.read()).presence).toMatchObject({ ledgerState: 'failed', hasDroppedReply: true })

  answer = LEDGER_REPLY
  await host.update(s => finishTurn(s, 'Done.'))
  await runUpdates(host)
  const kept = await host.read()
  expect(kept.ledger.items.map(i => i.ask)).toEqual(['Use Node or Python?'])
  expect(sessionView(kept, 0, host.settleWindowMs).status.error).toMatch(
    /^The inbox couldn't update from the agent's recent replies, even on a retry\..*tries again after the next reply\.$/,
  )

  await runUpdates({
    ...host,
    ...reading({ kind: 'reply', text: LEDGER_REPLY, source: null, statusCall: UNANSWERED, heard: null }, calls),
  })
  expect((await host.read()).presence).toMatchObject({ ledgerState: 'current', hasDroppedReply: false })
  expect(calls.catchUps).toBe(1)
})

const NO_PRS = { isFetching: false, hasPrs: false }
const shownStatus = (s: Session) => footerStatus('needsYou', sessionView(s, 0, 1_000).status, NO_PRS, null)

test('a failed catch-up waits for the next reply, says when a retry fails again, and clears once one applies', async () => {
  const calls = { catchUps: 0, asks: 0 }
  const { host } = fakeHost(async () => null)
  await host.update(s => ({ ...s, presence: { ...s.presence, ledgerState: 'behind' as const } }))
  await runUpdates({ ...host, ...reading({ kind: 'failed', heard: null }, calls) })
  expect(shownStatus(await host.read()).error).toBe(
    "The inbox couldn't update from the agent's last reply. Questions, tasks and findings from it may be missing. It tries again after the next reply.",
  )

  let duringRetry: ReturnType<typeof shownStatus> | null = null
  await runUpdates({
    ...host,
    catchUp: async () => {
      duringRetry = shownStatus(await host.read())
      return { kind: 'failed', heard: null }
    },
  })
  expect(duringRetry).toEqual({ text: 'Retrying the last update…', error: null })
  expect(shownStatus(await host.read()).error).toBe(
    "The inbox couldn't update from the agent's recent replies, even on a retry. Questions, tasks and findings from them may be missing. It tries again after the next reply.",
  )

  await runUpdates({
    ...host,
    ...reading({ kind: 'reply', text: LEDGER_REPLY, source: null, statusCall: UNANSWERED, heard: null }, calls),
  })
  expect(shownStatus(await host.read())).toEqual({ text: null, error: null })
})

test('a catch-up that cannot read the conversation still promises the next retry, and one that reads it clears the warning', async () => {
  const calls = { catchUps: 0, asks: 0 }
  const { host } = fakeHost(async () => null)
  await host.update(s => ({ ...s, presence: { ...s.presence, ledgerState: 'failed' as const, failedAttempts: 1 } }))

  await runUpdates({ ...host, ...reading({ kind: 'unreadable' }, calls) })
  expect(shownStatus(await host.read()).error).toBe(
    "The inbox couldn't read this conversation. Questions, tasks and findings from the agent's last reply may be missing. It tries again after the next reply.",
  )

  await runUpdates({
    ...host,
    ...reading({ kind: 'reply', text: LEDGER_REPLY, source: null, statusCall: UNANSWERED, heard: null }, calls),
  })
  expect(calls.catchUps).toBe(2)
  expect((await host.read()).presence.isConversationUnreadable).toBe(false)
  expect(shownStatus(await host.read()).error).toBeNull()
})

test('a pending exchange is retried on its own, so an unreadable conversation still reads as waiting', async () => {
  const { host } = fakeHost(async () => null)
  await host.update(s => finishTurn(s, 'Which runtime?'))
  await runUpdates({ ...host, catchUp: undefined })
  await host.update(s => ({ ...s, presence: { ...s.presence, isConversationUnreadable: true } }))
  expect(shownStatus(await host.read()).error).toBe(
    "The inbox couldn't update from the agent's last reply. Questions, tasks and findings from it may be missing. It tries again after the next reply.",
  )
})

test('an update cut off after one failure still reads as waiting to retry, not as failing again', async () => {
  const { host } = fakeHost(async () => null)
  await host.update(s => finishTurn(s, 'Which runtime?'))
  await runUpdates({ ...host, catchUp: undefined })
  await host.update(s => ({ ...s, presence: { ...s.presence, isUpdating: true } }))
  await reconcileUpdateStatus(host)
  expect((await host.read()).pending[0]?.failed).toBe(true)
  expect(shownStatus(await host.read()).error).toMatch(/^The inbox couldn't update from the agent's last reply\./)

  const running = { ...(await host.read()), pending: [] }
  const cutOff = cutOffUpdate({ ...running, presence: { ...running.presence, isUpdating: true } })
  expect(cutOff.presence).toMatchObject({ ledgerState: 'failed', failedAttempts: 1 })
  expect(shownStatus(cutOff).error).toMatch(/^The inbox couldn't update from the agent's last reply\./)
})

test('each model call says which call of the update it is: a first try, the retry of a failed exchange, a Status call asked again after prose, and a catch-up', async () => {
  const kinds: CallKind[] = []
  const ledgerAnswers = [null, LEDGER_REPLY]
  const statusAnswers = ['Here is where things stand.', 'NO CHANGE']
  const { host } = fakeHost(async (_prompt, system, kind) => {
    kinds.push(kind)
    return (system === STATUS_SYSTEM ? statusAnswers : ledgerAnswers).shift() ?? null
  })
  await host.update(s => finishTurn(s, 'Which runtime?'))
  await runUpdates({ ...host, catchUp: undefined })
  expect((await host.read()).callFailures.ledger.lastFailure?.cause).toBe('no-reply')
  await runUpdates({ ...host, catchUp: undefined })
  await askOverConversation(host, CLAUDE_CODE, await host.read(), '', 'Person: go')

  expect(kinds).toEqual([
    { call: 'ledger', reads: 'reply', isRetry: false },
    { call: 'ledger', reads: 'reply', isRetry: true },
    { call: 'status', reads: 'reply', isRetry: false },
    { call: 'status', reads: 'reply', isRetry: true },
    { call: 'ledger', reads: 'catch-up' },
  ])
})

test('each call’s last failure is saved in its own record with its cause, a process failure apart from an unparseable answer, without the answer’s text, and the call’s next usable answer marks its recovery', async () => {
  const process = {
    cli: '/codex',
    code: 1,
    stderr: 'ERROR: overloaded',
    signal: null,
    errorCode: null,
    timeoutMs: null,
  }
  const ledgerAnswers = [null, 'not a ledger', LEDGER_REPLY]
  const statusAnswers = ['Here is where things stand.', 'NO CHANGE']
  const { host } = fakeHost(async (_prompt, system, _kind, report) => {
    const answer = (system === STATUS_SYSTEM ? statusAnswers : ledgerAnswers).shift() ?? null
    report?.(answer === null ? { model: 'm', error: 'codex exec exited 1', cause: 'process', process } : { model: 'm' })
    return answer
  })
  const failure = async () => {
    const s = await host.read()
    return { ...s.callFailures.ledger, status: s.callFailures.status, saved: JSON.stringify(s) }
  }
  await host.update(s => finishTurn(s, 'Which runtime?'))
  await runUpdates({ ...host, catchUp: undefined })
  const byProcess = await failure()
  await runUpdates({ ...host, catchUp: undefined })
  const unparseable = await failure()
  await host.update(s => finishTurn(s, 'Which runtime now?'))
  await runUpdates({ ...host, catchUp: undefined })
  const recovered = await failure()

  expect(byProcess.lastFailure).toMatchObject({
    call: 'ledger',
    reads: 'reply',
    isRetry: false,
    cause: 'process',
    model: 'm',
    error: 'codex exec exited 1',
    answerChars: null,
    process,
  })
  expect(byProcess.recoveredAt).toBeNull()
  expect(unparseable.lastFailure).toMatchObject({
    isRetry: true,
    cause: 'unparseable',
    error: null,
    answerChars: 'not a ledger'.length,
    process: null,
  })
  expect(unparseable.saved).not.toContain('not a ledger')
  expect(recovered.lastFailure).toEqual(unparseable.lastFailure)
  expect(recovered.recoveredAt).toEqual(expect.any(Number))
  expect(recovered.status.lastFailure).toMatchObject({
    call: 'status',
    reads: 'reply',
    isRetry: false,
    cause: 'unparseable',
  })
  expect(recovered.status.recoveredAt).toBe(recovered.status.lastFailure!.at)
  expect(recovered.saved).not.toContain('Here is where things stand.')
})

test('the conversation keeps its newest lines when it is too long, and leaves out the inbox notes', () => {
  const long = 'x'.repeat(6000)
  const turns = Array.from({ length: 20 }, (_, i) => [
    { role: 'person' as const, text: `question ${i}`, activity: [] },
    { role: 'agent' as const, text: long, activity: [`ran: step ${i}`] },
  ]).flat()
  const text = flattenConversation([{ role: 'person', text: 'inbox: nothing waits', activity: [] }, ...turns])

  expect(text.startsWith('(earlier conversation left out)')).toBe(true)
  expect(text.endsWith('Agent ran: step 19')).toBe(true)
  expect(text).not.toContain('inbox: nothing waits')
})
