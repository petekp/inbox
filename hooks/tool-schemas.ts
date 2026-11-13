import { MAX_ORDERED_PRS } from './pr-fetch'

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
        'For a question or task: what you need from the user, in at most 12 plain words, readable without your reply.',
    },
    context: {
      type: 'string',
      description:
        'For a question: why it came up, in at most 20 plain words, so the user can answer without reading back through the conversation.',
    },
    options: {
      type: 'array',
      items: { type: 'string' },
      description: 'For a question: the answers the user can pick, at most 5 words each. Give at least one.',
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
