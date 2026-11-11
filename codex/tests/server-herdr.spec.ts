import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import type { PressFile } from '../../hooks/herdr'
import { followCodexPresses } from '../src/server-herdr'
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
