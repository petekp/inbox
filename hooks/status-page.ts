import type { Item, Ledger, Session, Subject, TaskNode, TaskProgressSegments, TaskTree } from '../types'
import { isChildRunning } from './status-children'
import { isOpen } from './status-limits'
import { cutAtPhrase } from './text'
import type { StatusTone } from './help'
import { goalPage, oldestAsk } from './status-goal-page'
import type { GoalParts } from './status-goal-page'
import { isFinishedUnseen, looseChildRows, partRows } from './status-page-parts'
import type { ListContext } from './status-page-parts'
import { taskRootGroups, weightedTaskProgress, weightedTaskProgressSegments } from './task-tree'

const STATUS_FAILED =
  "The inbox couldn't update this page from one of the agent's replies. What changed in that reply may be missing. It reads the conversation again after the next reply."

export type StatusBranch = 'mid' | 'last'
export type StatusStall = { text: string; tone: 'needsYou' | 'done' | 'muted' }

export type StatusRow = { depth: number } & (
  | {
      kind: 'subject'
      id: string
      mark: string
      tone: StatusTone
      isRunning: boolean
      name: string
      text: string | null
      stall: StatusStall | null
      merged: string | null
      was: string | null
      hasChildren: boolean
      ask: { id: string; kind: Item['kind'] } | null
    }
  | {
      kind: 'child'
      id: string
      mark: string
      tone: StatusTone
      isRunning: boolean
      name: string
      stall: StatusStall | null
      branch: StatusBranch | null
    }
  | { kind: 'more'; id: string; text: string; branch: 'last' }
  | { kind: 'fold'; id: string; mark: string; tone: StatusTone; text: string; subjectIds: string[] }
  | { kind: 'done-fold'; id: string; text: string; rows: StatusRow[] }
  | { kind: 'part'; id: string; text: string }
  | { kind: 'counts'; id: string; counts: StatusCount[] }
)

export type StatusCount = { mark: string; tone: StatusTone; text: string }

export type StatusPage = GoalParts & {
  isEmpty: boolean
  head: { title: string; description: string | null } | null
  rows: StatusRow[]
  progressSegments: TaskProgressSegments
  error: string | null
  empty: { title: string; hint: string }
}

export const WAS_PREFIX = 'was: '
const MERGED_PREFIX = 'merged in: '
export const STALL_GAP = ' · '
export const STATUS_TEXT_LINES = 3
export const NAMED_FOLD_TEXT = { done: 'Also done: ', dropped: 'Also dropped: ' } as const
export const namedFoldMore = (n: number) => `+${n} more`

export function mergedLine(merged: string, fits: (text: string) => boolean): string {
  return `${MERGED_PREFIX}${cutAtPhrase(merged, names => fits(`${MERGED_PREFIX}${names}`))}`
}

export function nameBeforeStall(name: string, fits: (shown: string) => boolean): string {
  const words = name.split(' ')
  const cuts = words.map((_, n) => (n === 0 ? name : `${words.slice(0, words.length - n).join(' ')}…`))

  return cuts.find(fits) ?? cuts.at(-1)!
}

function statusOf(roots: TaskNode[]): TaskNode['status'] {
  if (roots.every(task => task.status === 'done' || task.status === 'dropped'))
    return roots.some(task => task.status === 'done') ? 'done' : 'dropped'
  if (roots.some(task => task.status === 'working')) return 'working'
  return roots.some(task => task.status === 'waits-on-other') ? 'waits-on-other' : 'queued'
}

