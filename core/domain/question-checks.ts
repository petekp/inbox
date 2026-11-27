// What a recorded question carries besides its ask and options, and what a recorded question or task lacks.

import type { Item } from '../../types'
import { words } from './ask-match'
import { descriptionsFor } from './dialogs'
import { hasPreviews, isPreviewStep, previewsOf } from './option-previews'

/**
 * Why a question came up, what picking each option does, and what each option looks like, by its label as the record's
 * options have it.
 */
type QuestionBody = Pick<Item, 'context' | 'optionDescriptions' | 'optionPreviews'>

/**
 * The body of a `record` call for a question with `options`: its `context`, and its `option_notes` and `previews` in
 * option order.
 */
export function questionBody(input: Record<string, unknown>, options: string[]): QuestionBody {
  const context = typeof input.context === 'string' ? input.context.trim() : ''
  const notes = Array.isArray(input.option_notes) ? input.option_notes : []
  const noted = options.flatMap((option, i) => {
    const note = notes[i]
    const text = typeof note === 'string' ? note.trim() : ''
    return text === '' ? [] : [[option, text] as const]
  })
  const { previews } = previewsOf(input, options)

  return {
    ...(context ? { context } : {}),
    ...(noted.length > 0 ? { optionDescriptions: Object.fromEntries(noted) } : {}),
    ...(Object.keys(previews).length > 0 ? { optionPreviews: previews } : {}),
  }
}

/**
 * `item` with a record's body. A record of an open question may list its options in other words, so each note goes to
 * the item's option it names. A new context replaces the old, and a new note or preview replaces that option's old one.
 * A step that opens a preview leaves the steps, since the row shows it through Open previews.
 */
export function withBody(item: Item, body: QuestionBody): Item {
  const notes = body.optionDescriptions ? descriptionsFor(item.options, body.optionDescriptions) : null
  const optionDescriptions = notes ? { ...item.optionDescriptions, ...notes } : item.optionDescriptions
  const previews = body.optionPreviews ? descriptionsFor(item.options, body.optionPreviews) : null
  const optionPreviews = previews ? { ...item.optionPreviews, ...previews } : item.optionPreviews

  return {
    ...item,
    ...(body.context ? { context: body.context } : {}),
    ...(optionDescriptions ? { optionDescriptions } : {}),
    ...(optionPreviews ? { optionPreviews, helps: item.helps.filter(h => !isPreviewStep(h, optionPreviews)) } : {}),
  }
}

/** What a record of an open question changed in its body, as an "Already open" answer lists it. */
export function bodyChanges(before: Item, after: Item): string[] {
  const isNoteChanged = after.options.some(o => after.optionDescriptions?.[o] !== before.optionDescriptions?.[o])
  const isPreviewChanged = after.options.some(o => after.optionPreviews?.[o] !== before.optionPreviews?.[o])

  return [
    ...(after.context !== before.context ? ['gave it your context'] : []),
    ...(isNoteChanged ? ['gave its options your notes'] : []),
    ...(isPreviewChanged ? ['gave its options your previews'] : []),
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
  if (item?.kind === 'task') return taskStepsText(item, canSend) + taskResultsText(item, canSend)
  if (!item) return ''

  return bodyText(item, canSend) + recText(item, canSend) + approvalText(item, canSend) + previewsText(item, canSend)
}

function taskStepsText(item: Item, canSend: (field: string) => boolean): string {
  return item.helps.length === 0 && canSend('steps')
    ? ' It has no steps: when a command, file or link would help the user do it, record it again with steps.'
    : ''
}

const REPORT_VERB = String.raw`\b(?:report|tell (?:me|us)|let (?:me|us) know)\b`
const CONDITIONAL_VERB = String.raw`\b(?:confirm|answer|say|reply|tell \w+)\b`
/** The rest of a clause, up to a sentence's end, that has no word such as "when" that only waits for a step to finish. */
const SAME_CLAUSE = String.raw`(?:(?!\b(?:when|once|after)\b)(?:[^.;?!]|\.(?=\S)))*`
/**
 * An ask that asks the user to report one of the results it names, as "report Hola or Hello" or "say whether it loads".
 * Verbs such as confirm, answer, say, reply and tell also name a step to do, as "Confirm the 2FA prompt on your phone or
 * security key", so they ask for a result only with "whether", or with "if" right after the verb and an "or" later. "Report", "tell me" and
 * "let me know" ask for one with the "or" alone.
 */
const NAMED_RESULTS_ASK = new RegExp(
  String.raw`\bwhether\b|${REPORT_VERB}${SAME_CLAUSE}\bor\b|${CONDITIONAL_VERB}\s+if\b${SAME_CLAUSE}\bor\b`,
  'i',
)

/**
 * A task that asks the user something, as "does it come back?" or "report Hola or Hello", needs its results as options
 * to answer in one press.
 */
function taskResultsText(item: Item, canSend: (field: string) => boolean): string {
  const ask = item.ask.trim()
  const asksForResult = ask.endsWith('?') || NAMED_RESULTS_ASK.test(ask)

  return asksForResult && item.options.length === 0 && canSend('options')
    ? ' It asks for a result but has no options: record it again with the results the user can report as options.'
    : ''
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

function previewsText(item: Item, canSend: (field: string) => boolean): string {
  const isUnpreviewedDesignChoice = item.isDesignChoice === true && item.options.length >= 2 && !hasPreviews(item)

  return isUnpreviewedDesignChoice && canSend('previews')
    ? ' It has no previews: when you made an image, page or file that shows each option, record it again with previews.'
    : ''
}

function approvalText(item: Item, canSend: (field: string) => boolean): string {
  const hasPreviewPage = Object.keys(item.optionPreviews ?? {}).length > 0

  return isApproval(item) && item.helps.length === 0 && !hasPreviewPage && canSend('steps')
    ? " The user can't approve what they can't see: when there is something to look at, record it again with a screenshot, page or file in steps."
    : ''
}
