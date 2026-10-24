import { Easing } from 'remotion'

import { clamp01 } from './geometry'
import { SANS } from './fonts'

/** A key pressed `at` seconds into its beat, and the label its cap shows, such as Enter or /inbox. */
export type KeyPress = { at: number; label: string }

/** How long a cap stays after its press, in seconds. */
const HOLD = 0.6
const RISE = 0.18
const FADE = 0.25

/**
 * Keycaps for a take driven by keys, so a viewer who knows none of the app's keys sees what caused each change. Each
 * cap rises in as its key is pressed and fades after HOLD seconds. A newer cap replaces the one before it.
 */
export function KeyCaps(props: { presses: KeyPress[]; t: number; right: number; bottom: number }) {
  const { presses, t, right, bottom } = props
  const index = presses.filter(p => p.at <= t).length - 1
  const press = presses[index]
  const next = presses[index + 1]
  if (!press) return null

  const age = t - press.at
  const end = Math.min(press.at + HOLD + FADE, next?.at ?? Infinity)
  if (t >= end) return null
  const risen = Easing.out(Easing.back(1.6))(clamp01(age / RISE))
  const fading = clamp01((t - (end - FADE)) / FADE)
  const pressed = age < 0.12 ? 1 - age / 0.12 : 0
  return (
    <div
      style={{
        position: 'absolute',
        right,
        bottom,
        opacity: clamp01(age / RISE) * (1 - fading),
        transform: `translateY(${(1 - risen) * 16 + pressed * 3}px)`,
        padding: '10px 22px',
        minWidth: 64,
        textAlign: 'center',
        borderRadius: 12,
        backgroundColor: '#f2f2f4',
        color: '#18181b',
        fontFamily: SANS,
        fontSize: 34,
        fontWeight: 600,
        boxShadow: `0 ${6 - pressed * 3}px 0 #9a9aa2, 0 10px 28px rgba(0, 0, 0, 0.5)`,
      }}
    >
      {press.label}
    </div>
  )
}
