import { stepRow, withLeaving } from '../../core/view/row-motion'
import type { BannerView } from '../../core/view/banners'
import type { TextLevel } from '../../core/view/status-page-parts'
import { drawnRows } from './tab-state'
import { reducedMotion } from './tab-motion'

/** A line of text that comes and goes inside the tab, such as a press's status. */
export type TextLine = { id: string; text: string; level?: TextLevel }

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
  const entries = withLeaving(
    lines,
    lastLines ?? [],
    l => l.id,
    l => drawnRows.has(motion(l.id)),
  )

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

/** How a connector moves with the rows it joins: it leaves or enters with them, or null while it rests. */
export type ConnectorMotion = 'leaving' | 'entering' | null

/** `leaving` once every one of `motions` is leaving, `entering` while every one of them enters, else null. */
export function connectorMotion(motions: string[]): ConnectorMotion {
  const states = motions.map(m => drawnRows.get(m)?.track.state)
  if (states.length > 0 && states.every(s => s === 'leaving')) return 'leaving'
  if (states.length > 0 && states.every(s => s === 'entering')) return 'entering'

  return null
}

/** The class that makes a connector fade as `connectorMotion` says. */
export const connectorClass = (motion: ConnectorMotion) => (motion ? `connector-${motion}` : '')

/** A line's motion key, and its buttons out of reach while it leaves. */
export const lineMotion = (motion: string | undefined) =>
  motion ? { 'data-motion': motion, inert: drawnRows.get(motion)?.track.state === 'leaving' } : {}
