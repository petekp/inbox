import { partPt } from '../../hooks/row-parts'
import type { RowPart } from '../../hooks/row-parts'

/**
 * The attributes of a part of an open row drawn `partGap` under the part `above`: its name, and `--above`, the padding
 * the tab's one rule for parts puts above it.
 */
export const partAttrs = (above: RowPart, part: Exclude<RowPart, 'title'>) => ({
  'data-part': part,
  style: { '--above': `${partPt(above, part, 'codex')}px` },
})
