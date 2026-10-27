import type { Child, ChildKind, Overview, Subject, SubjectStatus } from '../types'

/** The most words the call may write in a subject's name, where it stands, and the goal. */
export const NAME_WORDS = 3
export const TEXT_WORDS = 4
export const GOAL_WORDS = 8
/** The most open subjects the call keeps. */
export const OPEN_SUBJECTS = 6
/** Limits code holds an answer to when the call writes past the words it was asked for. */
const NAME_KEPT = 8
const TEXT_KEPT = 12
const GOAL_KEPT = 14
/** Finished subjects the call reads, so it does not add one again. */
const FINISHED_READ = 10
/** How long an ended child stays saved, so a delegate prompted again keeps its link. */
const CHILD_KEPT_MS = 24 * 60 * 60_000
const CHILDREN_KEPT = 50
/** Share of content words two texts must share for code to keep the old text and age of a subject. */
const REWORD_OVERLAP = 0.5
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'for',
  'to',
  'in',
  'on',
  'and',
  'or',
  'is',
  'it',
  'its',
  'now',
  'be',
  'by',
  'at',
  'with',
])

const NL = '\n'

export const EMPTY_OVERVIEW: Overview = {
  role: 'session',
  goal: '',
  subjects: [],
  children: [],
  nextId: 1,
  nextChildId: 1,
  lastLookAt: null,
  look: null,
}

export type OpenStatus = Exclude<SubjectStatus, 'done' | 'dropped'>

const OPEN_STATUSES: readonly OpenStatus[] = ['working', 'queued', 'waits-on-you', 'waits-on-other', 'problem']
const STATUSES: readonly SubjectStatus[] = [...OPEN_STATUSES, 'done', 'dropped']
const CHILD_KINDS: readonly ChildKind[] = ['subagent', 'background', 'workflow', 'delegate']

/** One line of the Overview call's answer. */
export type Op =
  | { kind: 'none' }
  | { kind: 'new'; status: OpenStatus; name: string; text: string }
  | { kind: 'set'; ref: string; status: OpenStatus; text: string }
  | { kind: 'done'; ref: string; text: string }
  | { kind: 'drop'; ref: string; why: string; into: string | null }
  | { kind: 'was'; ref: string; text: string }
  | { kind: 'role'; role: Overview['role'] }
  | { kind: 'goal'; text: string }
  | { kind: 'link'; child: string; subject: string }

/** What the Overview call answered: nothing to change, or the changes to make. */
export type OverviewAnswer = { kind: 'unchanged' } | { kind: 'ops'; ops: Op[] }

const LINE = /^\s*[-*]?\s*(NO CHANGE|NOCHANGE|UNCHANGED|NEW|SET|DONE|DROP|WAS|ROLE|GOAL|LINK)\s*(?::\s*(.*))?$/i

/** The first `limit` words of `text`, with an ellipsis when words were cut. */
export function clipWords(text: string, limit: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean)

  return words.length <= limit ? words.join(' ') : `${words.slice(0, limit).join(' ')}…`
}

function fields(value: string): string[] {
  return value.split('|').map(f => f.trim())
}

function openStatus(s: string | undefined): OpenStatus | null {
  return OPEN_STATUSES.find(o => o === s?.toLowerCase()) ?? null
}

function opOf(key: string, f: string[]): Op | null {
  if (key === 'NOCHANGE' || key === 'UNCHANGED') return { kind: 'none' }
  if (key === 'NEW') {
    const status = openStatus(f[0])

    return status && f[1] ? { kind: 'new', status, name: f[1], text: f[2] ?? '' } : null
  }
  if (key === 'SET') {
    const isDone = f[1]?.toLowerCase() === 'done'
    if (f[0] && isDone) return { kind: 'done', ref: f[0], text: f[2] ?? '' }
    const status = openStatus(f[1])

    return f[0] && status ? { kind: 'set', ref: f[0], status, text: f[2] ?? '' } : null
  }
  if (key === 'DONE') return f[0] ? { kind: 'done', ref: f[0], text: f[1] ?? '' } : null
  if (key === 'DROP') {
    const into = (f[2] ?? '').replace(/^INTO\s+/i, '').trim()

    return f[0] ? { kind: 'drop', ref: f[0], why: f[1] ?? '', into: into || null } : null
  }
  if (key === 'WAS') return f[0] && f[1] ? { kind: 'was', ref: f[0], text: f[1] } : null
  if (key === 'ROLE') {
    const role = f[0]?.toLowerCase()

    return role === 'coordinator' || role === 'session' ? { kind: 'role', role } : null
  }
  if (key === 'GOAL') return f[0] ? { kind: 'goal', text: f[0] } : null
  if (key === 'LINK') return f[0] && f[1] ? { kind: 'link', child: f[0], subject: f[1] } : null

  return null
}

