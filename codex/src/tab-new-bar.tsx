import { useLayoutEffect, useRef } from 'preact/hooks'
import { NEW_FADE_MS, NEW_HOLD_MS, type NewRow } from '../../hooks/arrivals'
import { reducedMotion } from './tab-motion'

const EASE_IN_OUT_SINE = 'cubic-bezier(0.37, 0, 0.63, 1)'

/**
 * The bar at a new row's left edge, or with another `className`, a settled row's, on the clock of `row`. It shows at full strength until the row's tab is shown, holds for `NEW_HOLD_MS`,
 * then fades over `NEW_FADE_MS`. It starts at the clock's point, so a row drawn again mid-fade does not start over. With
 * reduced motion it holds for the whole time, then goes in one step.
 */
export function NewBar({ row, className = 'new-bar' }: { row: NewRow | undefined; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const shownAt = row?.shownAt ?? null
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || shownAt === null) return
    const total = NEW_HOLD_MS + NEW_FADE_MS
    const frames = reducedMotion.matches
      ? [{ opacity: 1 }, { opacity: 1, offset: 0.9999 }, { opacity: 0 }]
      : [{ opacity: 1 }, { opacity: 1, offset: NEW_HOLD_MS / total, easing: EASE_IN_OUT_SINE }, { opacity: 0 }]
    const fade = el.animate(frames, { duration: total, delay: shownAt - Date.now(), fill: 'forwards' })
    fade.finished.catch(() => undefined)

    return () => fade.cancel()
  }, [shownAt])

  return row ? <span ref={ref} class={className} aria-hidden="true" /> : null
}
