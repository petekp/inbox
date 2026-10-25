import type { Point } from './geometry'
import type { ClickMark } from './Pointer'

/** What the screen shows from `at` seconds into its beat until the next state. */
export type State = {
  at: number
  /** What the screen shows, which a placeholder draws as its label. */
  label: string
  /** What the inbox docked beside the conversation shows. A placeholder then draws `label` as the conversation. */
  pane?: string
  /** Where the pointer clicks, in screen points. */
  click?: Point
  /** How long before the click the take moved the recorded pointer onto its target, in seconds. */
  settle?: number
  /** Where the pointer moves at `at`, without clicking, in screen points. */
  move?: Point
  /**
   * Seconds from the click until its result shows, measured from takes. The click happens this much before `at`,
   * so its result shows at `at`.
   */
  lead?: number
  /** A captured still in public/, which replaces the placeholder. */
  still?: string
  /** A row that stays in place while this bar drains, such as Undo's. A placeholder draws the bar. */
  drain?: { label: string; seconds: number }
}

/** When a state's click happens, in seconds into its beat. */
export const clickAt = (s: State) => s.at - (s.lead ?? 0)

/** The state shown `t` seconds into a beat: the last one that has started. */
export function stateAt(states: State[], t: number): State | undefined {
  return states.filter(s => s.at <= t).pop()
}

/** The pointer's clicks and moves, from a beat's states, in screen pixels. */
export function pointerMarks(states: State[], onScreen: (p: Point) => { x: number; y: number }): ClickMark[] {
  return states.flatMap(s => {
    if (s.click) return [{ at: clickAt(s), ...onScreen(s.click), settle: s.settle }]
    if (s.move) return [{ at: s.at, ...onScreen(s.move), press: false, settle: 0 }]
    return []
  })
}
