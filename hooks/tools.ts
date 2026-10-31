import { recommendedOption } from './ask-match'
import { closeByAgent } from './ledger-close'
import { addAgentItem, addFinding } from './ledger-update'
import { stepHelp } from './reply-parse'
import type { Host } from './model-text'
import { linkedPrs, MAX_ORDERED_PRS } from './pr-fetch'
import type { Closed, Help, Ledger } from '../types'

const NAME_BY_CONTENT = 'Name it by what it says, never by its id.'

const RECORD_SCHEMA = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: ['question', 'task', 'finding'],
      description:
        'question: a decision only the user can make. task: a step only the user can do. finding: something outside the current task that deserves their attention.',
    },
    ask: {
      type: 'string',
      description:
        'For a question or task: what you need from the user, in at most 12 plain words, readable without your reply.',
    },
    options: {
      type: 'array',
      items: { type: 'string' },
      description: 'For a question: the answers the user can pick, at most 5 words each. Give at least one.',
    },
    rec: {
      type: 'string',
      description:
        'For a question: the option you recommend, copied from options. Leave it out when you recommend none.',
    },
    steps: {
      type: 'array',
      items: { type: 'string' },
      description:
        'For a task: up to 3 things the user can do in one press, each written bare as a command, a file path or an https link. For a question: up to 3 files or https links that help the user decide, such as a page comparing the options, each file as an absolute path.',
    },
    design_choice: {
      type: 'boolean',
      description:
        'For a question: true when its options are designs or approaches you could try and show side by side, such as two layouts or two ways to build a feature. The user can then ask you to compare them. Leave it out for a fact, an approval or a preference.',
    },
    finding_kind: {
      type: 'string',
      enum: ['issue', 'opportunity'],
      description: 'For a finding. issue: something wrong or risky. opportunity: something that could be better.',
    },
    title: { type: 'string', description: 'For a finding: what it is, in at most 12 plain words.' },
    detail: {
      type: 'string',
      description: 'For a finding: why it matters and what you would do, in one or two sentences.',
    },
    path: { type: 'string', description: 'For a finding: the file it is about, if one.' },
  },
  required: ['kind'],
}

const CLOSE_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'The id of the open item or finding, such as i35 or f32.' },
    answer: {
      type: 'string',
      description:
        'The user\'s answer, at most 8 words, when their own message answered it. Use their words, but when they picked by position or pointing, as "the second one", give the option they picked.',
    },
    reason: {
      type: 'string',
      description: 'Otherwise, why it is closed, in at most 8 words, such as "no longer applies: Inbox kept".',
    },
  },
  required: ['id'],
}

const ORDER_SCHEMA = {
  type: 'object',
  properties: {
    repo: { type: 'string', description: 'The repository, as owner/name.' },
    numbers: {
      type: 'array',
      items: { type: 'integer' },
      description: `The PR numbers, first to last, at most ${MAX_ORDERED_PRS}. Give an empty list to clear the order.`,
    },
    label: {
      type: 'string',
      description:
        'What the user does with the order, in at most 4 words, such as "Merge in this order" or "Review in this order". Required to set an order.',
    },
    why: {
      type: 'string',
      description:
        'The reason for this order, in one sentence, such as a PR that waits on another. Not a summary of each PR. Required to set an order.',
    },
  },
  required: ['numbers'],
}

function orderDescription(host: Host): string {
  return `Set the order of the user's PRs in ${host.prsIn}, when the user asks for an order there. Those PRs show first, in this order. Each call replaces the order, and an empty numbers list clears it.`
}

