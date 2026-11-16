import { isQuestionBack, recommendedOption } from './ask-match'
import { closeByAgent, reopenItem } from './ledger-close'
import { addAgentItem, addFinding } from './ledger-update'
import { stepHelp } from './reply-parse'
import { cutInline } from './inline'
import type { Host } from './model-text'
import { MAX_ORDERED_PRS, tabPrs } from './pr-fetch'
import { isDismissed } from './pr-views'
import { bodyChanges, missingText, questionBody, withBody } from './question-checks'
import { CLOSE_SCHEMA, ORDER_SCHEMA, RECORD_SCHEMA, TASKS_SCHEMA, V0_3_TOOL_FIELDS } from './tool-schemas'
import { CLOSE_DESCRIPTION, orderDescription, recordDescription, tasksDescription } from './tool-descriptions'
import { taskTreeAnswer } from './task-tool'
import type { Closed, Help, Item, LastAction, Ledger, TaskTree, ToolFields } from '../types'
import { recordLinksAnswer } from './record-links'

const NAME_BY_CONTENT = 'Name it by what it says, never by its id.'
const MAX_ITEM_DETAIL = 1200
const AGENT_TOOLS = ['record', 'close', 'order_prs', 'tasks'] as const

export type AgentTool = (typeof AGENT_TOOLS)[number]

/** Shared tool definitions registered and answered by every host. */
export function agentTools(
  host: Host,
): { name: AgentTool; description: string; inputSchema: Record<string, unknown> }[] {
  return [
    { name: 'record', description: recordDescription(host), inputSchema: RECORD_SCHEMA },
    { name: 'close', description: CLOSE_DESCRIPTION, inputSchema: CLOSE_SCHEMA },
    { name: 'order_prs', description: orderDescription(host), inputSchema: ORDER_SCHEMA },
    { name: 'tasks', description: tasksDescription(host), inputSchema: TASKS_SCHEMA },
  ]
}

export function isAgentTool(name: string): name is AgentTool {
  return (AGENT_TOOLS as readonly string[]).includes(name)
}

/** Latest row actions and the main turn's start, if known. */
type Presses = { lastActions: Record<string, LastAction>; turnStartedAt: number | null }

/** Answers a tool call using the fields that agent has. */
export function toolAnswer(
  host: Host,
  ledger: Ledger,
  tool: AgentTool,
  input: Record<string, unknown>,
  now: number,
  presses: Presses,
  fields: ToolFields,
  taskTree: TaskTree = [],
): ToolAnswer {
  switch (tool) {
    case 'record':
      return (
        recordAfterCompare(host, ledger, input, now, presses, fields) ?? recordItem(host, ledger, input, now, fields)
      )
    case 'close':
      return recordClose(host, ledger, input, now, presses)
    case 'order_prs':
      return orderPrs(host, ledger, input, now, presses.lastActions)
    case 'tasks':
      return { ledger, ...taskTreeAnswer(taskTree, input, now), personLine: null }
  }
}

