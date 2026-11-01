import type { Tab } from '../../types'
import {
  ARRIVAL_TABS,
  closedGroups,
  followTo,
  isPrsTabEmpty,
  isTabEmpty,
  listedRowIds,
  openRowIds,
  prRowIds,
  recordRows,
} from '../../hooks/arrivals'
import type { RowRecord } from '../../hooks/arrivals'
import type { ToneName } from '../../hooks/tones'
import { ROW_COPY } from '../../hooks/rows'
import { shownTabs, tabBadge, fitTabs, tabName, isRowTab } from '../../hooks/tabs'
import { footerStatus } from '../../hooks/view'
import { keptOpen } from '../../hooks/action-plan'
import { GOAL_FIELD, GOAL_KEYS_ID, statusKeyRows } from '../../hooks/status-keys'
import { versionLabel } from '../../hooks/banners'
import type { ShownTab, TabNaming } from '../../hooks/tabs'
import type { Draw } from './panel-draw'
import { entriesOf } from './panel-entries'
import { withTab } from './panel-keys'
import { linesOf, waitsOf } from './panel-lines'
import { fit, spread, visibleLength } from './panel-text'
import type { PanelScreen, PanelUi, Style } from './panel'

export type SeenRows = RowRecord<Tab>

/** Each tab's row ids: every row it lists, and the open rows a freshly opened panel moves for. PRs are null while they load. */
function tabRows(screen: PanelScreen): { listed: Record<Tab, string[] | null>; open: Record<Tab, string[]> } {
  const { view } = screen

  return {
    listed: { ...listedRowIds(view), prs: screen.isFetchingPrs ? null : prRowIds(view.prs.drawn) },
    open: { ...openRowIds(view), prs: [] },
  }
}

function isShownEmpty(screen: PanelScreen, ui: PanelUi, tab: Tab): boolean {
  const { view } = screen
  if (tab === 'prs') return isPrsTabEmpty(view.prs.drawn.length, screen.isFetchingPrs)
  const rows = tab === 'needsYou' ? [...view.needsYou.questions, ...view.needsYou.tasks] : view.findings.rows
  return isTabEmpty({
    rows,
    settled: new Set(rows.filter(r => r.state.is === 'settled').map(r => r.id)),
    closed: closedGroups(view, tab, kind => ui.unfolded.includes(kind)),
    hasBlocker: tab === 'needsYou' && screen.stop !== null,
  })
}

/**
 * Records which rows are new since `seen`, and where the panel moves for them. While the shown tab is empty, it moves
 * to the first other tab with new rows, or as the panel opens, with open rows. A default selection stays on the row it
 * was on when new rows arrive above it.
 */
export function followRows(
  screen: PanelScreen,
  ui: PanelUi,
  seen: SeenRows,
  isOpening: boolean,
  now: number,
): { ui: PanelUi; seen: SeenRows } {
  const { listed, open } = tabRows(screen)
  const recorded = recordRows(seen, listed)
  const { tab } = ui
  if (!isRowTab(tab)) return { ui, seen: recorded.seen }
  const to = followTo(ARRIVAL_TABS, tab, isShownEmpty(screen, ui, tab), isOpening ? open : recorded.added)
  if (to) return { ui: withTab(ui, to, now), seen: recorded.seen }
  const arrived = recorded.added[tab]
  if (ui.selectedId !== null || arrived.length === 0) return { ui, seen: recorded.seen }
  const kept = keptOpen(waitsOf(linesOf(entriesOf(screen, ui, tab, now))), arrived)

  return { ui: kept === null ? ui : { ...ui, selectedId: kept }, seen: recorded.seen }
}

type TabCell = {
  id: ShownTab
  hotkey: string
  label: string
  symbol: string
  tone: ToneName | null
  /** What follows the name: a row tab's count. */
  badge: string | null
  isShown: boolean
}

/** One layout of the tab line. Each later layout is narrower. */
type TabForm = { isBracketed: boolean }

const TAB_FORMS: readonly TabForm[] = [{ isBracketed: true }, { isBracketed: false }]

function tabCell(t: TabCell, name: string, form: TabForm, s: Style): string {
  const key = form.isBracketed ? `[${t.hotkey}]` : t.hotkey
  const { badge } = t
  if (t.isShown) return s.inverse(s.bold(` ${key} ${name}${badge === null ? '' : ` ${badge}`} `))
  const badgeText = badge === null ? '' : ` ${t.tone ? s.tone(t.tone, badge) : badge}`

  return ` ${s.dim(`${key} ${name}`)}${badgeText} `
}

