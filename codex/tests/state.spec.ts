import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  rmdir,
  stat,
  symlink,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { KEPT_SESSIONS } from '../../hooks/ledger'
import { SESSION_VERSION } from '../../hooks/session-version'
import { pruneSessions, readState, statePath, tryWithLock, updateState, withLock } from '../src/state'
import { notePrompt } from '../src/core'
import { tempDir } from './helpers'

const childMode = process.env.INBOX_STATE_LOCK_CHILD
if (childMode) {
  const path = process.argv[2]!
  const hold = async () => {
    process.send?.('ready')
    await new Promise(() => {})
  }
  if (childMode === 'prepare') {
    await mkdir(`${path}.owner-${process.pid}-${randomUUID()}`, { recursive: true })
    await hold()
  } else if (childMode === 'hold') await withLock(path, hold)
  else {
    const target = await readlink(path)
    const owner = target.endsWith('/held') ? dirname(target) : target
    await rename(owner, `${owner}.recover-${process.pid}-${randomUUID()}`)
    await hold()
  }
}

async function lockChild(path: string, mode: 'prepare' | 'hold' | 'recover') {
  const child = fork(fileURLToPath(import.meta.url), [path], {
    env: { ...process.env, INBOX_STATE_LOCK_CHILD: mode },
    silent: true,
  })
  try {
    await once(child, 'message', { signal: AbortSignal.timeout(5_000) })
  } catch (err) {
    child.kill('SIGKILL')
    throw err
  }

  return child
}

async function kill(child: ReturnType<typeof fork>) {
  const exited = once(child, 'exit')
  child.kill('SIGKILL')
  await exited
}

test('a live writer keeps its lock after fifteen seconds and a waiting writer preserves both updates', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  let entered!: () => void
  const ready = new Promise<void>(resolve => (entered = resolve))
  let release!: () => void
  const held = new Promise<void>(resolve => (release = resolve))
  const first = updateState(dir, 's1', async s => {
    entered()
    await held
    return { ...s, ledger: { ...s.ledger, turn: s.ledger.turn + 1 } }
  })
  await ready
  const path = `${statePath(dir, 's1')}.lock`
  const old = new Date(Date.now() - 20_000)
  await utimes(dirname(await readlink(path)), old, old)
  try {
    await assert.rejects(
      withLock(path, async () => assert.fail('entered a live lock'), 30),
      /Timed out/,
    )
  } finally {
    release()
  }
  await first
  await updateState(dir, 's1', s => ({ ...s, ledger: { ...s.ledger, turn: s.ledger.turn + 1 } }))
  assert.equal((await readState(dir, 's1')).ledger.turn, 2)
})

test('an older writer waits and times out on an aged new lock', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = join(dir, 'test.lock')
  await withLock(path, async () => {
    const target = await readlink(path)
    const old = new Date(Date.now() - 20_000)
    await utimes(dirname(target), old, old)
    const until = Date.now() + 80
    let attempts = 0
    await assert.rejects(async () => {
      for (;;) {
        if (++attempts > 100) throw new Error('older writer spun')
        try {
          await mkdir(path)
          assert.fail('older writer entered a live lock')
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
          const age = await stat(path).then(
            s => Date.now() - s.mtimeMs,
            () => 0,
          )
          if (age > 15_000) await rmdir(path).catch(() => undefined)
          else if (Date.now() > until) throw new Error('older writer timed out')
          else await new Promise(resolve => setTimeout(resolve, 15))
        }
      }
    }, /older writer timed out/)
  })
})

test('a killed lock owner is recovered by concurrent writers without losing updates', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = `${statePath(dir, 's1')}.lock`
  const preparing = await lockChild(path, 'prepare')
  t.after(() => preparing.kill('SIGKILL'))
  await kill(preparing)
  await withLock(path, async () => undefined)
  const child = await lockChild(path, 'hold')
  t.after(() => child.kill('SIGKILL'))
  await kill(child)
  await Promise.all(
    Array.from({ length: 20 }, () =>
      updateState(dir, 's1', s => ({ ...s, ledger: { ...s.ledger, turn: s.ledger.turn + 1 } })),
    ),
  )
  assert.equal((await readState(dir, 's1')).ledger.turn, 20)
  await assert.rejects(lstat(path), { code: 'ENOENT' })
})

test('recovery resumes when its process dies after claiming a dead owner', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = `${statePath(dir, 's1')}.lock`
  const owner = await lockChild(path, 'hold')
  t.after(() => owner.kill('SIGKILL'))
  await kill(owner)
  const recovering = await lockChild(path, 'recover')
  t.after(() => recovering.kill('SIGKILL'))
  await kill(recovering)
  await updateState(dir, 's1', s => ({ ...s, ledger: { ...s.ledger, turn: 1 } }))
  assert.equal((await readState(dir, 's1')).ledger.turn, 1)
  await assert.rejects(lstat(path), { code: 'ENOENT' })
})

