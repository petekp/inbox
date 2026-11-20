import { pressFile } from '../../hooks/herdr-press-file'
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
import { remoteRowVersion } from '../../hooks/remote-commands'
import type { RemoteCommand } from '../../hooks/remote-commands'
import { NO_HOLDS } from '../../hooks/timing'
import { tempDir, removeTempDir } from './helpers'

const DONE = { waiting: null }

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
      return DONE
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
      return DONE
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
      async () => DONE,
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
      apply = async (id, file) => void (await (await given(id, file)).waiting?.())
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
      apply = async (id, file) => void (await (await given(id, file)).waiting?.())
    },
  })

  await apply!('s1', {
    format: 1,
    id: 'l1',
    look: { startedAt: 20, endedAt: 20_000, shown: { s1: 20 }, drawnWrittenAt: 20_000 },
  })
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

test('a remote typed reply retains its outcome and does not queue twice after the server restarts', async () => {
  const dir = tempDir()
  await updateState(dir, 'remote-session', s => ({
    ...s,
    ledger: {
      ...s.ledger,
      items: [
        {
          id: 'i1',
          kind: 'task',
          ask: 'Review the preview',
          label: null,
          from: 'record',
          options: [],
          rec: null,
          turn: 1,
          at: 1,
          helps: [],
        },
      ],
    },
  }))
  const calls: string[][] = []
  const server = () => {
    let apply: ((sessionId: string, file: HerdrFile) => Promise<void>) | null = null
    makeServer({
      comparePage: '/plugin/dist/compare-page.html',
      dir,
      now: () => 1_000_000,
      exec: async args => {
        calls.push(args)
        return { code: 0, stdout: 'Queued message fixture', stderr: '' }
      },
      tabHtml: '<html></html>',
      fallbackCli: async () => 'codex',
      followHerdrPresses: given => {
        apply = async (id, file) => void (await (await given(id, file)).waiting?.())
      },
    })
    return (file: HerdrFile) => apply!('remote-session', file)
  }
  const initial = await readState(dir, 'remote-session')
  const command: RemoteCommand = {
    format: 2,
    kind: 'command',
    id: `${(1_000_000).toString(36)}-remote-command-fixture`,
    session: 'remote-session',
    issuedAt: 1_000_000,
    expected: remoteRowVersion(initial, 'i1'),
    press: { action: 'type', id: 'i1', text: 'The preview looks good.' },
  }
  await server()(command)
  const first = await readState(dir, 'remote-session')
  assert.equal(first.remoteCommands[command.id]!.state, 'applied')
  assert.equal(calls.filter(args => args.includes('queue')).length, 1)
  await server()(command)
  const after = await readState(dir, 'remote-session')
  assert.equal(calls.filter(args => args.includes('queue')).length, 1)
  assert.deepEqual(after.remoteCommands[command.id], first.remoteCommands[command.id])
  assert.equal(after.ledger.items[0]?.id, 'i1')
})

