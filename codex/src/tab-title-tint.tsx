import { useLayoutEffect, useRef } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { NEW_FADE_MS, NEW_HOLD_MS, TITLE_TINT, type NewRow } from '../../hooks/arrivals'
import { reducedMotion } from './tab-motion'

const EASE_IN_OUT_SINE = 'cubic-bezier(0.37, 0, 0.63, 1)'
const TINT = `${TITLE_TINT * 100}%`

/**
 * A row's title, tinted in `tone` on the clock of `row`. The tint is `--tint` of the tone mixed into the title's own
 * color, full until the row's tab is shown, held for `NEW_HOLD_MS`, then faded over `NEW_FADE_MS`. It starts at the
 * clock's point, so a row drawn again mid-fade does not start over. With reduced motion it holds for the whole time,
 * then goes in one step.
 */
export function TitleTint({
  row,
  tone,
  children,
}: {
  row: NewRow | undefined
  tone: 'key' | 'done' | 'muted' | 'error'
  children: ComponentChildren
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const shownAt = row?.shownAt ?? null
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || shownAt === null) return
    const total = NEW_HOLD_MS + NEW_FADE_MS
    const frames = reducedMotion.matches
      ? [{ '--tint': TINT }, { '--tint': TINT, offset: 0.9999 }, { '--tint': '0%' }]
      : [
          { '--tint': TINT },
          { '--tint': TINT, offset: NEW_HOLD_MS / total, easing: EASE_IN_OUT_SINE },
          { '--tint': '0%' },
        ]
    const fade = el.animate(frames, { duration: total, delay: shownAt - Date.now(), fill: 'forwards' })
    fade.finished.catch(() => undefined)

    return () => fade.cancel()
  }, [shownAt])

  return (
    <span ref={ref} class={`title-tint tint-${tone}`}>
      {children}
    </span>
  )
}
