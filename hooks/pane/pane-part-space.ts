import type { ModLook } from '../../core/view/rows'
import { desktopPad } from './pane-sizes'
import { partPt, partRows } from '../../core/view/row-parts'
import type { RowPart } from '../../core/view/row-parts'

/**
 * The space between two neighboring parts of an open row, in a Box's units: on desktop `partPt` written as the pane's
 * half-line units, and in the terminal `partRows`, which only a docked pane draws.
 */
export const partSpace =
  (look: ModLook, isInline: boolean) =>
  (above: RowPart, below: Exclude<RowPart, 'title'>): number =>
    look === 'desktop' ? desktopPad(partPt(above, below)) : partRows(above, below, !isInline)
