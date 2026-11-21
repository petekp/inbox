import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { test } from 'node:test'
import { demoSession } from '../../core/view/demo'
import { upgradeSession } from '../../core/view/session-files'
import { remoteRowVersion, startRemoteCommand } from '../../core/remote/remote-commands'
import type { RemoteCommand } from '../../core/remote/remote-commands'
import {
  commandsOf,
  EMPTY_LOG,
  remoteCommandState,
  remoteReceipts,
  withRecord,
} from '../../core/runtime/remote-command-state'
import type { CommandLog } from '../../core/runtime/remote-command-state'
import { movedLegacyCommands } from '../../core/runtime/command-store'
import { pruned } from '../../core/runtime/session-presses'
import { fakeHostWith } from '../../tests/session-script'
import { memoryCommandStore } from '../../tests/memory-command-store'
import { codexCommandStore, commandsPath } from '../src/command-log'
import { tempDir } from './helpers'

function fixture(isRunning?: (runner: { id: string }) => boolean) {
  let now = 1_000_000
  let state = demoSession(now, 'Claude')
  const question = state.ledger.items.find(row => row.kind === 'question')
  if (!question) throw new Error('The demo session has no question.')
  question.id = 'i1'
  let durable = structuredClone(state)
  let writing = Promise.resolve()
  let sequence = 0
  const commands = memoryCommandStore(isRunning)
  const built = fakeHostWith({
    read: async () => state,
    update: change => {
      const result = writing.then(async () => {
        state = await movedLegacyCommands(commands, pruned(await change(state), now), () => undefined)
        durable = structuredClone(state)
        await commands.update(log => remoteCommandState(log, state))
        return state
      })
      writing = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
    exclusive: async fn => ({ acquired: true, value: await fn() }),
  })(async () => null)
  built.host.now = () => now
  built.host.readDurable = async () => structuredClone(durable)
  built.host.commands = commands
  const command = (text = 'Fixture reply'): RemoteCommand => {
    now++
    return {
      format: 2,
      kind: 'command',
      id: `${now.toString(36)}-fixture-operation-${sequence++}`,
      session: 's1',
      issuedAt: now,
      expected: remoteRowVersion(state, 'i1'),
      press: { action: 'type', id: 'i1', text },
    }
  }
  const run = async (c: RemoteCommand) => {
    const started = await startRemoteCommand(built.host, c, 's1')
    return started.is === 'waiting' ? started.finish() : started.outcome
  }
  return {
    ...built,
    commands,
    command,
    run,
    receipt: async (id: string) => remoteReceipts(await commandsOf(commands, state))[id],
    state: () => state,
    durable: () => durable,
    setState: (next: typeof state) => {
      state = next
    },
    advance: (ms: number) => {
      now += ms
    },
    restart: () => {
      state = upgradeSession(durable)
    },
  }
}

function arrived(log: CommandLog, id: string): CommandLog {
  const c = log.commands[id]
  if (!c) throw new Error(`The log has no command ${id}.`)
  return withRecord(log, id, { ...c, delivered: true, pendingDelivery: false })
}

test('compacted history rejects an old command even when its row returns to its original state', async () => {
  const f = fixture()
  const first = f.command()
  await f.run(first)
  await f.host.update(s => ({ ...s, lastActions: {} }))
  await f.commands.update(log => arrived(log, first.id))
  for (let i = 0; i < 150; i++) await f.run({ ...f.command(), expected: 'a different row version' })
  const log = await f.commands.read()
  assert.equal(log.commands[first.id], undefined)
  assert.ok(log.floor >= first.issuedAt)
  assert.equal(remoteRowVersion(f.state(), 'i1'), first.expected)
  f.restart()
  await f.run(first)
  assert.equal(f.delivered.length, 1)
  assert.equal((await f.receipt(first.id))?.state, 'expired')
})

test('a full unresolved history retains its pending commands and publishes a durable refusal', async () => {
  const f = fixture()
  const attempted: RemoteCommand[] = []
  for (let i = 0; i < 50; i++) {
    await f.host.update(s => ({ ...s, lastActions: {} }))
    const next = f.command(`Pending reply ${i}`)
    attempted.push(next)
    await f.run(next)
  }
  const [first] = attempted
  const last = attempted.at(-1)
  if (!first || !last) throw new Error('No command was attempted.')
  const sent = f.delivered.length
  assert.ok(sent > 0 && sent < attempted.length)
  assert.equal((await f.receipt(last.id))?.state, 'refused')
  const log = await f.commands.read()
  assert.ok(log.commands[first.id]?.pendingDelivery)
  assert.ok(new TextEncoder().encode(JSON.stringify(log.commands)).byteLength <= 132_096)
  f.restart()
  await f.run(last)
  assert.equal(f.delivered.length, sent)
  assert.equal((await f.receipt(last.id))?.state, 'refused')
})

test('an expired request gets a saved outcome without executing', async () => {
  const f = fixture()
  const c = f.command()
  f.advance(2 * 24 * 60 * 60_000)
  await f.run(c)
  f.restart()
  assert.equal((await f.receipt(c.id))?.state, 'expired')
  assert.equal(f.delivered.length, 0)
})

for (const ambiguous of [false, true]) {
  test(`an in-turn receipt survives row replacement with ambiguity ${ambiguous}`, async () => {
    const f = fixture()
    f.host.deliver = async (s, text) => {
      await f.host.update(current => ({
        ...current,
        lastActions: {},
        sent: ambiguous
          ? [
              {
                text,
                press: null,
                at: 1,
                row: null,
                queuedId: null,
                pressedAt: null,
                deliveryId: 'earlier',
                phase: 'uncertain' as const,
              },
              ...s.sent,
            ]
          : s.sent,
      }))
      return { state: 'accepted', queuedId: null, isInTurn: true }
    }
    const c = f.command()
    await f.run(c)
    assert.deepEqual(f.state().lastActions, {})
    const receipt = await f.receipt(c.id)
    assert.equal(receipt?.delivered, !ambiguous)
    assert.equal(receipt?.pendingDelivery, ambiguous)
  })
}

test('eviction covers a completed command whose timestamp is ahead of the host clock', async () => {
  const f = fixture()
  const initial = f.command()
  const at = initial.issuedAt + 20_000
  const future = { ...initial, issuedAt: at, id: `${at.toString(36)}-future-operation-fixture` }
  await f.run(future)
  await f.host.update(s => ({ ...s, lastActions: {} }))
  await f.commands.update(log => arrived(log, future.id))
  for (let i = 0; i < 50; i++) {
    await f.host.update(s => ({ ...s, lastActions: {} }))
    await f.run(f.command(`Queued ${i}`))
  }
  assert.equal((await f.commands.read()).commands[future.id], undefined)
  const sent = f.delivered.length
  f.advance(30_000)
  await f.run(future)
  assert.equal(f.delivered.length, sent)
  assert.equal((await f.receipt(future.id))?.state, 'expired')
})

test('an invalid far-future refusal cannot poison the admission cutoff', async () => {
  const f = fixture()
  const request = f.command()
  const futureAt = request.issuedAt + 365 * 24 * 60 * 60_000
  const future = { ...request, issuedAt: futureAt, id: `${futureAt.toString(36)}-invalid-future-fixture` }
  await f.run(future)
  assert.equal(f.delivered.length, 0)
  assert.equal((await f.receipt(future.id))?.state, 'expired')
  const current = f.command()
  await f.run(current)
  assert.equal(f.delivered.length, 1)
  assert.equal((await f.receipt(current.id))?.state, 'applied')
  assert.ok((await f.commands.read()).floor < futureAt)
})

test('a command saves the session with its time as the floor an earlier build refuses older commands below', async () => {
  const f = fixture()
  const c = f.command()
  await f.run(c)
  assert.equal(f.durable().commandWrite?.id, c.id)
  assert.ok((f.durable().remoteCommandFloor ?? 0) >= c.issuedAt)
})

test('a message held until the agent’s turn ends leaves its command running, and the command applies once sent', async () => {
  const f = fixture()
  let endTurn = () => {}
  const turnEnds = new Promise<void>(resolve => {
    endTurn = resolve
  })
  f.host.isDeliveryHeldUntilRun = true
  f.host.deliver = async () => {
    await turnEnds
    return { state: 'accepted', queuedId: null }
  }
  const c = f.command()
  const started = await startRemoteCommand(f.host, c, 's1')
  assert.equal(started.is, 'waiting')
  assert.equal((await f.receipt(c.id))?.state, 'attempting')
  endTurn()
  if (started.is === 'waiting') await started.finish()
  assert.equal((await f.receipt(c.id))?.state, 'applied')
})

test('a command left running by a process that has ended reads as uncertain', async () => {
  const f = fixture(runner => runner.id === 'this-process')
  const c = f.command()
  await f.run(c)
  await f.commands.update(log => {
    const record = log.commands[c.id]
    if (!record) throw new Error('The command was not admitted.')
    return withRecord(log, c.id, { ...record, state: 'attempting', runner: { id: 'ended', startedAt: 0 } })
  })
  await f.run({ ...f.command(), expected: 'a different row version' })
  const receipt = await f.receipt(c.id)
  assert.equal(receipt?.state, 'uncertain')
  assert.equal(receipt?.error, 'The host could not confirm this action.')
})

test('a session an earlier build saved with its commands keeps their outcomes in the command log', async () => {
  const f = fixture()
  const c = f.command()
  await f.run(c)
  const log = await f.commands.read()
  await f.commands.update(() => EMPTY_LOG)
  f.setState({ ...f.state(), remoteCommands: log.commands, remoteCommandFloor: log.floor })
  await f.host.update(s => ({ ...s }))
  assert.equal('remoteCommands' in f.state(), false)
  const moved = await f.commands.read()
  assert.equal(moved.commands[c.id]?.state, 'applied')
  assert.equal(moved.floor, log.floor)
  await f.run(c)
  assert.equal(f.delivered.length, 1)
})

test('an unreadable command log is moved aside, and the log that replaces it refuses every earlier command', async () => {
  const dir = tempDir()
  const store = codexCommandStore(dir, 's1', () => 5_000)
  const path = commandsPath(dir, 's1')
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, '{ not a log')
  assert.deepEqual(await store.read(), { ...EMPTY_LOG, floor: 5_000 })
  await store.update(log => log)
  assert.equal(readFileSync(`${path}.unreadable-5000`, 'utf8'), '{ not a log')
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).floor, 5_000)
  assert.ok(existsSync(path))
})
