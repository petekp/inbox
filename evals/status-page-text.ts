import { EMPTY_STATUS_TEXT } from '../core/view/empty-tab'
import { countsText } from '../core/view/status-folds'
// The judge's checks quote a Prev line by its word alone, as `Prev: …`, so the page text leaves out the mark.
import { WAS_LABEL } from '../core/view/status-page'
import { mergedLine, STALL_GAP } from '../core/view/status-page-parts'
import type { StatusPage, StatusRow, StatusStall } from '../core/view/status-page'
import type { MilestoneRow } from '../core/view/status-goal-page'
import { milestoneRows } from '../core/view/status-folds'
import { LATER_TEXT } from '../core/view/status-path'

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
        ...(r.was ? [`${pad}  ${WAS_LABEL}${r.was}`] : []),
      ]
    }
    case 'child': {
      const branch = r.branch === null ? '  ' : `${'  '.repeat(r.depth - 1)}  ${r.branch === 'last' ? '└' : '├'} `
      return [`${branch}${r.mark} ${r.name}`]
    }
    case 'more':
      return [r.branch === null ? `  ${r.text}` : `${'  '.repeat(r.depth - 1)}  └ ${r.text}`]
    case 'fold':
      return [`${pad}${r.mark} ${r.text}`]
    case 'done-fold':
      return [`${pad}› ${r.text}`]
    case 'part':
      return [r.text === null ? '──' : `── ${r.text}`, ...(r.description ? [r.description] : [])]
    case 'counts':
      return [`${pad}${countsText(r.counts)} ›`]
  }
}

/**
 * A milestone in the goal's path: the Later label above the first one under Later, and › after
 * a done milestone folded to its name, whose rows stay folded.
 */
function milestoneText(m: MilestoneRow): string[] {
  const fold = m.foldId ? ' ›' : ''

  return [
    ...(m.startsLater ? [LATER_TEXT] : []),
    `${m.mark} ${nameLine(m.name, m.subject?.stall ?? null)}${fold}`,
    ...(m.text ? [`  ${m.text}`] : []),
    ...(m.subject?.merged ? [`  ${mergedLine(m.subject.merged, () => true)}`] : []),
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
        ...(g.was ? [`${WAS_LABEL}${g.was}`] : []),
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

  const goal = goalText(page)

  return [
    ...goal,
    ...(page.rows.length > 0 ? ['', ...page.rows.flatMap(rowText)] : []),
    ...(page.sync.is === 'stale' && page.sync.why === 'failed' && page.syncText ? ['', page.syncText] : []),
  ].join('\n')
}
