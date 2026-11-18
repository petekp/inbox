import { CODEX_TREE_PAD_PX, partPt } from '../../hooks/row-parts'
import type { RowPart } from '../../hooks/row-parts'

/**
 * The attributes of a part of an open row drawn `partGap` under the part `above`: its name, and `--above`, the padding
 * the tab's one rule for parts puts above it. A line of a question's tree adds the pad its strokes take.
 */
export const partAttrs = (above: RowPart, part: Exclude<RowPart, 'title'>, isTreeLine = false) => ({
  'data-part': part,
  style: { '--above': `${partPt(above, part, 'codex') + (isTreeLine ? CODEX_TREE_PAD_PX : 0)}px` },
})
