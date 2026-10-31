import { SETTLED_MS, NO_HOLDS, allRows, rowKeyPlan } from '../../hooks/view'
import type { StatusRow, RowView } from '../../hooks/view'
import { sessionView } from '../../hooks/session-view'
import { demoState } from '../src/demo'
import { INITIAL_UI, render } from '../src/panel'
import type { PanelScreen, PanelUi, Style } from '../src/panel'
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
}
export const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

export const screenOf = (overrides: Partial<PanelScreen> = {}, holds = NO_HOLDS): PanelScreen => ({
  view: sessionView(demoState(NOW), NOW, SETTLED_MS, true, holds),
  modelName: 'Claude Sonnet 4.5',
  isGhMissing: false,
  isFetchingPrs: false,
  stop: null,
  version: '1.2.3',
  ...overrides,
})

export const drawn = (screen: PanelScreen, ui: PanelUi, width = 200) => render(screen, ui, width, NOW, style)
export const text = (screen: PanelScreen, ui: PanelUi, width = 200) => drawn(screen, ui, width).map(strip).join('\n')
export const keys = (screen: PanelScreen, ui: PanelUi, ...names: string[]) =>
  names.reduce((u, name) => handleKey(screen, u, name, NOW).ui, ui)

export const waiting = (screen: PanelScreen, id: string) => allRows(screen.view).find(r => r.id === id)!
export const firstQuestion = (screen: PanelScreen) =>
  screen.view.needsYou.questions.find(r => r.state.is === 'open' && r.item?.rec)!
export const onRow = (row: RowView): PanelUi => ({ ...INITIAL_UI, selectedId: row.id })

export function plannedLabels(row: RowView): string[] {
  const { keys: planned, more } = rowKeyPlan(row, true)

  return [...planned, ...more].flatMap(k =>
    k.slot === 'allOptions' ? [] : [k.slot === 'retry' ? k.label : k.action.label],
  )
}

export const buttonLines = (screen: PanelScreen, ui: PanelUi) =>
  text(screen, ui)
    .split('\n')
    .filter(l => l.includes('↵ ') && !l.includes('↵ press'))

export function buttonLine(screen: PanelScreen, ui: PanelUi): string {
  return buttonLines(screen, ui)[0]!
}

export const onPage: PanelUi = { ...INITIAL_UI, tab: 'overview' }

export const labelOf = (row: StatusRow) => (row.kind === 'subject' || row.kind === 'child' ? row.name : row.text)
