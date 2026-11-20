import { SETTLED_MS, NO_HOLDS } from '../../hooks/timing'
import { allRows } from '../../hooks/rows'
import { isRowTab } from '../../hooks/tabs'
import { rowKeyPlan } from '../../hooks/action-plan'
import type { StatusRow } from '../../hooks/status-page'
import type { RowView } from '../../hooks/rows'
import { sessionView } from '../../hooks/session-view'
import { demoState } from '../src/demo'
import { INITIAL_UI, render } from '../src/panel'
import type { PanelPress, PanelScreen, PanelUi, Style } from '../src/panel'
import { handleKey } from '../src/panel-keys'

export const NOW = 1_700_000_000_000
export const ESC = '\x1b['
export const style: Style = {
  bold: s => `${ESC}1m${s}${ESC}22m`,
  dim: s => `${ESC}2m${s}${ESC}22m`,
  inverse: s => `${ESC}7m${s}${ESC}27m`,
  underline: s => `${ESC}4m${s}${ESC}24m`,
  tone: (_name, s) => `${ESC}35m${s}${ESC}39m`,
  banner: (_tone, _part, s) => s,
  tint: (_tone, _share, s) => s,
}
export const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

export const screenOf = (overrides: Partial<PanelScreen> = {}, holds = NO_HOLDS): PanelScreen => ({
  view: sessionView(demoState(NOW), NOW, SETTLED_MS, holds),
  modelName: 'Claude Sonnet 4.5',
  isGhMissing: false,
  isFetchingPrs: false,
  stop: null,
  version: '1.2.3',
  ...overrides,
})

export const drawn = (screen: PanelScreen, ui: PanelUi, width = 200) => render(screen, ui, width, NOW, style)
export const text = (screen: PanelScreen, ui: PanelUi, width = 200) => drawn(screen, ui, width).map(strip).join('\n')
type Collapse = { action: 'collapse'; id: string; isCollapsed: boolean }

export function keyed(screen: PanelScreen, ui: PanelUi, key: string, now = NOW, text?: string) {
  const result = handleKey(screen, ui, key, now, text)
  const sent = result.commands.flatMap((c): (PanelPress | Collapse)[] =>
    c.kind === 'press'
      ? [c.press]
      : c.kind === 'save-collapse'
        ? [{ action: 'collapse', id: c.id, isCollapsed: c.isCollapsed }]
        : [],
  )

  return { ...result, press: result.press ?? sent[0], sent }
}

export const keys = (screen: PanelScreen, ui: PanelUi, ...names: string[]) =>
  names.reduce((u, name) => handleKey(screen, u, name, NOW).ui, ui)

export const withCursorOn = (ui: PanelUi, id: string | null): PanelUi =>
  isRowTab(ui.tab)
    ? { ...ui, selection: { ...ui.selection, [ui.tab]: { id, index: 0, guard: null } } }
    : { ...ui, statusSelection: id }

export const waiting = (screen: PanelScreen, id: string) => allRows(screen.view).find(r => r.id === id)!
export const firstQuestion = (screen: PanelScreen) =>
  screen.view.needsYou.questions.find(r => r.state.is === 'open' && r.item?.rec)!
export const onRow = (row: RowView | { id: string }): PanelUi => {
  const cursor = { id: row.id, index: 0, guard: null }

  return { ...INITIAL_UI, selection: { needsYou: cursor, findings: cursor, prs: cursor } }
}

export const cursorOf = (ui: PanelUi): string | null =>
  isRowTab(ui.tab) ? ui.selection[ui.tab].id : ui.statusSelection

export function plannedLabels(row: RowView): string[] {
  const { options, keys: planned, more } = rowKeyPlan(row, true)

  return [
    ...options.map(o => o.action.label),
    ...[...planned, ...more].flatMap(k =>
      k.slot === 'allOptions' ? [] : [k.slot === 'retry' ? k.label : k.action.label],
    ),
  ]
}

export const buttonLines = (screen: PanelScreen, ui: PanelUi) =>
  text(screen, ui)
    .split('\n')
    .filter(l => l.includes('↵ ') && !l.includes('↵ press'))

export function buttonLine(screen: PanelScreen, ui: PanelUi): string {
  return buttonLines(screen, ui)[0]!
}

export const onPage: PanelUi = { ...INITIAL_UI, tab: 'overview' }

export const labelOf = (row: StatusRow) =>
  row.kind === 'subject' || row.kind === 'child'
    ? row.name
    : row.kind === 'counts'
      ? row.counts.map(c => c.text).join(' · ')
      : row.text
