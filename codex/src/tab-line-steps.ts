import { stepRow } from '../../core/view/row-motion'
import type { BannerView } from '../../core/view/banners'
import { drawnRows } from './tab-state'
import { reducedMotion } from './tab-motion'

/** A line of text that comes and goes inside the tab, such as a press's status. */
export type TextLine = { id: string; text: string }

/** A banner under the tab bar, keyed by its kind. */
export type BannerLine = { id: string; banner: BannerView }

export const bannerMotion = (kind: string) => `banner-${kind}`

/**
 * Steps lines through the row states, as `stepLists` does for rows. A line that `lines` brings in after the last draw
 * grows in, and a line it drops leaves from the place it had. With no last draw, every line is drawn at rest.
 */
export function stepLines<T extends { id: string }>(
  lines: T[],
  lastLines: T[] | undefined,
  motion: (id: string) => string,
  now: number,
  changed: Set<string>,
  kept: Set<string>,
): T[] {
  const listed = new Set(lines.map(l => l.id))
  const wasDrawn = new Set((lastLines ?? []).map(l => l.id))
  const entries = [...lines]
  for (const [n, l] of (lastLines ?? []).entries())
    if (!listed.has(l.id) && drawnRows.has(motion(l.id))) entries.splice(Math.min(n, entries.length), 0, l)

  return entries.filter(l => {
    const id = motion(l.id)
    const before = drawnRows.get(id)
    const isNew = lastLines !== undefined && !wasDrawn.has(l.id)
    const track = stepRow(before?.track, listed.has(l.id) ? 'closed' : 'gone', now, isNew, reducedMotion.matches)
    if (!track) return false
    if (track !== before?.track) changed.add(id)
    drawnRows.set(id, { track })
    kept.add(id)
    return true
  })
}

/** `leaving` once every one of `motions` is leaving, so the connector under them fades with its rows, else null. */
export function connectorMotion(motions: string[]): 'leaving' | null {
  const isLeaving = motions.length > 0 && motions.every(m => drawnRows.get(m)?.track.state === 'leaving')

  return isLeaving ? 'leaving' : null
}

/** The class that makes a connector fade out as `connectorMotion` says. */
export const connectorClass = (motion: 'leaving' | null) => (motion ? 'connector-leaving' : '')

/** A line's motion key, and its buttons out of reach while it leaves. */
export const lineMotion = (motion: string | undefined) =>
  motion ? { 'data-motion': motion, inert: drawnRows.get(motion)?.track.state === 'leaving' } : {}
