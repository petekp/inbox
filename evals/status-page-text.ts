import { LOOK_TEXT, mergedLine, STALL_GAP, WAS_PREFIX } from '../hooks/status-page'
import type { StatusPage, StatusRow, StatusStall } from '../hooks/status-page'

/** A row's name, with its stall word after it. */
function nameLine(name: string, stall: StatusStall | null): string {
  return stall ? `${name}${STALL_GAP}${stall.text}` : name
}

/**
 * A child linked to no row on the page is indented with no branch, so the judge can tell it from a subject row. The
 * looks draw it at a subject's depth.
 */
function rowText(r: StatusRow): string[] {
  switch (r.kind) {
    case 'subject': {
      return [
        `${r.mark} ${nameLine(r.name, r.stall)}`,
        ...(r.text ? [`  ${r.text}`] : []),
        ...(r.merged ? [`  ${mergedLine(r.merged, () => true)}`] : []),
        ...(r.was ? [`  ${WAS_PREFIX}${r.was}`] : []),
      ]
    }
    case 'child': {
      const branch = r.branch === null ? '  ' : r.branch === 'last' ? '  └ ' : '  ├ '
      return [`${branch}${r.mark} ${nameLine(r.name, r.stall)}`]
    }
    case 'more':
      return [`  └ ${r.text}`]
    case 'look':
      return [`── ${LOOK_TEXT}`]
    case 'fold':
      return [`${r.mark} ${r.text}`]
    case 'part':
      return [`── ${r.text}`]
    case 'counts':
      return [r.counts.map(c => `${c.mark} ${c.text}`).join(STALL_GAP)]
  }
}

/** The goal and its milestones, and a proposal, above the head, in the order the looks draw them. */
function goalText(page: StatusPage): string[] {
  const p = page.proposal
  const proposal = p ? [p.label, p.text, ...p.milestones.map(m => `${m.mark} ${m.name}`)] : []
  const g = page.goal
  const goal = g
    ? [
        g.label,
        g.count ? `${g.text}${STALL_GAP}${g.count}` : g.text,
        ...(g.was ? [`${WAS_PREFIX}${g.was}`] : []),
        ...(g.awaiting ? [g.awaiting] : []),
        ...g.milestones.flatMap(m => [`${m.mark} ${nameLine(m.name, m.stall)}`, ...(m.text ? [`  ${m.text}`] : [])]),
      ]
    : []

  const parts = p?.isBelowGoal ? [goal, proposal] : [proposal, goal]

  return parts.filter(lines => lines.length > 0).flatMap((lines, n) => (n > 0 ? ['', ...lines] : lines))
}

/** The Status page as plain text, in the order every look draws it, with no styling. */
export function pageText(page: StatusPage): string {
  if (page.isEmpty) return `${page.empty.title}\n${page.empty.hint}`

  const head = page.nowLine
    ? [page.nowLine]
    : page.head
      ? [page.head.title, ...(page.head.description ? [page.head.description] : [])]
      : []
  const goal = goalText(page)

  return [
    ...goal,
    ...(goal.length > 0 ? [''] : []),
    ...head,
    '',
    ...page.rows.flatMap(rowText),
    ...(page.error ? ['', page.error] : []),
  ].join('\n')
}
