import type { Child, Overview } from '../types'
import { changedChild, childActive, childEnded, withChild } from './overview'

/** How long a child's newer activity waits before it is saved again. The page shows ages in whole minutes. */
export const ACTIVITY_SAVE_MS = 30_000

/** The longest name a child keeps. Each look cuts it to one line. */
const NAME_CHARS = 80

export function childName(text: string): string {
  const line = text.trim().split('\n')[0] ?? ''

  return line.length > NAME_CHARS ? `${line.slice(0, NAME_CHARS - 1)}…` : line
}

/** What a background task's notification says: the ids it names, and whether the task ended. */
export type TaskNotice = { ids: string[]; hasEnded: boolean }

const TAG = (name: string) => new RegExp(`<${name}>([^<]*)</${name}>`)
const ENDED = new Set(['completed', 'failed', 'killed', 'stopped'])

/** Reads Claude Code's `<task-notification>` text. Null for any other prompt. */
export function taskNotice(text: string): TaskNotice | null {
  if (!text.includes('<task-notification>')) return null
  const ids = ['task-id', 'tool-use-id'].flatMap(tag => TAG(tag).exec(text)?.[1]?.trim() || [])
  if (ids.length === 0) return null
  const status = TAG('status').exec(text)?.[1]?.trim().toLowerCase() ?? ''

  return { ids, hasEnded: ENDED.has(status) }
}

/** The child a notice names ended, or did something, at `at`. */
export function noticeApplied(o: Overview | null, notice: TaskNotice, at: number): Overview | null {
  const ref = notice.ids.find(id => o?.children.some(c => c.ref === id))
  if (ref === undefined) return o

  return notice.hasEnded ? childEnded(o, ref, at) : childActive(o, ref, at)
}

/** One `herdr agent` command a session ran on a delegate. */
export type DelegateStep = { name: string; isWaitForEnd: boolean }

const HERDR = /(?:^|[;&|\n]\s*)herdr agent (start|prompt|wait) ([A-Za-z0-9_-]+)([^;&|\n]*)/g

/**
 * The delegates a shell command starts, prompts or waits on through Herdr. Each step means the delegate's turn runs.
 * A wait's end means the turn settled, except `--until working`, which waits only until it starts.
 */
export function delegateSteps(command: string): DelegateStep[] {
  return [...command.matchAll(HERDR)].map(([, verb, name, args]) => ({
    name: name!,
    isWaitForEnd: verb === 'wait' && !/--until working/.test(args ?? ''),
  }))
}

export const delegateRef = (name: string) => `herdr:${name}`

/** The delegate named `name` runs from `at`. A delegate prompted again keeps its id and link, and a new run starts its age over. */
export function delegateRunning(o: Overview | null, name: string, at: number): Overview {
  const ref = delegateRef(name)
  const known = o?.children.find(c => c.ref === ref)
  const isRunning = known !== undefined && known.endedAt === null
  if (o && isRunning) return changedChild(o, ref, () => ({ lastActivityAt: at })) ?? o

  return withChild(
    o,
    { ref, kind: 'delegate', name: childName(name), startedAt: at, endedAt: null, lastActivityAt: at },
    at,
  )
}

/** Herdr shows a prompted agent working within 5 seconds. A delegate prompted closer than this to a check waits for the next one. */
const HERDR_PROMPT_SETTLE_MS = 15_000

/** Whether a delegate runs, so a host asks Herdr only then. */
export function hasRunningDelegate(o: Overview | null): boolean {
  return o?.children.some(c => c.kind === 'delegate' && c.endedAt === null) ?? false
}

/** Every running delegate that `running`, read from Herdr at `at`, does not name ended then. */
export function delegatesSettled(o: Overview | null, running: ReadonlySet<string>, at: number): Overview | null {
  const refs = new Set([...running].map(delegateRef))
  const isGone = (c: Child) =>
    c.kind === 'delegate' &&
    c.endedAt === null &&
    !refs.has(c.ref) &&
    at - (c.lastActivityAt ?? c.startedAt) >= HERDR_PROMPT_SETTLE_MS
  if (!o?.children.some(isGone)) return o

  return { ...o, children: o.children.map(c => (isGone(c) ? { ...c, endedAt: at } : c)) }
}

/**
 * Keeps a host from saving every call a child makes. Answers true when a child's activity at `at` is worth saving:
 * the first since the host started, or `ACTIVITY_SAVE_MS` after the last one it saved.
 */
export function activityGate(): (ref: Child['ref'], at: number) => boolean {
  const saved = new Map<string, number>()

  return (ref, at) => {
    const last = saved.get(ref)
    if (last !== undefined && at - last < ACTIVITY_SAVE_MS) return false
    saved.set(ref, at)

    return true
  }
}

/** Every running child but a delegate ended at `at`: a reload cut off the subagents and tasks the session ran. */
export function childrenCutOff(o: Overview | null, at: number): Overview | null {
  const isCut = (c: Child) => c.endedAt === null && c.kind !== 'delegate'
  if (!o?.children.some(isCut)) return o

  return { ...o, children: o.children.map(c => (isCut(c) ? { ...c, endedAt: at } : c)) }
}

/** Every running subagent the host no longer lists ended at `at`. */
export function subagentsSettled(o: Overview | null, listed: ReadonlySet<string>, at: number): Overview | null {
  const isGone = (c: Child) => c.endedAt === null && c.kind === 'subagent' && !listed.has(c.ref)
  if (!o?.children.some(isGone)) return o

  return { ...o, children: o.children.map(c => (isGone(c) ? { ...c, endedAt: at } : c)) }
}