function recordDescription(host: Host): string {
  return `Record something the user must see in ${host.surface}, and still say it in your reply. Use it in the turn you raise it, once for each thing.
- question: a decision, approval or piece of information only the user has, which you need before you go on. Give options, and rec when you recommend one. This includes an act you hold until they say so, such as "say when you want those committed".
- task: a step only the user can do, such as signing in or running a command with their password. Put the commands, files and links in steps. A step your own tools can take is not a task: take it, or ask for their OK as a question when it changes something other people see.
- finding: something outside the current task that deserves their attention. It waits in ${host.findingsIn} until it is closed, and the user can ask you to address it or discuss it. Record what a careful senior engineer would flag to a teammate, once you have checked it. Leave out style nits, anything the user already decided, todos or ideas the user mentioned, problems in your own change, progress, and anything only the user can do or decide: handle those in your reply, or record them as a question or task.
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

/** The answer to a call of one of `agentTools`. */
export function toolAnswer(
  host: Host,
  ledger: Ledger,
  tool: AgentTool,
  input: Record<string, unknown>,
  now: number,
): ToolAnswer {
  switch (tool) {
    case 'record':
      return recordItem(host, ledger, input, now)
    case 'close':
      return recordClose(host, ledger, input, now)
    case 'order_prs':
      return orderPrs(host, ledger, input, now)
  }
}

function cut(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

const MAX_ASK = 200
const MAX_OPTION = 60
const MAX_OPTIONS = 8
const MAX_STEPS = 3

function list(value: unknown, max: number, each: number): string[] {
  return Array.isArray(value)
    ? value
        .map(v => cut(v, each))
        .filter(Boolean)
        .slice(0, max)
    : []
}

/**
 * A `record` or `close` call's answer. `result` is the text the agent reads back. `personLine` is the line the person
 * sees under the call in the conversation, or null when the call changed nothing in the inbox.
 */
export type ToolAnswer = { ledger: Ledger; result: string; personLine: string | null }

function unchanged(ledger: Ledger, result: string): ToolAnswer {
  return { ledger, result, personLine: null }
}

export function recordItem(host: Host, ledger: Ledger, input: Record<string, unknown>, now: number): ToolAnswer {
  if (input.kind === 'finding') return recordFinding(host, ledger, input, now)
  if (input.kind !== 'question' && input.kind !== 'task')
    return unchanged(ledger, 'Not recorded: kind must be question, task or finding.')
  const ask = cut(input.ask, MAX_ASK)
  if (ask === '') return unchanged(ledger, `Not recorded: a ${input.kind} needs an ask.`)
  const options = input.kind === 'question' ? list(input.options, MAX_OPTIONS, MAX_OPTION) : []
  if (input.kind === 'question' && options.length === 0)
    return unchanged(ledger, 'Not recorded: a question needs at least one option.')
  const recInput = input.kind === 'question' ? cut(input.rec, MAX_OPTION) : ''
  const rec = recInput === '' ? null : recommendedOption(options, recInput)
  if (recInput !== '' && rec === null) return unchanged(ledger, 'Not recorded: rec must be one of the options.')
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
  const r = addAgentItem(ledger, { kind: input.kind, ask, options, rec, helps, isDesignChoice }, now)
  if (r.is === 'open') {
    const changes = [
      ...(r.addedSteps > 0 ? ['added its new steps'] : []),
      ...(r.isNewlyMarked ? ['marked it as a design choice'] : []),
      ...(r.newRec ? [`changed its recommendation to ${r.newRec}`] : []),
    ]
    const updated = changes.length > 0 ? ` and ${changes.join(' and ')}` : ''

    return unchanged(r.ledger, `Already open, so this record updated it${updated}.${leftOut}`)
  }
  if (r.is === 'closed')
    return unchanged(ledger, `Not recorded: ${closedHow(r.record)}. Ask it again only if they bring it up.`)

  return {
    ledger: r.ledger,
    result:
      `Recorded. The user sees it in ${host.surface}.` +
      leftOut +
      (r.expired ? ` The list was full, so the oldest item closed: ${r.expired.ask}.` : ''),
    personLine: `${input.kind === 'question' ? 'Question' : 'Task'}: ${ask}`,
  }
}

function recordFinding(host: Host, ledger: Ledger, input: Record<string, unknown>, now: number): ToolAnswer {
  const title = cut(input.title, 120)
  const detail = cut(input.detail, 600)
  if (title === '' || detail === '') return unchanged(ledger, 'Not recorded: a finding needs a title and a detail.')
  const path = cut(input.path, 300)
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

export function recordClose(host: Host, ledger: Ledger, input: Record<string, unknown>, now: number): ToolAnswer {
  const id = cut(input.id, 80).replace(/^\[|\]$/g, '')
  const answer = cut(input.answer, 80)
  const reason = cut(input.reason, 80)
  if (id === '' || (answer === '' && reason === ''))
    return unchanged(ledger, "Not closed: give the id, and the user's answer or a reason.")
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
 * Sets the PRs tab's order from an `order_prs` call, and links each PR it names that the session does not, so the tab
 * fetches it. An empty list clears the order.
 */
function orderPrs(host: Host, ledger: Ledger, input: Record<string, unknown>, now: number): ToolAnswer {
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
  const added = refs.filter(ref => !ledger.prs.includes(ref))
  const addedText =
    added.length === 0
      ? ''
      : added.length === 1
        ? " 1 of them was not in the tab yet. It shows after the tab's next refresh, if the user wrote it and it is open."
        : ` ${added.length} of them were not in the tab yet. They show after the tab's next refresh, if the user wrote them and they are open.`

  return {
    ledger: {
      ...ledger,
      prs: linkedPrs(ledger.prs, added),
      prOrder: { refs, label, why, statuses: {}, by: host.agent, at: now },
    },
    result: `Set. These ${refs.length} PRs show first in ${host.prsIn}, in this order.${addedText}`,
    personLine: `PR order: ${label}, ${refs.length} ${refs.length === 1 ? 'PR' : 'PRs'}`,
  }
}
