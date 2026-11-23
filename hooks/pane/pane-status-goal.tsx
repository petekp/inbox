import type { PaneBase, PaneHandlers } from './pane-context'
import type { KeyAction } from './pane-keys'
import type { PaneRowFrame } from './pane-row-frame'
import type { PaneRowKeys } from './pane-row-keys'
import type { PaneRowLines } from './pane-row-lines'
import { DESKTOP_CELL_PT, DESKTOP_HAIR_LINES, DESKTOP_MARK_CELLS, desktopPad } from './pane-sizes'
import { milestonePadPt, milestoneRowPads } from '../../core/view/status-gaps'
import { paneMilestoneSpace } from './pane-status-milestone-space'
import { desktopButtonPt, desktopTextPt } from './desktop-metrics'
import { cellWidth } from '../../core/domain/text'
import {
  DESKTOP_BUTTON_LINES,
  desktopFrameLines,
  desktopTextLines,
  exactly,
  inkLines,
  stackedIn,
} from './pane-status-tops'
import type { Drawn } from './pane-status-tops'
import type { PaneStatusLines } from './pane-status-lines'
import type { PaneStatusPath } from './pane-status-path'
import type { GoalBlock, MilestoneRow } from '../../core/view/status-goal-page'
import { GOAL_HEADING, NO_GOAL_TEXT, shownMilestones, suggestedGoalOffer } from '../../core/view/status-goal-page'
import { paneGoalField, uncounted } from './pane-status-goal-field'
import { GOAL_KEYS_ID, goalKeyGroups, milestoneKeyPlan, type StatusKey } from '../../core/view/status-keys'
import type { StatusKeyTarget } from '../../core/view/status-keys'
import type { StatusPage, StatusRow } from '../../core/view/status-page'
import { WAS_PREFIX } from '../../core/view/status-page'
import { mergedLine, nameLevelOf, STALL_GAP, textLevelOf } from '../../core/view/status-page-parts'
import { levelSpan } from './terminal-text'
import { isParentCollapsed, milestoneRows } from '../../core/view/status-folds'
import type { IsCollapsed } from '../../core/view/status-folds'
import type { PaneStatusParent } from './pane-status-parent'
import { workJoints } from '../../core/view/status-path'

/** One line of the Status list, as `paneStatus` draws it, so milestones line up with subjects. */
type StatusRowLine = (line: {
  key: string
  mark: JSX.Element | null
  content: Drawn[]
  isSelected?: boolean
  padY?: number
}) => Drawn

