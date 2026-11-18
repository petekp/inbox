import { ago } from '../../hooks/text'
import { DOT } from '../../hooks/rows'
import { feedbackOf, feedbackText, feedbackTone, hasAge, type FeedbackTone } from '../../hooks/feedback'
import { prMarkId, isBlockPressShown } from '../../hooks/pr-rows'
import { isDismissed } from '../../hooks/pr-views'
import type { PrView } from '../../types'
import type { TabView as View } from './core'
import { sending, SENDING, errors } from './tab-state'
import { outPending } from './tab-press'
import { noteOf } from './tab-parts'

/** A press status, and its age after it, which stays muted. */
export type PressLine = { text: string; age: string | null; tone: FeedbackTone }

/** A PR block's press status, under its buttons. */
export function prLastLine(v: View, pr: PrView): PressLine | null {
  return pressLine(v, prMarkId(pr.ref), !isDismissed(v.lastActions, pr.ref) && isBlockPressShown(pr, v.lastActions))
}

/** A press's status under its buttons. `showsLast` says whether it draws the row's last press once that is saved. */
export function pressLine(v: View, id: string, showsLast: boolean): PressLine | null {
  const out = sending.get(id)
  const pending = outPending(v, id)
  if (pending) return { text: feedbackText(pending, 'codex'), age: null, tone: 'muted' }
  if (out && out.pending === null) return { text: SENDING, age: null, tone: 'muted' }
  const error = errors.get(id)
  if (error) return { text: error, age: null, tone: 'error' }
  const note = noteOf(id)
  if (note) return { text: note, age: null, tone: 'muted' }
  const f = showsLast ? feedbackOf(id, v.lastActions[id], undefined, v.turns, v.at) : null
  if (!f) return null

  return { text: feedbackText(f, 'codex'), age: hasAge(f) ? `${DOT}${ago(v.at - f.at)}` : null, tone: feedbackTone(f) }
}