/**
 * Parses the Overview call's answer. Null when it is empty, or when any line is not an operation: an answer that
 * holds prose has more than once corrected itself partway, and applying any of it could apply the wrong half.
 */
export function parseOverview(text: string | null): OverviewAnswer | null {
  const ops: Op[] = []
  for (const raw of (text ?? '').split(NL)) {
    const line = raw.trim()
    if (line === '') continue
    const m = LINE.exec(line)
    const op = m ? opOf(m[1]!.toUpperCase().replace(' ', ''), fields(m[2] ?? '')) : null
    if (op === null) return null
    ops.push(op)
  }
  if (ops.length === 0) return null

  return ops.every(o => o.kind === 'none') ? { kind: 'unchanged' } : { kind: 'ops', ops }
}

/**
 * Asks the Overview call through `ask`, and once more when the answer holds prose, as `parseOverview` refuses it. A
 * call that gives no text is not asked again. Returns the first answer and the one to apply, which are the same when
 * the call was asked once.
 */
export async function askOverview<T extends { text: string | null }>(
  ask: () => Promise<T>,
): Promise<{ first: T; last: T }> {
  const first = await ask()
  const holdsProse = first.text !== null && parseOverview(first.text) === null

  return { first, last: holdsProse ? await ask() : first }
}

function words(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}#.]+/gu) ?? []).filter(w => !STOP_WORDS.has(w)))
}

/** The share of content words two texts have in common, over the words either has. */
export function overlap(a: string, b: string): number {
  const x = words(a)
  const y = words(b)
  const both = [...x].filter(w => y.has(w)).length
  const either = new Set([...x, ...y]).size

  return either === 0 ? 1 : both / either
}

function nameKey(name: string): string {
  return [...words(name)].sort().join(' ')
}

export function isOpen(s: Pick<Subject, 'status'>): boolean {
  return s.status !== 'done' && s.status !== 'dropped'
}

/** Subject changes first, then reversals, then links, so a WAS or LINK can name a subject the same answer added. */
const OP_ORDER: Record<Op['kind'], number> = {
  none: 0,
  role: 0,
  goal: 0,
  new: 0,
  set: 0,
  done: 0,
  drop: 0,
  was: 1,
  link: 2,
}

