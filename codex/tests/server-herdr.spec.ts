import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import type { PressFile } from '../../hooks/herdr-press-file'
import { makeServer } from '../src/server'
import { followCodexPresses } from '../src/server-herdr'
import { readState, updateState } from '../src/state'
import { NO_HOLDS } from '../../hooks/timing'
import { tempDir } from './helpers'

const HOLDS = { replies: {}, discarded: {}, shownSince: null }

function writePress(appHome: string, sessionId: string, id: string) {
  const folder = join(appHome, 'inbox/presses', sessionId)
  mkdirSync(folder, { recursive: true })
  const path = join(folder, `${id}.json`)
  writeFileSync(
    path,
    JSON.stringify({ format: 1, id, pressedAt: 1, press: { action: 'done', id: 'i1' }, holds: HOLDS }),
  )
  return path
}

function publish(appHome: string, sessionId: string, host: string, terminal: string) {
  mkdirSync(join(appHome, 'inbox/sessions'), { recursive: true })
  writeFileSync(join(appHome, 'inbox/sessions', `${sessionId}.json`), JSON.stringify({ format: 1, host, terminal }))
}

async function until(isDone: () => boolean) {
  for (let waited = 0; !isDone() && waited < 2000; waited += 10) await new Promise(r => setTimeout(r, 10))
}

test("the server applies presses for this terminal's Codex sessions, at start and as the look writes them, and leaves others", async () => {
  const appHome = tempDir()
  publish(appHome, 's1', 'codex', 't1')
  publish(appHome, 's2', 'claude-code', 't1')
  publish(appHome, 's3', 'codex', 't2')
  const waiting = writePress(appHome, 's1', 'p1')
  const others = [writePress(appHome, 's2', 'p2'), writePress(appHome, 's3', 'p3')]
  const applied: [string, string][] = []
  const stop = followCodexPresses(
    { HC_TERMINAL_ID: 't1', HERDR_APP_HOME: appHome, HOME: '/home/person' },
    async (sessionId: string, file: PressFile) => {
      applied.push([sessionId, file.id])
    },
    () => undefined,
  )
  try {
    await until(() => !existsSync(waiting))
    assert.deepEqual(applied, [['s1', 'p1']])

    const later = writePress(appHome, 's1', 'p4')
    await until(() => !existsSync(later))
    assert.deepEqual(applied, [
      ['s1', 'p1'],
      ['s1', 'p4'],
    ])
    assert.ok(others.every(path => existsSync(path)))
  } finally {
    stop?.()
  }
})

test('a press folder named outside the session-id rule, or a press file too large to read, stops no other press', async () => {
  const appHome = tempDir()
  publish(appHome, 's1', 'codex', 't1')
  mkdirSync(join(appHome, 'inbox/presses/a.b'), { recursive: true })
  const large = join(appHome, 'inbox/presses/s1/large.json')
  mkdirSync(join(appHome, 'inbox/presses/s1'), { recursive: true })
  writeFileSync(large, 'x'.repeat(65 * 1024))
  const waiting = writePress(appHome, 's1', 'p1')
  const applied: string[] = []
  const logged: string[] = []
  const stop = followCodexPresses(
    { HC_TERMINAL_ID: 't1', HERDR_APP_HOME: appHome, HOME: '/home/person' },
    async (_sessionId: string, file: PressFile) => {
      applied.push(file.id)
    },
    text => logged.push(text),
  )
  try {
    await until(() => !existsSync(waiting) && !existsSync(large))
    assert.deepEqual(applied, ['p1'])
    assert.deepEqual(logged, ['Herdr press large.json refused: not read: over 65536 bytes'])
  } finally {
    stop?.()
  }
})

test('outside an app terminal the server follows no presses', () => {
  assert.equal(
    followCodexPresses(
      { HERDR_PANE_ID: 'p1' },
      async () => undefined,
      () => undefined,
    ),
    null,
  )
})

test("a press the look ran itself records the look's result, and each look press is saved as the last one with its outcome", async () => {
  const dir = tempDir()
  const root = tempDir()
  writeFileSync(join(root, 'notes.md'), '# Notes')
  await updateState(dir, 's1', s => ({
    ...s,
    root,
    ledger: {
      ...s.ledger,
      items: [
        {
          id: 'i2',
          kind: 'task',
          label: null,
          from: 'record',
          ask: 'Read notes',
          options: [],
          rec: null,
          turn: 1,
          at: 1,
          helps: [{ kind: 'open', path: 'notes.md' }],
        },
      ],
    },
  }))
  const calls: string[][] = []
  let apply: ((sessionId: string, file: PressFile) => Promise<void>) | null = null
  makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now: () => 100,
    exec: async args => {
      calls.push(args)
      return { code: 0, stdout: '', stderr: '' }
    },
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
    followHerdrPresses: given => {
      apply = given
    },
  })
  const look = (id: string, press: PressFile['press'], result?: PressFile['result']): PressFile => ({
    format: 1,
    id,
    pressedAt: 1,
    press,
    holds: NO_HOLDS,
    ...(result && { result }),
  })

  await apply!('s1', look('p1', { action: 'step', id: 'i2', step: 0, label: 'Open notes.md' }, { error: 'no editor' }))
  const opened = await readState(dir, 's1')
  assert.deepEqual(calls, [])
  assert.match(JSON.stringify(opened.lastActions.i2), /no editor/)
  assert.deepEqual(opened.lastHerdrPress, { id: 'p1', outcome: 'applied' })

  await apply!('s1', look('p2', { action: 'done', id: 'gone' }))
  assert.deepEqual((await readState(dir, 's1')).lastHerdrPress, { id: 'p2', outcome: 'stale' })
})
