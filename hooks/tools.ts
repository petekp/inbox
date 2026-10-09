// The record_finding and close tools the agent calls, the same in every host
// except for where the texts say the person sees the result.

import { addFinding, closeByAgent } from './ledger'
import type { Host } from './ledger'
import type { Ledger } from '../types'

export const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: ['issue', 'opportunity'],
      description: 'issue: something wrong or risky. opportunity: something that could be better.',
    },
    title: { type: 'string', description: 'What it is, in at most 12 plain words.' },
    detail: { type: 'string', description: 'Why it matters and what you would do, in one or two sentences.' },
    path: { type: 'string', description: 'The file it is about, if one.' },
  },
  required: ['kind', 'title', 'detail'],
}

export const CLOSE_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'The id of the open item or finding, such as i35 or f32.' },
    answer: {
      type: 'string',
      description: "The user's answer, in their words and at most 8, when their own message answered it.",
    },
    reason: {
      type: 'string',
      description: 'Otherwise, why it is closed, in at most 8 words, such as "no longer applies: Inbox kept".',
    },
  },
  required: ['id'],
}

export function findingDescription(host: Host): string {
  return `Record a finding for the user. It waits in ${host.findingsIn} until it is closed, and from there the user can ask you to address it or discuss it. Record what a careful senior engineer would flag to a teammate, and leave out style nits and anything the user already decided.`
}

export const CLOSE_DESCRIPTION = `Close an open item or finding by its id, such as i35 or f12, as listed in the latest "inbox:" text beside the user's prompt. Pass the user's answer when their message answered it, and a reason otherwise.`

function cut(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/** Adds the finding a record_finding call describes. `result` is the text the agent reads back. */
export function recordFinding(
  host: Host,
  ledger: Ledger,
  input: Record<string, unknown>,
  now: number,
): { ledger: Ledger; result: string } {
  const title = cut(input.title, 120)
  const detail = cut(input.detail, 600)
  if (title === '' || detail === '') return { ledger, result: 'Not recorded: a finding needs a title and a detail.' }
  const path = cut(input.path, 300)
  const r = addFinding(ledger, {
    kind: input.kind === 'opportunity' ? 'opportunity' : 'issue',
    title,
    detail,
    path: path || null,
    at: now,
  })

  return {
    ledger: r.ledger,
    result: r.isAdded ? `Recorded as ${r.id}. The user sees it in ${host.findingsIn}.` : `Already recorded as ${r.id}.`,
  }
}

/** Closes the item or finding a close call names. `result` is the text the agent reads back. */
export function recordClose(
  host: Host,
  ledger: Ledger,
  input: Record<string, unknown>,
  now: number,
): { ledger: Ledger; result: string } {
  const id = cut(input.id, 80).replace(/^\[|\]$/g, '')
  const answer = cut(input.answer, 80)
  const reason = cut(input.reason, 80)
  if (id === '' || (answer === '' && reason === ''))
    return { ledger, result: "Not closed: give the id, and the user's answer or a reason." }
  const r = closeByAgent(host, ledger, id, answer ? { answer } : { reason }, now)
  if (r.closed === 'item')
    return { ledger: r.ledger, result: `Closed ${id}. The user sees it in ${host.surface} with its outcome.` }
  if (r.closed === 'finding') return { ledger: r.ledger, result: `Closed finding ${id}.` }

  return {
    ledger,
    result: `Not closed: no open item or finding has the id ${id}. The open ones are listed beside the user's latest message.`,
  }
}
