import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { test } from 'node:test'
import { remoteRowDigest, startRemoteCommand } from '../../core/remote/remote-commands'
import { rowVersion } from '../../core/domain/preconditions'
import type { RemoteCommand } from '../../core/remote/remote-commands'
import { EMPTY_LOG, withLegacy, withRecord } from '../../core/runtime/remote-command-state'
import type { CommandLog } from '../../core/runtime/remote-command-state'
import { codexCommandStore, commandsPath } from '../src/command-log'
import { tempDir } from './helpers'
import { remoteCommandFixture as fixture } from './remote-commands-fixture'
import type { Delivery } from '../../types'

async function setRowDelivery(f: ReturnType<typeof fixture>, delivery: Delivery) {
  await f.host.update(s => {
    const last = s.lastActions.i1
    if (!last) throw new Error('The command pressed no row.')
    return { ...s, lastActions: { ...s.lastActions, i1: { ...last, delivery } } }
  })
}

async function strand(f: ReturnType<typeof fixture>, id: string) {
  await f.commands.update(log => {
    const record = log.commands[id]
    if (!record) throw new Error('The command was not admitted.')
    return withRecord(log, id, { ...record, state: 'attempting', runner: { id: 'ended', startedAt: 0 } })
  })
}

function arrived(log: CommandLog, id: string): CommandLog {
  const c = log.commands[id]
  if (!c) throw new Error(`The log has no command ${id}.`)
  return withRecord(log, id, { ...c, delivered: true, pendingDelivery: false })
}

test("a companion's second press on a row acts with the version it read before its first", async () => {
  for (const versionOf of [rowVersion, remoteRowDigest]) {
    const f = fixture()
    const expected = await versionOf(f.state(), 'i1')
    const explain = await f.run({ ...f.command(), expected, press: { action: 'explain', id: 'i1' } })
    const compare = await f.run({ ...f.command(), expected, press: { action: 'compare', id: 'i1' } })
    assert.deepEqual([explain.error, explain.note, compare.error, compare.note], [null, null, null, null])
    assert.equal(f.delivered.length, 2)
  }
})

test('a companion Done on a task from an earlier turn applies with no message pending, and one from this turn waits for its message', async () => {
  const receipts = []
  for (const turnsLater of [1, 0]) {
    const f = fixture()
    f.setState({ ...f.state(), ledger: { ...f.state().ledger, turn: f.state().ledger.turn + turnsLater } })
    const done = { ...f.command(), press: { action: 'done' as const, id: 'i1' } }
    await f.run(done)
    const { state, pendingDelivery, delivered } = (await f.receipt(done.id)) ?? {}
    receipts.push({ state, pendingDelivery, delivered })
  }
  assert.deepEqual(receipts, [
    { state: 'applied', pendingDelivery: false, delivered: false },
    { state: 'applied', pendingDelivery: true, delivered: false },
  ])
})

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
  assert.equal(rowVersion(f.state(), 'i1'), first.expected)
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

test('each session write a command makes is stamped with the command and raises the saved floor to its time', async () => {
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

test('a command left running by a process that has ended stops running, and its held message reads Not sent', async () => {
  const f = fixture(runner => runner.id === 'this-process')
  const c = f.command()
  await f.run(c)
  await setRowDelivery(f, { state: 'held', message: 'Fixture reply', until: Infinity, by: null })
  await strand(f, c.id)
  await f.run({ ...f.command(), expected: 'a different row version' })
  const receipt = await f.receipt(c.id)
  assert.equal(receipt?.state, 'failed')
  assert.equal(receipt?.error, 'The host could not confirm this action.')
  assert.equal(f.state().lastActions.i1?.delivery?.state, 'failed')
})

test('a command whose message waits for the agent’s turn reads Not sent once the process that held it has ended', async () => {
  const f = fixture(runner => runner.id === 'this-process')
  const c = f.command()
  await f.run(c)
  await setRowDelivery(f, { state: 'queued', message: 'Fixture reply' })
  await strand(f, c.id)
  await f.run({ ...f.command(), expected: 'a different row version' })
  assert.equal(f.state().lastActions.i1?.delivery?.state, 'failed')
  assert.equal((await f.receipt(c.id))?.state, 'failed')
})

test('a row whose command the log has no record of reads Not sent instead of waiting forever', async () => {
  const f = fixture()
  const c = f.command()
  await f.run(c)
  await setRowDelivery(f, { state: 'held', message: 'Fixture reply', until: Infinity, by: null })
  await f.commands.update(() => ({ ...EMPTY_LOG, floor: 1 }))
  await f.run({ ...f.command(), expected: 'a different row version' })
  assert.equal(f.state().lastActions.i1?.delivery?.state, 'failed')
})

test('a command log that was never written refuses commands at or before the session’s floor', async () => {
  const f = fixture()
  const c = f.command()
  f.setState({ ...f.state(), remoteCommandFloor: c.issuedAt })
  await f.run(c)
  assert.equal(f.delivered.length, 0)
  assert.equal((await f.receipt(c.id))?.state, 'expired')
})

test('a record an earlier build took further wins over the same command only accepted in the log', async () => {
  const f = fixture()
  const c = f.command()
  await f.run(c)
  const applied = (await f.commands.read()).commands[c.id]
  if (!applied) throw new Error('The command was not admitted.')
  const log = withRecord({ ...EMPTY_LOG, writtenAt: 1 }, c.id, { ...applied, state: 'accepted' })
  const merged = withLegacy(log, { ...f.state(), remoteCommands: { [c.id]: applied } })
  assert.equal(merged.commands[c.id]?.state, 'applied')
})

test('a session an earlier build saved with its commands keeps their outcomes in the command log', async () => {
  const f = fixture()
  const c = f.command()
  await f.run(c)
  const log = await f.commands.read()
  await f.commands.update(() => EMPTY_LOG)
  f.setState({ ...f.state(), remoteCommands: log.commands, remoteCommandFloor: log.floor })
  await f.run(f.command('Next reply'))
  assert.equal('remoteCommands' in f.state(), false)
  const moved = await f.commands.read()
  assert.equal(moved.commands[c.id]?.state, 'applied')
  assert.equal(moved.floor, log.floor)
  await f.run(c)
  assert.equal(f.delivered.length, 2)
})

test('a command whose delivery id the log cannot take sends nothing', async () => {
  const f = fixture()
  const c = f.command()
  f.allowUpdates(2)
  await f.run(c).catch(() => undefined)
  assert.equal(f.delivered.length, 0)
  assert.equal(f.state().lastActions.i1?.delivery?.state, 'failed')
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
