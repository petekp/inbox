import { expect, test } from 'claude-code/testing'

import { flattenConversation } from '../hooks/conversation'
import { EMPTY, applyUpdate, parseReply, upgradeLedger } from '../hooks/ledger'
import { applyOverview, parseOverview, withChild } from '../hooks/overview'
import { CLAUDE_CODE, OVERVIEW_SYSTEM } from '../hooks/model-text'
import {
  appliedCatchUp,
  appliedOverview,
  cleared,
  claimedOverviewRefresh,
  emptySession,
  endTurn,
  failedOverview,
  forkedFrom,
  hasLedger,
  isUnseen,
  noteActivity,
  noteCommandOutput,
  OVERVIEW_REFRESH_MS,
  notePrompt,
  pressOn,
  pruned,
  recordPrompt,
  recorded,
  sessionView,
  startContext,
  turnEnded,
  turnStarted,
  upgradeSession,
  withFetchedPrs,
} from '../hooks/session'
import type { Session } from '../hooks/session'
import type { Item, PrView, RowNote } from '../types'
import {
  isPrFetchDue,
  OVERVIEW_RECORD_VERSION,
  overviewCallPrompt,
  prFetchTracker,
  RECORDS_KEPT_MS,
  RECORDS_PER_SESSION,
  press,
  recordFileName,
  refreshOverview,
  runUpdates,
  wakeForDone,
  writeOverviewRecord,
} from '../hooks/session-host'
import type { CatchUpReply, OverviewCall, OverviewRecord, RecordFiles } from '../hooks/session-host'
import { allRows, COMPARE_LIMIT_MS, feedbackOf, feedbackText, footerStatus, NO_HOLDS } from '../hooks/view'
import { checkRowId, prMarkId } from '../hooks/pr-tab'
import { demoSession, demoView, isDemoCopy } from '../hooks/demo'
import { fakeHost } from './session-fake-host'
import { runSessionScript } from './session-script'

test('one scripted session runs through the shared session functions', async () => {
  await runSessionScript(fakeHost, (actual, expected, label) => expect(actual, label).toEqual(expected))
})

test('a refused Done message leaves its row reading Not sent, with Undo', async () => {
  let clock = 1_000_000
  const scripted = fakeHost(async () => null).host
  const host = {
    ...scripted,
    now: () => clock,
    deliver: async () => ({ state: 'rejected' as const, reason: 'queue refused' }),
  }
  await host.update(s => recorded(CLAUDE_CODE, s, 'record', { kind: 'task', ask: 'Sign in to npm' }, clock).state)
  const id = (await host.read()).ledger.items[0]!.id
  await press(host, { action: 'done', id }, false, NO_HOLDS)
  clock += host.settleWindowMs
  await wakeForDone(host)
  const view = sessionView(await host.read(), clock, host.settleWindowMs, true)

  expect(view.needsYou.closed.tasks.map(c => c.delivery)).toEqual([{ error: 'queue refused', canUndo: true }])
})

