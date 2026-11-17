import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demoSession } from '../../hooks/demo'
import { upgradeSession } from '../../hooks/session-files'
import { applyRemoteCommand, remoteRowVersion } from '../../hooks/remote-commands'
import type { RemoteCommand } from '../../hooks/remote-commands'
import { remoteCommandArrival, remoteReceipts } from '../../hooks/remote-command-state'
import { pruned } from '../../hooks/session-presses'
import { fakeHostWith } from '../../tests/session-script'

function fixture() {
  let now = 1_000_000
  let state = demoSession(now, 'Claude')
  state.ledger.items.find(row => row.kind === 'question')!.id = 'i1'
  let durable = structuredClone(state)
  let writing = Promise.resolve()
  let sequence = 0
  const built = fakeHostWith({
    read: async () => state,
    update: change => {
      const result = writing.then(async () => {
        state = pruned(await change(state), now)
        durable = structuredClone(state)
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
  return {
    ...built,
    command,
    state: () => state,
    advance: (ms: number) => {
      now += ms
    },
    restart: () => {
      state = upgradeSession(durable)
    },
  }
}

test('compacted history rejects an old command even when its row returns to its original state', async () => {
  const f = fixture()
  const first = f.command()
  await applyRemoteCommand(f.host, first, 's1')
  const delivery = f.state().remoteCommands[first.id]!.deliveryId!
  await f.host.update(s => remoteCommandArrival({ ...s, lastActions: {} }, delivery))
  for (let i = 0; i < 150; i++) {
    const next = f.command()
    await applyRemoteCommand(f.host, { ...next, expected: 'a different row version' }, 's1')
  }
  assert.equal(f.state().remoteCommands[first.id], undefined)
  assert.ok((f.state().remoteCommandFloor ?? 0) >= first.issuedAt)
  assert.equal(remoteRowVersion(f.state(), 'i1'), first.expected)
  f.restart()
  await applyRemoteCommand(f.host, first, 's1')
  assert.equal(f.delivered.length, 1)
  assert.equal(remoteReceipts(f.state())[first.id]?.state, 'expired')
})

test('a full unresolved history retains its pending commands and publishes a durable refusal', async () => {
  const f = fixture()
  const attempted: RemoteCommand[] = []
  for (let i = 0; i < 50; i++) {
    await f.host.update(s => ({ ...s, lastActions: {} }))
    const next = f.command(`Pending reply ${i}`)
    attempted.push(next)
    await applyRemoteCommand(f.host, next, 's1')
  }
  const last = attempted.at(-1)!
  const sent = f.delivered.length
  assert.ok(sent > 0 && sent < attempted.length)
  assert.equal(remoteReceipts(f.state())[last.id]?.state, 'refused')
  assert.ok(f.state().remoteCommands[attempted[0]!.id]?.pendingDelivery)
  assert.ok(new TextEncoder().encode(JSON.stringify(f.state().remoteCommands)).byteLength <= 132_096)
  f.restart()
  await applyRemoteCommand(f.host, last, 's1')
  assert.equal(f.delivered.length, sent)
  assert.equal(remoteReceipts(f.state())[last.id]?.state, 'refused')
})

test('an expired request gets a saved outcome without executing', async () => {
  const f = fixture()
  const c = f.command()
  f.advance(2 * 24 * 60 * 60_000)
  await applyRemoteCommand(f.host, c, 's1')
  f.restart()
  assert.equal(remoteReceipts(f.state())[c.id]?.state, 'expired')
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
    await applyRemoteCommand(f.host, c, 's1')
    assert.deepEqual(f.state().lastActions, {})
    const receipt = remoteReceipts(f.state())[c.id]!
    assert.equal(receipt.delivered, !ambiguous)
    assert.equal(receipt.pendingDelivery, ambiguous)
  })
}

test('eviction covers a completed command whose timestamp is ahead of the host clock', async () => {
  const f = fixture()
  const initial = f.command()
  const at = initial.issuedAt + 20_000
  const future = { ...initial, issuedAt: at, id: `${at.toString(36)}-future-operation-fixture` }
  await applyRemoteCommand(f.host, future, 's1')
  await f.host.update(s => remoteCommandArrival({ ...s, lastActions: {} }, s.remoteCommands[future.id]!.deliveryId!))
  for (let i = 0; i < 50; i++) {
    await f.host.update(s => ({ ...s, lastActions: {} }))
    await applyRemoteCommand(f.host, f.command(`Queued ${i}`), 's1')
  }
  assert.equal(f.state().remoteCommands[future.id], undefined)
  const sent = f.delivered.length
  f.advance(30_000)
  await applyRemoteCommand(f.host, future, 's1')
  assert.equal(f.delivered.length, sent)
  assert.equal(remoteReceipts(f.state())[future.id]?.state, 'expired')
})

test('an invalid far-future refusal cannot poison the admission cutoff', async () => {
  const f = fixture()
  const request = f.command()
  const futureAt = request.issuedAt + 365 * 24 * 60 * 60_000
  const future = { ...request, issuedAt: futureAt, id: `${futureAt.toString(36)}-invalid-future-fixture` }
  await applyRemoteCommand(f.host, future, 's1')
  assert.equal(f.delivered.length, 0)
  assert.equal(remoteReceipts(f.state())[future.id]?.state, 'expired')
  const current = f.command()
  await applyRemoteCommand(f.host, current, 's1')
  assert.equal(f.delivered.length, 1)
  assert.equal(remoteReceipts(f.state())[current.id]?.state, 'applied')
  assert.ok((f.state().remoteCommandFloor ?? 0) < futureAt)
})
