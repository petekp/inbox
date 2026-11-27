import { isQuestionBack, recommendedOption, rewordedQuestion } from '../domain/ask-match'
import type { AnswerDoc } from '../domain/earlier-answers'
import { closeByAgent, reopenItem } from '../domain/ledger-close'
import { addAgentItem, addFinding } from '../domain/ledger-update'
import { stepHelp } from '../domain/reply-parse'
import type { DelegateSession } from '../remote/hc-terminals'
import type { Host } from '../domain/model-text'
import { bodyChanges, missingText, questionBody, withBody } from '../domain/question-checks'
import { previewsLeftOutText } from '../domain/option-previews'
import { CLOSE_LIMITS, RECORD_LIMITS, recordFields, tooLongText } from '../domain/field-limits'
import { orderDescription, orderPrs } from './order-prs-tool'
import { type ToolAnswer, trimmed, unchanged } from './tool-answer'
import { earlierAnswersText } from '../domain/record-matches'
import { CLOSE_SCHEMA, ORDER_SCHEMA, RECORD_SCHEMA } from '../domain/tool-schemas'
import { CLOSE_ID_RULE } from '../domain/inbox-text'
import type { Closed, Help, Item, LastAction, Ledger, ToolFields } from '../../types'

const NAME_BY_CONTENT = 'Name it by what it says, never by its id.'

/** The id to close a new row by, which the inbox text beside the user's prompt lists only from the next turn. */
function closeIdText(id: string): string {
  return ` Its close id is ${id}. ${CLOSE_ID_RULE}`
}

function recordDescription(host: Host): string {
  return `Record something the user must see in ${host.surface}, and still say it in your reply. Use it in the turn you raise it, once for each thing.
- question: a decision, approval or piece of information only the user has, which you need before you go on. Give options, and rec with why when you recommend one. This includes an act you hold until they say so, such as "say when you want those committed".
- task: a step only the user can do, such as signing in or running a command with their password. Put the commands, files and links in steps. When it is a check whose outcome you need, such as whether a fix works on their screen, give the outcomes they can report as options, with no rec. A task you only need done, such as a sign-in, gets none: the user marks it done. A step your own tools can take is not a task: take it, or ask for their OK as a question when it changes something other people see.
- finding: something outside the current task that deserves their attention. It waits in ${host.findingsIn} until it is closed, and the user can ask you to address it or discuss it. Record what a careful senior engineer would flag to a teammate, once you have checked it. Leave out style nits, a PR's checks, conflicts, review threads or readiness, which ${host.prsIn} shows, anything the user already decided, todos or ideas the user mentioned, problems in your own change, progress, and anything only the user can do or decide: handle those in your reply, or record them as a question or task.
Do not record rhetorical questions, offers to continue when continuing is the default, FYIs, or invitations to look at finished work.`
}

const CLOSE_DESCRIPTION = `Close an open item or finding by its id, such as i35 or f12, as listed in the latest "inbox:" text beside the user's prompt. Pass the user's answer when their message answered it, and a reason otherwise.`

const AGENT_TOOLS = ['record', 'close', 'order_prs'] as const

export type AgentTool = (typeof AGENT_TOOLS)[number]

/** The tools the agent calls. A host registers these through its own API and answers each call with `toolAnswer`. */
export function agentTools(
  host: Host,
): { name: AgentTool; description: string; inputSchema: Record<string, unknown> }[] {
  return [
    { name: 'record', description: recordDescription(host), inputSchema: RECORD_SCHEMA },
    { name: 'close', description: CLOSE_DESCRIPTION, inputSchema: CLOSE_SCHEMA },
    { name: 'order_prs', description: orderDescription(host), inputSchema: ORDER_SCHEMA },
  ]
}

export function isAgentTool(name: string): name is AgentTool {
  return (AGENT_TOOLS as readonly string[]).includes(name)
}

/** The person's latest press on each row, and when the running turn started, or null when the host did not say. */
type Presses = { lastActions: Record<string, LastAction>; turnStartedAt: number | null }

/**
 * Why a delegate session's question or task is not recorded, and where it goes instead: the session that started it
 * asks the person.
 */
function delegateRefusal(delegate: DelegateSession): string {
  const starter = delegate.parent
    ? `the session in Herdr terminal ${delegate.parent}`
    : 'the session that started this one'

  return `Not recorded: this is a delegate session, so the user's inbox does not take its questions or tasks. Write this one in your REPORT.md, or message ${starter}. That session asks the user what only they can decide. Findings are still recorded.`
}

