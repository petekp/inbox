// Links an agent's dialog questions to the inbox questions that copy them.

import type { DialogQuestion, Item, Session, TurnDialogQuestion } from '../types'
import { restates } from './ask-match'
import { RECOMMENDED_SUFFIX } from './catch-up-text'
import { closeItem } from './ledger-close'

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

/** The descriptions of `options`, by their labels, from descriptions by other labels for them. Null when none match. */
export function descriptionsFor(
  options: string[],
  descriptions: Record<string, string>,
): Record<string, string> | null {
  const byKey = new Map(Object.entries(descriptions).map(([label, text]) => [optionKey(label), text]))
  const matched = options.flatMap(o => {
    const text = byKey.get(optionKey(o))
    return text === undefined ? [] : [[o, text] as const]
  })

  return matched.length > 0 ? Object.fromEntries(matched) : null
}

/**
 * The item as a copy of `q`: linked to its Codex dialog question, and given its option descriptions. The notes the
 * agent's record gave win over the dialog's.
 */
function asCopyOf(item: Item, q: TurnDialogQuestion): Item {
  const descriptions = descriptionsFor(item.options, q.descriptions)

  return {
    ...item,
    ...(q.callId === null ? {} : { dialog: { callId: q.callId, index: q.index, question: q.question } }),
    ...(descriptions ? { optionDescriptions: { ...descriptions, ...item.optionDescriptions } } : {}),
  }
}

/**
 * Links each dialog question to the open question that copies it, from the same ledger turn: one the agent recorded,
 * or one the per-reply update added from the dialog's activity line. A question whose copy is ambiguous stays
 * unlinked, so a Codex answer goes as a plain message and no descriptions show. The copy of a question the person
 * answered closes with that answer, so it must restate the question: shared options, such as Yes and No, are not
 * proof that two questions are one. A past turn's questions are dropped once no exchange of that turn waits for the
 * update, since no item for them can come after that.
 */
export function linkDialogs<S extends Session>(s: S, now = Date.now()): S {
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
    if (q.answer !== undefined && !restates(copy.ask, q.question)) return q
    linked.add(copy.id)
    items = items.map(i => (i.id === copy.id ? asCopyOf(i, q) : i))

    return { ...q, itemId: copy.id }
  })
  const kept = questions.filter(q => q.turn === s.ledger.turn || s.pending.some(p => p.ex.turn === q.turn))
  const ledger = questions.reduce(
    (l, q) =>
      q.answer !== undefined && q.itemId !== null && l.items.some(i => i.id === q.itemId)
        ? closeItem(l, q.itemId, { how: 'answered', outcome: q.answer }, now)
        : l,
    { ...s.ledger, items },
  )

  return { ...s, ledger, dialogQuestions: kept }
}

const MAX_DIALOG_ANSWER = 80

/**
 * The words around the `"<question>"="<answer>"` pairs of Claude Code's AskUserQuestion result. From 2.1.318 to
 * 2.1.323 they say whether every answer is an option, or one was typed or has notes, or the person asked for more
 * questions after answering some. 2.0.77 and 2.1.100 used the fourth. omp gives a form's pairs with no words around.
 */