test('desktop companion reads are passive and viewer updates preserve the original tab', async () => {
  const dir = tempDir()
  let calls = 0
  const now = Date.now()
  await updateState(
    dir,
    'companion-session',
    s => ({
      ...s,
      lastAnswers: {
        ledger: { at: now, turn: 1, reads: 'reply', isParsed: true, text: 'private model answer', chars: 20 },
        status: null,
      },
      heldRows: ['i1'],
      shownSince: now - 100,
      shownTab: 'needsYou',
      lookRows: { subject: now - 50 },
    }),
    () => now,
  )
  const handle = makeServer({
    dir,
    now: () => now,
    exec: async () => {
      calls++
      return { code: 0, stdout: '', stderr: '' }
    },
    tabHtml: '',
    fallbackCli: async () => 'codex',
    comparePage: '/fixture/compare.html',
  })
  const scope = [{ id: 'companion-session', name: 'Fixture' }]
  const path = join(dir, 'sessions/companion-session.json')
  const before = readFileSync(path, 'utf8')
  try {
    const listing = (await handle.companion({ version: 1, operation: 'list' }, scope)) as { sessions: { id: string }[] }
    assert.deepEqual(
      listing.sessions.map(s => s.id),
      ['companion-session'],
    )
    const view = (await handle.companion(
      { version: 1, operation: 'view', session: 'companion-session', opened: false },
      scope,
    )) as {
      writtenAt: number
      session: { remoteCommands: object; remoteViewers: object; lastAnswers: { ledger: unknown; status: unknown } }
    }
    assert.ok(view.writtenAt > 0)
    assert.deepEqual(view.session.remoteCommands, {})
    assert.deepEqual(view.session.remoteViewers, {})
    assert.deepEqual(view.session.lastAnswers, { ledger: null, status: null })
    assert.equal(readFileSync(path, 'utf8'), before)
    assert.equal(calls, 0)
    await assert.rejects(
      handle.companion({ version: 1, operation: 'view', session: 'missing', opened: true }, [
        { id: 'missing', name: 'Missing' },
      ]),
    )
    assert.equal(existsSync(join(dir, 'sessions/missing.json')), false)
    const missingList = (await handle.companion({ version: 1, operation: 'list' }, [
      { id: 'missing', name: 'Missing' },
    ])) as { sessions: { id: string; available: boolean }[] }
    assert.deepEqual(
      missingList.sessions.map(s => ({ id: s.id, available: s.available })),
      [{ id: 'missing', available: false }],
    )
    await handle.companion(
      {
        version: 1,
        operation: 'apply',
        session: 'companion-session',
        file: {
          format: 2,
          kind: 'viewer',
          id: 'companion-viewer-1234',
          session: 'companion-session',
          issuedAt: now,
          generation: 1,
          sequence: 1,
          active: true,
          replies: ['i2'],
          tab: 'prs',
          shownRows: [],
          listActive: false,
        },
      },
      scope,
    )
    const after = await readState(dir, 'companion-session')
    assert.deepEqual(after.heldRows, ['i1'])
    assert.equal(after.shownSince, now - 100)
    assert.equal(after.shownTab, 'needsYou')
    assert.deepEqual(after.lookRows, { subject: now - 50 })
    assert.ok(after.remoteViewers['companion-viewer-1234'])
  } finally {
    await removeTempDir(dir, handle)
  }
})

