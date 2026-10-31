import type { DialogQuestion, Ledger } from '../types'
import { ledgerBlocks, NL, systemText } from './ledger-prompt'
import type { Host } from './model-text'
import { clip, numberBlocks } from './text'

const CATCH_UP =
  'The ledger below may have missed turns. Write a CLOSED line for every item in <open> that the conversation shows answered, done, dealt with, or no longer relevant, and a FIXED line for every finding in <findings> that it shows was fixed. Add as NEW only what still waits on the user and is not already in <open> or <findings>.'

export function catchUpPrompt(host: Host, ledger: Ledger, screen: string): string {
  return [
    'Pause the task. Do not use tools. Instead, act as the ledger keeper described below, over this whole conversation.',
    `Treat the whole conversation as the exchange. ${CATCH_UP}`,
    ...ledgerBlocks(ledger),
    `<screen>${NL}${screen}${NL}</screen>`,
    'Code blocks here carry no [block N] marker, so a copy HELP must be one line of text.',
    '',
    systemText(host),
  ].join(NL)
}

export function transcriptCatchUpPrompt(ledger: Ledger, screen: string, transcript: string): string {
  return [
    `Treat the conversation in <conversation> as the exchange. Its start may be cut. ${CATCH_UP}`,
    ...ledgerBlocks(ledger),
    `<conversation>${NL}${numberBlocks(transcript)}${NL}</conversation>`,
    `<screen>${NL}${screen}${NL}</screen>`,
  ].join(NL)
}

const MAX_ACTIVITY = 40

export function addActivity(activity: string[], line: string | null): string[] {
  return !line || activity.length >= MAX_ACTIVITY || activity.includes(line) ? activity : [...activity, line]
}

export function toolActivity(tool: string, input: Record<string, unknown>): string | null {
  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '')
  switch (tool) {
    case 'Bash':
      return `${input.run_in_background ? 'started in background' : 'ran'}: ${text('command').slice(0, 140)}`
    case 'Edit':
    case 'Write':
      return `edited ${text('file_path')}`
    case 'Skill':
      return `used skill ${text('skill')}`
    case 'Agent':
      return `started agent: ${text('description')}`
  }

  return tool.startsWith('mcp__') ? `called ${tool.slice(5)}` : null
}

export type { DialogQuestion }

export type DialogOutcome =
  | { kind: 'answered'; answer: string }
  | { kind: 'timed-out'; answer: string }
  | { kind: 'dismissed' }
  | { kind: 'open' }

const DIALOG_QUESTIONS_SHOWN = 3
const DIALOG_QUESTION_MAX = 200
const DIALOG_OPTIONS_SHOWN = 6
const DIALOG_OPTION_MAX = 60
const DIALOG_ANSWER_MAX = 400
export const RECOMMENDED_SUFFIX = /\s*\(recommended\)\s*$/i

/**
 * The questions of a dialog tool's input. Claude's AskUserQuestion and omp's ask give `question` and options with a
 * `label` and an optional `description`. Codex's `request_user_input_async` gives `title` and plain option strings.
 */
export function dialogQuestions(raw: unknown): DialogQuestion[] {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((q: unknown) => {
    const fields = (q ?? {}) as Record<string, unknown>
    const text = [fields.question, fields.title].find((v): v is string => typeof v === 'string' && v.trim() !== '')
    if (!text) return []
    const options = (Array.isArray(fields.options) ? fields.options : []).flatMap((o: unknown) => {
      const option = typeof o === 'string' ? { label: o } : ((o ?? {}) as { label?: unknown; description?: unknown })
      const label = typeof option.label === 'string' ? option.label.trim() : ''
      const description = typeof option.description === 'string' ? option.description.trim() : ''

      return label === '' ? [] : [{ label, description }]
    })

    return [
      {
        question: text.trim(),
        options: options.map(o => o.label),
        descriptions: Object.fromEntries(options.filter(o => o.description !== '').map(o => [o.label, o.description])),
      },
    ]
  })
}

function dialogQuestionText(q: DialogQuestion): string {
  const shown = q.options.slice(0, DIALOG_OPTIONS_SHOWN).map(label => {
    const plain = label.replace(RECOMMENDED_SUFFIX, '')
    const text = clip(plain, DIALOG_OPTION_MAX)

    return plain === label ? text : `${text} (recommended)`
  })
  const more = q.options.length > shown.length ? ` / and ${q.options.length - shown.length} more` : ''
  const options = shown.length > 0 ? ` (options: ${shown.join(' / ')}${more})` : ''

  return `"${clip(q.question.replaceAll('"', "'"), DIALOG_QUESTION_MAX)}"${options}`
}

/** The activity line for a dialog the agent put to the person, with the questions and how it ended. */
export function dialogActivity(questions: DialogQuestion[], outcome: DialogOutcome): string {
  const shown = questions.slice(0, DIALOG_QUESTIONS_SHOWN).map(dialogQuestionText)
  const more = questions.length - shown.length
  const asked = shown.length > 0 ? `: ${shown.join('; ')}${more > 0 ? `; and ${more} more` : ''}` : ''
  const head = `asked the user in a dialog${asked}`
  switch (outcome.kind) {
    case 'answered':
      return `${head}; answer: ${outcome.answer.slice(0, DIALOG_ANSWER_MAX)}`
    case 'timed-out':
      return `${head}; it timed out while the user was away, so the user did not answer; it went on with: ${outcome.answer.slice(0, DIALOG_ANSWER_MAX)}`
    case 'dismissed':
      return `${head}; the user dismissed it without answering`
    case 'open':
      return `${head}; still open, waiting on the user's answer`
  }
}
