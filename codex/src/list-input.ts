import { FOLD_QUIET_MS, withListInput } from '../../hooks/timing'
import type { ListInput } from '../../hooks/timing'
import { cancelTimer, later } from './tab-host'
import { instanceAbort, root, tabState } from './tab-state'

let input: ListInput | null = null
let isPointerOnList = false
let wake: number | undefined

/**
 * The person's input on the list. A pointer resting on the list counts as input now, so rows never fold under it, but
 * only while this page is the active, visible tab: a hidden or replaced page gets no pointerleave.
 */
export function listInput(now: number): ListInput | null {
  const isPointerShown = isPointerOnList && tabState.isActive && document.visibilityState === 'visible'

  return isPointerShown && input ? { since: input.since, last: now } : input
}

/** Ends a pointer the page can no longer see, as when Codex hides the tab or the window loses focus. */
function pointerGone() {
  if (isPointerOnList) note()
  isPointerOnList = false
}

/** Notes an input, and draws again once the list has been quiet for FOLD_QUIET_MS, when a held row can fold. */
function note() {
  const now = Date.now()
  input = withListInput(listInput(now), now)
  cancelTimer(wake)
  wake = later(() => tabState.draw(), FOLD_QUIET_MS)
}

const isOnList = (target: EventTarget | null) =>
  target instanceof Element && root.contains(target) && target.closest('.list, .fold') !== null

const options = { passive: true, signal: instanceAbort.signal }

for (const type of ['pointerdown', 'keydown', 'wheel'] as const)
  document.addEventListener(type, () => tabState.isActive && note(), options)

document.addEventListener(
  'pointerover',
  e => {
    const isOn = tabState.isActive && isOnList(e.target)
    if (isOn !== isPointerOnList) note()
    isPointerOnList = isOn
  },
  options,
)

document.documentElement.addEventListener('pointerleave', pointerGone, options)
window.addEventListener('blur', pointerGone, options)
document.addEventListener(
  'visibilitychange',
  () => {
    if (document.visibilityState !== 'visible') pointerGone()
  },
  options,
)
