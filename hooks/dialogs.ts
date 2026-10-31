// Links an agent's dialog questions to the inbox questions that copy them.

import type { DialogQuestion, Item, Session, TurnDialogQuestion } from '../types'
import { restates } from './ask-match'
import { RECOMMENDED_SUFFIX } from './model-text'

type AskedQuestion = Pick<DialogQuestion, 'question' | 'options'>

function optionKey(option: string): string {
  return option.replace(RECOMMENDED_SUFFIX, '').trim().toLowerCase()
}

function optionsKey(options: string[]): string {
  return options.map(optionKey).sort().join('\n')
}

function hasSameOptions(item: Item, q: AskedQuestion): boolean {
  return item.options.length > 0 && optionsKey(item.options) === optionsKey(q.options)
}

/**
 * The item that copies `q`, when exactly one does. Options alone pick it only when no other item of `items` has those
 * options and no other question of `questions` has the item's. Otherwise the item's ask must restate `q`'s title, and
 * no other question's title.
 */
function copyOf(q: AskedQuestion, items: Item[], questions: AskedQuestion[]): Item | null {
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

/** The descriptions of `options`, by their labels, from a dialog question's descriptions. Null when none match. */
function descriptionsFor(options: string[], descriptions: Record<string, string>): Record<string, string> | null {
  const byKey = new Map(Object.entries(descriptions).map(([label, text]) => [optionKey(label), text]))
  const matched = options.flatMap(o => {
    const text = byKey.get(optionKey(o))
    return text === undefined ? [] : [[o, text] as const]
  })

  return matched.length > 0 ? Object.fromEntries(matched) : null
}

/** The item as a copy of `q`: linked to its Codex dialog question, and given its option descriptions. */
function asCopyOf(item: Item, q: TurnDialogQuestion): Item {
  const descriptions = descriptionsFor(item.options, q.descriptions)

  return {
    ...item,
    ...(q.callId === null ? {} : { dialog: { callId: q.callId, index: q.index, question: q.question } }),
    ...(descriptions ? { optionDescriptions: descriptions } : {}),
  }
}

/**
 * Links each dialog question to the open question that copies it, from the same ledger turn: one the agent recorded,
 * or one the per-reply update added from the dialog's activity line. A question whose copy is ambiguous stays
 * unlinked, so a Codex answer goes as a plain message and no descriptions show. A past turn's questions are dropped
 * once no exchange of that turn waits for the update, since no item for them can come after that.
 */
export function linkDialogs<S extends Session>(s: S): S {
  if (s.dialogQuestions.length === 0) return s
  let items = s.ledger.items
  const linked = new Set(s.dialogQuestions.flatMap(q => q.itemId ?? []))
  const questions = s.dialogQuestions.map(q => {
    if (q.itemId !== null) return q
    const turnItems = items.filter(i => i.kind === 'question' && i.turn === q.turn)
    const copy = copyOf(
      q,
      turnItems,
      s.dialogQuestions.filter(o => o.turn === q.turn),
    )
    if (!copy || copy.dialog || linked.has(copy.id)) return q
    linked.add(copy.id)
    items = items.map(i => (i.id === copy.id ? asCopyOf(i, q) : i))

    return { ...q, itemId: copy.id }
  })
  const kept = questions.filter(q => q.turn === s.ledger.turn || s.pending.some(p => p.ex.turn === q.turn))

  return { ...s, ledger: { ...s.ledger, items }, dialogQuestions: kept }
}

/**
 * Notes a dialog's questions in the current turn, then links them. A Codex dialog's call id names its questions, so
 * those already noted are skipped.
 */
export function noteDialog<S extends Session>(s: S, callId: string | null, questions: DialogQuestion[]): S {
  const isNoted = (index: number) =>
    callId !== null && s.dialogQuestions.some(q => q.callId === callId && q.index === index)
  const added = questions.flatMap((q, index) =>
    isNoted(index) ? [] : [{ ...q, callId, index, turn: s.ledger.turn, itemId: null }],
  )
  if (added.length === 0) return s

  return linkDialogs({ ...s, dialogQuestions: [...s.dialogQuestions, ...added] })
}