const PAIR_FORMS: { head: RegExp; tail: RegExp }[] = [
  { head: /^Your questions have been answered: /, tail: /\. You can now continue with these answers in mind\.$/ },
  { head: /^The user answered: /, tail: /\. Read the answers carefully[\s\S]*$/ },
  {
    head: /^The user asked for more questions before you proceed\. So far they answered: /,
    tail: /\.(?: They also wrote: [\s\S]*)? Call \S+ again with follow-up questions[\s\S]*$/,
  },
  { head: /^User has answered your questions: /, tail: /\. You can now continue with the user's answers in mind\.$/ },
  { head: /^(?=")/, tail: /$/ },
]

/** What follows an answer's closing quote inside its pair: the preview the person chose, or their notes. */
const AFTER_ANSWER = /^ (?:selected preview:\n|notes: |user notes: )/

/**
 * Texts that answer a dialog of one question with no pairs: Claude Code's reply the person wrote instead of answering,
 * and omp's choice or typed answer.
 */
const SINGLE_FORMS = [
  /^The user responded: ([\s\S]+)$/,
  /^User (?:has )?(?:answered|selected)(?: your questions?)?: ([^"\n].*)/i,
  /^User provided custom input: (.+)/,
]

/** The answer that opens `pair`, the text after its question's `=`, or null when it holds no answer in quotes. */
function quotedAnswer(pair: string): string | null {
  if (!pair.startsWith('"')) return null
  for (let end = pair.indexOf('"', 1); end > 0; end = pair.indexOf('"', end + 1)) {
    const after = pair.slice(end + 1)
    if (after === '' || AFTER_ANSWER.test(after)) return pair.slice(1, end)
  }

  return null
}

/**
 * Each question's answer in `"<question>"="<answer>"` pairs, or null for a question with no pair. The pairs may come in
 * any order. An answer may hold quote marks: it ends at the quote mark before its notes, its preview or the next pair.
 */
function pairedAnswers(questions: AskedQuestion[], pairs: string): (string | null)[] {
  const leadsOf = (q: AskedQuestion) => {
    const question = q.question.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    return [...pairs.matchAll(new RegExp(`"\\s*${question}\\s*"=`, 'g'))]
  }
  const leads = questions.map(q => {
    const [lead] = leadsOf(q)

    return lead ? { at: lead.index, answerAt: lead.index + lead[0].length } : null
  })
  const starts = questions.flatMap(q => leadsOf(q).map(lead => lead.index))

  return leads.map(lead => {
    if (!lead) return null
    const next = Math.min(pairs.length, ...starts.filter(at => at > lead.at))

    return quotedAnswer(pairs.slice(lead.answerAt, next).replace(/, $/, ''))
  })
}

/**
 * Each question's answer in a dialog's answer text, or null for a question it leaves unanswered. Text in a form not
 * listed here answers no question, since its words cannot be told from the person's.
 */
function answersOf(questions: AskedQuestion[], text: string): (string | null)[] {
  const trimmed = text.trim()
  for (const { head, tail } of PAIR_FORMS) {
    const opened = head.exec(trimmed)
    const rest = opened ? trimmed.slice(opened[0].length) : ''
    const closed = opened ? tail.exec(rest) : null
    if (closed) return pairedAnswers(questions, rest.slice(0, closed.index))
  }
  const single = questions.length === 1 ? SINGLE_FORMS.map(form => form.exec(trimmed)?.[1]).find(Boolean) : undefined

  return questions.map(() => single ?? null)
}

/** The option `answer` names whole, else `answer` itself, which the person typed in the dialog's own field. */
function chosenOf(q: AskedQuestion, answer: string): string {
  const chosen = q.options.find(o => optionKey(o) === answer.trim().toLowerCase())

  return (chosen ?? answer).replace(RECOMMENDED_SUFFIX, '').trim().slice(0, MAX_DIALOG_ANSWER)
}

/**
 * Notes the questions of a dialog the person answered, then links them. The copy of each question the text answers
 * closes with that answer, whether the agent recorded it before the dialog or records it later in the turn. The copy
 * of a question it leaves unanswered stays open.
 */
export function noteAnsweredDialog<S extends Session>(s: S, questions: DialogQuestion[], text: string, now: number): S {
  const answers = answersOf(questions, text)
  const added = questions.map((q, index) => {
    const answer = answers[index]?.trim() ? chosenOf(q, answers[index]!) : undefined

    return {
      ...q,
      callId: null,
      index,
      turn: s.ledger.turn,
      itemId: null,
      ...(answer === undefined ? {} : { answer }),
    }
  })

  return linkDialogs({ ...s, dialogQuestions: [...s.dialogQuestions, ...added] }, now)
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
