import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { delegatesSettled } from '../core/domain/children'
import { childEnded, lookEnded, lookStarted, LOOK_MIN_MS, withChild } from '../core/domain/status-children'
import { startHerdrFile } from '../core/remote/herdr-app'
import { delegatesInHerdr, HERDR_FORMAT, herdrTarget } from '../core/remote/herdr'
import { emptySession } from '../core/view/session-files'
import type { PressHost } from '../core/runtime/host-press'
import type { Session } from '../types'
import type { Run } from '../core/domain/gh'
import type { SessionStatus } from '../types'
import { MIN, after, page, shape } from './status-helpers'

const HC_TARGET = herdrTarget({ HC_TERMINAL_ID: 't9', HOME: '/home/person' })
const hcList = (terminals: object[]): Run => {
  const stdout = JSON.stringify({ terminals })

  return async argv =>
    argv.join(' ') === 'hc ls --json' ? { code: 0, stdout, stderr: '' } : { code: 1, stdout: '', stderr: '' }
}

test('a terminal hc lists under this session starts a delegate row before the session ever sends to it, and a shell, another parent and a ready terminal start none', async () => {
  const o: SessionStatus | null = after(null, 'NEW: working | Export | layout next', 10 * MIN)
  const run = hcList([
    { address: 't1', name: 'pdf-layout', parent: 't9', status: 'working' },
    { address: 't2', parent: 't9', status: 'blocked' },
    { address: 't3', name: 'fixer', parent: 't9', status: 'error' },
    { address: 't4', name: 'shell', parent: 't9' },
    { address: 't5', name: 'elsewhere', parent: 't8', status: 'working' },
    { address: 't6', name: 'spare', parent: 't9', status: 'idle' },
  ])
  const agents = await delegatesInHerdr(o, run, HC_TARGET)
  const started = delegatesSettled(o, agents!, 30 * MIN)

  expect(started!.children.map(c => [c.ref, c.name, c.delegateState])).toEqual([
    ['herdr:pdf-layout', 'pdf layout', 'working'],
    ['herdr:t2', 't2', 'blocked'],
    ['herdr:fixer', 'fixer', 'blocked'],
  ])
  expect(delegatesSettled(started, agents!, 31 * MIN)).toBe(started)
  expect(
    page(started, 31 * MIN)
      .rows.filter(r => r.kind === 'child')
      .map(r => r.isRunning),
  ).toEqual([true, false, false])
})

test('a delegate listed under an hc terminal ends finished once hc shows it ready, and starts again when it works again', async () => {
  const o: SessionStatus | null = after(null, 'NEW: working | Export | layout next', 10 * MIN)
  const listed = (status: string) => hcList([{ address: 't1', name: 'pdf', parent: 't9', status }])
  const at = async (x: SessionStatus | null, status: string, now: number) =>
    delegatesSettled(x, (await delegatesInHerdr(x, listed(status), HC_TARGET))!, now)

  const working = await at(o, 'working', 30 * MIN)
  const done = await at(working, 'done', 40 * MIN)
  expect(done!.children.map(c => [c.endedAt !== null, c.delegateState])).toEqual([[true, 'finished']])
  const again = await at(done, 'working', 50 * MIN)
  expect(again!.children.map(c => [c.endedAt === null, c.delegateState])).toEqual([[true, 'working']])
})

test('inside a Herdr app terminal, nothing asks herdr, and hc is asked while the Status holds no delegate', async () => {
  const asked: string[] = []
  const run: Run = async argv => {
    asked.push(argv.join(' '))

    return { code: 0, stdout: JSON.stringify({ terminals: [] }), stderr: '' }
  }
  await delegatesInHerdr(null, run, HC_TARGET)
  expect(asked).toEqual(['hc ls --json'])
})

test('a lone finished delegate no subject holds draws as its own row at once, seen or not, with a line under its name', () => {
  const now = 100 * MIN
  const base = after(null, 'NEW: working | Export | layout next', 10 * MIN)
  const started = withChild(
    base,
    {
      ref: 'd1',
      kind: 'delegate',
      name: 'pdf layout',
      startedAt: 20 * MIN,
      endedAt: null,
      lastActivityAt: null,
      delegateState: 'finished',
    },
    30 * MIN,
  )
  const finished = childEnded(started, 'd1', 40 * MIN)!
  const unseen = page({ ...finished, lastLookAt: 30 * MIN }, now).rows
  expect(shape(unseen)).toEqual(['◐ Export: layout next', '✓ pdf layout'])
  expect(unseen.flatMap(r => (r.kind === 'child' ? [[r.depth, r.text]] : []))).toEqual([
    [0, 'Ran 20m, finished 1h ago'],
  ])

  const looked = lookEnded(lookStarted(finished, 50 * MIN), 50 * MIN + LOOK_MIN_MS, 'all')
  expect(shape(page(looked, now).rows)).toEqual(['◐ Export: layout next', '✓ pdf layout'])
})

test("a running hc delegate takes its terminal's focus as its name and last note as its line, which stay once it finishes, and a finished one costs no hc get", async () => {
  const o: SessionStatus | null = after(null, 'NEW: working | Export | layout next', 10 * MIN)
  const asked: string[] = []
  const at = async (x: SessionStatus | null, status: string) => {
    const run: Run = async argv => {
      asked.push(argv.join(' '))
      if (argv[1] === 'ls') {
        const terminals = [{ address: 't1', name: 'pdf', parent: 't9', status }]

        return { code: 0, stdout: JSON.stringify({ terminals }), stderr: '' }
      }
      const detail = { labels: { 'inbox.focus': 'Fixing PDF page breaks' }, status: { msg: 'PR #12 open' } }

      return { code: 0, stdout: JSON.stringify(detail), stderr: '' }
    }

    return delegatesSettled(x, (await delegatesInHerdr(x, run, HC_TARGET))!, status === 'working' ? 30 * MIN : 40 * MIN)
  }

  const working = await at(o, 'working')
  const started = await at(working, 'working')
  const done = await at(started, 'done')
  const later = await at(done, 'done')

  expect(done!.children.map(c => [c.name, c.summary, c.delegateState])).toEqual([
    ['Fixing PDF page breaks', 'PR #12 open', 'finished'],
  ])
  expect(asked.filter(a => a.startsWith('hc get'))).toHaveLength(2)
  expect(later).toBe(done)
  const row = page({ ...done!, lastLookAt: 35 * MIN }, 100 * MIN).rows.find(r => r.kind === 'child')
  expect(row?.kind === 'child' && row.text).toBe('PR #12 open')
})

test('a look file the Herdr look wrote sets the last look on the saved Status', async () => {
  let saved: Session = {
    ...emptySession(),
    ledger: { ...emptySession().ledger, overview: after(null, 'NEW: working | Export | layout next', 10 * MIN) },
  }
  const host = {
    update: async (change: (s: Session) => Session) => void (saved = change(saved)),
  } as unknown as PressHost<Session>
  const look = {
    startedAt: 20 * MIN,
    endedAt: 20 * MIN + LOOK_MIN_MS,
    shown: { s1: 20 * MIN + 1 },
    drawnWrittenAt: 21 * MIN,
  }

  await startHerdrFile(host, { format: HERDR_FORMAT, id: 'p1', look })

  expect(saved.ledger.overview?.lastLookAt).toBe(20 * MIN + LOOK_MIN_MS)
})
