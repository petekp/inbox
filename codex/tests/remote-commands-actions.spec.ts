import assert from 'node:assert/strict'
import { test } from 'node:test'
import { remoteRowDigest } from '../../core/remote/remote-commands'
import type { RemoteCommand } from '../../core/remote/remote-commands'
import { markArrived } from '../../core/runtime/remote-command-state'
import { pressFile } from '../../core/remote/herdr-press-file'
import { wakeAfterSettle } from '../../core/runtime/host-press'
import { checkKey } from '../../core/domain/prs'
import { pressRowId } from '../../core/view/pr-press'
import { sessionView } from '../../core/view/session-view'
import { BLOCKED_PR, FIX_REF } from '../../tests/session-helpers'
import { remoteCommandFixture as fixture } from './remote-commands-fixture'

for (const kind of ['copy', 'run'] as const) {
  test(`remote step commands ${kind === 'copy' ? 'refuse device-local effects' : 'hand run instructions to the agent'}`, async () => {
    const h = fixture()
    await h.host.update(s => ({
      ...s,
      ledger: {
        ...s.ledger,
        items: s.ledger.items.map(item =>
          item.id === 'i1'
            ? {
                ...item,
                helps:
                  kind === 'copy'
                    ? [{ kind: 'copy' as const, text: 'Fixture text', name: null }]
                    : [{ kind: 'run' as const, command: 'echo fixture', name: null }],
              }
            : item,
        ),
      },
    }))
    const row = sessionView(h.state(), await h.host.now(), h.host.settleWindowMs).needsYou.questions.find(
      row => row.id === 'i1',
    )!
    const command: RemoteCommand = {
      ...h.command(),
      press: { action: 'step' as const, id: 'i1', step: 0, label: row.steps[0]!.label },
    }
    assert.equal(pressFile(JSON.stringify(command)).ok, true)
    await h.run(command)
    assert.equal((await h.receipt(command.id))?.state, kind === 'copy' ? 'refused' : 'applied')
    assert.equal(h.delivered.length, kind === 'copy' ? 0 : 1)
    assert.deepEqual(h.performed, [])
  })
}

test('remote goal edits retain receipts, reject stale revisions and never send an agent message', async () => {
  const f = fixture()
  const original = f.state().ledger.overview!.goal!.text
  const edit: RemoteCommand = {
    ...f.command(),
    expected: await remoteRowDigest(f.state(), 'goal'),
    press: { action: 'type', id: 'goal', text: 'Ship the private Inbox clients' },
  }
  assert.equal(pressFile(JSON.stringify(edit)).ok, true)
  await f.run(edit)
  assert.equal(f.state().ledger.overview!.goal!.text, 'Ship the private Inbox clients')
  f.restart()
  await f.run(edit)
  assert.equal((await f.receipt(edit.id))?.state, 'applied')
  const stale: RemoteCommand = { ...f.command(), expected: edit.expected, press: { action: 'remove-goal', id: 'goal' } }
  await f.run(stale)
  assert.equal((await f.receipt(stale.id))?.state, 'stale')
  const remove: RemoteCommand = {
    ...f.command(),
    expected: await remoteRowDigest(f.state(), 'goal'),
    press: { action: 'remove-goal', id: 'goal' },
  }
  assert.equal(pressFile(JSON.stringify(remove)).ok, true)
  await f.run(remove)
  assert.equal(f.state().ledger.overview!.goal, null)
  const undo: RemoteCommand = {
    ...f.command(),
    expected: await remoteRowDigest(f.state(), 'goal'),
    press: { action: 'restore-goal', id: 'goal' },
  }
  await f.run(undo)
  assert.equal(f.state().ledger.overview!.goal!.text, 'Ship the private Inbox clients')
  assert.notEqual(f.state().ledger.overview!.goal!.text, original)
  assert.deepEqual(f.delivered, [])
})

test('remote PR re-runs refresh their checks and retain the outcome across restart', async () => {
  const f = fixture()
  const check = {
    name: 'e2e',
    workflow: 'CI',
    bucket: 'cancelled' as const,
    url: 'https://github.com/acme/app/actions/runs/77/job/9',
  }
  await f.host.update(s => ({
    ...s,
    ledger: { ...s.ledger, prs: [FIX_REF] },
    prViews: { ...s.prViews, views: { [FIX_REF]: { ...BLOCKED_PR, checks: [check] } } },
  }))
  const runs: string[][] = []
  f.host.gh = {
    ...f.host.gh,
    find: async () => 'gh',
    run: () => async args => {
      runs.push(args)
      return { exitCode: 0, stdout: '', stderr: '' }
    },
  }
  f.host.refreshPrs = async () => {
    const at = await f.host.now()
    await f.host.update(s => ({
      ...s,
      prViews: {
        ...s.prViews,
        views: {
          [FIX_REF]: {
            ...BLOCKED_PR,
            fetchedAt: at,
            checks: [{ ...check, bucket: runs.length ? 'pending' : 'cancelled' }],
          },
        },
      },
    }))
  }
  const press = { action: 'check-rerun' as const, ref: FIX_REF, check: checkKey(check) }
  const command: RemoteCommand = { ...f.command(), press, expected: await remoteRowDigest(f.state(), pressRowId(press)) }
  assert.equal(pressFile(JSON.stringify(command)).ok, true)
  const result = await f.run(command)
  assert.equal(result.error, null)
  assert.equal((await f.receipt(command.id))?.state, 'applied')
  assert.equal((await f.commands.read()).commands[command.id]?.row, pressRowId(press))
  assert.deepEqual(runs, [['run', 'rerun', '77', '--failed', '-R', 'acme/app']])
  f.restart()
  await f.run(command)
  assert.equal((await f.receipt(command.id))?.state, 'applied')
  assert.equal(runs.length, 1)
  assert.deepEqual(f.delivered, [])
})

