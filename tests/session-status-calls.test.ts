import { expect, test } from 'claude-code/testing'

import { EMPTY } from '../hooks/ledger'
import { withChild } from '../hooks/status-children'
import { applyStatus } from '../hooks/status-ops'
import { CLAUDE_CODE } from '../hooks/model-text'
import { STATUS_SYSTEM } from '../hooks/status-prompt'
import {
  appliedStatus,
  cleared,
  claimedStatusRefresh,
  emptySession,
  failedStatus,
  forkedFrom,
  hasLedger,
  isUnseen,
  noteActivity,
  STATUS_REFRESH_MS,
  notePrompt,
  sessionView,
  turnEnded,
  turnStarted,
} from '../hooks/session'
import type { Session } from '../hooks/session'
import {
  STATUS_RECORD_VERSION,
  statusCallPrompt,
  RECORDS_KEPT_MS,
  RECORDS_PER_SESSION,
  recordFileName,
  refreshStatus,
  runUpdates,
  writeStatusRecord,
} from '../hooks/session-host'
import type { StatusRecord, RecordFiles } from '../hooks/session-host'
import { footerStatus, NO_HOLDS } from '../hooks/view'
import { fakeHost } from './session-fake-host'
import { LEDGER_REPLY, finishTurn, answer } from './session-helpers'

const withStatus = (s: Session): Session => ({
  ...s,
  ledger: { ...EMPTY, overview: applyStatus(null, answer, 1000, new Set()) },
})

test('a Status answer is written to the ledger after later updates and clears a saved failure, and both are dropped when their update is gone', () => {
  const later = { ...emptySession(), presence: { ...emptySession().presence, turnsApplied: 5 } }
  const failed = failedStatus(later, 'The person wants a CLI.', 3, 900)

  expect(failed.overviewFailure).toEqual({ at: 900, cause: 'refused', answer: 'The person wants a CLI.' })
  expect(failedStatus(later, null, 3, 900).overviewFailure).toEqual({ at: 900, cause: 'no-answer', answer: null })
  expect(appliedStatus(failed, answer, 3, 1000).ledger.overview?.head?.title).toBe('Work offline')
  expect(appliedStatus(failed, answer, 3, 1000).overviewFailure).toBeNull()
  expect(appliedStatus(emptySession(), answer, 3, 1000).ledger.overview).toBeNull()
  expect(failedStatus(emptySession(), null, 3, 900).overviewFailure).toBeNull()
  expect(cleared(failed).overviewFailure).toBeNull()
})

