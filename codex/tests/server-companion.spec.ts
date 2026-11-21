import { pressFile } from '../../core/remote/herdr-press-file'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { makeServer } from '../src/server'
import { readState, updateState } from '../src/state'
import { codexCommandStore } from '../src/command-log'
import { readViewers } from '../src/viewers'
import { remoteRowVersion } from '../../core/remote/remote-commands'
import type { RemoteCommand } from '../../core/remote/remote-commands'
import { tempDir, removeTempDir } from './helpers'

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
      session: { lastAnswers: { ledger: unknown; status: unknown } }
    }
    assert.ok(view.writtenAt > 0)
    assert.equal('remoteCommands' in view.session, false)
    assert.equal('remoteViewers' in view.session, false)
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
    assert.ok((await readViewers(dir, 'companion-session')).leases['companion-viewer-1234'])
    assert.equal('remoteViewers' in JSON.parse(readFileSync(path, 'utf8')), false)
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
  const commandState = async (id: string) =>
    (await codexCommandStore(dir, session, () => now).read()).commands[id]?.state
  try {
    await apply(await command({ action: 'type', id: 'goal', text: 'Finish the settings screen' }))
    assert.equal((await state()).ledger.overview?.goal?.text, 'Finish the settings screen')
    const staleRemove = await command({ action: 'remove-goal', id: 'goal' })
    await apply(await command({ action: 'type', id: 'goal', text: 'Finish the profile screen' }))
    await apply(staleRemove)
    assert.equal(await commandState(staleRemove.id), 'stale')
    assert.equal((await state()).ledger.overview?.goal?.text, 'Finish the profile screen')
    const remove = await command({ action: 'remove-goal', id: 'goal' })
    await apply(remove)
    assert.equal((await state()).ledger.overview?.goal, null)
    assert.equal(await commandState(remove.id), 'applied')
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
    assert.equal(await commandState(staleSuggestion.id), 'stale')
    assert.equal((await state()).ledger.overview?.goal, null)
    const take = await command({ action: 'take-goal', id: 'goal' })
    await apply(take)
    assert.equal((await state()).ledger.overview?.goal?.text, 'Ship the profile screen')
    assert.equal(await commandState(take.id), 'applied')
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
    assert.equal((await codexCommandStore(dir, session, () => now).read()).commands[command.id]?.state, 'applied')
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
