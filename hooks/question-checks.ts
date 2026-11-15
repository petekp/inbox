// What a recorded question carries besides its ask and options, and what a recorded question or task lacks.

import type { Item } from '../types'
import { words } from './ask-match'
import { descriptionsFor } from './dialogs'

const MAX_CONTEXT = 200
const MAX_OPTION_NOTE = 120

/** Why a question came up, and what picking each option does, by its label as the record's options have it. */
type QuestionBody = Pick<Item, 'context' | 'optionDescriptions'>

/** The body of a `record` call for a question with `options`: its `context`, and its `option_notes` in option order. */
export function questionBody(input: Record<string, unknown>, options: string[]): QuestionBody {
  const context = typeof input.context === 'string' ? input.context.trim().slice(0, MAX_CONTEXT) : ''
  const notes = Array.isArray(input.option_notes) ? input.option_notes : []
  const noted = options.flatMap((option, i) => {
    const note = notes[i]
    const text = typeof note === 'string' ? note.trim().slice(0, MAX_OPTION_NOTE) : ''
    return text === '' ? [] : [[option, text] as const]
  })

  return {
    ...(context ? { context } : {}),
    ...(noted.length > 0 ? { optionDescriptions: Object.fromEntries(noted) } : {}),
  }
}

/**
 * `item` with a record's body. A record of an open question may list its options in other words, so each note goes to
 * the item's option it names. A new context replaces the old, and a new note replaces that option's old one.
 */
export function withBody(item: Item, body: QuestionBody): Item {
  const notes = body.optionDescriptions ? descriptionsFor(item.options, body.optionDescriptions) : null
  const optionDescriptions = notes ? { ...item.optionDescriptions, ...notes } : item.optionDescriptions

  return {
    ...item,
    ...(body.context ? { context: body.context } : {}),
    ...(optionDescriptions ? { optionDescriptions } : {}),
  }
}

/** What a record of an open question changed in its body, as an "Already open" answer lists it. */
export function bodyChanges(before: Item, after: Item): string[] {
  const isNoteChanged = after.options.some(o => after.optionDescriptions?.[o] !== before.optionDescriptions?.[o])

  return [
    ...(after.context !== before.context ? ['gave it your context'] : []),
    ...(isNoteChanged ? ['gave its options your notes'] : []),
  ]
}

const APPROVAL_ASK = /^\s*(?:approve|ok(?:ay)? to|go ahead|ship|sign off)\b/i

/** Whether a question asks the user to approve something: its ask starts as an approval, or its options are yes and no. */
function isApproval(item: Pick<Item, 'ask' | 'options'>): boolean {
  const firstWords = item.options.map(o => words(o)[0]).toSorted()
  const isYesNo = item.options.length === 2 && firstWords[0] === 'no' && firstWords[1] === 'yes'

  return APPROVAL_ASK.test(item.ask) || isYesNo
}

/**
 * What a recorded question or task lacks for the user to act on it from its row, said so the agent can record it
 * again with it. It asks only for the `fields` the agent's record tool has, since an agent cannot send one its tool
 * lacks. A task may have no command, file or link, and an approval nothing to look at, so their sentences say when to
 * add one.
 */
export function missingText(item: Item | undefined, fields: readonly string[]): string {
  const canSend = (field: string) => fields.includes(field)
  if (item?.kind === 'task')
    return item.helps.length === 0 && canSend('steps')
      ? ' It has no steps: when a command, file or link would help the user do it, record it again with steps.'
      : ''
  if (!item) return ''

  return bodyText(item, canSend) + recText(item, canSend) + approvalText(item, canSend)
}

function bodyText(item: Item, canSend: (field: string) => boolean): string {
  const unnoted = canSend('option_notes') ? item.options.filter(o => !item.optionDescriptions?.[o]) : []
  const isUnnoted = unnoted.length > 0
  const isContextMissing = !item.context && canSend('context')
  const noNotes = unnoted.length === item.options.length ? 'option_notes' : `note on ${quoted(unnoted)}`
  const lacks = [...(isContextMissing ? ['context'] : []), ...(isUnnoted ? [noNotes] : [])]
  const asks = [
    ...(isContextMissing ? ['context (why it came up)'] : []),
    ...(isUnnoted ? ['option_notes (what picking each option does)'] : []),
  ]

  return lacks.length === 0 ? '' : ` It has no ${lacks.join(' or ')}: record it again with ${asks.join(' and ')}.`
}

function quoted(options: string[]): string {
  return options.map(o => `"${o}"`).join(' or ')
}

function recText(item: Item, canSend: (field: string) => boolean): string {
  if (!item.rec)
    return canSend('rec')
      ? ` It has no rec: when you can recommend an option, record it again with ${canSend('why') ? 'rec and why' : 'rec'}.`
      : ''

  return item.recReason || !canSend('why')
    ? ''
    : ' It has no why: record it again with why, so the user sees your reason.'
}

function approvalText(item: Item, canSend: (field: string) => boolean): string {
  return isApproval(item) && item.helps.length === 0 && canSend('steps')
    ? " The user can't approve what they can't see: when there is something to look at, record it again with a screenshot, page or file in steps."
    : ''
}
