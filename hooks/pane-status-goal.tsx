import type { UiPressArgument } from 'claude-code'
import type { PaneBase, PaneHandlers } from './pane-context'
import type { KeyAction } from './pane-keys'
import { fieldKey, openFields } from './pane-keys'
import type { PaneRowFrame } from './pane-row-frame'
import type { PaneRowKeys } from './pane-row-keys'
import type { PaneRowLines } from './pane-row-lines'
import { paneState } from './mod-state'
import {
  DESKTOP_CELL_PT,
  DESKTOP_FIELD_PT,
  DESKTOP_HAIR_LINES,
  DESKTOP_LINE_PT,
  DESKTOP_MARK_CELLS,
  DESKTOP_REPLY_ROWS,
  fieldRows,
  REPLY_ROWS,
} from './pane-sizes'
import { desktopButtonPt, desktopLines, desktopTextPt } from './desktop-metrics'
import { SECTION_GAP_PT, STATUS_ROW_PAD_PT } from './layout'
import { lineCount } from './terminal-text'
import { cellWidth } from './text'
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
import type { StatusTone } from './help'
import type { GoalBlock, MilestoneRow } from './status-goal-page'
import { GOAL_HEADING, NO_GOAL_TEXT, shownMilestones } from './status-goal-page'
import { GOAL_FIELD, GOAL_KEYS_ID, goalKeyPlan, milestoneKeyPlan, type StatusKey } from './status-keys'
import type { StatusKeyTarget } from './status-keys'
import type { StatusPage, StatusRow } from './status-page'
import { STALL_GAP, WAS_PREFIX } from './status-page'
import { isSpacedAbove, LATER_TEXT, milestoneRows, workJoints } from './status-path'
import { ROW_COPY } from './rows'

