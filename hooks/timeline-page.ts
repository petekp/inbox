import type { LastAction, TaskFactWarning, TaskHistoryEvent, TaskNode, TaskProgressSegments, TaskTree } from '../types'
import { prMarkId } from './pr-rows'
import { shortAgo } from './rows'
import { weightedTaskProgress, weightedTaskProgressSegments } from './task-tree'
import type { PrAction } from './pr-press'
import type { ActionView } from './rows'

type TimelineBarPart = { state: keyof Omit<TaskProgressSegments, 'total'>; mark: string; count: number }
type TimelineBar = { id: string; label: string; parts: TimelineBarPart[] }
type TimelineHistoryEvent = Omit<TaskHistoryEvent, 'at'> & { time: string }
type TimelineTask = Omit<TaskNode, 'createdAt' | 'updatedAt' | 'history'> & {
  updatedAgo: string
  history: TimelineHistoryEvent[]
}
type TimelineRowAction = Pick<ActionView, 'label' | 'hotkey' | 'kind' | 'emphasis'> & {
  action: 'select' | 'toggle-branch'
  id: string
}
type TimelineLinkAction = PrAction & { result: LastAction['result'] | null }
type TimelineNode = {
  task: TimelineTask
  depth: number
  branch: 'mid' | 'last' | null
  hasChildren: boolean
  progress: number
  measure: string
  status: string
  statusLabel: string
  stalledAge: string | null
  warnings: string[]
  actions: TimelineRowAction[]
}
type TimelineBase = { isEmpty: boolean; empty: { title: string; hint: string }; summary: string; bars: TimelineBar[] }
export type TimelineData = TimelineBase & { rows: Omit<TimelineNode, 'actions'>[] }
type TimelinePage = TimelineBase & {
  rows: TimelineNode[]
  selected: { row: TimelineNode; links: TimelineLinkAction[] } | null
}

const BAR_MARKS: Record<TimelineBarPart['state'], string> = {
  done: '■',
  working: '●',
  stalled: '!',
  waiting: '◌',
  queued: '·',
}
const BAR_STATES = Object.keys(BAR_MARKS) as TimelineBarPart['state'][]

function timelineTask(task: TaskNode, now: number): TimelineTask {
  const { createdAt: _createdAt, updatedAt, history, ...details } = task
  return {
    ...details,
    updatedAgo: shortAgo(now - updatedAt),
    history: history.map(({ at, ...event }) => ({ ...event, time: shortAgo(now - at) })),
  }
}

function timelineBar(segments: TaskProgressSegments, id: string, label: string, width = 16): TimelineBar {
  if (segments.total <= 0) return { id, label, parts: [] }
  let cumulative = 0
  let drawn = 0
  const parts = BAR_STATES.flatMap(state => {
    cumulative += segments[state]
    const end = Math.round((cumulative / segments.total) * width)
    const count = Math.max(0, end - drawn)
    drawn = end
    return count > 0 ? [{ state, mark: BAR_MARKS[state], count }] : []
  })
  return { id, label, parts }
}

export function timelineData(
  tree: TaskTree,
  segments: TaskProgressSegments,
  stalledSince: Record<string, number>,
  warnings: readonly TaskFactWarning[],
  now: number,
): TimelineData {
  const children = new Map<string | null, TaskNode[]>()
  for (const task of tree) children.set(task.parentId, [...(children.get(task.parentId) ?? []), task])
  const stalled = new Set(Object.keys(stalledSince))
  const rows: Omit<TimelineNode, 'actions'>[] = []
  const visit = (siblings: TaskNode[], depth: number) => {
    siblings.forEach((task, index) => {
      const childrenOfTask = children.get(task.id) ?? []
      const stalledAt = stalledSince[task.id]
      const status = stalledAt === undefined ? task.status : 'stalled'
      const progress = Math.round(weightedTaskProgress(tree, task.id) * 100)
      rows.push({
        task: timelineTask(task, now),
        depth,
        branch: depth === 0 ? null : index === siblings.length - 1 ? 'last' : 'mid',
        hasChildren: childrenOfTask.length > 0,
        progress,
        measure: childrenOfTask.length ? `${progress}%` : `w${task.weight}`,
        status,
        statusLabel:
          stalledAt !== undefined
            ? `stalled ${shortAgo(now - stalledAt)}`
            : status === 'waits-on-other'
              ? 'waiting on others'
              : status,
        stalledAge: stalledAt === undefined ? null : shortAgo(now - stalledAt),
        warnings: warnings.filter(warning => warning.taskId === task.id).map(warning => warning.message),
      })
      visit(childrenOfTask, depth + 1)
    })
  }
  visit(children.get(null) ?? [], 0)

  const roots = children.get(null) ?? []
  const streams = new Set(roots.flatMap(task => (task.streamId ? [task.streamId] : [])))
  const summary =
    streams.size > 1
      ? `${streams.size} streams`
      : segments.total > 0
        ? `${Math.round((segments.done / segments.total) * 100)}% complete · ${Number(segments.done.toFixed(1))}/${Number(segments.total.toFixed(1))} weight`
        : 'no tasks yet'
  const bars = [timelineBar(segments, 'tree', 'Task plan')]
  if (streams.size > 1)
    for (const root of roots)
      bars.push(timelineBar(weightedTaskProgressSegments(tree, stalled, root.id), root.id, root.title))

  return {
    isEmpty: tree.length === 0,
    empty: { title: 'Timeline', hint: 'No tasks have been recorded for this session.' },
    summary,
    rows,
    bars,
  }
}

