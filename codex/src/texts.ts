// What Codex and the tab read that differs from the mod's texts. Each one
// keeps the mod's wording except where the surface differs: Codex shows the
// inbox in a tab beside the conversation, with no band above the prompt.
// The shared texts in ../../hooks/ledger.ts name Codex and the tab through CODEX.

import type { Host } from '../../hooks/ledger'

/** How the shared texts name Codex and the tab. */
export const CODEX: Host = {
  agent: 'Codex',
  surface: 'the Inbox tab',
  band: null,
  shownIn: 'the Inbox tab',
  findingsIn: 'the Findings section of the Inbox tab',
}

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

export const TAB_DESCRIPTION =
  'Open the Inbox tab beside this conversation. Call it only when the user asks to see the inbox.'

/** Codex's word for a lone check refused in the shell: the mod's, without run_check, which the plugin leaves out. */
export const CHECK_REFUSAL =
  "Not run. Run each check on its own, with no pipe, redirect or other command, so its exit status is the check's."

export const START_TITLE =
  'inbox: where this session stands, as of the last reply. An "inbox:" text beside a later prompt replaces this.'
