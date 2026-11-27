import type { SessionView } from '../../core/view/session-view'
import { notesOf } from '../../core/view/ui-controller'
import { readWakeAt } from '../../core/view/ui-controller-clock'
import { holdsOf } from '../../core/view/ui-controller-reply'
import type { UiState } from '../../core/view/ui-controller-types'
import type { ReadSession } from '../../core/remote/herdr-read'
import { readView } from './screen'

type Read = Extract<ReadSession, { is: 'read' }>

/** The read and controller state the look shows, or null before a read. */
type Shown = { read: Read; ui: UiState } | null

type Kept = { read: Read; ui: UiState; view: SessionView; until: number }

/** What `prepare` uses of the look's context: a timer and a request to draw again. */
type LookContext = { timer: { after(ms: number, fn: (cx: LookContext) => void): { cancel(): void } }; notify(): void }

/**
 * The session's view for one read and one controller state, built once and kept until the clock changes it
 * (`readWakeAt`). Herdr stops a draw that runs past 50 ms, and an event, task or timer past 500 ms, so the look builds
 * the view in `prepare`, where its read or state changes and when the clock changes it, and a draw reads it with `at`.
 */
export class ViewCache {
  private kept: Kept | null = null
  private timer: { cancel(): void } | null = null

  constructor(private readonly shown: () => Shown) {}

  /** The view the look shows at `now`: the kept one while its read and state are shown and the clock has not changed it. */
  at(now: number): SessionView | null {
    const s = this.shown()
    if (s === null) return null
    const k = this.kept
    const isKept = k !== null && k.read === s.read && k.ui === s.ui && now < k.until

    return isKept ? k.view : this.build(s.read, s.ui, now)
  }

  /**
   * Builds the view outside a draw, afresh with `isFresh` for the ages it draws, which change each minute without a
   * wake. It builds the view again and draws when the clock changes it.
   */
  prepare(cx: LookContext, isFresh = false): void {
    this.timer?.cancel()
    this.timer = null
    const s = this.shown()
    if (s === null) return
    const now = Date.now()
    if (isFresh) this.build(s.read, s.ui, now)
    else this.at(now)
    const until = this.kept?.until ?? Infinity
    if (until === Infinity) return
    this.timer = cx.timer.after(Math.max(0, until - now), cx => {
      this.prepare(cx)
      cx.notify()
    })
  }

  private build(read: Read, ui: UiState, now: number): SessionView {
    const view = readView(read, now, holdsOf(ui, now), notesOf(ui))
    this.kept = { read, ui, view, until: readWakeAt(ui, view, now) ?? Infinity }

    return view
  }
}
