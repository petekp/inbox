import { ago } from '../../hooks/text'
import { DOT } from '../../hooks/rows'
import { feedbackOf, feedbackText, hasAge, isFailure } from '../../hooks/feedback'
import { prMarkId, isBlockPressShown } from '../../hooks/pr-rows'
import { isDismissed } from '../../hooks/pr-views'
import type { PrView } from '../../types'
import type { TabView as View } from './core'
import { sending, SENDING, errors } from './tab-state'
import { outPending } from './tab-press'
import { noteOf } from './tab-parts'

export type PressLine = { text: string; isError: boolean }

/** A PR block's press status, under its buttons. */
export function prLastLine(v: View, pr: PrView): PressLine | null {
  return pressLine(v, prMarkId(pr.ref), !isDismissed(v.lastActions, pr.ref) && isBlockPressShown(pr, v.lastActions))
}

/** A press's status under its buttons. `showsLast` says whether it draws the row's last press once that is saved. */
export function pressLine(v: View, id: string, showsLast: boolean): PressLine | null {
  const out = sending.get(id)
  const pending = outPending(v, id)
  if (pending) return { text: feedbackText(pending, 'codex'), isError: false }
  if (out && out.pending === null) return { text: SENDING, isError: false }
  const error = errors.get(id)
  if (error) return { text: error, isError: true }
  const note = noteOf(id)
  if (note) return { text: note, isError: false }
  const f = showsLast ? feedbackOf(id, v.lastActions[id], undefined, v.turns, v.at) : null
  if (!f) return null
  const text = feedbackText(f, 'codex')

  return { text: hasAge(f) ? `${text}${DOT}${ago(v.at - f.at)}` : text, isError: isFailure(f) }
}
