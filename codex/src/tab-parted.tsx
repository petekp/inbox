import { DOT } from '../../core/view/rows'

/**
 * The ` · ` before a part of a `.parted` line. A part that does not fit beside the one before it moves whole to the
 * next line, where its separator hangs left of the text edge and `.parted` clips it, so no line starts or ends in a dot.
 */
export function Sep() {
  return <span class="sep">{DOT.trim()}</span>
}