/**
 * The answer to a call of one of `agentTools`. `fields` are the input fields of the tools the agent has, which can be
 * an older build's, so the answer never asks for a field the agent cannot send. In a delegate session, `record` refuses
 * a question or a task as `delegateRefusal` says. `earlier` are the person's earlier answers most like the question a
 * `record` call asks, as `core/runtime/history-store.ts:recordMatches` finds them, which the answer lists after a new question.
 */
export function toolAnswer(
  host: Host,
  ledger: Ledger,
  tool: AgentTool,
  input: Record<string, unknown>,
  now: number,
  presses: Presses,
  fields: ToolFields,
  delegate: DelegateSession | null,
  earlier: readonly AnswerDoc[] = [],
): ToolAnswer {
  switch (tool) {
    case 'record':
      if (delegate && (input.kind === 'question' || input.kind === 'task'))
        return unchanged(ledger, delegateRefusal(delegate))

      return (
        recordAfterCompare(host, ledger, input, now, presses, fields) ??
        recordAfterOwnClose(host, ledger, input, now, presses, fields) ??
        recordItem(host, ledger, input, now, fields, earlier)
      )
    case 'close':
      return recordClose(host, ledger, input, now, presses)
    case 'order_prs':
      return orderPrs(host, ledger, input, now, presses.lastActions)
  }
}

const MAX_OPTIONS = 8
const MAX_STEPS = 3

function list(value: unknown, max: number): string[] {
  return Array.isArray(value) ? value.map(trimmed).filter(Boolean).slice(0, max) : []
}

/** What follows an answer whose change the user sees now, when the store refused to save the session as full. */
export const NOT_SAVED = "Not saved: the inbox's store is full, so this change is lost if this session restarts."

export function recordItem(
  host: Host,
  ledger: Ledger,
  input: Record<string, unknown>,
  now: number,
  fields: ToolFields,
  earlier: readonly AnswerDoc[] = [],
): ToolAnswer {
  if (input.kind === 'finding') return recordFinding(host, ledger, input, now)
  if (input.kind !== 'question' && input.kind !== 'task')
    return unchanged(ledger, 'Not recorded: kind must be question, task or finding.')
  const tooLong = tooLongText(input, RECORD_LIMITS, recordFields(input))
  if (tooLong) return unchanged(ledger, `Not recorded: ${tooLong}`)
  const ask = trimmed(input.ask)
  if (ask === '') return unchanged(ledger, `Not recorded: a ${input.kind} needs an ask.`)
  const options = list(input.options, MAX_OPTIONS)
  if (input.kind === 'question' && options.length === 0)
    return unchanged(ledger, 'Not recorded: a question needs at least one option.')
  const recInput = input.kind === 'question' ? trimmed(input.rec) : ''
  const rec = recInput === '' ? null : recommendedOption(options, recInput)
  if (recInput !== '' && rec === null) return unchanged(ledger, 'Not recorded: rec must be one of the options.')
  const recReason = rec ? trimmed(input.why).replace(/^because\s+/i, '') : ''
  const steps = list(input.steps, MAX_STEPS + 3)
  const isUsable = (h: Help) => input.kind === 'task' || h.kind === 'open' || h.kind === 'link'
  const helps = steps
    .flatMap(step => stepHelp(step) ?? [])
    .filter(isUsable)
    .slice(0, MAX_STEPS)
  const stepsLeftOut =
    helps.length < steps.length
      ? input.kind === 'task'
        ? ' Some steps were not a command, a file path or a link, so they are left out.'
        : ' Some steps were not an absolute file path or a link, so they are left out.'
      : ''
  const leftOut = stepsLeftOut + (input.kind === 'question' ? previewsLeftOutText(input, options) : '')

  const isDesignChoice = input.kind === 'question' && input.design_choice === true
  const kind: Item['kind'] = input.kind
  const entry = { kind, ask, options, rec, helps, isDesignChoice, ...(recReason ? { recReason } : {}) }
  const body = input.kind === 'question' ? questionBody(input, options) : {}
  const reworded =
    body.context && input.kind === 'question' ? rewordedQuestion(ledger.items, ledger.turn, entry) : undefined
  const r = addAgentItem(ledger, reworded ? { ...entry, ask: reworded.ask } : entry, now)
  if (r.is === 'closed')
    return unchanged(
      ledger,
      'title' in r.record
        ? `Not recorded: the user dismissed the finding "${r.record.title}", which this raises. Ask about it only if they bring it up.`
        : `Not recorded: ${closedHow(r.record)}. Ask it again only if they bring it up.`,
    )
  const before = r.ledger.items.find(i => i.id === r.id)
  const after = before && withBody(before, body)
  const rewordedAsk = reworded && r.is === 'open' && r.id === reworded.id ? { ask } : {}
  const recorded = {
    ...r.ledger,
    items: r.ledger.items.map(i => (i === before && after ? { ...after, ...rewordedAsk } : i)),
  }
  if (r.is === 'open') {
    const previewSteps = before && after ? before.helps.length - after.helps.length : 0
    const changes = [
      ...(r.addedSteps - previewSteps > 0 ? ['added its new steps'] : []),
      ...(r.isNewOptions ? ['gave it your options'] : []),
      ...(r.isNewlyMarked ? ['marked it as a design choice'] : []),
      ...(r.newRec ? [`changed its recommendation to ${r.newRec}`] : []),
      ...(r.isNewReason ? ['gave its recommendation your reason'] : []),
      ...(before && after ? bodyChanges(before, after) : []),
    ]
    const updated = changes.length > 0 ? ` and ${changes.join(' and ')}` : ''

    return unchanged(recorded, `Already open, so this record updated it${updated}.${leftOut}`)
  }

  return {
    ledger: recorded,
    result:
      `Recorded. The user sees it in ${host.surface}.` +
      closeIdText(r.id) +
      leftOut +
      missingText(after, fields.record) +
      (r.expired ? ` The list was full, so the oldest item closed: ${r.expired.ask}.` : '') +
      earlierAnswersText(r.id, earlier, now),
    personLine: `${input.kind === 'question' ? 'Question' : 'Task'}: ${ask}`,
  }
}