test('Compare reads Comparing… after its reply until the agent records the question again with its page, or until its limit passes', async () => {
  const { host, delivered } = fakeHost(async () => 'NONE')
  const record = async (args: Record<string, unknown>) => {
    let result = ''
    await host.update(async s => {
      const r = recorded(CLAUDE_CODE, s, 'record', args, await host.now())
      result = r.result
      return r.state
    })
    return result
  }
  const turn = async (prompt: string, reply: string) => {
    await host.update(s => notePrompt(CLAUDE_CODE, s, prompt, false).state)
    await host.update(s => endTurn(CLAUDE_CODE, s, reply, false))
    await runUpdates(host)
  }
  const question = {
    kind: 'question',
    ask: 'Which cache should the API use?',
    options: ['Redis', 'In-memory'],
    design_choice: true,
  }
  await host.update(s => notePrompt(CLAUDE_CODE, s, 'Add caching to the API', false).state)
  await record(question)
  await host.update(s => endTurn(CLAUDE_CODE, s, 'Which cache should the API use?', false))
  await runUpdates(host)
  const id = (await host.read()).ledger.items[0]!.id
  const row = async (later = 0) => {
    const view = sessionView(await host.read(), (await host.now()) + later, host.settleWindowMs, true)
    const r = allRows(view).find(x => x.id === id)!

    return { feedback: r.feedback && feedbackText(r.feedback, 'terminal'), actions: r.actions.map(a => a.label) }
  }

  await press(host, { action: 'compare', id }, false, NO_HOLDS)
  await turn(delivered.at(-1)!, 'A subagent is comparing the two caches.')
  expect(await row()).toEqual({
    feedback: 'Comparing…',
    actions: ['Redis', 'In-memory', 'Reply', 'Explain', 'Compare', 'Dismiss'],
  })
  expect(await row(COMPARE_LIMIT_MS)).toEqual({
    feedback: 'No comparison came back',
    actions: ['Redis', 'In-memory', 'Reply', 'Explain', 'Compare again', 'Dismiss'],
  })

  const reported = await record({ ...question, steps: ['/tmp/project/.scratch/compare/caches.html', 'npm test'] })
  expect(reported).toBe(
    'Already open, so this record updated it and added its new steps. Some steps were not an absolute file path or a link, so they are left out.',
  )
  expect(await row()).toEqual({
    feedback: '✓ Compared',
    actions: ['Redis', 'In-memory', 'Open caches.html', 'Reply', 'Explain', 'Compare again', 'Dismiss'],
  })

  await press(host, { action: 'compare', id }, false, NO_HOLDS)
  await turn(delivered.at(-1)!, 'A subagent is comparing the two caches again.')
  expect(await row()).toEqual({
    feedback: 'Comparing…',
    actions: ['Redis', 'In-memory', 'Open caches.html', 'Reply', 'Explain', 'Compare again', 'Dismiss'],
  })
})

test('while a press is out, its button stays out and a second press sends nothing, even when a newer note shows on the row', async () => {
  const { host } = fakeHost(async () => null)
  const question = { kind: 'question', ask: 'Ship it?', options: ['Yes', 'No'] }
  await host.update(s => recorded(CLAUDE_CODE, s, 'record', question, 1).state)
  const id = (await host.read()).ledger.items[0]!.id
  await press(host, { action: 'explain', id }, false, NO_HOLDS)
  const s = await host.read()
  const at = await host.now()
  const explainOf = (notes: Record<string, RowNote>) => {
    const row = allRows(sessionView(s, at, host.settleWindowMs, true, NO_HOLDS, notes)).find(r => r.id === id)!
    const explain = row.actions.find(a => a.press.action === 'explain')!

    return { feedback: row.feedback?.is, label: explain.label, isOut: explain.isOut }
  }
  const again = pressOn(
    s,
    { action: 'explain', id },
    at,
    { settleWindowMs: host.settleWindowMs, holds: NO_HOLDS },
    host,
  )

  expect('stale' in again ? null : again.effects).toEqual([])
  expect(explainOf({})).toEqual({ feedback: 'working', label: 'Explain', isOut: true })
  expect(explainOf({ [id]: { note: 'stale', at } })).toEqual({ feedback: 'note', label: 'Explain', isOut: true })
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

const LEDGER_REPLY = 'NEW: decide | 1 | Use Node or Python? | Node / Python | Node'

const finishTurn = (s: Session, reply: string) =>
  endTurn(CLAUDE_CODE, notePrompt(CLAUDE_CODE, s, 'go', false).state, reply, false)

const UNANSWERED: OverviewCall = { exchange: { kind: 'catch-up', conversation: '' }, ask: async () => null }

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
    ...reading({ kind: 'reply', text: LEDGER_REPLY, source: 'Person: go', overview: UNANSWERED }, calls),
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
    ...reading({ kind: 'reply', text: 'not a ledger', source: null, overview: UNANSWERED }, calls),
  })
  expect(calls.catchUps).toBe(1)
  expect((await host.read()).presence.ledgerState).toBe('failed')

  await runUpdates({ ...host, ...reading({ kind: 'failed' }, calls) })
  expect(calls.catchUps).toBe(2)
})