test('a session whose only record is a Status has a ledger, is not unseen, is copied by a fork and is cleared', () => {
  const parent = withStatus(emptySession())
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

test('the Status page is empty for a new session, and while its first turn runs, until the Status has a head', () => {
  const view = (s: Session) => sessionView(s, 10_000, 1000, true, NO_HOLDS).statusPage
  const idle = emptySession()

  expect(view(idle).isEmpty).toBe(true)
  expect(view(turnStarted(idle, 9_000)).isEmpty).toBe(true)
  expect(view(withStatus(turnStarted(idle, 9_000))).isEmpty).toBe(false)
  expect(view(withStatus(idle)).head?.title).toBe('Work offline')
  expect(view(idle).error).toBeNull()
})

test('a running turn claims a Status call once the wait has passed since it started and since the last call, claims it once, and an idle session never does', () => {
  const started = turnStarted(emptySession(), 0)
  const claimed = claimedStatusRefresh(started, STATUS_REFRESH_MS)
  const calledLater = { ...started, lastOverviewCallAt: 5 * 60_000 }

  expect(claimedStatusRefresh(started, STATUS_REFRESH_MS - 1)).toBe(started)
  expect(claimed.lastOverviewCallAt).toBe(STATUS_REFRESH_MS)
  expect(claimedStatusRefresh(claimed, STATUS_REFRESH_MS + 1)).toBe(claimed)
  expect(claimedStatusRefresh(calledLater, STATUS_REFRESH_MS)).toBe(calledLater)
  expect(claimedStatusRefresh(turnEnded(started, 1), 2 * STATUS_REFRESH_MS).lastOverviewCallAt).toBeNull()
})

test('a claimed Status call reads the running turn’s work with no reply and writes its answer, and a turn that ended first is left to the call after its reply', async () => {
  const prompts: string[] = []
  const { host } = fakeHost(async prompt => {
    prompts.push(prompt)
    return 'HEAD: Work offline | Letting the app work without a connection\nNEW: working | Offline mode | queue built'
  })
  await host.update(s => noteActivity(notePrompt(CLAUDE_CODE, turnStarted(s, 0), 'go', false).state, 'edited sync.ts'))
  await refreshStatus(host)
  const written = await host.read()

  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toContain('<activity>\nedited sync.ts\n</activity>')
  expect(prompts[0]).not.toContain('<reply>')
  expect(written.ledger.overview?.head?.title).toBe('Work offline')
  expect(written.lastOverviewCallAt).not.toBeNull()
  await host.update(s => turnEnded(s, 1))
  await refreshStatus(host)
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

test('a next build records a Status call in a file of its own: the exact prompt and system text, each answer, and the Status after', async () => {
  const statusPrompts: string[] = []
  const answers = [
    'The list gains a runtime subject.',
    'HEAD: Pick a runtime | Choosing between Node and Python\nNEW: working | Runtime choice | comparing two',
  ]
  const { host } = fakeHost(async (prompt, system) => {
    if (system !== STATUS_SYSTEM) return LEDGER_REPLY
    statusPrompts.push(prompt)
    return answers[statusPrompts.length - 1] ?? null
  })
  const { writes, written, files } = writtenOnce()
  await host.update(s => finishTurn(s, 'Which runtime?'))
  await runUpdates({
    ...host,
    records: { host: 'claude-code', folder: '/records', session: 'conv/1', files: files(false) },
  })
  await written
  const record = JSON.parse(writes[0]!.text) as StatusRecord

  expect(writes).toHaveLength(1)
  expect(writes[0]!.path).toBe(`/records/conv_1/${recordFileName(record.at, 'reply')}`)
  expect(writes[0]!.text).toBe(`${JSON.stringify(record)}\n`)
  expect(record).toMatchObject({
    version: STATUS_RECORD_VERSION,
    host: 'claude-code',
    session: 'conv/1',
    exchange: { kind: 'reply', exchange: { person: 'go', reply: 'Which runtime?' } },
    system: STATUS_SYSTEM,
    isParsed: true,
    isWritten: true,
    before: null,
  })
  expect(statusPrompts).toEqual([record.prompt, record.prompt])
  expect(statusCallPrompt(record.input, record.exchange)).toBe(record.prompt)
  expect(record.attempts.map(a => a.answer)).toEqual([
    'The list gains a runtime subject.',
    'HEAD: Pick a runtime | Choosing between Node and Python\nNEW: working | Runtime choice | comparing two',
  ])
  expect(record.input.asks.map(i => i.ask)).toEqual(['Use Node or Python?'])
  expect(record.after?.head?.title).toBe('Pick a runtime')
  expect((await host.read()).ledger.overview?.head?.title).toBe('Pick a runtime')
})

test('a failed Status call’s record holds the error the host reported, and a record that cannot be written leaves the update in place', async () => {
  const { host } = fakeHost(async (_prompt, system, report) => {
    if (system !== STATUS_SYSTEM) return LEDGER_REPLY
    report?.({ model: 'sonnet', error: 'api-error 529: overloaded' })
    return null
  })
  const { writes, written, files } = writtenOnce()
  await host.update(s => noteActivity(notePrompt(CLAUDE_CODE, turnStarted(s, 0), 'go', false).state, 'edited sync.ts'))
  await refreshStatus({ ...host, records: { host: 'omp', folder: '/records', session: 's1', files: files(true) } })
  await written
  const record = JSON.parse(writes[0]!.text) as StatusRecord

  expect(record).toMatchObject({
    exchange: { kind: 'mid-turn', turn: { person: 'go', trigger: null, activity: ['edited sync.ts'] } },
    isParsed: false,
    after: null,
  })
  expect(record.attempts.map(a => [a.model, a.answeredBy, a.answer, a.error])).toEqual([
    ['sonnet', null, null, 'api-error 529: overloaded'],
  ])
  expect(statusCallPrompt(record.input, record.exchange)).toBe(record.prompt)
  expect((await host.read()).overviewFailure?.cause).toBe('no-answer')
})

test('a session keeps the records of its newest 100 Status calls, and a session whose last call is 14 days old loses its records', async () => {
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
    writeStatusRecord(
      { host: 'codex', folder, session, files },
      {
        version: STATUS_RECORD_VERSION,
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

test('a failed Status call shows in the status line on the Status tab, in place of a failed update, and on no other tab', () => {
  const failed = failedStatus(
    { ...emptySession(), presence: { ...emptySession().presence, ledgerState: 'failed' } },
    null,
    0,
    900,
  )
  const v = sessionView(failed, 1000, 1000, true, NO_HOLDS)
  const prs = { isFetching: false, hasPrs: false }

  expect(v.statusPage.error).not.toBeNull()
  expect(footerStatus('overview', v.status, prs, v.statusPage.error).error).toBe(v.statusPage.error)
  expect(footerStatus('needsYou', v.status, prs, v.statusPage.error).error).toBe(v.status.error)
  expect(footerStatus('prs', v.status, prs, v.statusPage.error).error).toBeNull()
})