function timelineLinkPlan(
  task: Pick<TimelineTask, 'links'>,
  lastActions: Record<string, LastAction>,
): TimelineLinkAction[] {
  return (['pr', 'issue'] as const).flatMap(kind => {
    const url = task.links?.[kind]
    if (!url) return []
    const result = lastActions[prMarkId(url)]?.result ?? null
    return [
      {
        press: { action: 'pr-open' as const, ref: url },
        label: kind === 'pr' ? 'Open PR' : 'Open issue',
        kind: 'local' as const,
        emphasis: 'normal' as const,
        icon: 'open' as const,
        isOut: result?.state === 'pending',
        result,
      },
    ]
  })
}

export function timelinePage(
  data: TimelineData,
  selectedId: string | null,
  folded: readonly string[],
  lastActions: Record<string, LastAction> = {},
): TimelinePage {
  const nodes = new Map(data.rows.map(row => [row.task.id, row]))
  const foldedIds = new Set(folded)
  const rows = data.rows.filter(row => {
    let parent = row.task.parentId
    while (parent !== null) {
      if (foldedIds.has(parent)) return false
      parent = nodes.get(parent)?.task.parentId ?? null
    }
    return true
  })
  let selected = rows.find(row => row.task.id === selectedId)
  if (!selected && selectedId) {
    let parent = nodes.get(selectedId)?.task.parentId ?? null
    while (parent !== null && !selected) {
      selected = rows.find(row => row.task.id === parent)
      parent = nodes.get(parent)?.task.parentId ?? null
    }
  }
  selected ??= rows[0]
  const drawnRows = rows.map(row => {
    const isFolded = foldedIds.has(row.task.id)
    const actions: TimelineRowAction[] = [
      { action: 'select', id: row.task.id, label: 'Select', hotkey: 'enter', kind: 'view', emphasis: 'normal' },
      ...(row.hasChildren
        ? [
            {
              action: 'toggle-branch' as const,
              id: row.task.id,
              label: isFolded ? 'Open branch' : 'Close branch',
              hotkey: isFolded ? 'l' : 'h',
              kind: 'view' as const,
              emphasis: 'quiet' as const,
            },
          ]
        : []),
    ]
    return { ...row, actions }
  })
  const selectedRow = selected ? drawnRows.find(row => row.task.id === selected!.task.id)! : null

  return {
    ...data,
    rows: drawnRows,
    selected: selectedRow ? { row: selectedRow, links: timelineLinkPlan(selectedRow.task, lastActions) } : null,
  }
}

export function moveTimelineSelection(
  rows: readonly TimelineNode[],
  selectedId: string | null,
  step: number,
): string | null {
  if (rows.length === 0) return null
  const at = rows.findIndex(row => row.task.id === selectedId)
  const to = ((at < 0 ? (step < 0 ? 0 : -1) : at) + step + rows.length) % rows.length
  return rows[to]!.task.id
}

export function toggleTimelineBranch(folded: readonly string[], id: string): string[] {
  return folded.includes(id) ? folded.filter(value => value !== id) : [...folded, id]
}