test('an exchange that ends during a catch-up is still run afterward', async () => {
  const { host } = fakeHost(async () => LEDGER_REPLY)
  await host.update(s => ({ ...s, presence: { ...s.presence, ledgerState: 'behind' as const } }))
  await runUpdates({
    ...host,
    catchUp: async () => {
      await host.update(s => finishTurn(s, 'Which runtime?'))
      return { kind: 'reply', text: 'NONE', source: null, overview: UNANSWERED }
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
  const retryPromise = 'retries after your next message'
  expect(sessionView(kept, 0, host.settleWindowMs, false).status.error).toContain('Last update failed')
  expect(sessionView(kept, 0, host.settleWindowMs, false).status.error).not.toContain(retryPromise)
  expect(sessionView(kept, 0, host.settleWindowMs, true).status.error).toContain(retryPromise)

  await runUpdates({
    ...host,
    ...reading({ kind: 'reply', text: LEDGER_REPLY, source: null, overview: UNANSWERED }, calls),
  })
  expect((await host.read()).presence).toMatchObject({ ledgerState: 'current', hasDroppedReply: false })
  expect(calls.catchUps).toBe(1)
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

const answer = parseOverview('GOAL: Work offline\nNEW: working | Offline mode | queue built')!

const withOverview = (s: Session): Session => ({
  ...s,
  ledger: { ...EMPTY, overview: applyOverview(null, answer, 1000, new Set()) },
})

test('an Overview answer is written to the ledger after later updates and clears a saved failure, and both are dropped when their update is gone', () => {
  const later = { ...emptySession(), presence: { ...emptySession().presence, turnsApplied: 5 } }
  const failed = failedOverview(later, 'The person wants a CLI.', 3, 900)

  expect(failed.overviewFailure).toEqual({ at: 900, cause: 'refused', answer: 'The person wants a CLI.' })
  expect(failedOverview(later, null, 3, 900).overviewFailure).toEqual({ at: 900, cause: 'no-answer', answer: null })
  expect(appliedOverview(failed, answer, 3, 1000).ledger.overview?.goal).toBe('Work offline')
  expect(appliedOverview(failed, answer, 3, 1000).overviewFailure).toBeNull()
  expect(appliedOverview(emptySession(), answer, 3, 1000).ledger.overview).toBeNull()
  expect(failedOverview(emptySession(), null, 3, 900).overviewFailure).toBeNull()
  expect(cleared(failed).overviewFailure).toBeNull()
})

test('a session whose only record is an Overview has a ledger, is not unseen, is copied by a fork and is cleared', () => {
  const parent = withOverview(emptySession())
  const onlyChildren = withChild(
    null,
    { ref: 't1', kind: 'subagent', name: 'Review', startedAt: 1, endedAt: null, lastActivityAt: 1 },
    1,
  )

  expect(hasLedger(emptySession())).toBe(false)
  expect(isUnseen(emptySession())).toBe(true)
  expect(hasLedger(parent)).toBe(true)
  expect(isUnseen(parent)).toBe(false)
  expect(hasLedger({ ...emptySession(), ledger: { ...EMPTY, overview: onlyChildren } })).toBe(false)
  expect(forkedFrom(emptySession(), parent).ledger.overview).toEqual(parent.ledger.overview)
  expect(cleared(parent).ledger.overview).toBeNull()
})

test('the Overview page is empty for a new session, and while its first turn runs, until the Overview has a goal', () => {
  const view = (s: Session) => sessionView(s, 10_000, 1000, true, NO_HOLDS).overviewPage
  const idle = emptySession()

  expect(view(idle).isEmpty).toBe(true)
  expect(view(turnStarted(idle, 9_000)).isEmpty).toBe(true)
  expect(view(withOverview(turnStarted(idle, 9_000))).isEmpty).toBe(false)
  expect(view(withOverview(idle)).goal).toBe('Work offline')
  expect(view(idle).error).toBeNull()
})

test('a running turn claims an Overview call once the wait has passed since it started and since the last call, claims it once, and an idle session never does', () => {
  const started = turnStarted(emptySession(), 0)
  const claimed = claimedOverviewRefresh(started, OVERVIEW_REFRESH_MS)
  const calledLater = { ...started, lastOverviewCallAt: 5 * 60_000 }

  expect(claimedOverviewRefresh(started, OVERVIEW_REFRESH_MS - 1)).toBe(started)
  expect(claimed.lastOverviewCallAt).toBe(OVERVIEW_REFRESH_MS)
  expect(claimedOverviewRefresh(claimed, OVERVIEW_REFRESH_MS + 1)).toBe(claimed)
  expect(claimedOverviewRefresh(calledLater, OVERVIEW_REFRESH_MS)).toBe(calledLater)
  expect(claimedOverviewRefresh(turnEnded(started, 1), 2 * OVERVIEW_REFRESH_MS).lastOverviewCallAt).toBeNull()
})

test('a claimed Overview call reads the running turn’s work with no reply and writes its answer, and a turn that ended first is left to the call after its reply', async () => {
  const prompts: string[] = []
  const { host } = fakeHost(async prompt => {
    prompts.push(prompt)
    return 'GOAL: Work offline\nNEW: working | Offline mode | queue built'
  })
  await host.update(s => noteActivity(notePrompt(CLAUDE_CODE, turnStarted(s, 0), 'go', false).state, 'edited sync.ts'))
  await refreshOverview(host)
  const written = await host.read()

  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toContain('<activity>\nedited sync.ts\n</activity>')
  expect(prompts[0]).not.toContain('<reply>')
  expect(written.ledger.overview?.goal).toBe('Work offline')
  expect(written.lastOverviewCallAt).not.toBeNull()
  await host.update(s => turnEnded(s, 1))
  await refreshOverview(host)
  expect(prompts).toHaveLength(1)
})

const writtenOnce = () => {
  const writes: { path: string; text: string }[] = []
  let wrote = () => {}
  const written = new Promise<void>(resolve => (wrote = resolve))
  const files = (fails: boolean): RecordFiles => ({
    write: async (path, text) => {
      writes.push({ path, text })
      wrote()
      if (fails) throw new Error('disk full')
    },
    list: async () => [],
    removeFiles: async () => {},
    removeFolder: async () => {},
  })

  return { writes, written, files }
}

test('a next build records an Overview call in a file of its own: the exact prompt and system text, each answer, and the Overview after', async () => {
  const overviewPrompts: string[] = []
  const answers = [
    'The list gains a runtime subject.',
    'GOAL: Pick a runtime\nNEW: working | Runtime choice | comparing two',
  ]
  const { host } = fakeHost(async (prompt, system) => {
    if (system !== OVERVIEW_SYSTEM) return LEDGER_REPLY
    overviewPrompts.push(prompt)
    return answers[overviewPrompts.length - 1] ?? null
  })
  const { writes, written, files } = writtenOnce()
  await host.update(s => finishTurn(s, 'Which runtime?'))
  await runUpdates({
    ...host,
    records: { host: 'claude-code', folder: '/records', session: 'conv/1', files: files(false) },
  })
  await written
  const record = JSON.parse(writes[0]!.text) as OverviewRecord

  expect(writes).toHaveLength(1)
  expect(writes[0]!.path).toBe(`/records/conv_1/${recordFileName(record.at, 'reply')}`)
  expect(writes[0]!.text).toBe(`${JSON.stringify(record)}\n`)
  expect(record).toMatchObject({
    version: OVERVIEW_RECORD_VERSION,
    host: 'claude-code',
    session: 'conv/1',
    exchange: { kind: 'reply', exchange: { person: 'go', reply: 'Which runtime?' } },
    system: OVERVIEW_SYSTEM,
    isParsed: true,
    isWritten: true,
    before: null,
  })
  expect(overviewPrompts).toEqual([record.prompt, record.prompt])
  expect(overviewCallPrompt(record.input, record.exchange)).toBe(record.prompt)
  expect(record.attempts.map(a => a.answer)).toEqual([
    'The list gains a runtime subject.',
    'GOAL: Pick a runtime\nNEW: working | Runtime choice | comparing two',
  ])
  expect(record.input.asks.map(i => i.ask)).toEqual(['Use Node or Python?'])
  expect(record.after?.goal).toBe('Pick a runtime')
  expect((await host.read()).ledger.overview?.goal).toBe('Pick a runtime')
})

test('a failed Overview call’s record holds the error the host reported, and a record that cannot be written leaves the update in place', async () => {
  const { host } = fakeHost(async (_prompt, system, report) => {
    if (system !== OVERVIEW_SYSTEM) return LEDGER_REPLY
    report?.({ model: 'sonnet', error: 'api-error 529: overloaded' })
    return null
  })
  const { writes, written, files } = writtenOnce()
  await host.update(s => noteActivity(notePrompt(CLAUDE_CODE, turnStarted(s, 0), 'go', false).state, 'edited sync.ts'))
  await refreshOverview({ ...host, records: { host: 'omp', folder: '/records', session: 's1', files: files(true) } })
  await written
  const record = JSON.parse(writes[0]!.text) as OverviewRecord

  expect(record).toMatchObject({
    exchange: { kind: 'mid-turn', turn: { person: 'go', trigger: null, activity: ['edited sync.ts'] } },
    isParsed: false,
    after: null,
  })
  expect(record.attempts.map(a => [a.model, a.answeredBy, a.answer, a.error])).toEqual([
    ['sonnet', null, null, 'api-error 529: overloaded'],
  ])
  expect(overviewCallPrompt(record.input, record.exchange)).toBe(record.prompt)
  expect((await host.read()).overviewFailure?.cause).toBe('no-answer')
})

test('a session keeps the records of its newest 100 Overview calls, and a session whose last call is 14 days old loses its records', async () => {
  const saved = new Map<string, string>()
  const removedFolders: string[] = []
  const under = (folder: string) => [...saved.keys()].filter(p => p.startsWith(`${folder}/`))
  const files: RecordFiles = {
    write: async (path, text) => void saved.set(path, text),
    list: async folder => [...new Set(under(folder).map(p => p.slice(folder.length + 1).split('/')[0]!))],
    removeFiles: async paths => paths.forEach(p => saved.delete(p)),
    removeFolder: async path => {
      if (under(path).length > 0) throw new Error('not empty')
      removedFolders.push(path)
    },
  }
  const folder = '/capped-records'
  const write = (session: string, at: number) =>
    writeOverviewRecord(
      { host: 'codex', folder, session, files },
      {
        version: OVERVIEW_RECORD_VERSION,
        host: 'codex',
        session,
        at,
        system: 's',
        prompt: 'p',
        input: { last: null, asks: [], tasks: [], now: at },
        exchange: { kind: 'catch-up', conversation: 'c' },
        attempts: [],
        isParsed: false,
        isWritten: true,
        before: null,
        after: null,
      },
    )
  const start = 1_000_000_000_000
  await write('ended', start)
  for (let n = 0; n <= RECORDS_PER_SESSION; n += 1) await write('long', start + 1000 + n)

  const long = under(`${folder}/long`).sort()
  expect(long).toHaveLength(RECORDS_PER_SESSION)
  expect(long[0]).toBe(`${folder}/long/${recordFileName(start + 1001, 'catch-up')}`)
  expect(under(`${folder}/ended`)).toHaveLength(1)

  await write('long', start + RECORDS_KEPT_MS + 60 * 60_000)
  expect(under(`${folder}/ended`)).toEqual([])
  expect(removedFolders).toEqual([`${folder}/ended`])
  expect(under(`${folder}/long`)).toHaveLength(RECORDS_PER_SESSION)
})

test('a failed Overview call shows in the status line on the Overview tab, in place of a failed update, and on no other tab', () => {
  const failed = failedOverview(
    { ...emptySession(), presence: { ...emptySession().presence, ledgerState: 'failed' } },
    null,
    0,
    900,
  )
  const v = sessionView(failed, 1000, 1000, true, NO_HOLDS)
  const prs = { isFetching: false, hasPrs: false }

  expect(v.overviewPage.error).not.toBeNull()
  expect(footerStatus('overview', v.status, prs, v.overviewPage.error).error).toBe(v.overviewPage.error)
  expect(footerStatus('needsYou', v.status, prs, v.overviewPage.error).error).toBe(v.status.error)
  expect(footerStatus('prs', v.status, prs, v.overviewPage.error).error).toBeNull()
})

const ITEM: Item = {
  id: 'i1',
  kind: 'question',
  label: null,
  ask: 'Use Node or Python?',
  options: ['Node', 'Python'],
  rec: 'Node',
  helps: [],
  turn: 1,
  at: null,
  from: 'record',
}

test('the Overview page draws each status with its mark and tone, and ◆ on a subject an open ask holds up, whose Asks row names it until the subject closes', () => {
  const statuses = ['working', 'queued', 'waits-on-other', 'queued'] as const
  const asks = new Set([ITEM.id])
  const opened = applyOverview(
    null,
    parseOverview([...statuses.map((st, n) => `NEW: ${st} | Part ${n} | step`), `LINK: ${ITEM.id} | s4`].join('\n'))!,
    1000,
    asks,
  )
  const closed = applyOverview(opened, parseOverview('DONE: s1 | built')!, 2000, asks)
  const held = { ...emptySession(), ledger: { ...EMPTY, items: [ITEM], overview: closed } }
  const rows = sessionView(held, 3000, 1000, true, NO_HOLDS).overviewPage.rows.flatMap(r =>
    r.kind === 'subject' ? [[r.name, r.mark, r.tone]] : [],
  )

  expect(rows).toEqual([
    ['Part 3', '◆', 'needsYou'],
    ['Part 2', '◌', null],
    ['Part 1', '○', null],
    ['Part 0', '✓', 'done'],
  ])
  expect(allRows(sessionView(held, 3000, 1000, true, NO_HOLDS)).find(r => r.id === ITEM.id)?.holdsUpLine).toBe(
    'Holds up Part 3',
  )
  const heldDone = {
    ...held,
    ledger: { ...held.ledger, overview: applyOverview(closed, parseOverview('DONE: s4 | built')!, 2500, asks) },
  }
  expect(allRows(sessionView(heldDone, 3000, 1000, true, NO_HOLDS)).find(r => r.id === ITEM.id)?.holdsUpLine).toBeNull()
})

test('a session saved by the Progress trial build loads without its results, subagents and stated step', () => {
  const saved = {
    ...emptySession(),
    overviewFailure: undefined,
    ledger: { ...EMPTY, milestones: [{ id: 'm1', source: 'done', text: 'Reducer built' }] },
    subagents: [{ id: 'a1', task: 'Find the handler' }],
    presence: { turnsStarted: 2, isTurnRunning: true, statedStep: 'Reading x' },
  } as never
  const loaded = upgradeSession(saved) as unknown as Record<string, unknown>

  expect(loaded).not.toHaveProperty('subagents')
  expect(loaded.ledger).not.toHaveProperty('milestones')
  expect(loaded.presence).not.toHaveProperty('statedStep')
  expect(loaded.presence).toMatchObject({ turnsStarted: 2, isTurnRunning: true })
  expect(loaded.overviewFailure).toBeNull()
})

test('a sample saved without an Overview is replaced, and the sample session carries its own', () => {
  const old = demoView(1_000_000, 'Claude')

  expect(isDemoCopy(old)).toBe(true)
  expect(isDemoCopy({ ...old, presence: { isTurnRunning: false } })).toBe(true)
  expect(isDemoCopy({ ...old, ledger: { ...old.ledger, overview: undefined } })).toBe(false)
  const page = sessionView(demoSession(1_000_000, 'Claude'), 1_000_000, 1000, true, NO_HOLDS).overviewPage
  expect(page.goal).toBe('Pinch to dismiss glances')
  expect(page.rows.map(r => r.kind)).toEqual([
    'subject',
    'child',
    'child',
    'subject',
    'subject',
    'child',
    'child',
    'child',
    'subject',
    'look',
    'subject',
    'fold',
  ])
})

test('a conversation start carries the goal and where each open subject stands, not on a resume the guidance, and nothing for an empty session', () => {
  const described = emptySession()
  const ledger = { ...described.ledger, overview: applyOverview(null, answer, 1000, new Set()) }
  const carried = startContext(CLAUDE_CODE, { ...described, ledger }, 'resume')
  expect(carried).toContain('Working on: Work offline')
  expect(carried).toContain('- Offline mode: queue built (working)')
  expect(startContext(CLAUDE_CODE, { ...described, ledger }, 'startup')).toContain('Working on: Work offline')
  expect(startContext(CLAUDE_CODE, described, 'resume')).toBeNull()
})

test('an applied model answer that changes nothing still makes the session seen, and a fork takes the parent task list', () => {
  const begun = { ...emptySession(), presence: { ...emptySession().presence, turnsStarted: 1 } }
  const prompted = { ...begun, ledger: { ...begun.ledger, turn: 1 } }
  expect(hasLedger(prompted)).toBe(false)
  const none = appliedCatchUp(prompted, prompted, parseReply('NONE'), 5)
  expect(hasLedger(none)).toBe(true)
  expect(isUnseen(none)).toBe(false)

  const parent = { ...none, hostTasks: [{ id: '1', text: 'Fix it', status: 'pending' as const }] }
  expect(forkedFrom(emptySession(), parent).hostTasks).toEqual(parent.hostTasks)
})

test('a prune keeps the closed records of held rows and of rows closed since the showing began, a linked PR’s view, and a dismissed PR’s view only while the showing that dismissed it lasts', () => {
  const tasks = Array.from({ length: 14 }, (_, n) => `NEW: do | - | Task ${n} | - | -`).join('\n')
  const opened = applyUpdate(EMPTY, parseReply(tasks)!, 10, 1)
  const ids = opened.items.map(i => i.id)
  const closes = (some: string[]) => parseReply(some.map(id => `CLOSED: ${id} | done`).join('\n'))!
  const ledger = applyUpdate(applyUpdate(opened, closes(ids.slice(0, 2)), 20, 2), closes(ids.slice(2)), 50, 3)
  const demo = demoView(0, 'Claude')
  const [ref, linked] = Object.keys(demo.prViews.views) as [string, string]
  const s = {
    ...emptySession(),
    ledger: { ...ledger, prs: [linked] },
    prViews: { ...demo.prViews, branchRef: null },
    lastActions: { [prMarkId(ref)]: { kind: 'mark' as const, action: 'pr-dismiss', text: 'Dismissed', at: 30 } },
  }
  const closedIds = (x: Session) => x.ledger.closed.map(c => c.id)

  const shownEarly = pruned({ ...s, shownSince: 20 })
  expect(closedIds(shownEarly)).toEqual(ids)
  expect(Object.keys(shownEarly.prViews.views).sort()).toEqual([ref, linked].sort())
  expect(closedIds(pruned({ ...s, shownSince: 50, heldRows: [ids[0]!] }))).toEqual([ids[0], ...ids.slice(2)])
  const left = pruned({ ...s, shownSince: null })
  expect(closedIds(left)).toEqual(ids.slice(2))
  expect(Object.keys(left.prViews.views)).toEqual([linked])
})

const FIX_REF = 'acme/app#12'

const BLOCKED_PR: PrView = {
  ref: FIX_REF,
  number: 12,
  title: 'Add a CLI',
  url: 'https://github.com/acme/app/pull/12',
  isDraft: false,
  state: 'OPEN',
  base: 'main',
  mergeable: 'CONFLICTING',
  reviewDecision: '',
  checks: [{ name: 'test', bucket: 'fail', url: null }],
  threads: [],
  isYours: true,
  wasSeenOpen: true,
  error: null,
  fetchedAt: 1,
}

async function blockedPrHost(refreshed: (pr: PrView, at: number) => PrView) {
  const { host, delivered } = fakeHost(async () => null)
  await host.update(s => ({
    ...s,
    ledger: { ...s.ledger, prs: [FIX_REF] },
    prViews: { ...s.prViews, views: { [FIX_REF]: BLOCKED_PR } },
  }))
  const shownWhileRefreshing: string[] = []
  const shownOn = async (rowId: string) => {
    const s = await host.read()
    const f = feedbackOf(rowId, s.lastActions[rowId], undefined, s.presence, await host.now())
    return f ? feedbackText(f, 'terminal') : null
  }
  host.refreshPrs = async () => {
    for (const id of [prMarkId(FIX_REF), checkRowId(FIX_REF, 'test')]) {
      const text = await shownOn(id)
      if (text) shownWhileRefreshing.push(text)
    }
    const at = await host.now()
    await host.update(s => withFetchedPrs(s, { [FIX_REF]: refreshed(s.prViews.views[FIX_REF]!, at) }, null, false))
  }

  return { host, delivered, shownWhileRefreshing, shownOn }
}

test('Resolve conflicts and Fix check the PR on GitHub first, reading Refreshing at once, and send nothing once the problem is gone', async () => {
  const resolved = await blockedPrHost((pr, at) => ({ ...pr, mergeable: 'MERGEABLE', fetchedAt: at }))
  const conflicts = await press(resolved.host, { action: 'pr-conflicts', ref: FIX_REF }, false, NO_HOLDS)
  expect(resolved.shownWhileRefreshing).toEqual(['Refreshing PR #12…'])
  expect(conflicts.note).toBe('stale')
  expect(resolved.delivered).toEqual([])

  const passed = await blockedPrHost((pr, at) => ({
    ...pr,
    checks: [{ name: 'test', bucket: 'pass', url: null }],
    fetchedAt: at,
  }))
  const fix = await press(passed.host, { action: 'check-fix', ref: FIX_REF, check: 'test' }, false, NO_HOLDS)
  expect(passed.shownWhileRefreshing).toEqual(['Refreshing PR #12…'])
  expect(fix.note).toBe('stale')
  expect(passed.delivered).toEqual([])
})

test('Resolve conflicts and Fix send their message when the PR on GitHub still has the problem, after an earlier press of the same fix', async () => {
  const still = await blockedPrHost((pr, at) => ({ ...pr, fetchedAt: at }))
  for (const round of [1, 2]) {
    const conflicts = await press(still.host, { action: 'pr-conflicts', ref: FIX_REF }, false, NO_HOLDS)
    const fix = await press(still.host, { action: 'check-fix', ref: FIX_REF, check: 'test' }, false, NO_HOLDS)
    expect([conflicts.note, fix.note]).toEqual([null, null])
    expect(still.delivered.length).toBe(2 * round)
    for (const text of still.delivered.slice(-2))
      await still.host.update(s => endTurn(CLAUDE_CODE, notePrompt(CLAUDE_CODE, s, text, false).state, 'Done.', false))
  }
  expect(still.delivered[2]).toContain('PR #12 (https://github.com/acme/app/pull/12) conflicts with main.')
  expect(still.delivered[3]).toContain('The test check failed on PR #12')
  expect(await still.shownOn(prMarkId(FIX_REF))).toBe('✓ Asked to resolve conflicts')
})

test('a fix press whose check of the PR fails sends nothing and says why on its row', async () => {
  const unread = await blockedPrHost(pr => ({ ...pr, error: 'HTTP 502' }))
  const conflicts = await press(unread.host, { action: 'pr-conflicts', ref: FIX_REF }, false, NO_HOLDS)
  expect(conflicts.note).toBe(null)
  expect(unread.delivered).toEqual([])
  expect(await unread.shownOn(prMarkId(FIX_REF))).toBe('Could not refresh PR #12: HTTP 502')
})

test('PRs are due for a fetch 15 seconds after the last once the agent replied since it, and otherwise after 2 minutes', () => {
  const s = {
    ...emptySession(),
    ledger: { ...emptySession().ledger, prs: [FIX_REF] },
    prViews: { ...emptySession().prViews, views: { [FIX_REF]: BLOCKED_PR } },
  }
  const repliedAt = (at: number | null) => ({ ...s, presence: { ...s.presence, lastReplyAt: at } })
  expect(isPrFetchDue(repliedAt(1_005_000), 1_000_000, 1_015_000)).toBe(true)
  expect(isPrFetchDue(repliedAt(1_005_000), 1_000_000, 1_014_000)).toBe(false)
  expect(isPrFetchDue(repliedAt(999_000), 1_000_000, 1_015_000)).toBe(false)
  expect(isPrFetchDue(repliedAt(null), 1_000_000, 1_120_000)).toBe(true)
})

test('a fetch a press asks for while another runs starts once that one ends, and presses during one fetch share the next', async () => {
  const tracker = prFetchTracker(() => 1)
  const started: string[] = []
  let endFirst = () => {}
  const first = tracker.fetchNow('s1', () => {
    started.push('first')
    return new Promise<void>(resolve => (endFirst = resolve))
  })
  const pressed = () =>
    tracker.fetchNow('s1', async () => {
      started.push('after')
    })
  const both = [pressed(), pressed()]
  expect(started).toEqual(['first'])
  endFirst()
  await Promise.all([first, ...both])
  expect(started).toEqual(['first', 'after'])
})