test('an old owner cannot release a replacement lock', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = join(dir, 'test.lock')
  let firstEntered!: () => void
  let releaseFirst!: () => void
  const firstReady = new Promise<void>(resolve => (firstEntered = resolve))
  const firstHeld = new Promise<void>(resolve => (releaseFirst = resolve))
  const first = withLock(path, async () => {
    firstEntered()
    await firstHeld
  })
  await firstReady
  await unlink(path)
  let secondEntered!: () => void
  let releaseSecond!: () => void
  const secondReady = new Promise<void>(resolve => (secondEntered = resolve))
  const secondHeld = new Promise<void>(resolve => (releaseSecond = resolve))
  const second = withLock(path, async () => {
    secondEntered()
    await secondHeld
  })
  await secondReady
  releaseFirst()
  await first
  try {
    await assert.rejects(
      withLock(path, async () => assert.fail('replacement lost its lock'), 30),
      /Timed out/,
    )
  } finally {
    releaseSecond()
  }
  await second
})

test('aliases share a live lock and recover an old absolute owner link', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  const real = join(dir, 'real')
  const alias = join(dir, 'alias')
  await mkdir(real)
  await symlink(real, alias)
  const path = join(real, 'test.lock')
  const aliasPath = join(alias, 'test.lock')
  await withLock(path, async () => {
    await assert.rejects(
      withLock(aliasPath, async () => assert.fail('entered the alias of a live lock'), 30),
      /Timed out/,
    )
  })
  const liveOwner = `${aliasPath}.owner-${process.pid}-${randomUUID()}`
  await mkdir(liveOwner)
  await symlink(liveOwner, path)
  await assert.rejects(
    withLock(path, async () => assert.fail('reclaimed an older live owner'), 30),
    /Timed out/,
  )
  await unlink(path)
  await rmdir(liveOwner)
  const owner = `${aliasPath}.owner-999999-${randomUUID()}`
  await mkdir(owner)
  await symlink(owner, path)
  await withLock(path, async () => undefined)
  await assert.rejects(lstat(path), { code: 'ENOENT' })
})

test('a reused PID cannot keep a dead owner or recovery claim live', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = join(dir, 'test.lock')
  const owner = `${path}.owner-${process.pid}-${randomUUID()}-${'0'.repeat(32)}`
  await mkdir(owner)
  await symlink(join(owner, 'held'), path)
  await withLock(path, async () => undefined, 100)
  const interrupted = `${path}.owner-999999-${randomUUID()}`
  const claim = `${interrupted}.recover-${process.pid}-${randomUUID()}-${'0'.repeat(32)}`
  await mkdir(claim)
  await symlink(join(interrupted, 'held'), path)
  await withLock(path, async () => undefined, 100)
  await assert.rejects(lstat(path), { code: 'ENOENT' })
})

test('ownerless legacy locks and symlinks outside this lock generation are retained', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  const path = join(dir, 'test.lock')
  const legacy = join(dir, 'legacy.lock')
  await mkdir(legacy)
  const old = new Date(Date.now() - 20_000)
  await utimes(legacy, old, old)
  await assert.rejects(
    withLock(legacy, async () => assert.fail('stole a legacy lock'), 30),
    /Timed out/,
  )
  assert.equal((await lstat(legacy)).isDirectory(), true)
  await symlink(legacy, path)
  await assert.rejects(
    withLock(path, async () => assert.fail('followed an external target'), 30),
    /Timed out/,
  )
  assert.equal(await readlink(path), legacy)
  assert.equal((await lstat(legacy)).isDirectory(), true)
})

test('throwing while holding a lock releases it for the next writer', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  await assert.rejects(
    updateState(dir, 's1', () => {
      throw new Error('interrupted')
    }),
    /interrupted/,
  )
  await updateState(dir, 's1', s => ({ ...s, ledger: { ...s.ledger, turn: 1 } }))
  assert.equal((await readState(dir, 's1')).ledger.turn, 1)
})

test('tryWithLock preserves a nested lock timeout after acquiring its own lock', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  const outer = join(dir, 'outer.lock')
  const inner = join(dir, 'inner.lock')
  let entered!: () => void
  let release!: () => void
  const started = new Promise<void>(resolve => (entered = resolve))
  const held = new Promise<void>(resolve => (release = resolve))
  const holder = withLock(inner, async () => {
    entered()
    await held
  })
  await started
  try {
    await assert.rejects(
      tryWithLock(outer, () => withLock(inner, async () => undefined, 0)),
      /Timed out waiting/,
    )
  } finally {
    release()
    await holder
  }
})

test('a file saved before the version, the rollout path, the dropped-reply flag and the covered turn existed reads with their defaults, a save writes the session version, and its covered turn is the last recorded prompt’s, or the one before while that turn runs', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  const initial = await updateState(dir, 's1', s => s)
  assert.equal(JSON.parse(await readFile(statePath(dir, 's1'), 'utf8')).version, SESSION_VERSION)
  const { version: _version, transcriptPath: _path, coveredTurn: _covered, ...older } = initial
  const { hasDroppedReply: _flag, ...presence } = initial.presence
  await writeFile(statePath(dir, 's1'), JSON.stringify({ ...older, presence }))

  const read = await readState(dir, 's1')
  assert.equal(read.version, SESSION_VERSION)
  assert.equal(read.transcriptPath, null)
  assert.equal(read.presence.hasDroppedReply, false)
  assert.equal(read.coveredTurn, null)

  const heard = { ...older.heard, promptTurns: ['t1', 't2'] }
  await writeFile(statePath(dir, 's2'), JSON.stringify({ ...older, sessionId: 's2', heard }))
  await writeFile(
    statePath(dir, 's3'),
    JSON.stringify({ ...older, sessionId: 's3', heard, turn: { ...older.turn, person: 'Run the tests' } }),
  )
  assert.equal((await readState(dir, 's2')).coveredTurn, 't2')
  assert.equal((await readState(dir, 's3')).coveredTurn, 't1')
})

