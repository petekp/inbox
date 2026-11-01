import type { Child, ChildKind, DelegateState, SessionStatus, StatusHead, Subject, SubjectStatus } from '../types'
import { goalFields } from './status-upgrade-goal'
import {
  clipWords,
  DESCRIPTION_KEPT,
  EMPTY_SESSION_STATUS,
  NAME_KEPT,
  nameKey,
  STATUSES,
  OPEN_SUBJECTS,
  TEXT_KEPT,
} from './status-limits'
import type { OpenStatus } from './status-limits'

const CHILD_KINDS: readonly ChildKind[] = ['subagent', 'background', 'workflow', 'delegate']
const DELEGATE_STATES: readonly DelegateState[] = ['working', 'blocked', 'finished']

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function time(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Statuses an earlier build saved. An ask linked to the subject now marks one that waited on the person. */
const DROPPED_STATUSES: Record<string, SubjectStatus> = { 'waits-on-you': 'queued', problem: 'queued' }

/** An earlier build kept a merge in `was`, as "<name> folded in" or "<name> folded in; was: <plan>". */
const OLD_MERGE = /^(.+?) folded in(?:; was: (.*))?$/s

function wasAndMerged(was: unknown, merged: unknown): Pick<Subject, 'was' | 'merged'> {
  const old = typeof was === 'string' && typeof merged !== 'string' ? OLD_MERGE.exec(was) : null
  if (old) return { was: old[2] ?? null, merged: old[1]! }

  return { was: typeof was === 'string' ? was : null, merged: typeof merged === 'string' ? merged : null }
}

function subjectOf(saved: unknown): Subject | null {
  const s = saved as Partial<Record<keyof Subject, unknown>> | null
  const status = STATUSES.find(x => x === s?.status) ?? DROPPED_STATUSES[String(s?.status)]
  const changedAt = time(s?.changedAt)
  if (!s || typeof s.id !== 'string' || typeof s.name !== 'string' || !status || changedAt === null) return null

  return {
    id: s.id,
    name: s.name,
    status,
    text: text(s.text),
    ...wasAndMerged(s.was, s.merged),
    createdAt: time(s.createdAt) ?? changedAt,
    changedAt,
    closedAt: time(s.closedAt),
    into: typeof s.into === 'string' ? s.into : null,
  }
}

function childOf(saved: unknown): Child | null {
  const c = saved as Partial<Record<keyof Child, unknown>> | null
  const kind = CHILD_KINDS.find(k => k === c?.kind)
  const startedAt = time(c?.startedAt)
  if (!c || typeof c.id !== 'string' || typeof c.ref !== 'string' || !kind || startedAt === null) return null

  return {
    id: c.id,
    ref: c.ref,
    kind,
    name: text(c.name),
    subjectId: typeof c.subjectId === 'string' ? c.subjectId : null,
    startedAt,
    endedAt: time(c.endedAt),
    lastActivityAt: time(c.lastActivityAt),
    delegateState: DELEGATE_STATES.find(state => state === c.delegateState) ?? null,
  }
}

/** The statuses a Status saved before subjects had, as a subject's status; null for one that closed. */
const OLD_STATUS: Record<string, OpenStatus | null> = {
  working: 'working',
  queued: 'queued',
  'waits-on-you': 'queued',
  'waits-on-other': 'waits-on-other',
  problem: 'queued',
  unknown: 'queued',
  done: null,
  'ruled-out': null,
}

/** A goal an earlier build saved, as a head with no description. The next Status call writes the description. */
function headOfGoal(goal: unknown): StatusHead | null {
  const title = clipWords(text(goal), DESCRIPTION_KEPT)

  return title === '' ? null : { title, description: '' }
}

function headOf(saved: unknown): StatusHead | null {
  const h = saved as Partial<Record<keyof StatusHead, unknown>> | null | undefined
  const title = text(h?.title)

  return title === '' ? null : { title, description: text(h?.description) }
}

/**
 * A Status saved before subjects, as subjects. Its streams, work and problems that were still open become subjects
 * dated at the last look, since the person saw them then. With no look there is no honest time to give them, and the
 * person never read that page, so only the headline carries over, as the head.
 */
function fromLists(o: Record<string, unknown>): SessionStatus {
  const lastLookAt = time(o.lastLookAt)
  const items =
    lastLookAt === null ? [] : ['workstreams', 'queue', 'open'].flatMap(k => (Array.isArray(o[k]) ? o[k] : []))
  const subjects = items
    .flatMap((raw: unknown) => {
      const item = raw as { status?: unknown; text?: unknown; detail?: unknown } | null
      const status = OLD_STATUS[String(item?.status)] ?? null
      if (!status || typeof item?.text !== 'string') return []

      return [
        { status, name: clipWords(item.text, NAME_KEPT), text: typeof item.detail === 'string' ? item.detail : '' },
      ]
    })
    .filter((s, n, all) => all.findIndex(t => nameKey(t.name) === nameKey(s.name)) === n)
    .slice(0, OPEN_SUBJECTS)
    .map((s, n): Subject => ({
      id: `s${n + 1}`,
      ...s,
      text: clipWords(s.text, TEXT_KEPT),
      was: null,
      merged: null,
      createdAt: lastLookAt!,
      changedAt: lastLookAt!,
      closedAt: null,
      into: null,
    }))

  return {
    ...EMPTY_SESSION_STATUS,
    head: headOfGoal(o.headline),
    subjects,
    nextId: subjects.length + 1,
    lastLookAt,
  }
}

/** A saved Status, from this build or an earlier one, with anything wrongly shaped left out. Null for none. */
export function upgradeStatus(saved: unknown): SessionStatus | null {
  const o = saved as Record<string, unknown> | null | undefined
  if (typeof o !== 'object' || o === null) return null
  if (typeof o.headline === 'string') return fromLists(o)
  if (!Array.isArray(o.subjects)) return null
  const subjects = o.subjects.map(subjectOf).filter((s): s is Subject => s !== null)
  const children = Array.isArray(o.children) ? o.children.map(childOf).filter((c): c is Child => c !== null) : []
  const savedLinks = typeof o.askSubjects === 'object' && o.askSubjects !== null ? Object.entries(o.askSubjects) : []
  const askSubjects = Object.fromEntries(savedLinks.filter((e): e is [string, string] => typeof e[1] === 'string'))
  const look = o.look as { startedAt?: unknown } | null | undefined
  const lookAt = time(look?.startedAt)

  return {
    head: 'head' in o ? headOf(o.head) : headOfGoal(o.goal),
    subjects,
    children,
    askSubjects,
    nextId: Math.max(time(o.nextId) ?? 1, subjects.length + 1),
    nextChildId: Math.max(time(o.nextChildId) ?? 1, children.length + 1),
    lastLookAt: time(o.lastLookAt),
    look: lookAt === null ? null : { startedAt: lookAt },
    ...goalFields(o, new Set(subjects.map(s => s.id))),
  }
}
