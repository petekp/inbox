import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { lstat, mkdir, readdir, readlink, realpath, rename, rmdir, symlink, unlink } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

const LOCK_WAIT_MS = 10_000
const LOCK_CHILD = 'held'
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
class LockBusyError extends Error {}

type LockOwner = { pid: number; identity: string | null }
let bootSession: string | null = null
let ownIdentity: string | null = null

function lockOwner(suffix: string): LockOwner | null {
  const match = /^(\d+)-[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}(?:-([a-f\d]{32}))?$/.exec(suffix)
  const pid = Number(match?.[1])

  return Number.isSafeInteger(pid) && pid > 0 ? { pid, identity: match?.[2] ?? null } : null
}

function processIdentity(pid: number): string | null {
  if (pid === process.pid && ownIdentity) return ownIdentity
  try {
    const options = {
      encoding: 'utf8' as const,
      env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
      stdio: 'pipe' as const,
      timeout: 1_000,
    }
    const isLinux = process.platform === 'linux'
    const boot =
      bootSession ??
      (isLinux
        ? readFileSync('/proc/sys/kernel/random/boot_id', 'utf8')
        : execFileSync('/usr/sbin/sysctl', ['-n', 'kern.bootsessionuuid'], options)
      ).trim()
    const started = isLinux
      ? linuxStartTime(pid)
      : execFileSync('/bin/ps', ['-p', String(pid), '-o', 'lstart='], options).trim()
    if (!boot || !started) return null
    bootSession = boot
    const identity = createHash('sha256').update(boot).update('\0').update(started).digest('hex').slice(0, 32)
    if (pid === process.pid) ownIdentity = identity
    return identity
  } catch {
    return null
  }
}

// Field 22 of /proc/<pid>/stat is the start time in clock ticks since boot. Field 2, the command name, is in parentheses
// and can hold spaces and parentheses, so the fields are counted from the last ')'.
function linuxStartTime(pid: number): string {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
  return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] ?? ''
}

function isLive(owner: LockOwner, generation: string, observedLiveAt: Map<string, number>): boolean {
  try {
    process.kill(owner.pid, 0)
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH'
  }
  if (owner.identity === null) return true
  const checkedAt = observedLiveAt.get(generation)
  if (checkedAt !== undefined && Date.now() - checkedAt < 250) return true
  const identity = processIdentity(owner.pid)
  if (identity !== null && identity !== owner.identity) return false
  observedLiveAt.set(generation, Date.now())
  return true
}

async function lockTarget(path: string): Promise<string | null> {
  return readlink(path).catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT' || err.code === 'EINVAL') return null
    throw err
  })
}

async function removeOwnedLock(path: string, target: string, owner: string, source: string): Promise<boolean> {
  const identity = processIdentity(process.pid)
  const claimed = `${owner}.recover-${process.pid}-${randomUUID()}${identity ? `-${identity}` : ''}`
  const isDirectory = await lstat(source).then(
    s => s.isDirectory(),
    (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') return false
      throw err
    },
  )
  if (!isDirectory) return false
  try {
    await rename(source, claimed)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw err
  }
  if ((await lockTarget(path)) === target) await unlink(path)
  await rmdir(claimed)

  return true
}

async function recoverLock(path: string, observedLiveAt: Map<string, number>): Promise<boolean> {
  const target = await lockTarget(path)
  if (!target || !isAbsolute(target)) return false
  const owner = basename(target) === LOCK_CHILD ? dirname(target) : target
  if (target !== owner && target !== join(owner, LOCK_CHILD)) return false
  const prefix = `${basename(path)}.owner-`
  if (!basename(owner).startsWith(prefix)) return false
  if ((await realpath(dirname(owner)).catch(() => null)) !== dirname(path)) return false
  const holder = lockOwner(basename(owner).slice(prefix.length))
  if (!holder || isLive(holder, owner, observedLiveAt)) return false
  if (await removeOwnedLock(path, target, owner, owner)) return true
  const recoverPrefix = `${basename(owner)}.recover-`
  const entries = await readdir(dirname(path))
  for (const entry of entries) {
    if (!entry.startsWith(recoverPrefix)) continue
    const recovering = lockOwner(entry.slice(recoverPrefix.length))
    if (!recovering || isLive(recovering, entry, observedLiveAt)) continue
    if (await removeOwnedLock(path, target, owner, join(dirname(path), entry))) return true
  }

  return false
}

/** Runs `fn` under an owned lock; ownerless locks from older builds time out rather than risk a live writer. */
export async function withLock<T>(path: string, fn: () => Promise<T>, waitMs = LOCK_WAIT_MS): Promise<T> {
  path = resolve(path)
  await mkdir(dirname(path), { recursive: true })
  path = join(await realpath(dirname(path)), basename(path))
  const identity = processIdentity(process.pid)
  const owner = `${path}.owner-${process.pid}-${randomUUID()}${identity ? `-${identity}` : ''}`
  const target = join(owner, LOCK_CHILD)
  await mkdir(owner)
  const until = Date.now() + waitMs
  const observedLiveAt = new Map<string, number>()
  try {
    for (;;) {
      try {
        await symlink(target, path)
        break
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
        if (await recoverLock(path, observedLiveAt)) continue
        if (Date.now() > until) throw new LockBusyError(`Timed out waiting for ${path}`)
        await sleep(15)
      }
    }
    return await fn()
  } finally {
    await removeOwnedLock(path, target, owner, owner)
  }
}

export async function tryWithLock<T>(
  path: string,
  fn: () => Promise<T>,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  let acquired = false
  try {
    return {
      acquired: true,
      value: await withLock(
        path,
        () => {
          acquired = true
          return fn()
        },
        0,
      ),
    }
  } catch (err) {
    if (!acquired && err instanceof LockBusyError) return { acquired: false }
    throw err
  }
}
