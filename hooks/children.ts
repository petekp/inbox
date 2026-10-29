import type { Child, DelegateState, Overview } from '../types'
import { childActive, childEnded, subjectTouched, withChild } from './overview'
import type { HerdrStatus } from './herdr'
import { clipLabel } from './text'

/** How long a child's newer activity waits before it is saved again. The page shows ages in whole minutes. */
const ACTIVITY_SAVE_MS = 30_000

/** The longest name a child keeps. Each look cuts it to one line. */
const NAME_CHARS = 80

/**
 * The child starts at `at`, named by the first line of `name`. A child whose activity the host does not report, such
 * as a background command, starts with no activity time.
 */
export function childStarted(
  o: Overview | null,
  { ref, kind, name }: Pick<Child, 'ref' | 'kind' | 'name'>,
  at: number,
  {
    reportsActivity = true,
    delegateState = null,
  }: { reportsActivity?: boolean; delegateState?: DelegateState | null } = {},
): Overview {
  const line = name.trim().split('\n')[0] ?? ''
  const lastActivityAt = reportsActivity ? at : null

  return withChild(
    o,
    { ref, kind, name: clipLabel(line, NAME_CHARS), startedAt: at, endedAt: null, lastActivityAt, delegateState },
    at,
  )
}

/**
 * The child with `ref` did something at `at`. Its saved time moves only once it is `ACTIVITY_SAVE_MS` old, so most of
 * a child's calls change nothing and a host writes nothing for them.
 */
export function childWorked(o: Overview | null, ref: string, at: number): Overview | null {
  const saved = o?.children.find(c => c.ref === ref)?.lastActivityAt ?? null
  const isSavedRecently = saved !== null && at - saved < ACTIVITY_SAVE_MS

  return isSavedRecently ? o : childActive(o, ref, at)
}

/** Every running child that `isEnded` names ended at `at`. */
function childrenEnded(o: Overview | null, isEnded: (c: Child) => boolean, at: number): Overview | null {
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
export function noticeApplied(o: Overview | null, notice: TaskNotice, at: number): Overview | null {
  const ref = notice.ids.find(id => o?.children.some(c => c.ref === id))
  if (ref === undefined) return o

  return notice.hasEnded ? childEnded(o, ref, at) : childActive(o, ref, at)
}

/** One `herdr agent` command a session ran on a delegate. */
export type DelegateStep = { name: string; isPrompt: boolean; isWaitForEnd: boolean }

const HERDR = /(?:^|[;&|\n]\s*)herdr agent (start|prompt|wait) ([A-Za-z0-9_-]+)([^;&|\n]*)/g

/**
 * The delegates a shell command starts, prompts or waits on through Herdr. Each step means the delegate's turn runs.
 * A wait's end means the turn settled, except `--until working`, which waits only until it starts.
 */
export function delegateSteps(command: string): DelegateStep[] {
  return [...command.matchAll(HERDR)].map(([, verb, name, args]) => ({
    name: name!,
    isPrompt: verb === 'prompt',
    isWaitForEnd: verb === 'wait' && !/--until working/.test(args ?? ''),
  }))
}

export const delegateRef = (name: string) => `herdr:${name}`

/**
 * The delegate a step names runs from `at`. A delegate prompted again keeps its id and link, and a new run starts its
 * age over. A prompt shows it working, so it can read finished once Herdr shows it ready.
 */
function delegateRunning(o: Overview | null, step: DelegateStep, at: number): Overview | null {
  const ref = delegateRef(step.name)
  const known = o?.children.find(c => c.ref === ref)
  const isRunning = known !== undefined && known.endedAt === null
  if (!isRunning)
    return childStarted(o, { ref, kind: 'delegate', name: step.name }, at, {
      delegateState: step.isPrompt ? 'working' : null,
    })
  const active = childActive(o, ref, at)

  return step.isPrompt ? delegateStateSet(active, ref, 'working') : active
}

function delegateStateSet(o: Overview | null, ref: string, delegateState: DelegateState): Overview | null {
  if (!o?.children.some(c => c.ref === ref && c.delegateState !== delegateState)) return o

  return { ...o, children: o.children.map(c => (c.ref === ref ? { ...c, delegateState } : c)) }
}

/** Every delegate `command` starts, prompts or waits on runs from `at`, as the command starts. */
export function delegatesStarted(o: Overview | null, command: string, at: number): Overview | null {
  return delegateSteps(command).reduce((x, step) => delegateRunning(x, step, at), o)
}

/** Every delegate `command` waits on until its turn settles ended at `at`, once the command returned. */
export function delegateWaitsEnded(o: Overview | null, command: string, at: number): Overview | null {
  return delegateSteps(command)
    .filter(step => step.isWaitForEnd)
    .reduce((x, step) => childEnded(x, delegateRef(step.name), at), o)
}

/** Herdr shows a prompted agent working within 5 seconds. A delegate prompted closer than this to a check waits for the next one. */
const HERDR_PROMPT_SETTLE_MS = 15_000

/** Whether a delegate runs, so a host asks Herdr only then. */
export function hasRunningDelegate(o: Overview | null): boolean {
  return o?.children.some(c => c.kind === 'delegate' && c.endedAt === null) ?? false
}

/**
 * Each running delegate after Herdr's `states`, read at `at`, by agent name. A delegate Herdr shows working or blocked
 * takes that state. One Herdr shows ready, or no longer lists, ended then. One that is ready after it worked finished,
 * and its subject changed then, so the subject shows above the look line. Herdr's `unknown` changes nothing.
 */
export function delegatesSettled(
  o: Overview | null,
  states: ReadonlyMap<string, HerdrStatus>,
  at: number,
): Overview | null {
  if (!o) return o
  const byRef = new Map([...states].map(([name, status]) => [delegateRef(name), status]))
  const settled = (c: Child): Child => {
    if (c.kind !== 'delegate' || c.endedAt !== null) return c
    const status = byRef.get(c.ref)
    const isShownWorking = status === 'working' || status === 'blocked'
    if (isShownWorking) return c.delegateState === status ? c : { ...c, delegateState: status }
    const isSettling = at - (c.lastActivityAt ?? c.startedAt) < HERDR_PROMPT_SETTLE_MS
    if (status === 'unknown' || isSettling) return c

    const isReady = status === 'idle' || status === 'done'
    const hasFinished = isReady && c.delegateState !== null

    return { ...c, endedAt: at, delegateState: hasFinished ? 'finished' : c.delegateState }
  }
  const children = o.children.map(settled)
  if (children.every((c, n) => c === o.children[n])) return o
  const finished = children.filter(
    (c, n) => c.delegateState === 'finished' && o.children[n]!.delegateState !== 'finished',
  )

  return finished.reduce((x, c) => subjectTouched(x, c.subjectId, at), { ...o, children })
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
export function childrenCutOff(o: Overview | null, at: number): Overview | null {
  return childrenEnded(o, c => c.kind !== 'delegate', at)
}

/** Every running subagent the host no longer lists ended at `at`. */
export function subagentsSettled(o: Overview | null, listed: ReadonlySet<string>, at: number): Overview | null {
  return childrenEnded(o, c => c.kind === 'subagent' && !listed.has(c.ref), at)
}
