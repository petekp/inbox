// Links an inbox question to the open Codex dialog question it copies, so answering it in the inbox answers the dialog.

import { restates } from '../../hooks/ledger'
import { RECOMMENDED_SUFFIX } from '../../hooks/model-text'
import type { Session } from '../../hooks/session'
import type { DialogLink, Item } from '../../types'
import type { Dialog } from './transcript'

/** A question from a dialog the agent opened in the ledger turn `turn`, not yet linked to an inbox item. */
export type UnlinkedDialogQuestion = DialogLink & { options: string[]; turn: number }

type WithDialogs = Session & { unlinkedDialogQuestions: UnlinkedDialogQuestion[] }

/** Adds the questions of the dialogs the agent opened in the turn that is ending. */
export function noteDialogs<S extends WithDialogs>(s: S, dialogs: Dialog[]): S {
  const questions = dialogs.flatMap(({ callId, questions }) =>
    callId === null
      ? []
      : questions.map((q, index) => ({ callId, index, question: q.question, options: q.options, turn: s.ledger.turn })),
  )
  if (questions.length === 0) return s

  return { ...s, unlinkedDialogQuestions: [...s.unlinkedDialogQuestions, ...questions] }
}

function optionsKey(options: string[]): string {
  return options
    .map(o => o.replace(RECOMMENDED_SUFFIX, '').trim().toLowerCase())
    .sort()
    .join('\n')
}

function copies(item: Item, q: UnlinkedDialogQuestion): boolean {
  if (item.kind !== 'question' || item.dialog || item.turn !== q.turn) return false
  const hasSameOptions = item.options.length > 0 && optionsKey(item.options) === optionsKey(q.options)

  return hasSameOptions || restates(item.ask, q.question)
}

/**
 * Links each unlinked dialog question to an open question from the same ledger turn that has its options or restates
 * it: one the agent recorded, or one the per-reply update added from the dialog's activity line. A question that finds
 * no item is dropped once no exchange of its turn waits for the update, since no item for it can come after that.
 */
export function linkDialogs<S extends WithDialogs>(s: S): S {
  if (s.unlinkedDialogQuestions.length === 0) return s
  let items = s.ledger.items
  const unlinked: UnlinkedDialogQuestion[] = []
  for (const q of s.unlinkedDialogQuestions) {
    const at = items.findIndex(item => copies(item, q))
    if (at >= 0) {
      const { options: _options, turn: _turn, ...link } = q
      items = items.map((item, i) => (i === at ? { ...item, dialog: link } : item))
    } else if (s.pending.some(p => p.ex.turn === q.turn)) unlinked.push(q)
  }

  return { ...s, ledger: { ...s.ledger, items }, unlinkedDialogQuestions: unlinked }
}