test('remote PR commands reject changed sibling checks and extra payload fields', async () => {
  const f = fixture()
  await f.host.update(s => ({
    ...s,
    ledger: { ...s.ledger, prs: [FIX_REF] },
    prViews: { ...s.prViews, views: { [FIX_REF]: BLOCKED_PR } },
  }))
  const press = { action: 'pr-conflicts' as const, ref: FIX_REF }
  const command: RemoteCommand = { ...f.command(), press, expected: await remoteRowDigest(f.state(), pressRowId(press)) }
  for (const malformed of [
    { ...press, id: 'i1' },
    { action: 'pr-refresh', ref: FIX_REF },
    { action: 'thread-draft', ref: FIX_REF },
    { action: 'pr-open', ref: FIX_REF },
  ])
    assert.equal(pressFile(JSON.stringify({ ...command, press: malformed })).ok, false)
  assert.equal(
    pressFile(JSON.stringify({ ...f.command(), press: { action: 'type', id: 'i1', text: 'Hello', ref: FIX_REF } })).ok,
    false,
  )
  await f.host.update(s => ({
    ...s,
    prViews: {
      ...s.prViews,
      views: {
        [FIX_REF]: { ...BLOCKED_PR, checks: [...BLOCKED_PR.checks, { name: 'new check', bucket: 'fail', url: null }] },
      },
    },
  }))
  await f.run(command)
  assert.equal((await f.receipt(command.id))?.state, 'stale')
  assert.deepEqual(f.delivered, [])
})

for (const currentTurn of [false, true]) {
  test(`Done receipt waits only for an eligible notification, current turn ${currentTurn}`, async () => {
    const f = fixture()
    await f.host.update(s => ({
      ...s,
      lastActions: {},
      ledger: {
        ...s.ledger,
        closed: [],
        items: s.ledger.items.map(item =>
          item.kind === 'task'
            ? {
                ...item,
                id: item.id === s.ledger.items.find(i => i.kind === 'task')!.id ? 'i2' : item.id,
                turn: s.ledger.turn - (currentTurn ? 0 : 1),
              }
            : item,
        ),
      },
    }))
    const command: RemoteCommand = {
      ...f.command(),
      expected: await remoteRowDigest(f.state(), 'i2'),
      press: { action: 'done', id: 'i2' },
    }
    await f.run(command)
    assert.equal((await f.receipt(command.id))?.state, 'applied')
    assert.equal((await f.receipt(command.id))?.pendingDelivery, currentTurn)
    f.advance(2000)
    await wakeAfterSettle(f.host)
    assert.equal(f.delivered.length, currentTurn ? 1 : 0)
    if (currentTurn) {
      const delivery = (await f.commands.read()).commands[command.id]!.deliveryId!
      assert.ok(delivery)
      await markArrived(f.commands, delivery)
      assert.equal((await f.receipt(command.id))?.delivered, true)
    }
    assert.equal((await f.receipt(command.id))?.pendingDelivery, false)
    f.restart()
    await f.run(command)
    assert.equal(f.delivered.length, currentTurn ? 1 : 0)
  })
}

test('Resume is durable, sends once, and refuses a changed or non-resumable stop', async () => {
  const f = fixture()
  f.host.supportsResume = true
  await f.host.update(s => ({
    ...s,
    stop: { kind: 'api-error', apiError: null, detail: 'overloaded', resets: null, at: 999999 },
    presence: { ...s.presence, isTurnRunning: false },
  }))
  const resume = {
    ...f.command(),
    press: { action: 'resume', id: 'session' },
    expected: await remoteRowDigest(f.state(), 'session'),
  } as RemoteCommand
  assert.equal(pressFile(JSON.stringify(resume)).ok, true)
  assert.equal(pressFile(JSON.stringify({ ...resume, press: { action: 'resume', id: 'i1' } })).ok, false)
  await f.run(resume)
  f.restart()
  await f.run(resume)
  assert.deepEqual(f.delivered, ['Continue'])
  const repeated = { ...f.command(), press: resume.press, expected: await remoteRowDigest(f.state(), 'session') }
  await f.run(repeated)
  assert.equal(f.delivered.length, 1)
  await f.host.update(s => ({
    ...s,
    stop: { kind: 'sign-in', apiError: null, detail: 'expired', resets: null, at: 1000010 },
  }))
  const denied = { ...f.command(), press: resume.press, expected: await remoteRowDigest(f.state(), 'session') }
  await f.run(denied)
  assert.equal(f.delivered.length, 1)
  const stale = { ...f.command(), press: resume.press, expected: await remoteRowDigest(f.state(), 'session') }
  await f.host.update(s => ({ ...s, stop: null }))
  await f.run(stale)
  assert.equal(f.delivered.length, 1)
})

test('a host without Resume support refuses a direct durable command', async () => {
  const f = fixture()
  await f.host.update(s => ({
    ...s,
    stop: { kind: 'api-error', apiError: null, detail: 'overloaded', resets: null, at: 999999 },
    presence: { ...s.presence, isTurnRunning: false },
  }))
  const command: RemoteCommand = {
    ...f.command(),
    press: { action: 'resume', id: 'session' },
    expected: await remoteRowDigest(f.state(), 'session'),
  }
  await f.run(command)
  assert.equal(f.delivered.length, 0)
  assert.equal((await f.receipt(command.id))?.state, 'refused')
})
