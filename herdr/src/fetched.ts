import type { SessionView } from '../../core/view/session-view'
import { notesOf } from '../../core/view/ui-controller'
import { holdsOf } from '../../core/view/ui-controller-reply'
import { collapsedOf } from '../../core/view/ui-controller-selection'
import type { UiState } from '../../core/view/ui-controller-types'
import { lookUiOf } from './controller'
import type { ReadSession } from './files'
import type { Followed } from './follow'
import type { PressQueue } from './press-queue'
import { readView, screenOf } from './screen'

type Read = Extract<ReadSession, { is: 'read' }>

/** What `screenAt` reads of the look: the terminal it follows and its presses. */
type Look = { followed: Followed; queue: PressQueue }

/** What the look draws for `read` and the controller state `ui`, with `view` the session's view of them. */
export function screenAt(look: Look, read: ReadSession | null, ui: UiState, view: SessionView | null, now: number) {
  const collapsed = (v: SessionView) => collapsedOf(ui, v)
  const presses = { now, view, shownSince: ui.shownSince, collapsed, queue: look.queue }
  const lookUi = lookUiOf(ui, view && { ...view, collapsed: collapsed(view) })

  return screenOf(look.followed, read, lookUi, presses)
}

const NONE_FETCHED: ReadonlySet<string> = new Set()

/**
 * The ids of the blocks that the read `to` changes from the read the look last drew, `from`, both drawn with the
 * controller state `ui`.
 */
export function fetchedIds(
  look: Look,
  from: Read | null,
  to: Read | null,
  ui: UiState,
  now: number,
): ReadonlySet<string> {
  if (from === null || to === null || from === to) return NONE_FETCHED
  const blocksOf = (read: Read) => {
    const s = screenAt(look, read, ui, readView(read, now, holdsOf(ui, now), notesOf(ui)), now)
    return s.is === 'inbox' ? s.blocks : []
  }
  const before = new Map(blocksOf(from).map(b => [b.id, JSON.stringify(b)]))

  return new Set(blocksOf(to).flatMap(b => (before.get(b.id) === JSON.stringify(b) ? [] : [b.id])))
}

/**
 * The blocks a read changed between two draws. A read and the person's move can land between two draws, and what the
 * read changed is not theirs, so it moves as a publish does.
 */
export class FetchedReads {
  private drawn: { read: Read | null; at: number; before: Read | null } = { read: null, at: 0, before: null }
  private noted = { ids: NONE_FETCHED, inFrame: NONE_FETCHED }

  /** Notes the read `read`, which lands with a move the next draw shows. */
  note(look: Look, read: Read | null, ui: UiState, now: number): void {
    const { at, before } = this.drawn
    const ids = fetchedIds(look, this.drawn.read, read, ui, now)
    this.noted = { ids, inFrame: at === now ? fetchedIds(look, before, read, ui, now) : ids }
  }

  /**
   * The blocks a read changed for the draw at `now` that shows `read`. An answer draw shows the reply as input. Draws
   * in the same millisecond are one frame, so a draw in the millisecond of the draw before it also counts what a read
   * changed for that one.
   */
  drew(read: Read | null, isAnswer: boolean, now: number): ReadonlySet<string> {
    const isSameFrame = this.drawn.at === now
    const ids = isAnswer ? NONE_FETCHED : isSameFrame ? this.noted.inFrame : this.noted.ids
    const before = isSameFrame ? this.drawn.before : this.drawn.read
    this.drawn = { read, at: now, before }
    this.noted = { ids: NONE_FETCHED, inFrame: NONE_FETCHED }
    return ids
  }
}
