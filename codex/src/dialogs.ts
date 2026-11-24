// Notes the dialogs a Codex turn opened, and words an inbox answer so that it answers the dialog its question copies.

import { dialogActivity } from '../../core/domain/catch-up-text'
import { noteDialogs } from '../../core/domain/dialogs'
import { messages } from '../../core/domain/press-messages'
import type { DialogLink, Item, Session } from '../../types'
import { DIALOG_TOOL } from './rollout-commands'
import type { Dialog } from './rollout-turns'

/**
 * The message the Codex app sends when the person answers a dialog question. The app counts the question answered
 * and closes the dialog only when a user message's whole text, trimmed, is this form and names the question's id.
 */
function dialogReply(link: DialogLink, answer: string): string {
  const questionItemId = JSON.stringify([DIALOG_TOOL, link.callId, link.index])
  const reply = [{ questionItemId, question: link.question, answer }]

  return `<send_user_message_question_reply>\n${JSON.stringify(reply)}\n</send_user_message_question_reply>`
}

const REPLY_FORM = /^<send_user_message_question_reply>\s*([\s\S]*?)\s*<\/send_user_message_question_reply>$/

/** The answer to the dialog question at `index` of the call `callId`. */
type DialogAnswer = { callId: string; index: number; answer: string }

function parsed(text: unknown): unknown {
  try {
    return JSON.parse(typeof text === 'string' ? text : '')
  } catch {
    return null
  }
}

/** The answers a user message gives in the form `dialogReply` writes. Any other message gives none. */
export function dialogAnswersOf(text: string): DialogAnswer[] {
  const replies = parsed(REPLY_FORM.exec(text.trim())?.[1])
  if (!Array.isArray(replies)) return []

  return replies.flatMap(reply => {
    const { questionItemId, answer } = (reply ?? {}) as { questionItemId?: unknown; answer?: unknown }
    const id = parsed(questionItemId)
    const isQuestionId =
      Array.isArray(id) && id[0] === DIALOG_TOOL && typeof id[1] === 'string' && typeof id[2] === 'number'

    return isQuestionId && typeof answer === 'string'
      ? [{ callId: id[1] as string, index: id[2] as number, answer }]
      : []
  })
}

/** The activity line for a dialog of a turn: answered with the answers a dialog reply gave it, else open. */
export function dialogLine(d: Dialog): string {
  const pairs = d.questions.flatMap((q, index) => {
    const answer = d.answers[index]

    return answer === undefined ? [] : [`"${q.question}"="${answer}"`]
  })

  return dialogActivity(
    d.questions,
    pairs.length > 0 ? { kind: 'answered', answer: pairs.join(', ') } : { kind: 'open' },
  )
}

/** An answer to a question linked to an open dialog question goes in the dialog's form, which closes the dialog. */
export function answerMessage(item: Item, answer: string): string {
  return item.dialog ? dialogReply(item.dialog, answer) : messages.answer(item, answer)
}

/**
 * Notes the dialogs the agent opened in a turn. A dialog row with no call id cannot be answered, so it is left out.
 * So is a dialog a user message followed in its turn: that message started a new inbox turn, so the dialog's copy is
 * not in the turn it would be noted in, and a question of the new turn with the same options would pass for it.
 */
export function noteTurnDialogs<S extends Session>(s: S, dialogs: Dialog[]): S {
  return noteDialogs(
    s,
    dialogs.filter(d => d.callId !== null && !d.isFollowedByMessage),
  )
}
