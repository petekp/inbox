import { EMPTY_STATUS_TEXT } from '../hooks/empty-tab'
import { mergedLine, STALL_GAP, WAS_PREFIX } from '../hooks/status-page'
import type { StatusPage, StatusRow, StatusStall } from '../hooks/status-page'
import type { MilestoneRow } from '../hooks/status-goal-page'
import { LATER_TEXT, milestoneRows } from '../hooks/status-path'

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
    case 'fold':
      return [`${pad}${r.mark} ${r.text}`]
    case 'done-fold':
      return [`${pad}▸ ${r.text}`]
    case 'part':
      return [`── ${r.text}`]
    case 'counts':
      return [`${pad}${r.counts.map(c => `${c.mark} ${c.text}`).join(STALL_GAP)}`]
  }
}

/**
 * A milestone in the goal's path: the Later label above the first one under Later, its word after an arrow, and ▸ after
 * a done milestone folded to its name, whose rows stay folded.
 */
function milestoneText(m: MilestoneRow): string[] {
  const word = m.word ? `  ← ${m.word}` : ''
  const fold = m.foldId ? ' ▸' : ''

  return [
    ...(m.startsLater ? [LATER_TEXT] : []),
    `${m.mark} ${nameLine(m.name, m.stall)}${fold}${word}`,
    ...(m.text ? [`  ${m.text}`] : []),
    ...milestoneRows(m, () => false).flatMap(rowText),
  ]
}

/** The goal with its Now line and its milestones, each with its rows under it, in the order the looks draw them. */
function goalText(page: StatusPage): string[] {
  const g = page.goal
  const goal = g
    ? [
        g.label,
        g.text,
        ...(g.was ? [`${WAS_PREFIX}${g.was}`] : []),
        ...(g.now ? [g.now] : []),
        ...(g.awaiting ? [g.awaiting] : []),
        ...g.milestones.flatMap(milestoneText),
      ]
    : []

  return goal
}

/** The Status page as plain text, in the order every look draws it, with no styling. */
export function pageText(page: StatusPage): string {
  if (page.isEmpty) return `${EMPTY_STATUS_TEXT.title}\n${EMPTY_STATUS_TEXT.hint}`

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
