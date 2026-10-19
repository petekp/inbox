import { CLOSE_ID_RULE } from '../../hooks/model-text'
import type { Host } from '../../hooks/model-text'
import type { InboxView, RowView } from '../../hooks/view'

export const CODEX: Host = {
  agent: 'Codex',
  surface: 'the Inbox tab',
  band: null,
  findingsIn: 'the Findings section of the Inbox tab',
  mapIn: 'the Map section of the Inbox tab',
  intro:
    'The inbox plugin shows the user what waits on them: your open questions and the tasks only they can do, and your findings, in the Inbox tab beside the conversation.',
}

export const INBOX_DESCRIPTION =
  'What waits on the user in this conversation: open questions, tasks and findings, as text. Call it only when the user asks to see the inbox or what waits on them. It does not open the Inbox tab; the user opens that from the side panel.'

export const VIEW_DESCRIPTION =
  'For the Inbox tab only: what the tab shows for this conversation, or its demo. Do not call it; to tell the user what waits on them, call inbox.'

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
  const out = [counts.join(' · '), CLOSE_ID_RULE]
  for (const [title, rows] of groups) {
    if (rows.length === 0) continue
    out.push(title)
    for (const r of rows) out.push(rowLine(r))
  }
  out.push('Open the Inbox tab to act on these.')

  return out.join('\n')
}

function rowLine(r: RowView): string {
  if (r.finding) return `${r.handle} ${r.finding.kind}: ${r.title} (close id: ${r.id})`
  const item = r.item
  const options = item && item.options.length > 0 ? `; options: ${item.options.join(' / ')}` : ''
  const rec = item?.rec ? `; recommended: ${item.rec}` : ''

  return `${r.handle} "${r.title}"${options}${rec} (close id: ${r.id})`
}