/**
 * The tab line. As the panel narrows, it drops the `[n]` brackets, then names the tabs by their symbols, with and then
 * without brackets. Narrower still, the final `fit()` in `drawPanel` cuts the line's end.
 */
export function tabBar(d: Draw): string {
  const { screen, ui, width, style: s } = d
  const counts: Record<Tab, number> = {
    needsYou: screen.view.needsYou.count,
    findings: screen.view.findings.count,
    prs: screen.view.prs.count,
  }
  const tabs: TabCell[] = shownTabs(screen.isNextBuild === true).map(t => ({
    ...t,
    tone: isRowTab(t.id) ? t.id : null,
    badge: tabBadge(t.id, counts),
    isShown: t.id === ui.tab,
  }))
  const lineOf = (naming: TabNaming, form: TabForm) =>
    ` ${tabs.map(t => tabCell(t, tabName(t, naming), form, s)).join(' ')}`
  const { naming, layout } = fitTabs(TAB_FORMS, (naming, form) => visibleLength(lineOf(naming, form)) <= width)

  return spread(lineOf(naming, layout), ui.isHelpShown ? '' : s.dim('esc to close '), width)
}

export function footer(d: Draw, isPageScrolling: boolean): string[] {
  const { screen, ui, width, style: s } = d
  const out: string[] = [s.dim('─'.repeat(width))]
  const status = footerStatus(
    ui.tab,
    screen.view.status,
    { isFetching: screen.isFetchingPrs, hasPrs: screen.view.prs.drawn.length > 0 },
    screen.view.statusPage.error,
  )
  if (status.text) out.push(` ${s.dim(status.text)}`)
  const hints =
    ui.typing !== null
      ? [`↵ ${ui.typing === GOAL_KEYS_ID ? GOAL_FIELD.submit : ROW_COPY.send}`, `esc ${ROW_COPY.cancel}`]
      : ui.isHelpShown
        ? [...(isPageScrolling ? ['↑↓ scroll'] : []), 'esc close help']
        : isRowTab(ui.tab)
          ? ['←→ pick', '↵ press', '↑↓ move', 'tab switch', '? help']
          : [
              ...(statusKeyRows(screen.view.statusPage).length > 0 ? ['j k select', '↵ press'] : []),
              ...(isPageScrolling ? ['↑↓ scroll'] : []),
              'tab switch',
              '? help',
            ]
  const model = `${screen.modelName ? `inbox model ${screen.modelName}` : 'no inbox model: set @inbox'}  ${versionLabel(screen.version, screen.isNextBuild === true)} `
  const hintLine = ` ${hints.map(h => s.dim(h)).join(` ${s.tone('sep', '·')} `)}`
  const fitsBesideHints = width - visibleLength(hintLine) - visibleLength(model) >= 2
  if (fitsBesideHints) out.push(spread(hintLine, s.dim(model), width))
  else out.push(fit(hintLine, width), fit(` ${s.dim(model.trimEnd())}`, width))

  return out
}

const moreLines = (arrow: string, n: number, s: Style) => s.dim(`  ${arrow} ${n} more line${n === 1 ? '' : 's'}`)

/**
 * `room` lines of the page, `top` presses past its first screen. Each press shows one more line at the bottom, so the
 * first press also hides the line the "↑" line takes, and the press before the end leaves "↓ 1 more line".
 */
export function pageWindow(body: string[], top: number, room: number, s: Style): string[] {
  const end = Math.min(body.length, room - 1 + top)
  const below = body.length - end
  const start = end - (room - (top > 0 ? 1 : 0) - (below > 0 ? 1 : 0))

  return [
    ...(top > 0 ? [moreLines('↑', start, s)] : []),
    ...body.slice(start, end),
    ...(below > 0 ? [moreLines('↓', below, s)] : []),
  ]
}

export function scrolled(body: string[], selectedAt: number[], room: number, s: Style): string[] {
  const [first = 0, last = 0] = selectedAt
  let start = Math.min(Math.max(0, first - 1), body.length - room)
  if (last > start + room - 2) start = Math.min(Math.max(first, last - room + 2), body.length - room)
  const end = start + room
  const clip = body.slice(start, end)
  if (start > 0) clip[0] = s.dim(`  ↑ ${start} more lines`)
  if (end < body.length) clip[clip.length - 1] = s.dim(`  ↓ ${body.length - end} more lines`)

  return clip
}
