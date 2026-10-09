// What Codex and the tab read that differs from the mod's texts. Each one
// keeps the mod's wording except where the surface differs: Codex shows the
// inbox in a tab beside the conversation, with no band above the prompt.
// The shared texts in ../../hooks/ledger.ts name Codex and the tab through CODEX.

import type { Host } from '../../hooks/ledger'
import type { InboxView, RowView } from '../../hooks/view'

/** How the shared texts name Codex and the tab. */
export const CODEX: Host = {
  agent: 'Codex',
  surface: 'the Inbox tab',
  band: null,
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

export const INBOX_DESCRIPTION =
  'What waits on the user in this conversation: open questions, tasks and findings, as text. Call it only when the user asks to see the inbox or what waits on them. It does not open the Inbox tab; the user opens that from the side panel.'

export const VIEW_DESCRIPTION =
  'For the Inbox tab only: what the tab shows for this conversation, or its demo. Do not call it; to tell the user what waits on them, call inbox.'

/** What the `inbox` tool tells Codex: the count, one line per row that counts, and where to act on them. */
export function inboxToolText(v: InboxView): string {
  const isOpen = (r: RowView) => r.state.is === 'open'
  const groups: [string, RowView[]][] = [
    ['Questions:', v.needsYou.questions.filter(isOpen)],
    ['Tasks:', v.needsYou.tasks.filter(isOpen)],
    ['Findings:', v.findings.rows.filter(isOpen)],
  ]
  const needs = v.needsYou.count
  const findings = v.findings.count
  if (needs === 0 && findings === 0) return 'Nothing waits on the user.'
  const counts = [
    needs > 0 ? `${needs} ${needs === 1 ? 'waits' : 'wait'} on the user` : null,
    findings > 0 ? (findings === 1 ? '1 finding' : `${findings} findings`) : null,
  ].filter(x => x !== null)
  const out = [counts.join(' · ')]
  for (const [title, rows] of groups) {
    if (rows.length === 0) continue
    out.push(title)
    for (const r of rows) out.push(rowLine(r))
  }
  out.push('Open the Inbox tab to act on these.')

  return out.join('\n')
}

function rowLine(r: RowView): string {
  if (r.finding) return `${r.handle} [${r.id}] ${r.finding.kind}: ${r.title}`
  const item = r.item
  const options = item && item.options.length > 0 ? `; options: ${item.options.join(' / ')}` : ''
  const rec = item?.rec ? `; recommended: ${item.rec}` : ''

  return `${r.handle} [${r.id}] "${r.title}"${options}${rec}`
}

export const START_TITLE =
  'inbox: where this session stands, as of the last reply. An "inbox:" text beside a later prompt replaces this.'
