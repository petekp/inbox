// The rows the Inbox tab sees for the first time in a poll, which draw a bar
// for NEW_ROW_MS, and the tab it moves to for them. The mod's followNewRows
// follows the same rules. Pure, so tests can run them without the tab's page.

import type { InboxView } from '../../hooks/view'

export type Tab = 'needsYou' | 'findings'

export const TAB_IDS: Tab[] = ['needsYou', 'findings']

/** The row ids the tab has seen in each tab, or null before its first view. */
export type SeenRows = Record<Tab, ReadonlySet<string>> | null

/** Each tab's row ids in a view, settled rows included, so a row Undo brings back is not new. */
function listedIds(v: InboxView): Record<Tab, string[]> {
  return {
    needsYou: [...v.needsYou.questions, ...v.needsYou.tasks].map(r => r.id),
    findings: v.findings.rows.map(r => r.id),
  }
}

/** Records a view's rows, and returns by tab the ids the tab had not seen. The first view adds none. */
export function newRows(seen: SeenRows, v: InboxView): { seen: SeenRows; added: Record<Tab, string[]> } {
  const listed = listedIds(v)

  return {
    seen: { needsYou: new Set(listed.needsYou), findings: new Set(listed.findings) },
    added: {
      needsYou: seen ? listed.needsYou.filter(id => !seen.needsYou.has(id)) : [],
      findings: seen ? listed.findings.filter(id => !seen.findings.has(id)) : [],
    },
  }
}

/**
 * Where the tab moves for rows that just appeared: to the other tab, while the
 * tab on screen shows only its empty text, with the first new row there that
 * can open, or null when it has none. Null when the tab stays.
 */
export function followTo(
  shown: Tab,
  isShownEmpty: boolean,
  added: Record<Tab, string[]>,
  selectable: Record<Tab, string[]>,
): { tab: Tab; id: string | null } | null {
  const to = isShownEmpty ? TAB_IDS.find(t => t !== shown && added[t].length > 0) : undefined
  if (!to) return null

  return { tab: to, id: selectable[to].find(id => added[to].includes(id)) ?? null }
}
