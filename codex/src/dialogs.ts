// Links an inbox question to the open Codex dialog question it copies, so answering it in the inbox answers the dialog.

import { restates } from '../../hooks/ledger'
import { RECOMMENDED_SUFFIX } from '../../hooks/model-text'
import type { Session } from '../../hooks/session'
import type { DialogLink, Item } from '../../types'
import type { Dialog } from './transcript'

/**
 * A question from a dialog the agent opened in the ledger turn `turn`, and the id of the item linked to it, or null.
 */
export type TurnDialogQuestion = DialogLink & { options: string[]; turn: number; itemId: string | null }

type WithDialogs = Session & { dialogQuestions: TurnDialogQuestion[] }

/** Adds the questions of the dialogs the agent opened in the turn that is ending. */
export function noteDialogs<S extends WithDialogs>(s: S, dialogs: Dialog[]): S {
  const turn = s.ledger.turn
  const questions = dialogs.flatMap(({ callId, questions }) =>
    callId === null
      ? []
      : questions.map((q, index) => ({ callId, index, question: q.question, options: q.options, turn, itemId: null })),
  )
  if (questions.length === 0) return s

  return { ...s, dialogQuestions: [...s.dialogQuestions, ...questions] }
}

function optionsKey(options: string[]): string {
  return options
    .map(o => o.replace(RECOMMENDED_SUFFIX, '').trim().toLowerCase())
    .sort()
    .join('\n')
}

function hasSameOptions(item: Item, q: TurnDialogQuestion): boolean {
  return item.options.length > 0 && optionsKey(item.options) === optionsKey(q.options)
}

/**
 * The item that copies `q`, when exactly one does. Options alone pick it only when no other item of the turn has those
 * options and no other dialog question of the turn has the item's. Otherwise the item's ask must restate `q`'s title,
 * and no other dialog question's title.
 */
function copyOf(q: TurnDialogQuestion, items: Item[], questions: TurnDialogQuestion[]): Item | null {
  const byOptions = items.filter(i => hasSameOptions(i, q))
  const [only] = byOptions
  if (only && byOptions.length === 1 && questions.filter(o => hasSameOptions(only, o)).length === 1) return only
  const pool = byOptions.length > 0 ? byOptions : items
  const byAsk = pool.filter(i => restates(i.ask, q.question))
  const [asked] = byAsk
  if (!asked || byAsk.length !== 1) return null
  const restated = questions.filter(o => restates(asked.ask, o.question))

  return restated.length === 1 ? asked : null
}

/**
 * Links each dialog question to the open question that copies it, from the same ledger turn: one the agent recorded,
 * or one the per-reply update added from the dialog's activity line. A question whose copy is ambiguous stays
 * unlinked, so its answer goes as a plain message. A turn's questions are dropped once no exchange of that turn waits
 * for the update, since no item for them can come after that.
 */
export function linkDialogs<S extends WithDialogs>(s: S): S {
  if (s.dialogQuestions.length === 0) return s
  let items = s.ledger.items
  const questions = s.dialogQuestions.map(q => {
    if (q.itemId !== null) return q
    const turnItems = items.filter(i => i.kind === 'question' && i.turn === q.turn)
    const copy = copyOf(
      q,
      turnItems,
      s.dialogQuestions.filter(o => o.turn === q.turn),
    )
    if (!copy || copy.dialog) return q
    const link: DialogLink = { callId: q.callId, index: q.index, question: q.question }
    items = items.map(i => (i.id === copy.id ? { ...i, dialog: link } : i))

    return { ...q, itemId: copy.id }
  })
  const kept = questions.filter(q => s.pending.some(p => p.ex.turn === q.turn))

  return { ...s, ledger: { ...s.ledger, items }, dialogQuestions: kept }
}
