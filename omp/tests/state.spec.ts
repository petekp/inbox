import { afterEach, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { KEPT_SESSIONS } from '../../hooks/ledger'
import { exclusiveRun, pruneSessions, readState, statePath, updateState } from '../src/state'
import type { OmpState } from '../src/state'

const dirs: string[] = []
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'inbox-omp-state-'))
  dirs.push(dir)

  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const withTurns =
  (n: number) =>
  (s: OmpState): OmpState => ({
    ...s,
    presence: { ...s.presence, turnsStarted: n },
  })

test('a session nobody saved reads as a new one', async () => {
  const state = await readState(tempDir(), 's1')
  expect(state.sessionId).toBe('s1')
  expect(state.presence.turnsStarted).toBe(0)
})

test('concurrent updates run one after another and each sees the last one', async () => {
  const dir = tempDir()
  await Promise.all(
    Array.from({ length: 20 }, () =>
      updateState(dir, 's1', async s => {
        await new Promise(resolve => setTimeout(resolve, 1))

        return withTurns(s.presence.turnsStarted + 1)(s)
      }),
    ),
  )
  expect((await readState(dir, 's1')).presence.turnsStarted).toBe(20)
})

test('a failed update leaves the saved state and does not block the next one', async () => {
  const dir = tempDir()
  await updateState(dir, 's1', withTurns(1))
  await expect(
    updateState(dir, 's1', () => {
      throw new Error('boom')
    }),
  ).rejects.toThrow('boom')
  await updateState(dir, 's1', s => withTurns(s.presence.turnsStarted + 1)(s))
  expect((await readState(dir, 's1')).presence.turnsStarted).toBe(2)
})

test('a second exclusive run is refused while one holds the session', async () => {
  const dir = tempDir()
  let release = () => {}
  const first = exclusiveRun(dir, 's1', () => new Promise<string>(resolve => (release = () => resolve('first'))))
  expect(await exclusiveRun(dir, 's1', async () => 'second')).toEqual({ acquired: false })
  expect(await exclusiveRun(dir, 's2', async () => 'other')).toEqual({ acquired: true, value: 'other' })
  release()
  expect(await first).toEqual({ acquired: true, value: 'first' })
  expect(await exclusiveRun(dir, 's1', async () => 'again')).toEqual({ acquired: true, value: 'again' })
})

test('the exclusive hold is released when the run throws', async () => {
  const dir = tempDir()
  await expect(
    exclusiveRun(dir, 's1', async () => {
      throw new Error('boom')
    }),
  ).rejects.toThrow('boom')
  expect(await exclusiveRun(dir, 's1', async () => 1)).toEqual({ acquired: true, value: 1 })
})

test('a corrupt file throws instead of resetting the session', async () => {
  const dir = tempDir()
  mkdirSync(join(dir, 'sessions'))
  writeFileSync(statePath(dir, 's1'), '{"presence": ')
  await expect(readState(dir, 's1')).rejects.toThrow()
  await expect(updateState(dir, 's1', withTurns(1))).rejects.toThrow()
  expect(readFileSync(statePath(dir, 's1'), 'utf8')).toBe('{"presence": ')
})

test('a file from a newer version throws', async () => {
  const dir = tempDir()
  mkdirSync(join(dir, 'sessions'))
  writeFileSync(statePath(dir, 's1'), JSON.stringify({ version: 2 }))
  await expect(readState(dir, 's1')).rejects.toThrow('Unsupported inbox state version: 2')
})

test('a file missing newer fields reads with their defaults', async () => {
  const dir = tempDir()
  mkdirSync(join(dir, 'sessions'))
  writeFileSync(statePath(dir, 's1'), JSON.stringify({ version: 1, presence: { turnsStarted: 4 } }))
  const state = await readState(dir, 's1')
  expect(state.presence).toEqual({
    turnsStarted: 4,
    turnsApplied: 0,
    ledgerState: 'current',
    hasDroppedReply: false,
    isUpdating: false,
    isTurnRunning: false,
  })
  expect(state.pending).toEqual([])
  expect(state.prViews.isFetching).toBe(false)
})

test('a session id that is not a plain name is refused', async () => {
  await expect(readState(tempDir(), '../escape')).rejects.toThrow('Not a session id')
})

test('pruning removes the oldest sessions beyond the kept count and never the current one', async () => {
  const dir = tempDir()
  const total = KEPT_SESSIONS + 3
  for (let n = 0; n < total; n++) {
    await updateState(dir, `s${n}`, withTurns(n))
    const at = new Date(1_700_000_000_000 + n * 1000)
    utimesSync(statePath(dir, `s${n}`), at, at)
  }
  await pruneSessions(dir, 's0')
  const present = async (id: string) => (await readState(dir, id)).presence.turnsStarted !== 0 || id === 's0'
  expect(await present('s0')).toBe(true)
  expect(await present('s1')).toBe(false)
  expect(await present('s2')).toBe(false)
  expect(await present(`s${total - 1}`)).toBe(true)
})