test('a file saved by the Progress trial build reads without its subagents and stated step', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  const initial = await updateState(dir, 's1', s => s)
  await writeFile(
    statePath(dir, 's1'),
    JSON.stringify({
      ...initial,
      subagents: [{ id: 'a1', task: 'x' }],
      ledger: { ...initial.ledger, milestones: [{ id: 'm1' }] },
      presence: { ...initial.presence, statedStep: 'Reading x' },
    }),
  )

  const read = (await readState(dir, 's1')) as unknown as Record<string, Record<string, unknown>>
  assert.equal('subagents' in read, false)
  assert.equal('milestones' in read.ledger!, false)
  assert.equal('statedStep' in read.presence!, false)
})

test('older queued messages upgrade without inventing a press time or confirming same-time presses', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  const initial = await updateState(dir, 's1', s => s)
  const text = 'Explain the question'
  await writeFile(
    statePath(dir, 's1'),
    JSON.stringify({
      ...initial,
      sent: [{ text, press: null, at: 100, row: 'i1', queuedId: 'q1' }],
      lastActions: {
        i1: { kind: 'talk', action: 'explain', text: 'Explain', at: 100, delivery: { state: 'queued', message: text } },
        i2: { kind: 'talk', action: 'explain', text: 'Explain', at: 100, delivery: { state: 'queued', message: text } },
        i3: {
          kind: 'talk',
          action: 'explain',
          text: 'Explain',
          at: 100,
          delivery: { state: 'queued', message: text, id: 'new' },
        },
      },
    }),
  )
  const old = await readState(dir, 's1')
  assert.equal(old.sent[0]?.pressedAt, null)
  assert.equal(old.sent[0]?.deliveryId, null)
  const observed = notePrompt(old, text, 300).state
  assert.equal(observed.lastActions.i1?.delivery?.state, 'unconfirmed')
  assert.equal(observed.lastActions.i2?.delivery?.state, 'unconfirmed')
  assert.equal(observed.lastActions.i3?.delivery?.state, 'queued')
  assert.equal(observed.sent.length, 0)
  assert.equal(observed.ledger.turn, old.ledger.turn + 1)
})

async function savedSessions(dir: string, count: number) {
  const ids = Array.from({ length: count }, (_, i) => `s${String(i).padStart(3, '0')}`)
  for (const [i, id] of ids.entries()) {
    await updateState(dir, id, s => s)
    await utimes(statePath(dir, id), 1000 + i, 1000 + i)
  }

  return ids
}

const remaining = async (dir: string) => (await readdir(join(dir, 'sessions'))).sort()

test('pruning keeps the newest saved sessions and the current one', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  const ids = await savedSessions(dir, KEPT_SESSIONS + 5)
  await pruneSessions(dir, ids[0]!)
  const kept = ids.slice(6).map(id => `${id}.json`)
  assert.deepEqual(await remaining(dir), [`${ids[0]}.json`, ...kept].sort())
})

test('pruning leaves a session whose lock is held', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  const ids = await savedSessions(dir, KEPT_SESSIONS + 2)
  await withLock(`${statePath(dir, ids[0]!)}.lock`, () =>
    withLock(`${statePath(dir, ids[1]!)}.updating`, () => pruneSessions(dir, ids[5]!)),
  )
  assert.deepEqual(
    await remaining(dir),
    ids.map(id => `${id}.json`),
  )
})

test('pruning leaves unreadable and newer-version files and does not count them', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  const ids = await savedSessions(dir, KEPT_SESSIONS + 1)
  await writeFile(statePath(dir, 'broken'), '{')
  await writeFile(statePath(dir, 'future'), JSON.stringify({ version: 2 }))
  await utimes(statePath(dir, 'broken'), 1, 1)
  await utimes(statePath(dir, 'future'), 1, 1)
  await pruneSessions(dir, ids.at(-1)!)
  const names = await remaining(dir)
  assert.ok(names.includes('broken.json'))
  assert.ok(names.includes('future.json'))
  assert.ok(!names.includes(`${ids[0]}.json`))
  assert.equal(names.length, KEPT_SESSIONS + 2)
})

test('pruning leaves no lock files behind', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))
  const ids = await savedSessions(dir, KEPT_SESSIONS + 1)
  await pruneSessions(dir, ids.at(-1)!)
  assert.deepEqual(
    (await remaining(dir)).filter(name => !name.endsWith('.json')),
    [],
  )
})
