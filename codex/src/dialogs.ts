// Notes the dialogs a Codex turn opened, and words an inbox answer so that it answers the dialog its question copies.

import { noteDialog } from '../../hooks/dialogs'
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

/** Notes each dialog the agent opened. A dialog row with no call id cannot be answered, so it is left out. */
export function noteDialogs<S extends Session>(s: S, dialogs: Dialog[]): S {
  return dialogs.reduce((x, d) => (d.callId === null ? x : noteDialog(x, d.callId, d.questions)), s)
}
