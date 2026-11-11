import type { Elements, RenderElement, RenderInput, RenderSurface } from 'claude-code'

import { fillSlot, offerChoice, placementIn, TOOLBAR_KEYS } from './pane-grid'

/**
 * The inbox in a pane-grid cell (https://github.com/hwanyong/pane-grid, its docs/add-pane-grid-cell.md). pane-grid
 * splits a grid pane into cells and moves the drawing of the mod placed in a cell into it. While the inbox has a cell
 * it draws there and not in its own pane or band, and it goes back to them when the cell is emptied. Without pane-grid
 * every read is undefined and the inbox draws as before. register.tsx reads pane-grid's state, since only its own
 * functions may take `$`, and this file holds what needs no engine.
 */

/** The name in .claude-plugin/plugin.json, under which pane-grid keeps the inbox's cell. */
export const PLUGIN = 'inbox'
export const PANE = 'inbox'
export const TITLE = 'Inbox'

/**
 * Where the pane's drawing goes: the inbox's own pane, or its cell in a grid pane. `columns` and `rows` are the size it
 * draws in, `isFocused` whether it has the keys, and `isActive` whether its hotkeys act.
 */
export type Site = { id: string; columns: number; rows: number; isFocused: boolean; isActive: boolean }

export type Placement = NonNullable<ReturnType<typeof placementIn>>

/**
 * The inbox's cell as pane-grid's last layout write gave it. A press that opens the pane calls `$.ui.open` before any
 * await, as `openInbox` in register.tsx says, so the checks made there read this and not `$.state`.
 */
let placed: Placement | undefined

/** Keeps the cell register.tsx read: at a session's start, after a hot reload, and on each layout write. */
export function keepPlacement(cell: Placement | undefined) {
  placed = cell
}

export const isPlaced = () => placed !== undefined

/** The pane that holds the drawing, which `$.ui.focus` names. */
export const siteId = () => placed?.requestId ?? PANE

export const ownSite = (e: RenderInput<'Pane'>): Site => ({
  id: PANE,
  columns: e.props.bodyColumns,
  rows: e.props.scroll.bodyRows,
  isFocused: e.props.isFocused,
  isActive: true,
})

/** `e` as the drawing reads it at `site`: the parts drawn from `e.props` take the site's size and focus. */
export const atSite = (e: RenderInput<'Pane'>, site: Site): RenderInput<'Pane'> => ({
  ...e,
  props: {
    ...e.props,
    bodyColumns: site.columns,
    isFocused: site.isFocused,
    scroll: { ...e.props.scroll, bodyRows: site.rows },
  },
})

/**
 * Whether `site` binds `hotkey`. A Button hotkey in a cell acts for the whole grid pane, and of two Buttons with one
 * hotkey the engine presses the later drawn, which is the cell. So only the active cell binds keys, and it leaves
 * pane-grid's toolbar letters to the toolbar.
 */
export const takesKey = (site: Site, hotkey: string) =>
  site.isActive && (site.id === PANE || !(TOOLBAR_KEYS as readonly string[]).includes(hotkey))

/** What `/inbox` says while the inbox has a cell, since its own pane then does not open. Null without a cell. */
export const cellText = (cell: Placement | undefined) =>
  cell ? `The inbox is drawn in pane-grid cell ${cell.cell} of the tab ${cell.tab}, so its pane did not open.` : null

/** The site of the inbox's cell `cell` in the grid pane `e`. pane-grid gives 0 for a size until it has measured the pane. */
export const cellSite = (e: RenderInput<'Pane'>, cell: Placement): Site => {
  const isActive = cell.isActive ?? true

  return {
    id: e.requestId,
    columns: cell.columns > 0 ? cell.columns : e.props.bodyColumns,
    rows: cell.rows > 0 ? cell.rows : e.props.scroll.bodyRows,
    isFocused: e.props.isFocused && isActive,
    isActive,
  }
}

/**
 * The grid pane's drawing `below` with the inbox offered in each empty cell, and with `drawn` in the inbox's cell when
 * that cell is in this grid pane. pane-grid answers the offered Button's press by its key, so its onPress does nothing.
 */
export function inGrid(
  below: RenderElement,
  cell: Placement | undefined,
  { Box, Button }: Pick<Elements[RenderSurface], 'Box' | 'Button'>,
  drawn?: RenderElement,
) {
  const offered = offerChoice(below, PLUGIN, cell, c => (
    <Button key={c.key} plain label={c.label} hotkey={c.hotkey} onPress={() => undefined} />
  ))
  if (!drawn) return offered
  const boxed = (
    <Box key={`cell:${PLUGIN}`} flexDirection="column">
      {drawn}
    </Box>
  )

  return (
    fillSlot(offered, PLUGIN, boxed) ?? (
      <Box flexDirection="column">
        {offered}
        {boxed}
      </Box>
    )
  )
}
