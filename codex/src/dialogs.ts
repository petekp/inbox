// Notes the dialogs a Codex turn opened, and words an inbox answer so that it answers the dialog its question copies.

import { noteDialogs } from '../../core/domain/dialogs'
import { messages } from '../../core/domain/press-messages'
import type { DialogLink, Item, Session } from '../../types'
import { DIALOG_TOOL } from './rollout-commands'
import type { Dialog } from './rollout-turns'

export const REPLY_OPEN = '<send_user_message_question_reply>'
const REPLY_CLOSE = '</send_user_message_question_reply>'

/**
 * The message the Codex app sends when the person answers a dialog question. The app counts the question answered
 * and closes the dialog only when a user message's whole text, trimmed, is this form and names the question's id.
 */
function dialogReply(link: DialogLink, answer: string): string {
  const questionItemId = JSON.stringify([DIALOG_TOOL, link.callId, link.index])
  const reply = [{ questionItemId, question: link.question, answer }]

  return `${REPLY_OPEN}\n${JSON.stringify(reply)}\n${REPLY_CLOSE}`
}

/** The call id and index of each dialog question a user message answers in the dialog's reply form. */
export function repliedQuestions(text: string): { callId: string; index: number }[] {
  const trimmed = text.trim()
  if (!trimmed.startsWith(REPLY_OPEN) || !trimmed.endsWith(REPLY_CLOSE)) return []
  try {
    const replies: unknown = JSON.parse(trimmed.slice(REPLY_OPEN.length, -REPLY_CLOSE.length))
    if (!Array.isArray(replies)) return []

    return replies.flatMap(reply => {
      const id: unknown = (reply as { questionItemId?: unknown } | null)?.questionItemId
      const parts: unknown = typeof id === 'string' ? JSON.parse(id) : null
      if (!Array.isArray(parts)) return []
      const [tool, callId, index] = parts as unknown[]
      const isQuestionId = tool === DIALOG_TOOL && typeof callId === 'string' && Number.isInteger(index)

      return isQuestionId ? [{ callId, index: index as number }] : []
    })
  } catch {
    return []
  }
}

/** An answer to a question linked to an open dialog question goes in the dialog's form, which closes the dialog. */
export function answerMessage(item: Item, answer: string): string {
  return item.dialog ? dialogReply(item.dialog, answer) : messages.answer(item, answer)
}

/** Notes the dialogs the agent opened in a turn. A dialog row with no call id cannot be answered, so it is left out. */
export function noteTurnDialogs<S extends Session>(s: S, dialogs: Dialog[]): S {
  return noteDialogs(
    s,
    dialogs.filter(d => d.callId !== null),
  )
}