// prettier-ignore
export function statusPage(
  s: {
    ledger: Pick<Ledger, 'overview' | 'items'>
    taskTree?: TaskTree
    presence: Session['presence']
    overviewFailure?: Session['overviewFailure']
  },
  now: number,
  stalledTasks: ReadonlySet<string> = new Set(),
): StatusPage {
  const o = s.ledger.overview
  const tree = s.taskTree ?? []
  const byId = new Map(tree.map(task => [task.id, task]))
  const groups = taskRootGroups(tree)
  const rootIds = new Map(groups.flatMap(group => group.roots.map(root => [root.id, group.id] as const)))
  const rootIdOf = (id: string | null) => {
    let task = id === null ? undefined : byId.get(id)
    while (task?.parentId !== null && task?.parentId !== undefined) task = byId.get(task.parentId)
    return task ? rootIds.get(task.id) ?? task.id : null
  }
  const openAskIds = new Set(s.ledger.items.map(item => item.id))
  const askLinks = Object.fromEntries(
    Object.entries(o?.askSubjects ?? {})
      .filter(([ask]) => openAskIds.has(ask))
      .map(([ask, ids]) => [ask, [...new Set(ids.map(rootIdOf).filter((id): id is string => id !== null))]]),
  )
  const heldIds = new Set(Object.values(askLinks).flat())
  const lastLookAt = o?.lastLookAt ?? null
  const missed = o?.missedInLastLook ?? {}
  const runningChildren = (o?.children ?? [])
    .filter(child => isChildRunning(child, now) || isFinishedUnseen(child, lastLookAt))
    .map(child => ({ ...child, subjectId: rootIdOf(child.subjectId) }))
    .sort((a, b) => (b.lastActivityAt ?? b.startedAt) - (a.lastActivityAt ?? a.startedAt))
  const taskRows = groups.map(({ id, roots }) => {
    const detail = roots.map(task => task.detail).filter(Boolean).join('; ')
    const progress = Math.round(weightedTaskProgress(tree, roots.map(task => task.id)) * 100)
    const changedAt = Math.max(...roots.map(task => task.updatedAt))
    const closed = roots.every(task => task.status === 'done' || task.status === 'dropped')
    return {
      id, name: roots.map(task => task.title).join(', '), status: statusOf(roots),
      text: `${progress}% complete${detail ? ` · ${detail}` : ''}`,
      createdAt: Math.min(...roots.map(task => task.createdAt)), changedAt,
      closedAt: closed ? changedAt : null, was: null, merged: null, into: null,
    }
  })
  const place = { working: 0, 'waits-on-other': 1, queued: 2, done: 3, dropped: 3 }
  taskRows.sort((a, b) => Number(heldIds.has(b.id)) - Number(heldIds.has(a.id)) || place[a.status] - place[b.status] || b.changedAt - a.changedAt)
  const isNew = (task: Subject) => {
    const seenAt = task.id in missed ? missed[task.id] : lastLookAt
    return seenAt === null || seenAt === undefined || task.changedAt > seenAt
  }
  const isHeld = (task: Subject) => isOpen(task) && heldIds.has(task.id)
  const oldestAskOf = (task: Subject) => (isHeld(task) ? oldestAsk(s.ledger.items, askLinks, task.id) : null)
  const ctx: ListContext = {
    isNew,
    isHeld,
    oldestAskOf,
    running: runningChildren,
    isTurnRunning: s.presence.isTurnRunning,
    now,
  }
  const shown: Subject[] = taskRows.filter(task => isOpen(task) || isNew(task))
  const done = taskRows.filter(task => task.status === 'done' && !isNew(task))
  const shownIds = new Set(shown.map(task => task.id))
  const loose = runningChildren.filter(child => child.subjectId === null || !shownIds.has(child.subjectId))
  const rows = [...looseChildRows(loose, 0), ...partRows(shown, ctx, 0)]
  if (done.length > 0)
    rows.push({
      kind: 'done-fold',
      id: 'done',
      depth: 0,
      text: `${done.length} done`,
      rows: partRows(done, { ...ctx, running: [] }, 1),
    })
  const goalParts = goalPage(o, s.ledger.items, tree)
  const head = o?.head ? { title: o.head.title, description: o.head.description || null } : null

  return {
    isEmpty: head === null && rows.length === 0 && goalParts.goal === null && !goalParts.canRestoreGoal,
    head,
    ...goalParts,
    rows,
    progressSegments: weightedTaskProgressSegments(tree, stalledTasks),
    error: s.overviewFailure ? STATUS_FAILED : null,
    empty: {
      title: 'Status',
      hint: "What this session's work is for, where each top-level task stands, and what changed.",
    },
  }
}

export function seenSubjectIds(row: StatusRow): string[] {
  // prettier-ignore
  return row.kind === 'subject' ? [row.id] : row.kind === 'fold' ? row.subjectIds : row.kind === 'done-fold' ? row.rows.flatMap(seenSubjectIds) : []
}

export function statusListRows(page: StatusPage): StatusRow[] {
  return [...(page.goal?.milestones ?? []).flatMap(milestone => milestone.rows), ...page.rows]
}
