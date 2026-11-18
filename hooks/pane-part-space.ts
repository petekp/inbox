import type { ModLook } from './rows'
import { desktopPad } from './pane-sizes'
import { partPt, partRows } from './row-parts'
import type { PartForm, RowPart } from './row-parts'

/** The desktop forms of an open row: a card when its lines hang on a tree, else one frame. */
export type DesktopForm = Extract<PartForm, 'desktopCard' | 'desktopFrame'>

/**
 * The space between two neighboring parts of an open row, in a Box's units: on desktop `partPt` of the row's form,
 * written as the pane's half-line units, and in the terminal `partRows`, which only a docked pane draws.
 */
export const partSpace =
  (look: ModLook, isInline: boolean, form: DesktopForm) =>
  (above: RowPart, below: Exclude<RowPart, 'title'>): number =>
    look === 'desktop' ? desktopPad(partPt(above, below, form)) : partRows(above, below, !isInline)
