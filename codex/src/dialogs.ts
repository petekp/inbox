// Links an inbox question to the open Codex dialog question it copies, so answering it in the inbox answers the dialog.

import { copyOf } from '../../hooks/dialogs'
import { messages } from '../../hooks/presses'
import type { Session } from '../../hooks/session'
import type { DialogLink, Item } from '../../types'
import type { Dialog } from './transcript'

/**
 * The message the Codex app sends when the person answers a dialog question. The app counts the question answered
 * and closes the dialog only when a user message's whole text, trimmed, is this form and names the question's id.
 */
export function dialogReply(link: DialogLink, answer: string): string {
  const questionItemId = JSON.stringify(['request_user_input_async', link.callId, link.index])
  const reply = [{ questionItemId, question: link.question, answer }]

  return `<send_user_message_question_reply>\n${JSON.stringify(reply)}\n</send_user_message_question_reply>`
}

/** An answer to a question linked to an open dialog question goes in the dialog's form, which closes the dialog. */
export function answerMessage(item: Item, answer: string): string {
  return item.dialog ? dialogReply(item.dialog, answer) : messages.answer(item, answer)
}

/**
 * A question from a dialog the agent opened in the ledger turn `turn`, and the id of the item linked to it, or null.
 */
export type TurnDialogQuestion = DialogLink & { options: string[]; turn: number; itemId: string | null }

type WithDialogs = Session & { dialogQuestions: TurnDialogQuestion[] }

/** Adds the questions of dialogs the agent opened in the current turn, skipping those already noted. */
export function noteDialogs<S extends WithDialogs>(s: S, dialogs: Dialog[]): S {
  const turn = s.ledger.turn
  const isNoted = (callId: string, index: number) =>
    s.dialogQuestions.some(q => q.callId === callId && q.index === index)
  const questions = dialogs.flatMap(({ callId, questions }) =>
    callId === null
      ? []
      : questions.flatMap((q, index) =>
          isNoted(callId, index)
            ? []
            : [{ callId, index, question: q.question, options: q.options, turn, itemId: null }],
        ),
  )
  if (questions.length === 0) return s

  return { ...s, dialogQuestions: [...s.dialogQuestions, ...questions] }
}

/**
 * Links each dialog question to the open question that copies it, from the same ledger turn: one the agent recorded,
 * or one the per-reply update added from the dialog's activity line. A question whose copy is ambiguous stays
 * unlinked, so its answer goes as a plain message. A past turn's questions are dropped once no exchange of that turn
 * waits for the update, since no item for them can come after that.
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
  const kept = questions.filter(q => q.turn === s.ledger.turn || s.pending.some(p => p.ex.turn === q.turn))

  return { ...s, ledger: { ...s.ledger, items }, dialogQuestions: kept }
}
