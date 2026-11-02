import { LOOK_TEXT, mergedLine, STALL_GAP, WAS_PREFIX } from '../hooks/status-page'
import type { StatusPage, StatusRow, StatusStall } from '../hooks/status-page'

/** A row's name, with its stall word after it. */
function nameLine(name: string, stall: StatusStall | null): string {
  return stall ? `${name}${STALL_GAP}${stall.text}` : name
}

/**
 * Each step of a row's depth indents it two spaces, so a row under a milestone sits under the milestone's text. A child
 * linked to no row on the page is indented with no branch, so the judge can tell it from a subject row. The looks draw
 * it at a subject's depth.
 */
function rowText(r: StatusRow): string[] {
  const pad = '  '.repeat(r.depth)
  switch (r.kind) {
    case 'subject': {
      return [
        `${pad}${r.mark} ${nameLine(r.name, r.stall)}`,
        ...(r.text ? [`${pad}  ${r.text}`] : []),
        ...(r.merged ? [`${pad}  ${mergedLine(r.merged, () => true)}`] : []),
        ...(r.was ? [`${pad}  ${WAS_PREFIX}${r.was}`] : []),
      ]
    }
    case 'child': {
      const branch = r.branch === null ? '  ' : `${'  '.repeat(r.depth - 1)}  ${r.branch === 'last' ? '└' : '├'} `
      return [`${branch}${r.mark} ${nameLine(r.name, r.stall)}`]
    }
    case 'more':
      return [`${'  '.repeat(r.depth - 1)}  └ ${r.text}`]
    case 'look':
      return [`${pad}── ${LOOK_TEXT}`]
    case 'fold':
      return [`${pad}${r.mark} ${r.text}`]
    case 'part':
      return [`── ${r.text}`]
    case 'counts':
      return [`${pad}${r.counts.map(c => `${c.mark} ${c.text}`).join(STALL_GAP)}`]
  }
}

/** The goal with its Now line and its milestones, each with its rows under it, and a proposal, in the order the looks draw them. */
function goalText(page: StatusPage): string[] {
  const p = page.proposal
  const proposal = p ? [p.label, p.text, ...p.milestones.map(m => `${m.mark} ${m.name}`)] : []
  const g = page.goal
  const goal = g
    ? [
        g.label,
        g.count ? `${g.text}${STALL_GAP}${g.count}` : g.text,
        ...(g.was ? [`${WAS_PREFIX}${g.was}`] : []),
        ...(g.now ? [g.now] : []),
        ...(g.awaiting ? [g.awaiting] : []),
        ...g.milestones.flatMap(m => [
          `${m.mark} ${nameLine(m.name, m.stall)}`,
          ...(m.text ? [`  ${m.text}`] : []),
          ...m.rows.flatMap(rowText),
        ]),
      ]
    : []

  const parts = p?.isBelowGoal ? [goal, proposal] : [proposal, goal]

  return parts.filter(lines => lines.length > 0).flatMap((lines, n) => (n > 0 ? ['', ...lines] : lines))
}

/** The Status page as plain text, in the order every look draws it, with no styling. */
export function pageText(page: StatusPage): string {
  if (page.isEmpty) return `${page.empty.title}\n${page.empty.hint}`

  const head =
    page.goal === null && page.head ? [page.head.title, ...(page.head.description ? [page.head.description] : [])] : []
  const goal = goalText(page)

  return [
    ...goal,
    ...(goal.length > 0 && head.length > 0 ? [''] : []),
    ...head,
    ...(page.rows.length > 0 ? ['', ...page.rows.flatMap(rowText)] : []),
    ...(page.error ? ['', page.error] : []),
  ].join('\n')
}