/** The goal and its milestones, and the goal's text field, in the terminal and desktop looks. */
export function paneStatusGoal(
  {
    e,
    look,
    Box,
    Text,
    pal,
    Input,
    typing,
    drafts,
    listColumns,
    statusKeyRow,
    statusMarkAt,
    statusNameLine,
    statusPageText,
    statusTextWidth,
    desktopBlockWidth,
    fitsStatusLine,
    markGlyph,
    markWidth,
    keyRow,
    terminalKeyCells,
    desktopFrame,
  }: Pick<
    PaneBase,
    'e' | 'look' | 'Box' | 'Text' | 'pal' | 'Input' | 'typing' | 'drafts' | 'listColumns' | 'statusKeyRow'
  > &
    Pick<
      PaneStatusLines,
      'statusMarkAt' | 'statusNameLine' | 'statusPageText' | 'statusTextWidth' | 'desktopBlockWidth' | 'fitsStatusLine'
    > &
    Pick<PaneRowLines, 'markGlyph' | 'markWidth'> &
    Pick<PaneRowKeys, 'keyRow' | 'terminalKeyCells'> &
    Pick<PaneRowFrame, 'desktopFrame'>,
  handlers: Pick<PaneHandlers, 'editDraft' | 'closeField' | 'sendTyped'>,
  {
    statusRowLine,
    drawRows,
    keysRow,
    statusKeys,
    statusPartLine,
    isUnfolded,
    isCollapsed,
    parentName,
    path,
    seenTops,
  }: {
    statusRowLine: StatusRowLine
    /** Each subject `r` stands for, with its first line in a row padded `padY` above. */
    seenTops: (r: StatusRow, padY: number) => Drawn['tops']
    statusKeys: (t: StatusKeyTarget) => KeyAction[]
    /** Draws rows as given, with no fold opened. */
    drawRows: (rows: StatusRow[], pads?: { above: number; below: number }[]) => Drawn[]
    keysRow: (t: StatusKeyTarget, width: number) => Drawn[]
    statusPartLine: (id: string, text: string, isFirst: boolean) => Drawn
    isUnfolded: (id: string) => boolean
    isCollapsed: IsCollapsed
    parentName: PaneStatusParent['parentName']
    path: PaneStatusPath
  },
) {
  const isTypingGoal = Input !== null && typing === GOAL_KEYS_ID
  /** Lines at the head's column. The terminal marks the selected block with the selection color, as it does a row. */
  const block = (key: string, parts: Drawn[], isSelected = false): Drawn => {
    const children = parts.map(p => p.el)
    const frame: Drawn[] = look === 'desktop' ? [{ el: <Box key={`${key}-frame`} />, lines: desktopFrameLines(0) }] : []

    return stackedIn(
      look === 'desktop' ? (
        desktopFrame({ key, padY: 0, markCells: 0, hasSide: false, children })
      ) : (
        <Box
          key={key}
          flexDirection="column"
          paddingLeft={statusMarkAt}
          backgroundColor={isSelected ? pal.selection : undefined}
        >
          {children}
        </Box>
      ),
      [...parts, ...frame],
    )
  }
  /** The width of a block's text: the list's columns past the head's column, or its points on desktop. */
  const blockWidth = look === 'desktop' ? desktopBlockWidth : listColumns - statusMarkAt
  /**
   * How far a marked goal's lines sit in from the head's column: the mark column's width, so they start where a
   * milestone's name does. Cells in both looks.
   */
  const markInset = look === 'desktop' ? DESKTOP_MARK_CELLS + 1 : markWidth
  /** The width of the text under a marked goal's heading, in the text column. */
  const insetWidth = look === 'desktop' ? statusTextWidth(0) : blockWidth - markWidth
  /** Text Claude Code or desktop wraps in a block `width` wide. */
  const wrapped = (el: JSX.Element, text: string, width = blockWidth): Drawn => ({
    el,
    lines: look === 'desktop' ? desktopTextLines(text, width) : inkLines(text, width),
  })
  const muted = (key: string, text: string, width = blockWidth) =>
    wrapped(
      <Box key={key}>
        <Text wrap="wrap" color={pal.muted}>
          {text}
        </Text>
      </Box>,
      text,
      width,
    )
  const keysLine = (target: StatusKeyTarget) => keysRow(target, blockWidth)
  const isSelected = (id: string) => look === 'terminal' && !isTypingGoal && statusKeyRow?.id === id
  const { field } = paneGoalField({ e, look, Box, Input, drafts, listColumns, statusMarkAt, keyRow }, handlers, muted)
  /**
   * The suggested goal's offer in the goal text's place, drawn as the goal's text is, with its buttons
   * inline after it. When they do not fit on the offer's line, they sit on a line under it.
   */
  const offerLines = (text: string, offerKeys: StatusKey[], width: number): Drawn[] => {
    const offer = suggestedGoalOffer(text)
    const offerText = (
      <Text wrap="wrap" bold>
        {offer}
      </Text>
    )
    const offerBlock = () => wrapped(<Box key="goal-offer">{offerText}</Box>, offer, width)
    if (offerKeys.length === 0) return [offerBlock()]
    const inlineKeys = statusKeys({ id: GOAL_KEYS_ID, keys: offerKeys })
    const offerWidth = look === 'desktop' ? desktopTextPt(offer) : cellWidth(offer)
    const gap = look === 'desktop' ? desktopTextPt(STALL_GAP) : cellWidth(STALL_GAP)
    if (offerWidth + gap + keysWidth(inlineKeys) <= width)
      return [
        {
          el: (
            <Box key="goal-offer" flexDirection="row" alignItems="center">
              {offerText}
              <Box flexShrink={0} marginLeft={1}>
                {headingKeys(inlineKeys)}
              </Box>
            </Box>
          ),
          lines: look === 'desktop' ? { least: 1, most: DESKTOP_BUTTON_LINES } : exactly(1),
        },
      ]

    return [offerBlock(), ...keysRow({ id: GOAL_KEYS_ID, keys: offerKeys }, width)]
  }
  const { spaceAboveOf, laterLines } = paneMilestoneSpace({ look, Box, statusPartLine, isUnfolded, isCollapsed })
  /** A milestone frame's padding above and below on desktop: half of its own gap, as a subject with no neighbor pads. */
  const milestonePad = (m: MilestoneRow) => desktopPad(milestonePadPt(m))
  /** A frame's padding and 1 pt border above its first line on desktop, where a tree or path line starts. */
  const edgeOf = (padY: number) => padY + 2 * DESKTOP_HAIR_LINES
  /**
   * The milestone's line: its mark, then its name, or the fold of a done milestone folded to its name. A subject drawn
   * in its place adds what a subject's row draws.
   */
  const milestoneLine = (m: MilestoneRow): Drawn => {
    const x = m.subject
    const mark = markGlyph(
      { text: m.mark, isRunning: x?.isRunning ?? false },
      m.id,
      m.tone ? pal.mark[m.tone] : pal.muted,
    )
    if (m.foldId !== null) {
      const fold = path.foldedName(
        { ...m, foldId: m.foldId },
        { text: m.mark, color: (m.tone ? pal.mark[m.tone] : pal.muted) ?? null },
      )
      return look === 'desktop'
        ? fold
        : statusRowLine({ key: `status-${m.id}`, mark, content: [fold], isSelected: isSelected(m.id) })
    }
    const name = {
      ...levelSpan(m.name, nameLevelOf(m, m.isMuted ? 'muted' : 'plain')),
      ...(m.isBold ? { bold: true as const } : {}),
    }

    const isFolded = isParentCollapsed(m, isCollapsed)
    const stall = x?.stall ?? null
    const line = statusRowLine({
      key: `status-${m.id}`,
      mark,
      padY: milestonePad(m),
      content: [
        m.foldCount > 0
          ? parentName(m.id, name, stall, 0, { isCollapsed: isFolded, count: m.foldCount })
          : statusNameLine(`goal-${m.id}-name`, name, stall, 0),
        ...(x?.waitsOn ? [statusPageText(`goal-${m.id}-waits-on`, [{ text: x.waitsOn, isNeedsYou: true }], 0)] : []),
        ...(m.text ? [statusPageText(`goal-${m.id}-text`, [levelSpan(m.text, textLevelOf(m))], 0)] : []),
        ...(x?.merged
          ? [
              statusPageText(
                `goal-${m.id}-merged`,
                [{ text: mergedLine(x.merged, fitsStatusLine(0)), isMuted: true }],
                0,
              ),
            ]
          : []),
        ...(m.was ? [statusPageText(`goal-${m.id}-was`, [{ text: `${WAS_PREFIX}${m.was}`, isMuted: true }], 0)] : []),
        ...keysLine({ id: m.id, keys: milestoneKeyPlan(m) }),
      ],
      isSelected: isSelected(m.id),
    })

    return x ? { ...line, tops: seenTops(x, milestonePad(m)) } : line
  }
  /**
   * A milestone, then on the next line the work that serves it, one step in, each row joined to the milestone's mark
   * column by the nesting connector or by the path's line.
   */
  const milestoneLines = (m: MilestoneRow): Drawn[] => {
    const rows = milestoneRows(m, isUnfolded, isCollapsed)
    const joints = workJoints(rows, m.line)
    const line = milestoneLine(m)
    const isConnectorDown = rows.length > 0 && m.line === null
    const pads = milestoneRowPads(m, rows)

    const shown = isConnectorDown
      ? path.connectorDown(`goal-${m.id}-down`, line, edgeOf(milestonePad(m)))
      : m.line !== null
        ? path.lineBeside(`goal-${m.id}-line`, m.line, line)
        : line

    return [
      shown,
      ...drawRows(rows, pads).map((d, n) => {
        const joint = joints[n]
        const edge = edgeOf(desktopPad(pads[n]?.above ?? 0))
        return joint ? path.jointed(`goal-${rows[n]?.id}-joint`, d, joint, edge) : d
      }),
    ]
  }
  /**
   * The milestones in path order. The space under a milestone the path's line leaves from is part of its group, so the
   * line runs through it. The Later label sits above the first milestone under Later.
   */
  const milestoneSection = (milestones: MilestoneRow[]): Drawn[] => {
    return milestones.flatMap((m, n) => {
      const hasLineAbove = (milestones[n - 1]?.line ?? null) !== null
      const isLaterNext = look === 'desktop' && milestones[n + 1]?.startsLater === true
      const pathLine = m.line
      const under =
        pathLine !== null && n + 1 < milestones.length && !isLaterNext
          ? spaceAboveOf(milestones, n + 1).map(g => path.lineBeside(`goal-${m.id}-under`, pathLine, g, 0))
          : []
      const above = m.startsLater
        ? laterLines(milestones, n, hasLineAbove)
        : hasLineAbove
          ? []
          : spaceAboveOf(milestones, n)

      return [
        ...above,
        ...path.pathGroup(`goal-${m.id}-path`, m.line, [...milestoneLines(m), ...under], edgeOf(milestonePad(m))),
      ]
    })
  }

  /** A cell's width in the units a heading measures in: one cell in the terminal, its points on desktop. */
  const markCellWidth = look === 'desktop' ? DESKTOP_CELL_PT : 1
  /** The cells the terminal draws `keys` in on one line, `STALL_GAP` between them, or the points desktop draws them in. */
  const keysWidth = (keys: KeyAction[]) =>
    look === 'desktop'
      ? keys.reduce((n, k) => n + desktopButtonPt(k.label, true), (keys.length - 1) * desktopTextPt(STALL_GAP))
      : keys.reduce((n, k) => n + terminalKeyCells(k), (keys.length - 1) * cellWidth(STALL_GAP))
  /** The goal's buttons with a dim `STALL_GAP` between them, as the old "Goal · Edit" line drew them. */
  const headingKeys = (keys: KeyAction[]) => (
    <Box flexDirection="row" alignItems="center">
      {keys.flatMap((k, n) => [
        ...(n > 0
          ? [
              <Text key={`goal-key-gap-${n}`} color={pal.muted}>
                {STALL_GAP}
              </Text>,
            ]
          : []),
        <Box key={`goal-key-${k.key}`} flexShrink={0}>
          {keyRow(GOAL_KEYS_ID, [k])}
        </Box>,
      ])}
    </Box>
  )
  /** A rule between the heading's title and its buttons, filling the room left. The selection color hides the divider's, so a selected heading's rule is muted. */
  const headingRule = (key: string, cells: number) =>
    look === 'desktop' ? (
      <Box key={key} flexGrow={1} marginX={1} height={DESKTOP_HAIR_LINES} backgroundColor={pal.divider} />
    ) : (
      <Text key={key} color={isSelected(GOAL_KEYS_ID) ? pal.muted : pal.divider}>
        {` ${'─'.repeat(Math.max(4, cells))}`}
      </Text>
    )
  /**
   * The goal's heading row: its title, a rule, then the goal's buttons at the right edge. When the buttons do not fit
   * beside the title with a short rule, the rule runs to the edge and the buttons wrap under it, still at the right.
   */
  const goalHeading = (label: string, keys: KeyAction[], mark: GoalBlock['mark']): Drawn[] => {
    const markCells = mark === null ? 0 : markInset
    const titleWidth = (look === 'desktop' ? desktopTextPt(label) : cellWidth(label)) + markCells * markCellWidth
    const minRule = look === 'desktop' ? 4 * DESKTOP_CELL_PT : 6
    const isBeside = keys.length > 0 && titleWidth + minRule + keysWidth(keys) <= blockWidth
    const row = (cells: number, withKeys: boolean): JSX.Element => (
      <Box key={withKeys ? 'goal-heading' : 'goal-heading-title'} flexDirection="row" alignItems="center">
        {mark === null ? null : (
          <Box width={markCells} flexShrink={0}>
            {markGlyph(
              { text: mark.mark, isRunning: false },
              GOAL_KEYS_ID,
              mark.tone ? pal.mark[mark.tone] : pal.muted,
            )}
          </Box>
        )}
        <Text color={mark?.tone ? pal.mark[mark.tone] : pal.muted}>{label}</Text>
        {headingRule('goal-heading-rule', cells)}
        {withKeys ? (
          <Box flexShrink={0} marginLeft={look === 'terminal' ? 1 : 0}>
            {headingKeys(keys)}
          </Box>
        ) : null}
      </Box>
    )
    if (isBeside)
      return [
        {
          el: row(blockWidth - titleWidth - keysWidth(keys) - 2, true),
          lines: look === 'desktop' ? { least: 1, most: DESKTOP_BUTTON_LINES } : exactly(1),
        },
      ]
    const keysUnder: Drawn[] =
      keys.length === 0
        ? []
        : [
            {
              el: (
                <Box key="goal-heading-keys" flexDirection="row">
                  <Box flexGrow={1} />
                  <Box flexShrink={0}>{headingKeys(keys)}</Box>
                </Box>
              ),
              lines:
                look === 'desktop'
                  ? { least: 1, most: DESKTOP_BUTTON_LINES }
                  : keysWidth(keys) <= blockWidth
                    ? exactly(1)
                    : null,
            },
          ]
    return [{ el: row(blockWidth - titleWidth - 1, false), lines: exactly(1) }, ...keysUnder]
  }
  /**
   * The goal's section, first on every page that is not empty: its heading row with the goal's buttons at its right,
   * then the goal's text with its was, Now and awaiting lines, or the line that says no goal is set, then the
   * milestones, each after a blank line. While the person types a goal, the field and its Cancel take the text's place,
   * and the buttons leave the heading. While the suggested goal shows, its offer takes the text's place with its
   * buttons after it, and the heading keeps only Undo.
   */
  const goalSection = (page: StatusPage): Drawn[] => {
    const g = page.goal
    const mark = g?.mark ?? null
    const width = mark === null ? blockWidth : insetWidth
    const goalText = g
      ? wrapped(
          <Box key="goal-text">
            <Text wrap="wrap" bold>
              {g.text}
            </Text>
          </Box>,
          g.text,
          width,
        )
      : muted('goal-none', NO_GOAL_TEXT)
    const groups = goalKeyGroups(page)
    const keys = isTypingGoal ? [] : statusKeys({ id: GOAL_KEYS_ID, keys: groups.heading })
    const suggestion = page.suggestedGoal
    /** A met goal's lines under its text say nothing about the suggestion drawn in its place. */
    const shownGoal = suggestion === null ? g : null
    const under = [
      ...(isTypingGoal
        ? field(mark === null ? 0 : markInset, page)
        : suggestion !== null
          ? offerLines(suggestion, groups.offer, width)
          : [goalText]),
      ...(shownGoal?.was ? [muted('goal-was', `${WAS_PREFIX}${shownGoal.was}`, width)] : []),
      ...(shownGoal?.now ? [muted('goal-now', shownGoal.now, width)] : []),
      ...(shownGoal?.awaiting ? [muted('goal-awaiting', shownGoal.awaiting, width)] : []),
    ]
    const body = [
      ...goalHeading(g?.label ?? GOAL_HEADING, keys, mark),
      ...(mark === null
        ? under
        : [
            stackedIn(
              <Box key="goal-under" flexDirection="column" paddingLeft={markInset}>
                {under.map(p => p.el)}
              </Box>,
              under,
            ),
          ]),
    ]

    return [
      block(`status-${GOAL_KEYS_ID}`, body, isSelected(GOAL_KEYS_ID)),
      ...milestonesFoldLine(g),
      ...milestoneSection(shownMilestones(g, isUnfolded)),
    ]
  }
  /** The line a met goal's milestones fold into, at the text column, as a done milestone folded to its name draws. */
  const milestonesFoldLine = (g: GoalBlock | null): Drawn[] => {
    const fold = g?.milestonesFold ?? null
    if (fold === null) return []
    const line = path.foldedName({ id: fold.id, foldId: fold.id, name: fold.text })

    return [
      look === 'desktop'
        ? line
        : statusRowLine({ key: `status-${fold.id}`, mark: null, content: [line], isSelected: isSelected(fold.id) }),
    ]
  }
  /** New, the suggested goal and its buttons, or the field they opened, with no frame, for the empty page's centred column. */
  const setGoalBare = (
    setGoal: { keys: StatusKey[]; offerKeys: StatusKey[]; isFieldOpen: boolean; suggestion: string | null },
    page: StatusPage,
  ): Drawn[] =>
    setGoal.isFieldOpen
      ? [
          uncounted(
            <Box key="goal-field-bare" flexDirection="column" width="100%">
              {field(0, page).map(p => p.el)}
            </Box>,
          ),
        ]
      : [
          ...(setGoal.suggestion === null ? [] : offerLines(setGoal.suggestion, setGoal.offerKeys, blockWidth)),
          ...(setGoal.keys.length === 0 ? [] : keysLine({ id: GOAL_KEYS_ID, keys: setGoal.keys })),
        ]
  return { goalSection, setGoalBare, isTypingGoal }
}
