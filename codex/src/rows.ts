import { timelinePage } from '../../hooks/timeline-page'
import { stepRow } from '../../hooks/row-motion'
import type { TabView } from './core'
import { closingFolds, drawnRows, tabState, timelineFolded } from './tab-state'
import { reducedMotion, toggleFold } from './tab-motion'

export function timelinePageOf(view: TabView) {
  return timelinePage(view.timeline, tabState.timelineSelection, [...timelineFolded], view.lastActions)
}

export function stepTimelineRows(view: TabView): Set<string> {
  const now = Date.now()
  const all = timelinePage(view.timeline, null, [], view.lastActions).rows
  const page = timelinePageOf(view)
  const visible = new Set(page.rows.map(row => row.task.id))
  const nodes = new Map(all.map(row => [row.task.id, row]))
  const kept = new Set<string>()
  const changed = new Set<string>()

  for (const row of all) {
    let show = visible.has(row.task.id)
    let parent = row.task.parentId
    while (!show && parent !== null) {
      if (timelineFolded.has(parent)) {
        show = closingFolds.has(`timeline-${parent}`)
        break
      }
      parent = nodes.get(parent)?.task.parentId ?? null
    }
    if (!show) continue

    const id = `timeline:${row.task.id}`
    const before = drawnRows.get(id)
    const selected = page.selected?.row.task.id === row.task.id
    const track = stepRow(before?.track, selected ? 'open' : 'closed', now, !before, reducedMotion.matches)
    if (!track) continue
    if (track !== before?.track) changed.add(id)
    const openTimeline = selected ? page.selected : before?.openTimeline
    drawnRows.set(id, { track, ...(track.hasPanel && openTimeline ? { openTimeline } : {}) })
    kept.add(id)
  }

  for (const id of [...drawnRows.keys()]) {
    if (!id.startsWith('timeline:') || kept.has(id)) continue
    drawnRows.delete(id)
  }
  return changed
}

export function forgetTimelineRows() {
  for (const id of [...drawnRows.keys()]) if (id.startsWith('timeline:')) drawnRows.delete(id)
}

export function selectTimelineRow(id: string) {
  tabState.timelineSelection = id
  tabState.draw()
}

export function toggleTimelineFold(view: TabView, id: string) {
  const shown = new Set(view.timeline.rows.map(row => row.task.id).filter(taskId => !timelineFolded.has(taskId)))
  timelineFolded.has(id) ? timelineFolded.delete(id) : timelineFolded.add(id)
  toggleFold(id, shown, `timeline-${id}`)
}
