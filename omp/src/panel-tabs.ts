import type { Tab } from '../../types'
import type { ToneName } from '../../core/view/tones'
import { HERDR_ASK_BUTTONS } from '../../core/remote/herdr-ask'
import { ROW_COPY } from '../../core/view/rows'
import { shownTabs, tabBadge, fitTabs, tabName, isRowTab } from '../../core/view/tabs'
import { GOAL_KEYS_ID, goalSubmitLabel, statusKeyRows, statusSelected } from '../../core/view/status-keys'
import type { IsCollapsed } from '../../core/view/status-folds'
import type { StatusPage } from '../../core/view/status-page'
import type { ShownTab, TabNaming } from '../../core/view/tabs'
import type { Draw } from './panel-draw'
import { drawnKeys } from './panel-keys'
import { collapsedIn, fit, spread, visibleLength } from './panel-text'
import type { InboxModel, Style } from './panel'

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
  const tabs: TabCell[] = shownTabs().map(t => ({
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

function inboxModelText({ modelName, isSignedIn }: InboxModel): string {
  if (modelName) return `inbox model ${modelName}`

  return isSignedIn ? 'no inbox model: set @inbox' : 'no inbox model: sign in with /login'
}

export function footer(d: Draw, isPageScrolling: boolean): string[] {
  const { screen, ui, width, style: s } = d
  const out: string[] = [s.dim('─'.repeat(width))]
  const askHints =
    screen.herdrAsk?.is === 'asking' && ui.typing === null && !ui.isHelpShown
      ? HERDR_ASK_BUTTONS.map(a => `${a.hotkey} ${a.label.toLowerCase()}`)
      : []
  const keyHints =
    ui.typing !== null
      ? [
          `↵ ${ui.typing === GOAL_KEYS_ID ? goalSubmitLabel(screen.view.statusPage) : ROW_COPY.send}`,
          `esc ${ROW_COPY.cancel}`,
        ]
      : ui.isHelpShown
        ? [...(isPageScrolling ? ['↑↓ scroll'] : []), 'esc close help']
        : isRowTab(ui.tab)
          ? ['←→ pick', '↵ press', '↑↓ move', 'tab switch', '? help']
          : [
              ...statusHints(
                screen.view.statusPage,
                ui.statusSelection,
                id => ui.statusUnfolded.includes(id),
                collapsedIn(screen.view),
              ),
              ...(isPageScrolling ? ['↑↓ scroll'] : []),
              'tab switch',
              '? help',
            ]
  const hints = [...askHints, ...keyHints]
  const model = `${inboxModelText(screen)} `
  const hintLine = ` ${hints.map(h => s.dim(h)).join(` ${s.tone('sep', '·')} `)}`
  const fitsBesideHints = width - visibleLength(hintLine) - visibleLength(model) >= 2
  if (fitsBesideHints) out.push(spread(hintLine, s.dim(model), width))
  else out.push(fit(hintLine, width), fit(` ${s.dim(model.trimEnd())}`, width))

  return out
}

/** The lines of a page `lines` long that `pageWindow` shows, from `start` up to `end`. */
export function pageWindowLines(lines: number, top: number, room: number): { start: number; end: number } {
  const end = Math.min(lines, room - 1 + top)
  const start = end - (room - (top > 0 ? 1 : 0) - (lines - end > 0 ? 1 : 0))

  return { start, end }
}

const moreLines = (arrow: string, n: number, s: Style) => s.dim(`  ${arrow} ${n} more line${n === 1 ? '' : 's'}`)

/**
 * `room` lines of the page, `top` presses past its first screen. Each press shows one more line at the bottom, so the
 * first press also hides the line the "↑" line takes, and the press before the end leaves "↓ 1 more line".
 */
export function pageWindow(body: string[], top: number, room: number, s: Style): string[] {
  const { start, end } = pageWindowLines(body.length, top, room)
  const below = body.length - end

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

/** The Status's key hints: j and k while a target has buttons, and ←→ while the selected one has more than one. */
function statusHints(
  page: StatusPage,
  selectedId: string | null,
  isUnfolded: (id: string) => boolean,
  isCollapsed: IsCollapsed,
): string[] {
  if (statusKeyRows(page, isUnfolded, isCollapsed).length === 0) return []
  const selected = statusSelected(page, selectedId, isUnfolded, isCollapsed)
  const fold = selected?.keys.find(k => k.press.action === 'toggle-collapse')
  const isPicking = (selected ? drawnKeys(selected).length : 0) > 1

  return [
    'j k select',
    ...(isPicking ? ['←→ pick'] : []),
    '↵ press',
    ...(fold ? [`${fold.hotkey} ${fold.label.toLowerCase()}`] : []),
  ]
}