function cut(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

const MAX_ASK = 200
const MAX_FINDING_TITLE = 120
const MAX_FINDING_DETAIL = 600
const MAX_OPTION = 60
const MAX_OPTIONS = 8
const MAX_STEPS = 3
const MAX_REASON = 120

/** A text field as the agent sent it, trimmed, before any cut. */
function raw(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function rawList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(raw).filter(Boolean) : []
}

function list(value: unknown, max: number, each: number, inline = false): string[] {
  return Array.isArray(value)
    ? value
        .map(v => (inline ? cutInline(typeof v === 'string' ? v : '', each) : cut(v, each)))
        .filter(Boolean)
        .slice(0, max)
    : []
}

/** The agent's result and the optional line shown to the person under the call. */
export type ToolAnswer = { ledger: Ledger; taskTree?: TaskTree; result: string; personLine: string | null }

/** What follows an answer whose change the user sees now, when the store refused to save the session as full. */
export const NOT_SAVED = "Not saved: the inbox's store is full, so this change is lost if this session restarts."

function unchanged(ledger: Ledger, result: string): ToolAnswer {
  return { ledger, result, personLine: null }
}

export function recordItem(
  host: Host,
  ledger: Ledger,
  input: Record<string, unknown>,
  now: number,
  fields: ToolFields = V0_3_TOOL_FIELDS,
): ToolAnswer {
  if (input.kind === 'finding') return recordFinding(host, ledger, input, now)
  if (input.kind !== 'question' && input.kind !== 'task')
    return unchanged(ledger, 'Not recorded: kind must be question, task or finding.')
  const ask = cutInline(typeof input.ask === 'string' ? input.ask.trim() : '', MAX_ASK)
  if (ask === '') return unchanged(ledger, `Not recorded: a ${input.kind} needs an ask.`)
  const options = input.kind === 'question' ? list(input.options, MAX_OPTIONS, MAX_OPTION, true) : []
  if (input.kind === 'question' && options.length === 0)
    return unchanged(ledger, 'Not recorded: a question needs at least one option.')
  const recInput =
    input.kind === 'question' ? cutInline(typeof input.rec === 'string' ? input.rec : '', MAX_OPTION) : ''
  const rec = recInput === '' ? null : recommendedOption(options, recInput)
  if (recInput !== '' && rec === null) return unchanged(ledger, 'Not recorded: rec must be one of the options.')
  const recReason = rec ? cut(input.why, MAX_REASON).replace(/^because\s+/i, '') : ''
  const steps = list(input.steps, MAX_STEPS + 3, 4000)
  const isUsable = (h: Help) => input.kind === 'task' || h.kind === 'open' || h.kind === 'link'
  const helps = steps
    .flatMap(step => stepHelp(step) ?? [])
    .filter(isUsable)
    .slice(0, MAX_STEPS)
  const leftOut =
    helps.length < steps.length
      ? input.kind === 'task'
        ? ' Some steps were not a command, a file path or a link, so they are left out.'
        : ' Some steps were not an absolute file path or a link, so they are left out.'
      : ''

  const isDesignChoice = input.kind === 'question' && input.design_choice === true
  const detail = cutInline(typeof input.detail === 'string' ? input.detail.trim() : '', MAX_ITEM_DETAIL)
  const linkSteps = helps.flatMap(h => (h.kind === 'link' ? [h.url] : []))
  const linkProblem = recordLinksAnswer(
    [
      { field: 'ask', text: raw(input.ask), max: MAX_ASK },
      { field: 'detail', text: raw(input.detail), max: MAX_ITEM_DETAIL },
      ...rawList(input.kind === 'question' ? input.options : [])
        .slice(0, MAX_OPTIONS)
        .map(text => ({
          field: 'options' as const,
          text,
          max: MAX_OPTION,
        })),
    ],
    linkSteps,
  )
  if (linkProblem) return unchanged(ledger, linkProblem)
  const document = cut(input.document, 4096) || undefined
  const documentPreview = document ? cut(input.document_preview, 180) || undefined : undefined
  const documentError = cut(input.document_error, 160)
  const documentNote = documentError ? ` The Markdown report was not attached: ${documentError}` : ''
  const kind: Item['kind'] = input.kind
  const entry = {
    kind,
    ask,
    options,
    rec,
    helps,
    isDesignChoice,
    ...(recReason ? { recReason } : {}),
    ...(detail ? { detail } : {}),
    ...(document ? { document, documentPreview } : {}),
  }
  const r = addAgentItem(ledger, entry, now)
  if (r.is === 'source-managed')
    return unchanged(
      ledger,
      'Not recorded: a matching task is managed by the active work source and was left unchanged.',
    )
  if (r.is === 'closed')
    return unchanged(
      ledger,
      'title' in r.record
        ? `Not recorded: the user dismissed the finding "${r.record.title}", which this raises. Ask about it only if they bring it up.`
        : `Not recorded: ${closedHow(r.record)}. Ask it again only if they bring it up.`,
    )
  const body = input.kind === 'question' ? questionBody(input, options) : {}
  const before = r.ledger.items.find(i => i.id === r.id)
  const after = before && withBody(before, body)
  const recorded = { ...r.ledger, items: r.ledger.items.map(i => (i === before && after ? after : i)) }
  if (r.is === 'open') {
    const changes = [
      ...(r.addedSteps > 0 ? ['added its new steps'] : []),
      ...(r.isNewlyMarked ? ['marked it as a design choice'] : []),
      ...(r.hasNewDetail ? ['replaced its detail'] : []),
      ...(r.hasNewDocument ? ['updated its Markdown report'] : []),
      ...(r.newRec ? [`changed its recommendation to ${r.newRec}`] : []),
      ...(r.isNewReason ? ['gave its recommendation your reason'] : []),
      ...(before && after ? bodyChanges(before, after) : []),
    ]
    const updated = changes.length > 0 ? ` and ${changes.join(' and ')}` : ''

    return unchanged(recorded, `Already open, so this record updated it${updated}.${leftOut}${documentNote}`)
  }

  return {
    ledger: recorded,
    result:
      `Recorded. The user sees it in ${host.surface}.` +
      leftOut +
      missingText(after, fields.record) +
      (r.expired ? ` The list was full, so the oldest item closed: ${r.expired.ask}.` : '') +
      documentNote,
    personLine: `${input.kind === 'question' ? 'Question' : 'Task'}: ${ask}`,
  }
}

function recordFinding(host: Host, ledger: Ledger, input: Record<string, unknown>, now: number): ToolAnswer {
  const title = cutInline(raw(input.title), MAX_FINDING_TITLE)
  const detail = cutInline(raw(input.detail), MAX_FINDING_DETAIL)
  if (title === '' || detail === '') return unchanged(ledger, 'Not recorded: a finding needs a title and a detail.')
  const linkProblem = recordLinksAnswer([
    { field: 'title', text: raw(input.title), max: MAX_FINDING_TITLE },
    { field: 'detail', text: raw(input.detail), max: MAX_FINDING_DETAIL },
  ])
  if (linkProblem) return unchanged(ledger, linkProblem)
  const path = cut(input.path, 300)
  const document = cut(input.document, 4096) || undefined
  const documentPreview = document ? cut(input.document_preview, 180) || undefined : undefined
  const documentError = cut(input.document_error, 160)
  const documentNote = documentError ? ` The Markdown report was not attached: ${documentError}` : ''
  const kind = input.finding_kind === 'opportunity' ? 'opportunity' : 'issue'
  const r = addFinding(ledger, { kind, title, detail, path: path || null, document, documentPreview, at: now })

  if (r.dismissed)
    return unchanged(
      ledger,
      `Not recorded: the user already closed this (${r.dismissed.outcome}). Record it again only if they bring it up.${documentNote}`,
    )
  if (!r.isAdded) return unchanged(r.ledger, `Already recorded.${documentNote}`)

  return {
    ledger: r.ledger,
    result:
      `Recorded. The user sees it in ${host.findingsIn}.` +
      (r.expired ? ` The list was full, so the oldest finding closed: ${r.expired.title}.` : '') +
      documentNote,
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

/** Whether `at` follows `id`'s Compare press in this turn. */
function isAfterCompareThisTurn(id: string, at: number, presses: Presses): boolean {
  const last = presses.lastActions[id]

  return last?.action === 'compare' && at >= Math.max(last.at, presses.turnStartedAt ?? last.at)
}

/** Whether this question was recorded again after its Compare press in this turn. */
function isRecordedAfterCompare(ledger: Ledger, id: string, presses: Presses): boolean {
  const item = ledger.items.find(i => i.id === id)
  if (item?.kind !== 'question' || item.reportedAt === undefined) return false

  return isAfterCompareThisTurn(id, item.reportedAt, presses)
}

/** Reopens and updates a question when its reasoned close followed Compare in the same turn. */
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

export function recordClose(
  host: Host,
  ledger: Ledger,
  input: Record<string, unknown>,
  now: number,
  presses: Presses,
): ToolAnswer {
  const id = cut(input.id, 80).replace(/^\[|\]$/g, '')
  const answer = cut(input.answer, 80)
  const reason = cut(input.reason, 80)
  if (id === '' || (answer === '' && reason === ''))
    return unchanged(ledger, "Not closed: give the id, and the user's answer or a reason.")
  if (answer === '' && isRecordedAfterCompare(ledger, id, presses))
    return unchanged(ledger, 'Not closed: your record updated this question, and it stays open for the user.')
  const item = ledger.items.find(i => i.id === id)
  if (item?.kind === 'question' && answer !== '' && isQuestionBack(answer, item.options))
    return unchanged(
      ledger,
      'Not closed: the user asked a question back, so it stays open. Answer them in your reply, and close it when they decide.',
    )
  if (
    ledger.items.some(item => item.id === id && item.sourceManaged) ||
    ledger.findings.some(finding => finding.id === id && finding.sourceManaged)
  )
    return unchanged(ledger, 'Not closed: this row is owned by the active-items source. Update that source instead.')
  const r = closeByAgent(host, ledger, id, answer ? { answer } : { reason }, now)
  if (r.closed && 'item' in r.closed)
    return {
      ledger: r.ledger,
      result: `Closed. The user sees it in ${host.surface} with its outcome. ${NAME_BY_CONTENT}`,
      personLine: `Closed: ${r.closed.item.ask}`,
    }
  if (r.closed)
    return {
      ledger: r.ledger,
      result: `Closed the finding. ${NAME_BY_CONTENT}`,
      personLine: `Closed: ${r.closed.finding.title}`,
    }
  const earlier = [...ledger.closed, ...ledger.closedFindings].findLast(c => c.id === id)
  if (earlier) return unchanged(ledger, `Already closed: ${closedHow(earlier)}.`)

  return unchanged(
    ledger,
    `Not closed: no open item or finding has the id ${id}. The open ones are listed beside the user's latest message.`,
  )
}

const REPO = /^[\w.-]+\/[\w.-]+$/
const MAX_ORDER_LABEL = 40
const MAX_ORDER_WHY = 300

/** A PR number as the agent gave it, as 3401 or "#3401", or null when it is not one. */
function prNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim().replace(/^#/, '')) : NaN

  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Sets the PRs tab's order from an `order_prs` call. The tab shows and fetches each PR the order ranks, without
 * linking it, so a new order or an empty list, which clears it, takes the old order's PRs off the tab. A PR the
 * person or a fetch dismissed stays off it.
 */
function orderPrs(
  host: Host,
  ledger: Ledger,
  input: Record<string, unknown>,
  now: number,
  lastActions: Record<string, LastAction>,
): ToolAnswer {
  if (!Array.isArray(input.numbers)) return unchanged(ledger, 'Not set: numbers must be a list of PR numbers.')
  if (input.numbers.length === 0) {
    if (ledger.prOrder === null) return unchanged(ledger, 'No order was set.')

    return {
      ledger: { ...ledger, prOrder: null },
      result: `Cleared. The PRs show in their usual order in ${host.prsIn}.`,
      personLine: 'PR order cleared',
    }
  }
  const numbers = input.numbers.map(prNumber)
  if (numbers.includes(null)) return unchanged(ledger, 'Not set: numbers must be PR numbers, such as 3401.')
  const repo = cut(input.repo, 200)
  if (!REPO.test(repo)) return unchanged(ledger, 'Not set: give repo as owner/name.')
  const refs = [...new Set(numbers.map(n => `${repo}#${n}`))]
  if (refs.length > MAX_ORDERED_PRS) return unchanged(ledger, `Not set: an order ranks at most ${MAX_ORDERED_PRS} PRs.`)
  const label = cut(input.label, MAX_ORDER_LABEL)
  if (!label) return unchanged(ledger, 'Not set: give label, what the user does with the order.')
  const why = cut(input.why, MAX_ORDER_WHY)
  if (!why) return unchanged(ledger, 'Not set: give why, the reason for this order.')
  const dismissed = refs.filter(ref => isDismissed(lastActions, ref) || ledger.prOrder?.dismissed.includes(ref))
  const onTab = tabPrs(ledger)
  const added = refs.filter(ref => !onTab.includes(ref))
  const addedText =
    added.length === 0
      ? ''
      : added.length === 1
        ? " 1 of them was not in the tab yet. It shows after the tab's next refresh, if the user wrote it and it is open."
        : ` ${added.length} of them were not in the tab yet. They show after the tab's next refresh, if the user wrote them and they are open.`

  return {
    ledger: {
      ...ledger,
      prOrder: { refs, label, why, statuses: {}, dismissed, by: host.agent, at: now },
    },
    result: `Set. These ${refs.length} PRs show first in ${host.prsIn}, in this order.${addedText}`,
    personLine: `PR order: ${label}, ${refs.length} ${refs.length === 1 ? 'PR' : 'PRs'}`,
  }
}
