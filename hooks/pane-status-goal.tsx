import type { UiPressArgument } from 'claude-code'
import type { PaneBase, PaneHandlers } from './pane-context'
import type { KeyAction } from './pane-keys'
import { fieldKey, openFields } from './pane-keys'
import type { PaneRowFrame } from './pane-row-frame'
import type { PaneRowKeys } from './pane-row-keys'
import type { PaneRowLines } from './pane-row-lines'
import { paneState } from './mod-state'
import { DESKTOP_FIELD_PT, DESKTOP_LINE_PT, DESKTOP_REPLY_ROWS, fieldRows, REPLY_ROWS } from './pane-sizes'
import { desktopLines } from './desktop-metrics'
import { LOOK_GAP_PT } from './layout'
import { lineCount } from './terminal-text'
import { cellWidth } from './text'
import { desktopFrameLines, desktopTextLines, exactly, inkLines, stackedIn } from './pane-status-tops'
import type { Drawn } from './pane-status-tops'
import type { PaneStatusLines } from './pane-status-lines'
import type { StatusTone } from './help'
import type { MilestoneRow } from './status-goal-page'
import { GOAL_HEADING, NO_GOAL_TEXT } from './status-goal-page'
import { GOAL_FIELD, GOAL_KEYS_ID, goalKeyPlan, milestoneKeyPlan } from './status-keys'
import type { StatusKeyTarget } from './status-keys'
import type { StatusPage, StatusRow } from './status-page'
import { STALL_GAP, WAS_PREFIX } from './status-page'
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
    desktopBlockWidth,
    markGlyph,
    keyRow,
    desktopFrame,
  }: Pick<
    PaneBase,
    'e' | 'look' | 'Box' | 'Text' | 'pal' | 'Input' | 'typing' | 'drafts' | 'listColumns' | 'now' | 'statusKeyRow'
  > &
    Pick<PaneStatusLines, 'statusMarkAt' | 'statusNameLine' | 'statusPageText' | 'desktopBlockWidth'> &
    Pick<PaneRowLines, 'markGlyph'> &
    Pick<PaneRowKeys, 'keyRow'> &
    Pick<PaneRowFrame, 'desktopFrame'>,
  { updateDrafts, updateTyping, sendTyped }: Pick<PaneHandlers, 'updateDrafts' | 'updateTyping' | 'sendTyped'>,
  {
    statusRowLine,
    statusRows,
    keysRow,
    statusPartLine,
  }: {
    statusRowLine: StatusRowLine
    statusPartLine: (id: string, text: string, isGoal?: boolean) => Drawn
    statusRows: (rows: StatusRow[]) => Drawn[]
    keysRow: (t: StatusKeyTarget, width: number) => Drawn[]
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
  /** Text Claude Code or desktop wraps in a block. */
  const wrapped = (el: JSX.Element, text: string): Drawn => ({
    el,
    lines: look === 'desktop' ? desktopTextLines(text, blockWidth) : inkLines(text, blockWidth),
  })
  const muted = (key: string, text: string) =>
    wrapped(
      <Box key={key}>
        <Text wrap="wrap" color={pal.muted}>
          {text}
        </Text>
      </Box>,
      text,
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
  const submitLabel = look === 'desktop' ? GOAL_FIELD.submit : 'set'
  /** The terminal draws `⏎` and the submit label beside the field. */
  const terminalFieldColumns = listColumns - statusMarkAt - cellWidth(`⏎ ${submitLabel}`) - 1
  /** A terminal field that passes one row takes all `REPLY_ROWS`, as the reply field does in `paneRows`. */
  const fieldRowCount = (text: string) => {
    if (look === 'desktop')
      return fieldRows(text, line => desktopLines(line, DESKTOP_FIELD_PT).length, DESKTOP_REPLY_ROWS)
    const fitsOneRow = fieldRows(text, line => lineCount(line, terminalFieldColumns), REPLY_ROWS) === 1
    return fitsOneRow ? 1 : REPLY_ROWS
  }
  const goalInput = (Field: NonNullable<typeof Input>) => (
    <Field
      key={fieldKey(GOAL_KEYS_ID)}
      placeholder={GOAL_FIELD.placeholder}
      {...(openFields.get(GOAL_KEYS_ID)?.seed ? { value: openFields.get(GOAL_KEYS_ID)?.seed } : {})}
      submitLabel={submitLabel}
      autoFocus
      rows={fieldRowCount(drafts[GOAL_KEYS_ID]?.text ?? openFields.get(GOAL_KEYS_ID)?.seed ?? '')}
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
  const fieldInput = (): Drawn[] =>
    Input === null
      ? []
      : [
          uncounted(
            look === 'terminal' ? (
              <Box key="goal-field" width={e.props.bodyColumns} flexShrink={0}>
                {goalInput(Input)}
              </Box>
            ) : (
              goalInput(Input)
            ),
          ),
          ...(paneState.fieldWithoutKeys === GOAL_KEYS_ID ? [muted('goal-field-click', ROW_COPY.clickField)] : []),
        ]
  const fieldKeys = (): Drawn[] =>
    Input === null ? [] : [uncounted(<Box key="goal-field-keys">{keyRow(`${GOAL_KEYS_ID}-field`, [cancel])}</Box>)]
  const field = () => [...fieldInput(), ...fieldKeys()]
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
  /** A milestone, then the work that serves it, one step in. */
  const milestoneLines = (m: MilestoneRow): Drawn[] => [
    statusRowLine({
      key: `status-${m.id}`,
      mark: markGlyph({ text: m.mark, isRunning: false }, m.id, m.tone ? pal.mark[m.tone] : pal.muted),
      content: [
        statusNameLine(`goal-${m.id}-name`, { text: m.name, ...(m.isChanged ? { bold: true } : {}) }, m.stall, 0),
        ...(m.text ? [statusPageText(`goal-${m.id}-text`, [{ text: m.text, isMuted: true }], 0)] : []),
        ...(m.was ? [statusPageText(`goal-${m.id}-was`, [{ text: `${WAS_PREFIX}${m.was}`, isMuted: true }], 0)] : []),
        ...keysLine({ id: m.id, keys: milestoneKeyPlan(m) }),
      ],
      isSelected: isSelected(m.id),
    }),
    ...statusRows(m.rows),
  ]

  /**
   * The goal's section, first on every page that is not empty: its heading, drawn as Other work's is, then the goal's
   * text with its was, Now and awaiting lines, or the line that says no goal is set, then the goal's buttons as a row's,
   * then a blank line and the milestones. While the person types a goal, the field and its Cancel take the text's
   * place, and the buttons leave.
   */
  const goalSection = (page: StatusPage): Drawn[] => {
    const g = page.goal
    const goalText = g
      ? wrapped(
          <Box key="goal-text">
            <Text wrap="wrap">
              <Text bold>{g.text}</Text>
              {g.count ? <Text color={pal.muted}>{`${STALL_GAP}${g.count}`.replaceAll(' ', '\u00a0')}</Text> : null}
            </Text>
          </Box>,
          `${g.text}${g.count ? `${STALL_GAP}${g.count}`.replaceAll(' ', '_') : ''}`,
        )
      : muted('goal-none', NO_GOAL_TEXT)
    const body = [
      ...(isTypingGoal ? field() : [goalText]),
      ...(g?.was ? [muted('goal-was', `${WAS_PREFIX}${g.was}`)] : []),
      ...(g?.now ? [muted('goal-now', g.now)] : []),
      ...(g?.awaiting ? [muted('goal-awaiting', g.awaiting)] : []),
      ...(isTypingGoal ? [] : goalKeys(page)),
    ]
    const milestones = g?.milestones ?? []
    /** A blank line in the terminal, and on desktop the space Codex leaves there, `LOOK_GAP_PT`. */
    const milestoneGap = look === 'terminal' ? 1 : LOOK_GAP_PT / DESKTOP_LINE_PT

    return [
      statusPartLine(`${GOAL_KEYS_ID}-heading`, g?.label ?? GOAL_HEADING, true),
      block(`status-${GOAL_KEYS_ID}`, body, isSelected(GOAL_KEYS_ID)),
      ...(milestones.length > 0
        ? [{ el: <Box key="goal-gap" height={milestoneGap} />, lines: exactly(milestoneGap) }]
        : []),
      ...milestones.flatMap(milestoneLines),
    ]
  }
  const goalKeys = (page: StatusPage) => keysLine({ id: GOAL_KEYS_ID, keys: goalKeyPlan(page) })
  /** Set goal, or the field it opened, with no frame, for the empty page's centred column. */
  const setGoalBare = (page: StatusPage): Drawn[] =>
    isTypingGoal
      ? [
          uncounted(
            <Box key="goal-field-bare" flexDirection="column" width="100%">
              {field().map(p => p.el)}
            </Box>,
          ),
        ]
      : goalKeys(page)
  return { goalSection, setGoalBare, markRun }
}
