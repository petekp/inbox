// What Codex and the tab read that differs from the mod's texts. Each one
// keeps the mod's wording except where the surface differs: Codex shows the
// inbox in a tab beside the conversation, with no band above the prompt.
// The mod's other model-facing texts come from ../../hooks/ledger.ts unchanged.

import type { Finding, Item } from '../../types'
import { inboxText as modInboxText } from '../../hooks/ledger'
import type { Ledger } from '../../types'

export const FINDING_DESCRIPTION = `Record a finding for the user. It waits in the Findings section of the Inbox tab until it is closed, and from there the user can ask you to address it or discuss it. Record what a careful senior engineer would flag to a teammate, and leave out style nits and anything the user already decided.`

export const GUIDANCE = `# Inbox
The inbox plugin shows the user what waits on them: your open questions and the tasks only they can do, and your findings, in the Inbox tab beside the conversation.

A finding is something you noticed that deserves the user's attention but is outside the current task: a bug, a risk, missing tests, tech debt, or a chance to improve something. Record it with mcp__inbox__record_finding the moment you notice it, then go on with the task; fixing it waits until the user asks. Record one too at two moments that are easy to pass over while focused on the task:
- You work around a problem instead of fixing it, such as copying files by hand because a tool does not reach them.
- Part of your change could not be tested or verified.
State those two in your reply as well. Mention any other finding only when it bears on what the user asked.

The latest "inbox:" text beside the user's prompt is the current state. It lists every open item and finding with its id, such as [i35] or [f12], and anything it does not list is closed. Check it before telling the user that something is open or waits on them.

Close with mcp__inbox__close:
- When the user's message answers an open item, close it first, before other work, with their answer.
- When an item or finding is done or no longer applies, close it with a short reason, without waiting to be asked.
The answer to a question is the user's to give. Close a question with their answer, or once it no longer applies, and never with an answer of your own.`

export const CLOSE_DESCRIPTION = `Close an open item or finding by its id, such as i35 or f12, as listed in the latest "inbox:" text beside the user's prompt. Pass the user's answer when their message answered it, and a reason otherwise.`

export const TAB_DESCRIPTION =
  'Open the Inbox tab beside this conversation. Call it only when the user asks to see the inbox.'

/** Codex's word for a lone check refused in the shell: the mod's, without run_check, which the plugin leaves out. */
export const CHECK_REFUSAL =
  "Not run. Run each check on its own, with no pipe, redirect or other command, so its exit status is the check's."

/** The outcome prefix the mod writes for an item Claude closed, and Codex's in its place. */
export const CLOSED_BY = 'closed by Codex'

const PANE_OPEN = 'The user has the /inbox pane open beside the conversation.'
const PANE_CLOSED = 'The /inbox pane is closed.'

/** The mod's inbox line, with its last sentence naming the Inbox tab instead of the /inbox pane. */
export function inboxText(ledger: Ledger, isTabOpen: boolean): string {
  return modInboxText(ledger, isTabOpen)
    .replace(PANE_OPEN, 'The user has the Inbox tab open beside the conversation.')
    .replace(PANE_CLOSED, 'The Inbox tab is closed.')
}

/** What the person has on screen besides the conversation, as the inbox model reads it. */
export function screenText(isTabOpen: boolean): string {
  return isTabOpen
    ? 'The Inbox tab is open beside the conversation, listing every open item.'
    : 'The Inbox tab is closed.'
}

export const START_TITLE =
  'inbox: where this session stands, as of the last reply. An "inbox:" text beside a later prompt replaces this.'

/** The messages a press sends, as the mod words them. */
export const messages = {
  answer: (item: Item, answer: string) => `Re "${item.ask}": ${answer}`,
  explain: (item: Item) => {
    const what = item.kind === 'task' ? 'this task you left for me' : 'this question you asked me'
    const options = item.options.length > 0 ? `\nOptions: ${item.options.join(' / ')}` : ''

    return `Remind me what ${what} is about: why it came up, and what each choice would mean. Don't act on it yet.\n"${item.ask}"${options}`
  },
  run: (item: Item, command: string) => `For "${item.ask}", run this:\n\`\`\`\n${command}\n\`\`\``,
  taskReply: (item: Item, words: string) => `Re the task you left for me, "${item.ask}": ${words}`,
  finding: (finding: Finding, how: 'address' | 'discuss' | 'typed', words = '') => {
    const opening =
      how === 'address'
        ? 'Please address this finding you recorded:'
        : how === 'discuss'
          ? "Let's talk through this finding you recorded before changing anything:"
          : 'About this finding you recorded:'
    const body = [
      `${finding.kind === 'issue' ? 'Issue' : 'Opportunity'}: ${finding.title}`,
      finding.detail,
      ...(finding.path ? [`File: ${finding.path}`] : []),
    ]

    return [opening, ...body, ...(how === 'typed' ? ['', words] : [])].join('\n')
  },
}