test('companion goal controls reject stale views and retain outcomes across retries', async () => {
  const dir = tempDir()
  const now = 2_000_000
  const session = 'goal-session'
  await updateState(
    dir,
    session,
    s => s,
    () => now,
  )
  const handle = makeServer({
    dir,
    now: () => now,
    exec: async () => {
      throw new Error('Goal controls must not execute an agent command')
    },
    tabHtml: '',
    fallbackCli: async () => 'codex',
    comparePage: '/fixture/compare.html',
  })
  const scope = [{ id: session, name: 'Goal controls' }]
  let sequence = 0
  const command = async (press: RemoteCommand['press']): Promise<RemoteCommand> => ({
    format: 2,
    kind: 'command',
    id: `${now.toString(36)}-goal-control-fixture-${++sequence}`,
    session,
    issuedAt: now,
    expected: remoteRowVersion(await readState(dir, session), 'goal'),
    press,
  })
  const apply = (file: RemoteCommand) => {
    const parsed = pressFile(JSON.stringify(file))
    assert.ok(parsed.ok)
    assert.ok(parsed.file.format === 2)
    return handle.companion({ version: 1, operation: 'apply', session, file: parsed.file }, scope)
  }
  const state = () => readState(dir, session)
  try {
    await apply(await command({ action: 'type', id: 'goal', text: 'Finish the settings screen' }))
    assert.equal((await state()).ledger.overview?.goal?.text, 'Finish the settings screen')
    const staleRemove = await command({ action: 'remove-goal', id: 'goal' })
    await apply(await command({ action: 'type', id: 'goal', text: 'Finish the profile screen' }))
    await apply(staleRemove)
    assert.equal((await state()).remoteCommands[staleRemove.id]?.state, 'stale')
    assert.equal((await state()).ledger.overview?.goal?.text, 'Finish the profile screen')
    const remove = await command({ action: 'remove-goal', id: 'goal' })
    await apply(remove)
    assert.equal((await state()).ledger.overview?.goal, null)
    assert.equal((await state()).remoteCommands[remove.id]?.state, 'applied')
    await apply(await command({ action: 'restore-goal', id: 'goal' }))
    assert.equal((await state()).ledger.overview?.goal?.text, 'Finish the profile screen')
    await apply(remove)
    assert.equal((await state()).ledger.overview?.goal?.text, 'Finish the profile screen')
    await apply(await command({ action: 'remove-goal', id: 'goal' }))
    await updateState(
      dir,
      session,
      s => ({
        ...s,
        ledger: { ...s.ledger, overview: { ...s.ledger.overview!, suggestedGoal: 'Ship the settings screen' } },
      }),
      () => now,
    )
    const staleSuggestion = await command({ action: 'take-goal', id: 'goal' })
    await updateState(
      dir,
      session,
      s => ({
        ...s,
        ledger: { ...s.ledger, overview: { ...s.ledger.overview!, suggestedGoal: 'Ship the profile screen' } },
      }),
      () => now,
    )
    await apply(staleSuggestion)
    assert.equal((await state()).remoteCommands[staleSuggestion.id]?.state, 'stale')
    assert.equal((await state()).ledger.overview?.goal, null)
    const take = await command({ action: 'take-goal', id: 'goal' })
    await apply(take)
    assert.equal((await state()).ledger.overview?.goal?.text, 'Ship the profile screen')
    assert.equal((await state()).remoteCommands[take.id]?.state, 'applied')
    await apply(take)
    assert.equal((await state()).ledger.overview?.goal?.text, 'Ship the profile screen')
  } finally {
    await removeTempDir(dir, handle)
  }
})

test('a companion Compare queues once and keeps the design question open', async () => {
  const dir = tempDir()
  const now = 2_000_000
  const session = 'compare-session'
  await updateState(dir, session, s => ({
    ...s,
    ledger: {
      ...s.ledger,
      items: [
        {
          id: 'i1',
          kind: 'question',
          ask: 'Which layout should we use?',
          label: null,
          from: 'record',
          options: ['North', 'South'],
          rec: null,
          turn: 1,
          at: 1,
          helps: [],
          isDesignChoice: true,
        },
      ],
    },
  }))
  const messages: string[] = []
  const handle = makeServer({
    dir,
    now: () => now,
    exec: async args => {
      if (args.includes('queue')) messages.push(args.join(' '))
      return { code: 0, stdout: 'Queued message fixture', stderr: '' }
    },
    tabHtml: '',
    fallbackCli: async () => 'codex',
    comparePage: '/fixture/compare.html',
  })
  const scope = [{ id: session, name: 'Compare check' }]
  try {
    const command: RemoteCommand = {
      format: 2,
      kind: 'command',
      id: `${now.toString(36)}-compare-command-fixture`,
      session,
      issuedAt: now,
      expected: remoteRowVersion(await readState(dir, session), 'i1'),
      press: { action: 'compare', id: 'i1' },
    }
    const parsed = pressFile(JSON.stringify(command))
    assert.ok(parsed.ok && parsed.file.format === 2)
    const request = { version: 1, operation: 'apply', session, file: parsed.file } as const
    await handle.companion(request, scope)
    await handle.companion(request, scope)
    const saved = await readState(dir, session)
    assert.equal(saved.remoteCommands[command.id]?.state, 'applied')
    assert.deepEqual(
      saved.ledger.items.map(item => item.ask),
      ['Which layout should we use?'],
    )
    assert.equal(messages.length, 1)
    assert.match(messages[0]!, /\/fixture\/compare\.html/)
    assert.match(messages[0]!, /Which layout should we use\?/)
  } finally {
    await removeTempDir(dir, handle)
  }
})