function recordFinding(host: Host, ledger: Ledger, input: Record<string, unknown>, now: number): ToolAnswer {
  const tooLong = tooLongText(input, RECORD_LIMITS, recordFields(input))
  if (tooLong) return unchanged(ledger, `Not recorded: ${tooLong}`)
  const title = trimmed(input.title)
  const detail = trimmed(input.detail)
  if (title === '' || detail === '') return unchanged(ledger, 'Not recorded: a finding needs a title and a detail.')
  const path = trimmed(input.path)
  const kind = input.finding_kind === 'opportunity' ? 'opportunity' : 'issue'
  const r = addFinding(ledger, { kind, title, detail, path: path || null, at: now })

  if (r.dismissed)
    return unchanged(
      ledger,
      `Not recorded: the user already closed this (${r.dismissed.outcome}). Record it again only if they bring it up.`,
    )
  if (!r.isAdded) return unchanged(r.ledger, 'Already recorded.')

  return {
    ledger: r.ledger,
    result:
      `Recorded. The user sees it in ${host.findingsIn}.` +
      closeIdText(r.id) +
      (r.expired ? ` The list was full, so the oldest finding closed: ${r.expired.title}.` : ''),
    personLine: `${kind === 'opportunity' ? 'Opportunity' : 'Issue'}: ${title}`,
  }
}

function closedHow(c: Pick<Closed, 'how' | 'outcome'>): string {
  switch (c.how) {
    case 'answered':
      return `the user answered it (${c.outcome})`
    case 'done':
      return 'the user marked it done'
    case 'dismissed':
      return 'the user dismissed it'
    case 'expired':
      return 'it expired'
    case 'claude':
      return 'you closed it earlier'
    case 'update':
      return `the inbox closed it (${c.outcome})`
  }
}

/** Whether `at` falls in the running turn, after the person's Compare press on `id`. */
function isAfterCompareThisTurn(id: string, at: number, presses: Presses): boolean {
  const last = presses.lastActions[id]

  return last?.action === 'compare' && at >= Math.max(last.at, presses.turnStartedAt ?? last.at)
}

/**
 * Whether the agent recorded `id` again this turn, after the person pressed Compare on it. That record updated the open
 * question, so a close with a reason would only replace it with a copy.
 */
function isRecordedAfterCompare(ledger: Ledger, id: string, presses: Presses): boolean {
  const item = ledger.items.find(i => i.id === id)
  if (item?.kind !== 'question' || item.reportedAt === undefined) return false

  return isAfterCompareThisTurn(id, item.reportedAt, presses)
}

