export type { Told } from '../types'
export { buildPrompt, systemText } from './ledger-prompt'
export { catchUpPrompt, dialogActivity, dialogQuestions, toolActivity, transcriptCatchUpPrompt } from './catch-up-text'
export { STATUS_SYSTEM, statusCatchUpPrompt, statusMidTurnPrompt, statusPrompt } from './status-prompt'
export type { StatusCallInput } from './status-prompt'
export { screenText, statusCarryText } from './inbox-text'
export type { ScreenTab } from './inbox-text'

export function guidanceText(host: Host): string {
  return `# Inbox
${host.intro}

When you ask the user to decide something, say which option you recommend and why, in one clause ("I'd go with B: it keeps the old API"). If you cannot recommend one, say what would decide it.

Before you hand the user a step, take it yourself when your tools reach it, such as running a command, reloading or checking a page, or reading a log. When the step changes something other people see, such as marking a PR ready or pushing, ask for their OK as a question and take the step when they say yes. Record a task only for a step your tools cannot reach, and say in your reply why you cannot take it.

When you ask the user to do something, such as review a page, sign in or run a command, give them what they need in the same reply: the link, file path or command, what to do there, and how the result gets back to you. If the result would stay where you cannot read it, such as in their browser, give them a way to send it to you.

Ask in your reply as a direct question, and record the same ask in that turn with ${host.recordTool}, so it stays in the inbox after the conversation moves on. Record a decision, an approval or information you need as a question, with its options and the one you recommend. Record an act you hold until the user says so the same way. Record a step only the user can take as a task, with its steps. Record each one once. Do not record rhetorical questions, offers to continue when continuing is the default, FYIs, or invitations to look at finished work.

A finding is something you noticed that deserves the user's attention but is outside the current task: a bug, a risk, missing tests, tech debt, or a chance to improve something. Check it once before you record it, by reading the code or running a quick command, so the finding says what is true. Record it with ${host.recordTool} as a finding, then go on with the task; fixing it waits until the user asks. Record one too when you work around a problem instead of fixing it, such as copying files by hand because a tool does not reach them, and when part of your change cannot be checked from where you are. State those in your reply as well. Mention any other finding only when it bears on what the user asked.

These are not findings. Handle them in the task and your reply instead:
- A problem in your own change or inside the task: fix it.
- A check you could run yourself: run it, or say in your reply that you have not.
- Progress, status, or an approach you tried and dropped: say it.
- Something only the user can do or decide, such as an approval, a sign-in or a choice: ask it, and record it as a question or task.

The latest "inbox:" text beside the user's prompt is the current state. It lists every open item and finding with its id, such as (close id: i35), and anything it does not list is closed. Check it before telling the user that something is open or waits on them. The ids are for the inbox tools only. The user never sees them, so never write one to the user, not even in parentheses: name an item or finding by what it says, as "the deploy task" or "the migration finding".

Close with ${host.closeTool}:
- When the user's message answers an open item, close it first, before other work, with their answer, and say in your reply what you took their answer to be.
- When an item or finding is done or no longer applies, close it with a short reason, without waiting to be asked.
The answer to a question is the user's to give. Close a question with their answer, or once it no longer applies, and never with an answer of your own.`
}

/** Claude Code sends only this many characters of a tool's description when the tool is not behind tool search. */
export const MAX_TOOL_DESCRIPTION = 4096

/** `record`'s own description leaves too little room under `MAX_TOOL_DESCRIPTION` for the guidance, so `close` carries it. */
export function guidedCloseDescription(host: Host, description: string): string {
  return `${description}\n\n${guidanceText(host)}`
}

export type Host = {
  agent: string
  surface: string
  /** Where the person always sees how many items and findings are open, besides the surface; null when only the surface shows them. */
  band: string | null
  findingsIn: string
  /** Where the person sees their PRs. */
  prsIn: string
  /** The names the agent calls the inbox tools by. */
  recordTool: string
  closeTool: string
  /** The first paragraph of `guidanceText`: what the inbox shows the person, and where. */
  intro: string
}

export const CLAUDE_CODE: Host = {
  agent: 'Claude',
  surface: 'the /inbox pane',
  band: 'a band above their prompt',
  findingsIn: 'the Finds tab of the /inbox pane',
  prsIn: 'the PRs tab of the /inbox pane',
  recordTool: 'mcp__inbox__record',
  closeTool: 'mcp__inbox__close',
  intro:
    "The inbox plugin shows the user what waits on them: your open questions and the tasks only they can do, in the /inbox pane, and your findings, in the pane's Finds tab. A band above their prompt shows only two counts: one for your questions and their tasks together, and one for your findings.",
}
