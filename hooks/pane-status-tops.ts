import type { KeyAction } from './pane-keys'
import {
  GOAL_KEYS_ID,
  goalKeyPlan,
  isGoalKeyInHeader,
  milestoneKeyPlan,
  PROPOSAL_KEYS_ID,
  proposalKeyPlan,
  statusKeyPlan,
} from './status-keys'
import type { StatusKeyTarget } from './status-keys'
import type { MilestoneRow } from './status-goal-page'
import { mergedLine, STALL_GAP, WAS_PREFIX } from './status-page'
import type { StatusPage, StatusRow, StatusStall } from './status-page'
import { unfoldedRows } from './status-page-parts'
import type { TerminalSpan } from './terminal-text'
import { lineCount } from './terminal-text'
import { cellWidth } from './text'

/** Where a Status row's first line sits, from the top of the Status page, or `unknown` when a line above it is not known exactly. */
export type RowTop = number | 'unknown'

/** What the terminal look draws the Status with, so the lines counted here are the lines it draws. */
export type StatusLineCounts = {
  isInline: boolean
  listColumns: number
  statusMarkAt: number
  markWidth: number
  isTypingGoal: boolean
  isUnfolded: (id: string) => boolean
  textWidth: (depth: number) => number
  fitsStatusLine: (depth: number) => (text: string) => boolean
  nameLines: (name: TerminalSpan, stall: StatusStall | null, depth: number) => number
  textLines: (spans: TerminalSpan[], depth: number) => number
  statusKeys: (t: StatusKeyTarget) => KeyAction[]
  keyLines: (keys: KeyAction[], more: KeyAction[], width: number) => number
  keyCells: (k: KeyAction) => number
}

/**
 * The lines Claude Code wraps `text` to in a box `width` wide, or null when that is not known exactly: when the text
 * holds a character wider than one cell, or when one cell less would wrap it differently, since a box's width may
 * differ from the one counted here by a cell.
 */
function inkLines(text: string, width: number): number | null {
  if (cellWidth(text) !== text.length) return null
  const lines = lineCount(text, width)

  return lines === lineCount(text, width - 1) ? lines : null
}

/**
 * Each Status subject row's first line in the terminal look, from the top of the page `paneStatus` draws, by the
 * row's id. It walks the page as `statusView` draws it. A row below anything whose height is not known exactly, such
 * as an open goal field, is `unknown`.
 */
export function statusRowTops(page: StatusPage, c: StatusLineCounts): Map<string, RowTop> {
  const tops = new Map<string, RowTop>()
  if (page.isEmpty) return tops
  let line = 0
  let isKnown = true
  const add = (lines: number | null) => {
    if (lines === null) isKnown = false
    else line += lines
  }
  const blockWidth = c.listColumns - c.statusMarkAt
  /** A key row's lines at `width`, null when one more cell would wrap it differently. */
  const keyRowLines = (t: StatusKeyTarget, width: number): number | null => {
    const keys = c.statusKeys(t)
    if (keys.length === 0) return 0
    const lines = c.keyLines(keys, [], width)
    return lines === c.keyLines(keys, [], width + 1) ? lines : null
  }
  const rowKeyLines = (t: StatusKeyTarget, depth: number) => keyRowLines(t, c.textWidth(depth))
  const muted = (text: string) => inkLines(text, blockWidth)

  const listRow = (r: StatusRow) => {
    if (r.isRuledAbove && !c.isInline) add(1)
    if (r.kind === 'subject') {
      tops.set(r.id, isKnown ? line : 'unknown')
      add(c.nameLines({ text: r.name }, r.stall, r.depth))
      if (r.text) add(c.textLines([{ text: r.text, isMuted: true }], r.depth))
      if (r.merged) add(c.textLines([{ text: mergedLine(r.merged, c.fitsStatusLine(r.depth)) }], r.depth))
      if (r.was) add(c.textLines([{ text: `${WAS_PREFIX}${r.was}` }], r.depth))
      add(rowKeyLines({ id: r.id, keys: statusKeyPlan(r) }, r.depth))
    } else if (r.kind === 'child') add(c.nameLines({ text: r.name }, r.stall, r.depth))
    else if (r.kind === 'look') add(r.isLast ? 2 : 3)
    else if (r.kind === 'part') add(2)
    else if (r.kind === 'more' || r.kind === 'fold' || r.kind === 'done-fold')
      add(inkLines(r.text, c.textWidth(r.depth)))
    else {
      const cells = r.counts.reduce((n, x, i) => n + (i > 0 ? cellWidth(STALL_GAP) : 0) + 2 + cellWidth(x.text), 0)
      add(cells < c.textWidth(r.depth) ? 1 : null)
    }
  }
  const listRows = (rows: StatusRow[]) => unfoldedRows(rows, c.isUnfolded).forEach(listRow)

  const proposal = () => {
    const p = page.proposal
    if (!p) return
    add(muted(p.label))
    add(c.isTypingGoal ? null : inkLines(p.text, blockWidth))
    for (const m of p.milestones) add(c.nameLines({ text: m.name }, null, 0))
    add(c.isTypingGoal ? null : keyRowLines({ id: PROPOSAL_KEYS_ID, keys: proposalKeyPlan(page) }, blockWidth))
  }
  const milestone = (m: MilestoneRow) => {
    add(c.nameLines({ text: m.name }, m.stall, 0))
    if (m.text) add(c.textLines([{ text: m.text, isMuted: true }], 0))
    if (m.was) add(c.textLines([{ text: `${WAS_PREFIX}${m.was}` }], 0))
    add(rowKeyLines({ id: m.id, keys: milestoneKeyPlan(m) }, 0))
    listRows(m.rows)
  }
  const goal = () => {
    const g = page.goal
    if (!g) return
    const isKeyInHeader = isGoalKeyInHeader(page)
    const headerKeys =
      isKeyInHeader && !c.isTypingGoal ? c.statusKeys({ id: GOAL_KEYS_ID, keys: goalKeyPlan(page) }) : []
    const labelCells = headerKeys.reduce((n, k) => n + cellWidth(STALL_GAP) + c.keyCells(k), cellWidth(g.label))
    add(headerKeys.length === 0 ? muted(g.label) : labelCells < blockWidth ? 1 : null)
    const count = g.count ? `${STALL_GAP}${g.count}`.replaceAll(' ', '_') : ''
    add(c.isTypingGoal && !page.proposal ? null : inkLines(`${g.text}${count}`, blockWidth))
    for (const text of [g.was ? `${WAS_PREFIX}${g.was}` : null, g.now, g.awaiting]) if (text) add(muted(text))
    g.milestones.forEach(milestone)
    if (!c.isTypingGoal && !isKeyInHeader) add(keyRowLines({ id: GOAL_KEYS_ID, keys: goalKeyPlan(page) }, blockWidth))
  }
  const head = () => {
    if (page.goal === null && page.head) {
      add(inkLines(page.head.title, blockWidth))
      if (page.head.description) add(inkLines(page.head.description, blockWidth))
    }
    if (page.goal !== null || page.proposal !== null) return
    add(c.isTypingGoal ? null : keyRowLines({ id: GOAL_KEYS_ID, keys: goalKeyPlan(page) }, blockWidth))
  }

  const sectionGap = c.isInline ? 1 : 2
  const goalParts = page.proposal?.isBelowGoal ? [goal, proposal] : [proposal, goal]
  for (const part of [...goalParts, head]) {
    const start = line
    const wasKnown = isKnown
    part()
    if (wasKnown && line > start) add(sectionGap)
  }
  if (page.rows.length > 0) listRows(page.rows)

  return tops
}
