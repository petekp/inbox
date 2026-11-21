import { expect, mock, type Engine } from 'claude-code/testing'
import { test } from './test-with-timeout'
import { KEPT_SESSIONS } from '../core/domain/ledger'
import { storedLength, w, world } from './hooks-world'
import { SAVED_SESSION } from './hooks-helpers'

const saveOf = (savedAt: number, filler = '') => JSON.stringify({ savedAt, ledger: SAVED_SESSION.ledger, filler })

const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, n) => `${prefix}-${n + 1}`)

const filesOf = (sessionIds: string[]) => [
  { pid: 100, sessionId: 'session-1' },
  ...sessionIds.map((sessionId, n) => ({ pid: 200 + n, sessionId })),
]

async function firstSave($: Engine, clock: { settle: () => Promise<void> }) {
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'new request', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'New reply.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
}

test('a prune keeps every running session’s save however many run, and the newest ended ones up to the count', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], { XDG_STATE_HOME: '/state' })
  const running = ids('running', KEPT_SESSIONS + 5)
  const ended = ids('ended', KEPT_SESSIONS + 2)
  running.forEach((id, n) => w.stored.set(`s:${id}`, saveOf(n + 1)))
  ended.forEach((id, n) => w.stored.set(`s:${id}`, saveOf(100 + n)))
  w.sessionFiles = filesOf([...running, 'exited'])
  w.endedPids = [200 + running.length]
  w.stored.set('s:exited', saveOf(99))
  const logOf = (id: string) => `/state/inbox/claude-code/${id}.commands.json`
  const logged = ['exited', 'ended-2', 'ended-3', 'running-1']
  logged.forEach(id => {
    w.written[logOf(id)] = '{}'
  })

  await firstSave($, clock)
  expect(logged.filter(id => logOf(id) in w.written)).toEqual(['ended-3', 'running-1'])
  expect(running.filter(id => !w.stored.has(`s:${id}`))).toEqual([])
  expect(['exited', ...ended].filter(id => !w.stored.has(`s:${id}`))).toEqual(['exited', 'ended-1', 'ended-2'])
  expect(w.stored.has('s:session-1')).toBe(true)
})

test('when ps cannot run, every session with a file counts as running', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const others = ids('other', KEPT_SESSIONS + 1)
  others.forEach((id, n) => w.stored.set(`s:${id}`, saveOf(n + 1)))
  w.sessionFiles = filesOf(others)
  w.endedPids = others.map((_, n) => 200 + n)
  w.isPsMissing = true

  await firstSave($, clock)
  expect(others.filter(id => !w.stored.has(`s:${id}`))).toEqual([])
})

test('when no session file names this session, the prune keeps the newest saves up to the count, as if none ran', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const others = ids('other', KEPT_SESSIONS + 1)
  others.forEach((id, n) => w.stored.set(`s:${id}`, saveOf(n + 1)))
  w.sessionFiles = filesOf(others).slice(1)

  await firstSave($, clock)
  expect(others.filter(id => !w.stored.has(`s:${id}`))).toEqual(['other-1'])
})

test('a full store makes room by deleting ended sessions’ saves oldest first, never a running one, and the save lands', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const filler = 'x'.repeat(50_000)
  w.stored.set('s:running-1', saveOf(1, filler))
  w.stored.set('s:ended-1', saveOf(2, filler))
  w.stored.set('s:ended-2', saveOf(3, filler))
  w.sessionFiles = filesOf(['running-1'])
  await firstSave($, clock)
  w.storeLimit = storedLength()

  const r = await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'Retry loop never backs off',
    detail: 'The fetch retry spins with no delay.',
  })
  expect(r.result).toBe('Recorded. The user sees it in the Finds tab of the /inbox pane.')
  expect(w.stored.get('s:session-1')).toContain('Retry loop never backs off')
  expect(['running-1', 'ended-1', 'ended-2'].filter(id => w.stored.has(`s:${id}`))).toEqual(['running-1', 'ended-2'])
})

test('each publish writes the conversation’s registry entry with its pid and removes those of Claude Code processes that ended, and the end removes it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], { XDG_STATE_HOME: '/state' })
  w.sessionFiles = filesOf(['other'])
  w.endedPids = [200]
  const folder = '/state/inbox/registry'
  const ended = JSON.stringify({ format: 1, pid: 200, startedAt: 1 })
  w.written[`${folder}/claude-code-other.json`] = ended
  w.written[`${folder}/omp-other.json`] = ended

  await firstSave($, clock)
  expect(JSON.parse(w.written[`${folder}/claude-code-session-1.json`] ?? 'null')).toMatchObject({
    host: 'claude-code',
    sessionId: 'session-1',
    pid: 100,
    projectFolder: '/tmp/project',
    title: null,
    herdr: null,
  })
  expect(
    Object.keys(w.written)
      .filter(path => path.startsWith(folder))
      .sort(),
  ).toEqual([`${folder}/claude-code-session-1.json`, `${folder}/omp-other.json`])

  await $.session.end({ reason: 'other', sessionId: 'session-1' } as never)
  await clock.settle()
  expect(Object.keys(w.written).filter(path => path.startsWith(folder))).toEqual([`${folder}/omp-other.json`])
})
