import { RUNNING_PULSE_MS } from '../../core/view/timing'
import * as layout from '../../core/view/layout'
import { ENTER_FADE_MS, enterDelayMs, FADE_MS, LEAVE_FADE_MS } from '../../core/view/row-motion'
import { HEIGHT_SETTLE_MS } from '../../core/view/springs'
import { FADE_EASING } from './tab-glide'

/** The shared spacing scale, as the CSS variables the tab's styles read. */
const SPACING_VARIABLES: [string, number][] = [
  ['--unit', layout.SPACE_UNIT],
  ['--line', layout.LINE_PT],
  ['--inside-gap', layout.INSIDE_GAP_PT],
  ['--list-gap', layout.LIST_GAP_PT],
  ['--child-gap', layout.CHILD_GAP_PT],
  ['--item-gap', layout.ITEM_GAP_PT],
  ['--head-gap', layout.HEAD_GAP_PT],
  ['--list-margin', layout.LIST_MARGIN_PT],
  ['--control-gap', layout.CONTROL_GAP_PT],
  ['--section-gap', layout.SECTION_GAP_PT],
  ['--edge', layout.EDGE_PT],
  ['--empty-max-width', layout.EMPTY_STATE_MAX_WIDTH_PT],
  ['--mark', layout.MARK_PT],
  ['--row-pad', layout.ROW_PAD_PT],
  ['--banner-pad-y', layout.BANNER_PAD_Y_PT],
  ['--banner-gap', layout.BANNER_GAP_PT],
  ['--button-pad-x', layout.BUTTON_PAD_X_PT],
  ['--button-border', layout.BUTTON_BORDER_PT],
]

export function applyPageVariables() {
  for (const [name, pt] of SPACING_VARIABLES) document.documentElement.style.setProperty(name, `${pt}px`)
  document.documentElement.style.setProperty('--pulse', `${RUNNING_PULSE_MS}ms`)
  document.documentElement.style.setProperty('--fade', `${FADE_MS}ms ${FADE_EASING}`)
  document.documentElement.style.setProperty('--settle', `${HEIGHT_SETTLE_MS}ms ease-out`)
  document.documentElement.style.setProperty('--leave-fade', `${LEAVE_FADE_MS}ms ${FADE_EASING}`)
  document.documentElement.style.setProperty('--page-fade', `${ENTER_FADE_MS}ms ${FADE_EASING}`)
  const lineWait = enterDelayMs(layout.LINE_PT)
  document.documentElement.style.setProperty('--enter-fade', `${ENTER_FADE_MS}ms ${FADE_EASING} ${lineWait}ms`)
}
