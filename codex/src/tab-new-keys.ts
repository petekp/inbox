import { ENTER_FADE_MS, enterDelayMs } from '../../core/view/row-motion'
import { root } from './tab-state'
import { fade, glides, isRunning } from './tab-glide'

/** A text field's buttons, such as the goal field's Save and Cancel, and an open row's buttons. */
const KEYS = '.field-keys, .panel > .actions > .keys'

/** The buttons a draw starts with. */
export const drawnKeys = (): Set<Element> => new Set(root.querySelectorAll(KEYS))

/** A block a draw started with, and the part it drew open, a row's panel. */
type DrawnBlock = { el: HTMLElement; openPart: Element | null }

/**
 * Buttons that this draw brings into a block it drew before fade in: a field's buttons, while the text field shows at
 * once, as in Herdr, and a row's buttons that come back as its reply field closes. While the block's box grows they
 * wait until it has nearly grown to hold them. A box this draw brings in, as on a page's first draw, and a row's panel
 * that opens, which fades in whole, show their buttons with them.
 */
export function showNewKeys(keysBefore: Set<Element>, blocksBefore: Map<string, DrawnBlock>) {
  for (const keys of root.querySelectorAll<HTMLElement>(KEYS)) {
    if (keysBefore.has(keys)) continue
    const box = keys.closest<HTMLElement>('[data-motion]')
    const was = box ? blocksBefore.get(box.dataset.motion ?? '') : undefined
    if (!box || !was || was.el !== box) continue
    const panel = keys.closest('.panel')
    if (panel && was.openPart !== panel) continue
    const g = glides.get(box)
    const isGrowing = g !== undefined && isRunning(g.anim) && g.to > g.from.x
    fade(keys, 0, 1, ENTER_FADE_MS, false, false, isGrowing ? g.delay + enterDelayMs(g.to, g.from) : 0)
  }
}
