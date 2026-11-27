import { agentExec } from './core'
import type { HostBinding, SessionBinding } from './binding'

const CLOCK_SCRIPT =
  'import time,json,os; print(json.dumps({"now":time.time_ns()//1000000,"privateFiles":hasattr(os,"O_NOFOLLOW") and hasattr(os,"O_DIRECTORY") and all(f in os.supports_dir_fd for f in [os.open,os.mkdir,os.rename,os.unlink])}))'

type ClockSample = { remote: number; monotonic: number; wall: number; uncertainty: number; privateFiles: boolean }
const clocks = new Map<string, { expires: number; value: Promise<ClockSample | null> }>()
const clockKey = (binding: SessionBinding) => JSON.stringify([binding.socket, binding.machineId])

export function forgetRemoteClock(binding: SessionBinding): void {
  if (binding.machine) clocks.delete(clockKey(binding))
}

export async function agentClock(
  binding: HostBinding,
  fresh = false,
): Promise<{ now: number; reliable: boolean; uncertainty: number; privateFiles: boolean }> {
  if (binding.source === 'codex') return { now: Date.now(), reliable: true, uncertainty: 0, privateFiles: true }
  if (!binding.machine)
    return {
      now: Date.now(),
      reliable: true,
      uncertainty: 0,
      privateFiles: process.platform !== 'win32' && Bun.which('python3') !== null,
    }
  if (!binding.machineId) return { now: 0, reliable: false, uncertainty: Infinity, privateFiles: false }
  const key = clockKey(binding)
  const mono = performance.now()
  let cached = clocks.get(key)
  if (fresh || !cached || cached.expires <= mono) {
    const value = (async (): Promise<ClockSample | null> => {
      const started = performance.now()
      try {
        const answer = await agentExec(binding, ['python3', '-c', CLOCK_SCRIPT])
        const ended = performance.now()
        const uncertainty = (ended - started) / 2
        const now = answer && typeof answer === 'object' ? (answer as { now?: unknown }).now : undefined
        if (typeof now !== 'number' || !Number.isSafeInteger(now) || now < 0 || uncertainty > 1000) return null
        return {
          remote: now + uncertainty,
          monotonic: ended,
          wall: Date.now(),
          uncertainty,
          privateFiles: (answer as { privateFiles?: unknown }).privateFiles === true,
        }
      } catch {
        return null
      }
    })()
    cached = { expires: mono + 5000, value }
    clocks.set(key, cached)
  }
  const sample = await cached.value
  if (!sample) return { now: 0, reliable: false, uncertainty: Infinity, privateFiles: false }
  const age = performance.now() - sample.monotonic
  const wallAge = Date.now() - sample.wall
  const clockJumped = age < 0 || Math.abs(wallAge - age) > 1000
  if (clockJumped) {
    clocks.delete(key)
    return fresh ? { now: 0, reliable: false, uncertainty: Infinity, privateFiles: false } : agentClock(binding, true)
  }
  const now = Math.floor(sample.remote + age)
  return Number.isSafeInteger(now) && now >= 0
    ? { now, reliable: true, uncertainty: sample.uncertainty, privateFiles: sample.privateFiles }
    : { now: 0, reliable: false, uncertainty: Infinity, privateFiles: false }
}