/** The list after `ops`, applied at `now`. A line that names an id or a name the list does not hold changes nothing. */
export function applyOps(last: Overview | null, ops: Op[], now: number): Overview {
  let o: Overview = {
    ...(last ?? EMPTY_OVERVIEW),
    subjects: (last?.subjects ?? []).map(s => ({ ...s })),
    children: (last?.children ?? []).map(c => ({ ...c })),
  }
  const find = (ref: string) => {
    const key = nameKey(clipWords(ref, NAME_KEPT))

    return o.subjects.find(s => s.id === ref) ?? o.subjects.find(s => isOpen(s) && nameKey(s.name) === key) ?? null
  }
  /** A `was:` line stays until the person has seen it. The page shows it only on rows that changed since the last look. */
  const forgetSeenWas = (s: Subject) => {
    const isSeen = o.lastLookAt !== null && s.changedAt <= o.lastLookAt
    if (isSeen) s.was = null
  }
  const set = (s: Subject, status: OpenStatus, text: string) => {
    if (s.status === status && overlap(s.text, text) >= REWORD_OVERLAP) return
    s.status = status
    s.text = clipWords(text, TEXT_KEPT)
    forgetSeenWas(s)
    s.changedAt = now
  }
  const ordered = ops.map((op, n) => ({ op, n })).sort((x, y) => OP_ORDER[x.op.kind] - OP_ORDER[y.op.kind] || x.n - y.n)
  for (const { op } of ordered) {
    if (op.kind === 'none') continue
    if (op.kind === 'role') o.role = op.role
    else if (op.kind === 'goal') o.goal = clipWords(op.text, GOAL_KEPT)
    else if (op.kind === 'link') {
      const child = o.children.find(c => c.id === op.child)
      const subject = find(op.subject)
      if (child && subject) child.subjectId = subject.id
    } else if (op.kind === 'new') {
      const known = find(op.name)
      if (known && isOpen(known)) {
        set(known, op.status, op.text)
        continue
      }
      const s: Subject = {
        id: `s${o.nextId}`,
        name: clipWords(op.name, NAME_KEPT),
        status: op.status,
        text: clipWords(op.text, TEXT_KEPT),
        was: null,
        createdAt: now,
        changedAt: now,
        closedAt: null,
        into: null,
      }
      o = { ...o, nextId: o.nextId + 1, subjects: [...o.subjects, s] }
    } else {
      const s = find(op.ref)
      if (!s) continue
      if (op.kind === 'set') set(s, op.status, op.text)
      else if (op.kind === 'done') {
        s.status = 'done'
        if (op.text) s.text = clipWords(op.text, TEXT_KEPT)
        forgetSeenWas(s)
        s.closedAt = now
        s.changedAt = now
      } else if (op.kind === 'drop') {
        const target = op.into ? find(op.into) : null
        s.status = 'dropped'
        s.text = clipWords(op.why, TEXT_KEPT)
        s.closedAt = now
        s.into = target && target.id !== s.id ? target.id : null
        s.changedAt = now
        if (target && s.into) {
          target.was = target.was ?? `${s.name} folded in`
          target.changedAt = now
        }
      } else {
        const folded = o.subjects.find(x => x.into === s.id && x.closedAt === now)
        s.was = folded ? `${folded.name} folded in; was: ${op.text}` : op.text
        s.changedAt = now
      }
    }
  }

  return o
}

/** The Overview after an answer, applied at `now`. */
export function applyOverview(last: Overview | null, answer: OverviewAnswer, now: number): Overview | null {
  return answer.kind === 'unchanged' ? last : applyOps(last, answer.ops, now)
}

export function isChildRunning(c: Pick<Child, 'startedAt' | 'endedAt'>, now: number): boolean {
  return c.startedAt <= now && (c.endedAt === null || c.endedAt > now)
}

/** What a host reports about a child: everything but the id and the link, which the Overview owns. */
export type ChildReport = Omit<Child, 'id' | 'subjectId'>

/**
 * Adds a child the host reports, or updates the one it holds with the same `ref`. A delegate prompted again keeps its
 * id and link. Children that ended more than `CHILD_KEPT_MS` before `now` are let go.
 */
export function withChild(last: Overview | null, c: ChildReport, now: number): Overview {
  const o = last ?? EMPTY_OVERVIEW
  const kept = o.children.filter(x => x.ref === c.ref || x.endedAt === null || now - x.endedAt < CHILD_KEPT_MS)
  const known = kept.find(x => x.ref === c.ref)
  if (known) return { ...o, children: kept.map(x => (x === known ? { ...x, ...c } : x)) }

  return {
    ...o,
    nextChildId: o.nextChildId + 1,
    children: [...kept, { ...c, id: `c${o.nextChildId}`, subjectId: null }].slice(-CHILDREN_KEPT),
  }
}

/** The child with `ref` after `change`, or the Overview unchanged when it holds none. */
function changedChild(o: Overview | null, ref: string, change: (c: Child) => Partial<ChildReport>): Overview | null {
  const known = o?.children.find(c => c.ref === ref)
  if (!o || !known) return o

  return { ...o, children: o.children.map(c => (c === known ? { ...c, ...change(c) } : c)) }
}

/** The child with `ref` ended at `at`. */
export function childEnded(o: Overview | null, ref: string, at: number): Overview | null {
  return changedChild(o, ref, c => ({ endedAt: c.endedAt ?? at }))
}

/** The child with `ref` did something at `at`. Only a kind the host reports activity for has a time to move. */
export function childActive(o: Overview | null, ref: string, at: number): Overview | null {
  return changedChild(o, ref, c => ({ lastActivityAt: Math.max(c.lastActivityAt ?? at, at) }))
}

