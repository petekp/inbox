import { instanceAbort, root, tabState } from './tab-state'
import { dispatch } from './tab-ui'

/** How often a pointer moving over the list notes input, as in the Herdr look. */
const LIST_INPUT_STEP_MS = 250

/** Tells the controller the person used the list, so rows hold still until `FOLD_QUIET_MS` after the last input. */
function note() {
  if (!tabState.isActive || !tabState.serverView) return
  dispatch([{ type: 'list-input' }], { isDrawn: false })
}

const isOnList = (target: EventTarget | null) =>
  target instanceof Element && root.contains(target) && target.closest('.list, .fold') !== null

const options = { passive: true, signal: instanceAbort.signal }

for (const type of ['pointerdown', 'keydown', 'wheel'] as const) document.addEventListener(type, note, options)

document.addEventListener(
  'pointermove',
  e => {
    const isNew = Date.now() - (tabState.ui.listInput?.last ?? 0) >= LIST_INPUT_STEP_MS
    if (isNew && isOnList(e.target)) note()
  },
  options,
)
