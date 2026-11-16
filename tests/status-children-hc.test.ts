import { expect, test } from 'claude-code/testing'

import { delegatesSettled } from '../hooks/children'
import { childEnded, lookEnded, lookStarted, LOOK_MIN_MS, withChild } from '../hooks/status-children'
import { delegatesInHerdr, herdrTarget } from '../hooks/herdr'
import type { Run } from '../hooks/gh'
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

test('a finished delegate no subject holds draws a row until a look ends, then folds into "1 done", which unfolds to its row one step in', () => {
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

  expect(shape(page({ ...finished, lastLookAt: 30 * MIN }, now).rows)).toEqual([
    '✓ pdf layout',
    '◐ Export: layout next',
  ])

  const looked = lookEnded(lookStarted(finished, 50 * MIN), 50 * MIN + LOOK_MIN_MS, 'all')
  const rows = page(looked, now).rows

  expect(shape(rows)).toEqual(['◐ Export: layout next', '› 1 done'])
  expect(rows.flatMap(r => (r.kind === 'done-fold' ? r.rows : [])).map(r => [r.kind, r.depth])).toEqual([['child', 1]])
})
