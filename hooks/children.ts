import type { Child, SessionStatus } from '../types'
import { childActive, childEnded, withChild } from './status'
import { clipLabel } from './text'

/** How long a child's newer activity waits before it is saved again. The page shows ages in whole minutes. */
const ACTIVITY_SAVE_MS = 30_000

/** The longest name a child keeps. Each look cuts it to one line. */
const NAME_CHARS = 80

/**
 * The child starts at `at`, named by the first line of `name`. A child whose activity the host does not report, such
 * as a background command, starts with no activity time, so it never reads quiet.
 */
export function childStarted(
  o: SessionStatus | null,
  { ref, kind, name }: Pick<Child, 'ref' | 'kind' | 'name'>,
  at: number,
  { reportsActivity = true } = {},
): SessionStatus {
  const line = name.trim().split('\n')[0] ?? ''
  const lastActivityAt = reportsActivity ? at : null

  return withChild(
    o,
    { ref, kind, name: clipLabel(line, NAME_CHARS), startedAt: at, endedAt: null, lastActivityAt },
    at,
  )
}

/**
 * The child with `ref` did something at `at`. Its saved time moves only once it is `ACTIVITY_SAVE_MS` old, so most of
 * a child's calls change nothing and a host writes nothing for them.
 */
export function childWorked(o: SessionStatus | null, ref: string, at: number): SessionStatus | null {
  const saved = o?.children.find(c => c.ref === ref)?.lastActivityAt ?? null
  const isSavedRecently = saved !== null && at - saved < ACTIVITY_SAVE_MS

  return isSavedRecently ? o : childActive(o, ref, at)
}

/** Every running child that `isEnded` names ended at `at`. */
function childrenEnded(o: SessionStatus | null, isEnded: (c: Child) => boolean, at: number): SessionStatus | null {
  const isEnding = (c: Child) => c.endedAt === null && isEnded(c)
  if (!o?.children.some(isEnding)) return o

  return { ...o, children: o.children.map(c => (isEnding(c) ? { ...c, endedAt: at } : c)) }
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
export function noticeApplied(o: SessionStatus | null, notice: TaskNotice, at: number): SessionStatus | null {
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
function delegateRunning(o: SessionStatus | null, name: string, at: number): SessionStatus | null {
  const ref = delegateRef(name)
  const known = o?.children.find(c => c.ref === ref)
  const isRunning = known !== undefined && known.endedAt === null

  return isRunning ? childActive(o, ref, at) : childStarted(o, { ref, kind: 'delegate', name }, at)
}

/** Every delegate `command` starts, prompts or waits on runs from `at`, as the command starts. */
export function delegatesStarted(o: SessionStatus | null, command: string, at: number): SessionStatus | null {
  return delegateSteps(command).reduce((x, step) => delegateRunning(x, step.name, at), o)
}

/** Every delegate `command` waits on until its turn settles ended at `at`, once the command returned. */
export function delegateWaitsEnded(o: SessionStatus | null, command: string, at: number): SessionStatus | null {
  return delegateSteps(command)
    .filter(step => step.isWaitForEnd)
    .reduce((x, step) => childEnded(x, delegateRef(step.name), at), o)
}

/** Herdr shows a prompted agent working within 5 seconds. A delegate prompted closer than this to a check waits for the next one. */
const HERDR_PROMPT_SETTLE_MS = 15_000

/** Whether a delegate runs, so a host asks Herdr only then. */
export function hasRunningDelegate(o: SessionStatus | null): boolean {
  return o?.children.some(c => c.kind === 'delegate' && c.endedAt === null) ?? false
}

/** Every running delegate that `running`, read from Herdr at `at`, does not name ended then. */
export function delegatesSettled(
  o: SessionStatus | null,
  running: ReadonlySet<string>,
  at: number,
): SessionStatus | null {
  const refs = new Set([...running].map(delegateRef))
  const isGone = (c: Child) =>
    c.kind === 'delegate' && !refs.has(c.ref) && at - (c.lastActivityAt ?? c.startedAt) >= HERDR_PROMPT_SETTLE_MS

  return childrenEnded(o, isGone, at)
}

/**
 * Keeps a long-lived host, the mod or omp, from reading its saved session for every call a child makes. Answers true
 * when a child's activity at `at` is worth a read: the first since the host started, or `ACTIVITY_SAVE_MS` after the
 * last one it let through. Codex runs each hook in its own process, which keeps nothing between calls, so it relies on
 * `childWorked` alone.
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
export function childrenCutOff(o: SessionStatus | null, at: number): SessionStatus | null {
  return childrenEnded(o, c => c.kind !== 'delegate', at)
}

/** Every running subagent the host no longer lists ended at `at`. */
export function subagentsSettled(
  o: SessionStatus | null,
  listed: ReadonlySet<string>,
  at: number,
): SessionStatus | null {
  return childrenEnded(o, c => c.kind === 'subagent' && !listed.has(c.ref), at)
}
