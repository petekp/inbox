import { partPt } from '../../hooks/row-parts'
import type { RowPart } from '../../hooks/row-parts'

/**
 * The attributes of a part of an open row drawn `partGap` under the part `above`: its name, and that gap as its top
 * padding, which `--above` repeats for the tree's strokes. The space is padding, not a gap or a margin, so the row's
 * height grows smoothly when the panel mounts. It is inline, so no rule in the tab's CSS outranks it.
 */
export const partAttrs = (above: RowPart, part: Exclude<RowPart, 'title'>) => {
  const gap = `${partPt(above, part)}px`

  return { 'data-part': part, style: { '--above': gap, paddingTop: gap } }
}
