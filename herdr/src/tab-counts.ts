import { LEAVE_FADE_MS } from '../../core/view/row-motion'
import type { RowMotion } from './motion'
import { HEIGHT_SETTLE_MS } from '../../core/view/springs'
import type { TabCell } from './draw'
import { heldTabs } from './held-form'

/**
 * How a tab's count draws. While `opening`, the count came, and its box springs open from no width as it fades in.
 * While `fading`, it went, and it fades out in a box held at its width. While `closing`, that fade has run its course,
 * and the box springs shut. A count that comes back while it fades out is at rest again, so it fades back in from
 * where it is. At `rest`, it draws at its own width, or the tab has no count.
 */
type CountMotion = 'rest' | 'opening' | 'fading' | 'closing'

/** A tab as the look draws it. A count that went keeps its text as `badge` until its box has shut. */
export type DrawnTab = TabCell & { count: CountMotion }

type Change = { is: 'opening' | 'leaving'; since: number; badge: string }

/**
 * The tab bar's counts across draws, so that a count that comes or goes moves the tabs after it on a spring, as a
 * block's space opens and shuts, instead of in one draw.
 */
export class TabCounts {
  private last: TabCell[] = []
  private changes = new Map<string, Change>()
  /** When a count next changes form, or null. */
  nextAt: number | null = null

  /** The tabs to draw at `now`, from the view's `tabs`. A new session or page draws its counts at rest. */
  draw(tabs: TabCell[], motion: ReadonlyMap<string, RowMotion>, now: number, isFirst: boolean): DrawnTab[] {
    const shown = heldTabs(tabs, this.last, motion)
    if (isFirst) this.changes.clear()
    for (const t of shown) {
      const was = isFirst ? undefined : this.last.find(l => l.id === t.id)
      if (was?.badge && t.badge === null) this.changes.set(t.id, { is: 'leaving', since: now, badge: was.badge })
      if (was && was.badge === null && t.badge !== null) {
        const change = this.changes.get(t.id)
        const isFadingOut = change !== undefined && formAt(change, now)?.count === 'fading'
        if (isFadingOut) this.changes.delete(t.id)
        else this.changes.set(t.id, { is: 'opening', since: now, badge: t.badge })
      }
    }
    this.last = shown
    const ends: number[] = []
    const drawn = shown.map((t): DrawnTab => {
      const change = this.changes.get(t.id)
      const form = change ? formAt(change, now) : null
      if (!change || !form) {
        this.changes.delete(t.id)
        return { ...t, count: 'rest' }
      }
      ends.push(change.since + form.untilMs)
      return { ...t, badge: t.badge ?? change.badge, count: form.count }
    })
    this.nextAt = ends.length === 0 ? null : Math.min(...ends)

    return drawn
  }
}

/** Each form a change takes, and how long after the change it lasts. */
const FORMS: Record<Change['is'], { count: CountMotion; untilMs: number }[]> = {
  opening: [{ count: 'opening', untilMs: HEIGHT_SETTLE_MS }],
  leaving: [
    { count: 'fading', untilMs: LEAVE_FADE_MS },
    { count: 'closing', untilMs: LEAVE_FADE_MS + HEIGHT_SETTLE_MS },
  ],
}

/** The form a change takes at `now`, or null once it has come to rest. */
const formAt = (change: Change, now: number) => FORMS[change.is].find(f => now - change.since < f.untilMs) ?? null
