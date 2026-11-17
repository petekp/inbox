import { MAX_ORDERED_PRS } from './pr-fetch'
import type { Session, ToolFields } from '../types'

export const RECORD_SCHEMA = {
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
        'For a question or task: what you need from the user, in at most 12 words, readable without your reply. Links as [label](https://…); a link counts as its label.',
    },
    context: {
      type: 'string',
      description:
        'For a question: why it came up, in at most 20 plain words, so the user can answer without reading back through the conversation.',
    },
    options: {
      type: 'array',
      items: { type: 'string' },
      description:
        'For a question: the answers the user can pick, at most 5 words each. Give at least one. A link here shows only its label; put the page behind an option in detail or steps.',
    },
    option_notes: {
      type: 'array',
      items: { type: 'string' },
      description:
        'For a question: one note for each option, in the order of options, saying what picking it does, in at most 12 words each.',
    },
    rec: {
      type: 'string',
      description:
        'For a question: the option you recommend, copied from options. Leave it out when you recommend none.',
    },
    why: {
      type: 'string',
      description:
        'For a question with rec: why you recommend it, as a short clause of at most 12 words, such as "it keeps the old API".',
    },
    steps: {
      type: 'array',
      items: { type: 'string' },
      description:
        'For a task: up to 3 things the user can do in one press, each written as a command, a file path or a [label](https://…) link. For a question: up to 3 files or links that help the user decide, such as a page comparing the options, each file as an absolute path.',
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
    title: {
      type: 'string',
      description:
        'For a finding: what it is, in at most 12 words. Links as [label](https://…); a link counts as its label.',
    },
    detail: {
      type: 'string',
      description:
        'For a question or task: why you ask and what it holds up; for a question, what each option leads to. For a finding: why it matters and what you would do. Use short paragraphs. Links as [label](https://…).',
    },
    path: { type: 'string', description: 'For a finding: the file it is about, if one.' },
    document: {
      type: 'string',
      description: 'For a Markdown report the user should read in the inbox: its absolute local file path.',
    },
  },
  required: ['kind'],
}

export const CLOSE_SCHEMA = {
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

export const ORDER_SCHEMA = {
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

export const TASKS_SCHEMA = {
  type: 'object',
  properties: {
    operation: {
      type: 'string',
      enum: ['add', 'update', 'move', 'complete', 'note'],
      description: 'Add a task, update its facts, move it, complete it, or add a note.',
    },
    task_id: { type: 'string', description: 'A stable id for add, or the existing task id for other operations.' },
    parent_id: {
      type: ['string', 'null'],
      description: 'For add or move: the parent task id. Use null to put the task at the root.',
    },
    title: { type: 'string', description: 'For add or update: a short title, at most 100 characters.' },
    detail: { type: 'string', description: 'For add or update: task detail, at most 2000 characters.' },
    status: {
      type: 'string',
      enum: ['working', 'queued', 'waits-on-other', 'done', 'dropped'],
      description: 'For add or update: the task status.',
    },
    weight: { type: 'number', description: 'For add or update: a sibling-relative weight from 0.1 to 100.' },
    pr: {
      type: ['string', 'null'],
      description:
        'For add or update: a GitHub or GitHub Enterprise pull request URL, https://<host>/owner/repo/pull/123. Use null to clear.',
    },
    issue: {
      type: ['string', 'null'],
      description:
        'For add or update: a GitHub or GitHub Enterprise issue URL, https://<host>/owner/repo/issues/123. Use null to clear.',
    },
    owner_agent: {
      type: ['string', 'null'],
      description:
        'For add or update: the Herdr owner agent name, matching [a-z][a-z0-9_-]{0,31}. Add with owner_machine; on update, it can change alone. Use null alone to clear the owner.',
    },
    owner_machine: {
      type: ['string', 'null'],
      description:
        'For add or update: the Herdr machine alias (use local for this machine), up to 100 characters. Add with owner_agent; on update, it can change alone. Use null alone to clear the owner.',
    },
    note: { type: 'string', description: 'For note: a note to append, at most 2000 characters.' },
  },
  required: ['operation'],
}

/** The input fields of each inbox tool in this build. */
export const TOOL_FIELDS: ToolFields = {
  record: Object.keys(RECORD_SCHEMA.properties),
  close: Object.keys(CLOSE_SCHEMA.properties),
  order_prs: Object.keys(ORDER_SCHEMA.properties),
  tasks: Object.keys(TASKS_SCHEMA.properties),
}

/** The input fields of each inbox tool in 0.3.0. A session saved before sessions kept their fields gets these. */
export const V0_3_TOOL_FIELDS: ToolFields = {
  record: ['kind', 'ask', 'options', 'rec', 'steps', 'design_choice', 'finding_kind', 'title', 'detail', 'path'],
  close: ['id', 'answer', 'reason'],
  order_prs: ['repo', 'numbers', 'label', 'why'],
  tasks: [],
}

/** The fields of the inbox tools the session's agent has: those it saved, or 0.3.0's when it saved none. */
export function sessionToolFields(s: Pick<Session, 'toolFields'>): ToolFields {
  return s.toolFields ? { ...s.toolFields, tasks: s.toolFields.tasks ?? [] } : V0_3_TOOL_FIELDS
}
