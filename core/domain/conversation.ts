import { clip } from './text'

const NL = '\n'

const TRANSCRIPT_MAX = 80_000

const MESSAGE_MAX = 6000

/**
 * One message of a conversation, as the inbox model reads it. `activity` holds a line for each thing the agent did
 * after its text. A text marked `isVerbatim` is already the line to show, so it is not cut to the message limit.
 */
export type Turn = { role: 'person' | 'agent'; text: string; activity: string[]; isVerbatim?: true }

/**
 * The conversation as lines, oldest first, ending with the newest that fit. A person's text that starts with
 * "inbox:" is the inbox's own note to the agent, so it is left out. When older lines do not fit, a line says so.
 */
export function flattenConversation(turns: Turn[]): string {
  const lines: string[] = []
  for (const turn of turns) {
    const text = turn.text.trim()
    const shown = turn.isVerbatim ? text : clip(text, MESSAGE_MAX)
    if (turn.role === 'person') {
      if (text && !text.startsWith('inbox:')) lines.push(`Person: ${shown}`)
      continue
    }
    if (text) lines.push(`Agent: ${shown}`)
    for (const line of turn.activity) lines.push(`Agent ${line}`)
  }
  const kept: string[] = []
  let size = 0
  for (const line of lines.reverse()) {
    size += line.length + 1
    if (size > TRANSCRIPT_MAX) {
      kept.push('(earlier conversation left out)')
      break
    }
    kept.push(line)
  }

  return kept.reverse().join(NL)
}
