import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import type { HerdrFile, PressFile } from '../../hooks/herdr-press-file'
import { isSubjectSeen } from '../../hooks/status-children'
import { EMPTY_SESSION_STATUS } from '../../hooks/status-limits'
import { makeServer } from '../src/server'
import { codexHerdrAsk, followCodexPresses } from '../src/server-herdr'
import { builtAtLine } from '../../hooks/herdr-install'
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

async function until(isDone: () => boolean, timeoutMs = 20_000) {
  const start = Date.now()
  while (!isDone()) {
    if (Date.now() - start > timeoutMs) throw new Error(`not done after ${timeoutMs} ms`)
    await new Promise(r => setTimeout(r, 10))
  }
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
    async (sessionId: string, file: HerdrFile) => {
      applied.push([sessionId, file.id])
    },
    () => undefined,
  )
  try {
    await until(() => applied.length === 1 && !existsSync(waiting))
    assert.deepEqual(applied, [['s1', 'p1']])

    const later = writePress(appHome, 's1', 'p4')
    await until(() => applied.length === 2 && !existsSync(later))
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
    async (_sessionId: string, file: HerdrFile) => {
      applied.push(file.id)
    },
    text => logged.push(text),
  )
  try {
    await until(() => applied.length === 1 && logged.length === 1 && !existsSync(waiting) && !existsSync(large))
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
  let apply: ((sessionId: string, file: HerdrFile) => Promise<void>) | null = null
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

test('a look file the Herdr look wrote counts the Status subjects it showed as seen, and saves no press', async () => {
  const dir = tempDir()
  const subject = (id: string) => ({
    id,
    name: `Piece ${id}`,
    status: 'working' as const,
    text: 'under way',
    was: null,
    merged: null,
    createdAt: 10,
    changedAt: 10,
    closedAt: null,
    into: null,
  })
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: { ...s.ledger, overview: { ...EMPTY_SESSION_STATUS, subjects: [subject('s1'), subject('s2')] } },
  }))
  let apply: ((sessionId: string, file: HerdrFile) => Promise<void>) | null = null
  makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now: () => 100,
    exec: async () => ({ code: 0, stdout: '', stderr: '' }),
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
    followHerdrPresses: given => {
      apply = given
    },
  })

  await apply!('s1', { format: 1, id: 'l1', look: { startedAt: 20, endedAt: 20_000, shown: { s1: 20 } } })
  const looked = await readState(dir, 's1')
  const overview = looked.ledger.overview!

  assert.deepEqual(
    overview.subjects.filter(s => isSubjectSeen(overview, s)).map(s => s.id),
    ['s1'],
  )
  assert.equal(looked.lastHerdrPress, undefined)
})

test('an Install press on the tab installs the Herdr mod, says so, and a later press finds the question closed', async () => {
  const appHome = tempDir()
  writeFileSync(join(appHome, 'settings.json'), '{}')
  const bundled = tempDir()
  const code = 'draw()'
  const mainJs = `// Built by herdr/build.ts\n${builtAtLine('2026-11-10T00:00:00.000Z', code.length)}\n${code}`
  writeFileSync(join(bundled, 'main.js'), mainJs)
  writeFileSync(join(bundled, 'mod.json'), '{}\n')
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir: tempDir(),
    now: () => 100,
    exec: async () => ({ code: 0, stdout: '', stderr: '' }),
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
    herdrAsk: codexHerdrAsk({ HOME: '/home/person', HERDR_APP_HOME: appHome }, bundled),
  })
  const press = async () =>
    (
      (await handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'inbox_press',
          arguments: { press: { action: 'herdr-ask', isYes: true } },
          _meta: { thread_id: 's1' },
        },
      })) as { result: { structuredContent: unknown } }
    ).result.structuredContent

  assert.deepEqual(await press(), {
    ask: { is: 'answered', text: '✓ Installed the inbox mod in Herdr.' },
    failure: null,
  })
  assert.equal(readFileSync(join(appHome, 'mods/inbox/main.js'), 'utf8'), mainJs)
  assert.deepEqual(await press(), { ask: null, failure: null })
})