/** One line of the Status list, as `paneStatus` draws it, so milestones line up with subjects. */
type StatusRowLine = (line: { key: string; mark: JSX.Element | null; content: Drawn[]; isSelected?: boolean }) => Drawn

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
    now,
    statusKeyRow,
    statusMarkAt,
    statusNameLine,
    statusPageText,
    statusTextWidth,
    desktopBlockWidth,
    markGlyph,
    markWidth,
    keyRow,
    terminalKeyCells,
    desktopFrame,
  }: Pick<
    PaneBase,
    'e' | 'look' | 'Box' | 'Text' | 'pal' | 'Input' | 'typing' | 'drafts' | 'listColumns' | 'now' | 'statusKeyRow'
  > &
    Pick<
      PaneStatusLines,
      'statusMarkAt' | 'statusNameLine' | 'statusPageText' | 'statusTextWidth' | 'desktopBlockWidth'
    > &
    Pick<PaneRowLines, 'markGlyph' | 'markWidth'> &
    Pick<PaneRowKeys, 'keyRow' | 'terminalKeyCells'> &
    Pick<PaneRowFrame, 'desktopFrame'>,
  { updateDrafts, updateTyping, sendTyped }: Pick<PaneHandlers, 'updateDrafts' | 'updateTyping' | 'sendTyped'>,
  {
    statusRowLine,
    drawRows,
    keysRow,
    statusKeys,
    statusPartLine,
    isUnfolded,
    path,
  }: {
    statusRowLine: StatusRowLine
    statusKeys: (t: StatusKeyTarget) => KeyAction[]
    /** Draws rows as given, with no fold opened. */
    drawRows: (rows: StatusRow[]) => Drawn[]
    keysRow: (t: StatusKeyTarget, width: number) => Drawn[]
    statusPartLine: (id: string, text: string, isFirst: boolean) => Drawn
    isUnfolded: (id: string) => boolean
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
  /** An open field's height follows what is typed, so its lines are not counted. */
  const uncounted = (el: JSX.Element): Drawn => ({ el, lines: null })
  const keysLine = (target: StatusKeyTarget) => keysRow(target, blockWidth)
  const isSelected = (id: string) => look === 'terminal' && !isTypingGoal && statusKeyRow?.id === id
  const cancel: KeyAction = {
    key: `cancel-${GOAL_KEYS_ID}`,
    label: 'Cancel',
    kind: 'view',
    onPress: () => void updateTyping(t => (t === GOAL_KEYS_ID ? null : t)),
  }
  const submitLabel = look === 'desktop' ? GOAL_FIELD.submit : 'save'
  /** The terminal draws `⏎` and the submit label beside a field `inset` cells in from the head's column. */
  const terminalFieldColumns = (inset: number) => listColumns - statusMarkAt - inset - cellWidth(`⏎ ${submitLabel}`) - 1
  /** A terminal field that passes one row takes all `REPLY_ROWS`, as the reply field does in `paneRows`. */
  const fieldRowCount = (text: string, inset: number) => {
    if (look === 'desktop')
      return fieldRows(text, line => desktopLines(line, DESKTOP_FIELD_PT).length, DESKTOP_REPLY_ROWS)
    const fitsOneRow = fieldRows(text, line => lineCount(line, terminalFieldColumns(inset)), REPLY_ROWS) === 1
    return fitsOneRow ? 1 : REPLY_ROWS
  }
  const goalInput = (Field: NonNullable<typeof Input>, inset: number) => (
    <Field
      key={fieldKey(GOAL_KEYS_ID)}
      placeholder={GOAL_FIELD.placeholder}
      {...(openFields.get(GOAL_KEYS_ID)?.seed ? { value: openFields.get(GOAL_KEYS_ID)?.seed } : {})}
      submitLabel={submitLabel}
      autoFocus
      rows={fieldRowCount(drafts[GOAL_KEYS_ID]?.text ?? openFields.get(GOAL_KEYS_ID)?.seed ?? '', inset)}
      onInput={(value: string) =>
        void updateDrafts(d => ({
          ...d,
          [GOAL_KEYS_ID]: { text: value, since: d[GOAL_KEYS_ID]?.since ?? now },
        }))
      }
      onSubmit={(value: string, submit: { surface: UiPressArgument['surface'] }) =>
        sendTyped(GOAL_KEYS_ID, value, submit.surface)
      }
    />
  )
  /**
   * The goal's text field, as many rows tall as `fieldRowCount` gives. Submitting sets the typed goal. When the prompt kept the
   * keys, a line under it says to click it.
   */
  const fieldInput = (inset: number): Drawn[] =>
    Input === null
      ? []
      : [
          uncounted(
            look === 'terminal' ? (
              <Box key="goal-field" width={e.props.bodyColumns - inset} flexShrink={0}>
                {goalInput(Input, inset)}
              </Box>
            ) : (
              goalInput(Input, inset)
            ),
          ),
          ...(paneState.fieldWithoutKeys === GOAL_KEYS_ID ? [muted('goal-field-click', ROW_COPY.clickField)] : []),
        ]
  const fieldKeys = (): Drawn[] =>
    Input === null ? [] : [uncounted(<Box key="goal-field-keys">{keyRow(`${GOAL_KEYS_ID}-field`, [cancel])}</Box>)]
  /** The goal's field and its keys, `inset` cells in from the head's column: the mark column under a met goal. */
  const field = (inset: number) => [...fieldInput(inset), ...fieldKeys()]
  /** Marks in their tones, each with its text, on lines that wrap between them, as the Other work counts draw. */
  const markRun = (
    key: string,
    parts: { mark: string; tone: StatusTone; text: string }[],
    gap: string,
    isMuted = false,
  ) => (
    <Box key={key} flexDirection="row" flexWrap="wrap">
      {parts.flatMap((part, n) => [
        ...(n > 0
          ? [
              <Text key={`${key}-gap-${n}`} color={pal.muted}>
                {gap}
              </Text>,
            ]
          : []),
        <Box key={`${key}-${n}`} flexDirection="row" flexShrink={0}>
          {markGlyph({ text: part.mark, isRunning: false }, `${key}-${n}`, part.tone ? pal.mark[part.tone] : pal.muted)}
          <Text color={isMuted ? pal.muted : undefined}>{` ${part.text}`}</Text>
        </Box>,
      ])}
    </Box>
  )
  /**
   * A blank line in the terminal. On desktop, the space Codex leaves there: `SECTION_GAP_PT` under the goal's text, and
   * `STATUS_ROW_PAD_PT` between two milestones, so a milestone's work sits closer to its own name than to the next.
   */
  const gap = (key: string, isUnderGoalText: boolean): Drawn => {
    const height = look === 'terminal' ? 1 : (isUnderGoalText ? SECTION_GAP_PT : STATUS_ROW_PAD_PT) / DESKTOP_LINE_PT

    return { el: <Box key={key} height={height} />, lines: exactly(height) }
  }
  /** The milestone's line: its mark, then its name, or the fold of a done milestone folded to its name. */
  const milestoneLine = (m: MilestoneRow): Drawn => {
    const mark = markGlyph({ text: m.mark, isRunning: false }, m.id, m.tone ? pal.mark[m.tone] : pal.muted)
    if (m.foldId !== null) {
      const fold = path.foldedName({ ...m, foldId: m.foldId })
      return look === 'desktop'
        ? fold
        : statusRowLine({ key: `status-${m.id}`, mark, content: [fold], isSelected: isSelected(m.id) })
    }
    const name = {
      text: m.name,
      ...(m.isChanged ? { bold: true as const } : {}),
      ...(m.isMuted ? { isMuted: true as const } : {}),
    }

    return statusRowLine({
      key: `status-${m.id}`,
      mark,
      content: [
        statusNameLine(`goal-${m.id}-name`, name, m.stall, 0),
        ...path.pathWord(m),
        ...(m.text ? [statusPageText(`goal-${m.id}-text`, [{ text: m.text, isMuted: true }], 0)] : []),
        ...(m.was ? [statusPageText(`goal-${m.id}-was`, [{ text: `${WAS_PREFIX}${m.was}`, isMuted: true }], 0)] : []),
        ...keysLine({ id: m.id, keys: milestoneKeyPlan(m) }),
      ],
      isSelected: isSelected(m.id),
    })
  }
  /**
   * A milestone, then on the next line the work that serves it, one step in, each row joined to the milestone's mark
   * column by the nesting connector or by the path's line.
   */
  const milestoneLines = (m: MilestoneRow): Drawn[] => {
    const rows = milestoneRows(m, isUnfolded)
    const joints = workJoints(rows, m.line)
    const line = milestoneLine(m)
    const isConnectorDown = rows.length > 0 && m.line === null

    return [
      isConnectorDown ? path.connectorDown(`goal-${m.id}-down`, line) : line,
      ...drawRows(rows).map((d, n) => {
        const joint = joints[n]
        return joint ? path.jointed(`goal-${rows[n]?.id}-joint`, d, joint) : d
      }),
    ]
  }
  /**
   * The milestones in path order. The space under a milestone the path's line leaves from is part of its group, so the
   * line runs through it. The Later label sits above the first milestone under Later.
   */
  const milestoneSection = (milestones: MilestoneRow[]): Drawn[] => {
    const spaceAbove = (n: number) =>
      isSpacedAbove(milestones, n, isUnfolded) ? [gap(`goal-${milestones[n]?.id}-gap`, n === 0)] : []

    return milestones.flatMap((m, n) => {
      const hasLineAbove = (milestones[n - 1]?.line ?? null) !== null
      const under = m.line !== null && n + 1 < milestones.length ? spaceAbove(n + 1) : []

      return [
        ...(hasLineAbove ? [] : spaceAbove(n)),
        ...(m.startsLater ? [statusPartLine('goal-later', LATER_TEXT, true)] : []),
        ...path.pathGroup(`goal-${m.id}-path`, m.line, [...milestoneLines(m), ...under]),
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
   * and the buttons leave the heading.
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
    const keys = isTypingGoal ? [] : statusKeys({ id: GOAL_KEYS_ID, keys: goalKeyPlan(page) })
    const under = [
      ...(isTypingGoal ? field(mark === null ? 0 : markInset) : [goalText]),
      ...(g?.was ? [muted('goal-was', `${WAS_PREFIX}${g.was}`, width)] : []),
      ...(g?.now ? [muted('goal-now', g.now, width)] : []),
      ...(g?.awaiting ? [muted('goal-awaiting', g.awaiting, width)] : []),
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
  /** New, or the field it opened, with no frame, for the empty page's centred column. */
  const setGoalBare = (setGoal: { keys: StatusKey[]; isFieldOpen: boolean }): Drawn[] =>
    setGoal.isFieldOpen
      ? [
          uncounted(
            <Box key="goal-field-bare" flexDirection="column" width="100%">
              {field(0).map(p => p.el)}
            </Box>,
          ),
        ]
      : keysLine({ id: GOAL_KEYS_ID, keys: setGoal.keys })
  return { goalSection, setGoalBare, markRun, isTypingGoal }
}