/** The subjects as the call reads them: open ones with ids, and finished names it must not add again. */
export function subjectsText(o: Overview | null): { open: string; finished: string } {
  const subjects = o?.subjects ?? []
  const open = subjects.filter(isOpen).map(s => `${s.id} | ${s.status} | ${s.name} | ${s.text || '-'}`)
  const finished = subjects
    .filter(s => !isOpen(s))
    .slice(-FINISHED_READ)
    .map(s => `${s.id} | ${s.status} | ${s.name}`)

  return { open: open.join(NL) || '(none yet)', finished: finished.join(NL) }
}

/** The running children as the call reads them. */
export function runningText(o: Overview | null, now: number): string {
  return (o?.children ?? [])
    .filter(c => isChildRunning(c, now))
    .map(c => `${c.id} | ${c.kind} | ${c.name} | ${c.subjectId ?? '-'}`)
    .join(NL)
}

/** The Overview tab is shown. The look line stays where it was until the look ends, so the page keeps its order. */
export function lookStarted(o: Overview | null, now: number): Overview | null {
  return o === null || o.look !== null ? o : { ...o, look: { startedAt: now } }
}

/** How long the Overview must show before it counts as a look, so a pass through the tab keeps the look line. */
export const LOOK_MIN_MS = 5_000

/** The Overview tab is no longer shown, at `at`. A look shorter than `LOOK_MIN_MS` leaves the look line where it was. */
export function lookEnded(o: Overview | null, at: number): Overview | null {
  if (o === null || o.look === null) return o
  const isLongEnough = at - o.look.startedAt >= LOOK_MIN_MS

  return { ...o, lastLookAt: isLongEnough ? at : o.lastLookAt, look: null }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function time(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function subjectOf(saved: unknown): Subject | null {
  const s = saved as Partial<Record<keyof Subject, unknown>> | null
  const status = STATUSES.find(x => x === s?.status)
  const changedAt = time(s?.changedAt)
  if (!s || typeof s.id !== 'string' || typeof s.name !== 'string' || !status || changedAt === null) return null

  return {
    id: s.id,
    name: s.name,
    status,
    text: text(s.text),
    was: typeof s.was === 'string' ? s.was : null,
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
  }
}

/** The statuses an Overview saved before subjects had, as a subject's status; null for one that closed. */
const OLD_STATUS: Record<string, OpenStatus | null> = {
  working: 'working',
  queued: 'queued',
  'waits-on-you': 'waits-on-you',
  'waits-on-other': 'waits-on-other',
  problem: 'problem',
  unknown: 'queued',
  done: null,
  'ruled-out': null,
}

/**
 * An Overview saved before subjects, as subjects. Its streams, work and problems that were still open become subjects
 * dated at the last look, since the person saw them then. With no look there is no honest time to give them, and the
 * person never read that page, so only the headline carries over, as the goal.
 */
function fromLists(o: Record<string, unknown>): Overview {
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
      createdAt: lastLookAt!,
      changedAt: lastLookAt!,
      closedAt: null,
      into: null,
    }))

  return {
    ...EMPTY_OVERVIEW,
    role: o.isCoordinator === true ? 'coordinator' : 'session',
    goal: clipWords(text(o.headline), GOAL_KEPT),
    subjects,
    nextId: subjects.length + 1,
    lastLookAt,
  }
}

/** A saved Overview, from this build or an earlier one, with anything wrongly shaped left out. Null for none. */
export function upgradeOverview(saved: unknown): Overview | null {
  const o = saved as Record<string, unknown> | null | undefined
  if (typeof o !== 'object' || o === null) return null
  if (typeof o.headline === 'string') return fromLists(o)
  if (!Array.isArray(o.subjects)) return null
  const subjects = o.subjects.map(subjectOf).filter((s): s is Subject => s !== null)
  const children = Array.isArray(o.children) ? o.children.map(childOf).filter((c): c is Child => c !== null) : []
  const look = o.look as { startedAt?: unknown } | null | undefined
  const lookAt = time(look?.startedAt)

  return {
    role: o.role === 'coordinator' ? 'coordinator' : 'session',
    goal: text(o.goal),
    subjects,
    children,
    nextId: Math.max(time(o.nextId) ?? 1, subjects.length + 1),
    nextChildId: Math.max(time(o.nextChildId) ?? 1, children.length + 1),
    lastLookAt: time(o.lastLookAt),
    look: lookAt === null ? null : { startedAt: lookAt },
  }
}