/**
 * A record of a question the agent closed with a reason this turn, after the person pressed Compare on it. The question
 * reopens and the record updates it, as when the close comes after the record. Null when no such question matches.
 */
function recordAfterCompare(
  host: Host,
  ledger: Ledger,
  input: Record<string, unknown>,
  now: number,
  presses: Presses,
  fields: ToolFields,
): ToolAnswer | null {
  const isClosedAfterCompare = (c: Closed) =>
    c.how === 'claude' && c.kind === 'question' && isAfterCompareThisTurn(c.id, c.at, presses)
  const closed = ledger.closed.findLast(isClosedAfterCompare)
  if (!closed) return null
  const r = recordItem(host, reopenItem(ledger, closed.id), input, now, fields)
  const isUpdated = r.ledger.items.some(i => i.id === closed.id && i.reportedAt === now)

  return isUpdated ? r : null
}

/**
 * A record that repeats a question or task the agent closed with an answer during the running turn. The row reopens
 * and the record updates it, so the agent can take back a close it made by mistake. A row the person answered, or the
 * agent closed before this turn, stays closed. Null when no such row matches.
 */
function recordAfterOwnClose(
  host: Host,
  ledger: Ledger,
  input: Record<string, unknown>,
  now: number,
  presses: Presses,
  fields: ToolFields,
): ToolAnswer | null {
  const { turnStartedAt } = presses
  if (turnStartedAt === null) return null
  const isOwnCloseThisTurn = (c: Closed) => c.closedBy === 'agent' && c.how === 'answered' && c.at >= turnStartedAt
  for (const closed of ledger.closed.filter(isOwnCloseThisTurn).toReversed()) {
    const r = recordItem(host, reopenItem(ledger, closed.id), input, now, fields)
    const reopened = r.ledger.items.find(i => i.id === closed.id && i.reportedAt === now)
    if (reopened)
      return {
        ledger: r.ledger,
        result:
          `Reopened: you closed it earlier in this turn. The user sees it in ${host.surface} again.` +
          closeIdText(closed.id),
        personLine: `${reopened.kind === 'question' ? 'Question' : 'Task'}: ${reopened.ask}`,
      }
  }

  return null
}

export function recordClose(
  host: Host,
  ledger: Ledger,
  input: Record<string, unknown>,
  now: number,
  presses: Presses,
): ToolAnswer {
  const id = trimmed(input.id).replace(/^\[|\]$/g, '')
  const answer = trimmed(input.answer)
  const reason = trimmed(input.reason)
  if (id === '' || (answer === '' && reason === ''))
    return unchanged(ledger, "Not closed: give the id, and the user's answer or a reason.")
  const tooLong = tooLongText(input, CLOSE_LIMITS, [answer ? 'answer' : 'reason'])
  if (tooLong) return unchanged(ledger, `Not closed: ${tooLong}`)
  if (answer === '' && isRecordedAfterCompare(ledger, id, presses))
    return unchanged(ledger, 'Not closed: your record updated this question, and it stays open for the user.')
  const item = ledger.items.find(i => i.id === id)
  if (item?.kind === 'question' && answer !== '' && isQuestionBack(answer, item.options))
    return unchanged(
      ledger,
      'Not closed: the user asked a question back, so it stays open. Answer them in your reply, and close it when they decide.',
    )
  const r = closeByAgent(host, ledger, id, answer ? { answer } : { reason }, now)
  if (r.closed && 'item' in r.closed)
    return {
      ledger: r.ledger,
      result: `Closed "${r.closed.item.ask}". The user sees it in ${host.surface} with its outcome. ${NAME_BY_CONTENT}`,
      personLine: `Closed: ${r.closed.item.ask}`,
    }
  if (r.closed)
    return {
      ledger: r.ledger,
      result: `Closed the finding "${r.closed.finding.title}". ${NAME_BY_CONTENT}`,
      personLine: `Closed: ${r.closed.finding.title}`,
    }
  const earlier = [...ledger.closed, ...ledger.closedFindings].findLast(c => c.id === id)
  if (earlier) return unchanged(ledger, `Already closed: ${closedHow(earlier)}.`)

  return unchanged(
    ledger,
    `Not closed: no open item or finding has the id ${id}. The open ones are listed beside the user's latest message.`,
  )
}
