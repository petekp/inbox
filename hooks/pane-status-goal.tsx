import type { UiPressArgument } from 'claude-code'
import type { PaneBase, PaneHandlers } from './pane-context'
import type { KeyAction } from './pane-keys'
import { fieldKey, openFields } from './pane-keys'
import type { PaneRowFrame } from './pane-row-frame'
import type { PaneRowKeys } from './pane-row-keys'
import type { PaneRowLines } from './pane-row-lines'
import { paneState } from './mod-state'
import { DESKTOP_MARK_CELLS, DESKTOP_REPLY_ROWS, REPLY_ROWS, STATUS_PAD_Y } from './pane-sizes'
import type { PaneStatusLines } from './pane-status-lines'
import type { StatusTone } from './help'
import type { MilestoneRow, ProposalBlock } from './status-goal-page'
import {
  GOAL_FIELD,
  GOAL_KEYS_ID,
  goalKeyPlan,
  isGoalKeyInHeader,
  milestoneKeyPlan,
  PROPOSAL_KEYS_ID,
  proposalKeyPlan,
} from './status-keys'
import type { StatusKeyTarget } from './status-keys'
import type { StatusPage, StatusRow } from './status-page'
import { STALL_GAP, WAS_PREFIX } from './status-page'
import { ROW_COPY } from './rows'

/** One line of the Status list, as `paneStatus` draws it, so milestones line up with subjects. */
type StatusRowLine = (line: {
  key: string
  mark: JSX.Element | null
  content: JSX.Element[]
  isSelected?: boolean
}) => JSX.Element

/** The proposal, the goal and its milestones, and the goal's text field, in the terminal and desktop looks. */
export function paneStatusGoal(
  {
    look,
    Box,
    Text,
    pal,
    Input,
    typing,
    now,
    statusKeyRow,
    statusMarkAt,
    statusNameLine,
    statusPageText,
    markGlyph,
    markWidth,
    keyRow,
    textKey,
    desktopFrame,
  }: Pick<PaneBase, 'look' | 'Box' | 'Text' | 'pal' | 'Input' | 'typing' | 'now' | 'statusKeyRow'> &
    Pick<PaneStatusLines, 'statusMarkAt' | 'statusNameLine' | 'statusPageText'> &
    Pick<PaneRowLines, 'markGlyph' | 'markWidth'> &
    Pick<PaneRowKeys, 'keyRow' | 'textKey'> &
    Pick<PaneRowFrame, 'desktopFrame'>,
  { updateDrafts, updateTyping, sendTyped }: Pick<PaneHandlers, 'updateDrafts' | 'updateTyping' | 'sendTyped'>,
  {
    statusRowLine,
    statusKeys,
    statusRows,
  }: {
    statusRowLine: StatusRowLine
    statusKeys: (t: StatusKeyTarget) => KeyAction[]
    statusRows: (rows: StatusRow[]) => JSX.Element[]
  },
) {
  const isTypingGoal = Input !== null && typing === GOAL_KEYS_ID
  /** Lines at the head's column. The terminal marks the selected block with the selection color, as it does a row. */
  const block = (key: string, children: JSX.Element[], isSelected = false) =>
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
    )
  const muted = (key: string, text: string) => (
    <Box key={key}>
      <Text wrap="wrap" color={pal.muted}>
        {text}
      </Text>
    </Box>
  )
  const bold = (key: string, text: string) => (
    <Box key={key}>
      <Text wrap="wrap" bold>
        {text}
      </Text>
    </Box>
  )
  const keysLine = (target: StatusKeyTarget) => {
    const keys = statusKeys(target)

    return keys.length > 0 ? [<Box key={`${target.id}-keys`}>{keyRow(target.id, keys)}</Box>] : []
  }
  const isSelected = (id: string) => look === 'terminal' && !isTypingGoal && statusKeyRow?.id === id
  const cancel: KeyAction = {
    key: `cancel-${GOAL_KEYS_ID}`,
    label: 'Cancel',
    kind: 'view',
    onPress: () => void updateTyping(t => (t === GOAL_KEYS_ID ? null : t)),
  }
  /** The goal's text field. Submitting sets the typed goal. When the prompt kept the keys, a line under it says to click it. */
  const fieldInput = () =>
    Input === null
      ? []
      : [
          <Input
            key={fieldKey(GOAL_KEYS_ID)}
            placeholder={GOAL_FIELD.placeholder}
            {...(openFields.get(GOAL_KEYS_ID)?.seed ? { value: openFields.get(GOAL_KEYS_ID)?.seed } : {})}
            submitLabel={look === 'desktop' ? GOAL_FIELD.submit : 'set'}
            autoFocus
            {...(look === 'terminal' ? { rows: REPLY_ROWS } : look === 'desktop' ? { rows: DESKTOP_REPLY_ROWS } : {})}
            onInput={(value: string) =>
              void updateDrafts(d => ({ ...d, [GOAL_KEYS_ID]: { text: value, since: d[GOAL_KEYS_ID]?.since ?? now } }))
            }
            onSubmit={(value: string, submit: { surface: UiPressArgument['surface'] }) =>
              sendTyped(GOAL_KEYS_ID, value, submit.surface)
            }
          />,
          ...(paneState.fieldWithoutKeys === GOAL_KEYS_ID ? [muted('goal-field-click', ROW_COPY.clickField)] : []),
        ]
  const fieldKeys = () =>
    Input === null ? [] : [<Box key="goal-field-keys">{keyRow(`${GOAL_KEYS_ID}-field`, [cancel])}</Box>]
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
  /**
   * A proposed milestone on its own line, its mark, name and spacing as a goal's milestone row draws them, so the list
   * keeps its place when the proposal becomes the goal. The block already starts at the mark's column.
   */
  const proposedMilestone = (m: ProposalBlock['milestones'][number], n: number) => (
    <Box
      key={`goal-proposal-${n}`}
      flexDirection="row"
      alignItems="flex-start"
      paddingY={look === 'desktop' ? STATUS_PAD_Y : 0}
    >
      <Box width={look === 'desktop' ? DESKTOP_MARK_CELLS + 1 : markWidth} flexShrink={0}>
        {markGlyph({ text: m.mark, isRunning: false }, `goal-proposal-${n}`, m.tone ? pal.mark[m.tone] : pal.muted)}
      </Box>
      <Box flexDirection="column" flexShrink={1} flexGrow={1} minWidth={0}>
        {statusNameLine(`goal-proposal-${n}-name`, { text: m.name }, null, 0)}
      </Box>
    </Box>
  )
  /** A milestone, then the work that serves it, one step in. */
  const milestoneLines = (m: MilestoneRow) => [
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
   * What the page draws above the head: the goal with its milestones, and a proposal, which the page puts first only
   * while no goal is set. While the person types a goal,
   * the field takes the proposal's text's place, else the goal's, else Set a goal's under the head, and the buttons of
   * the proposal and the goal give way to it.
   */
  const goalAbove = (page: StatusPage): { proposal: JSX.Element[]; goal: JSX.Element[] } => {
    const p = page.proposal
    const g = page.goal
    const proposal = p
      ? [
          block(
            `status-${PROPOSAL_KEYS_ID}`,
            [
              muted('goal-proposal-label', p.label),
              ...(isTypingGoal ? fieldInput() : [bold('goal-proposal-text', p.text)]),
              ...p.milestones.map(proposedMilestone),
              ...(isTypingGoal ? fieldKeys() : keysLine({ id: PROPOSAL_KEYS_ID, keys: proposalKeyPlan(page) })),
            ],
            isSelected(PROPOSAL_KEYS_ID),
          ),
        ]
      : []
    if (g === null) return { proposal, goal: [] }
    const isKeyInHeader = isGoalKeyInHeader(page)
    const headerKeys = isKeyInHeader && !isTypingGoal ? statusKeys({ id: GOAL_KEYS_ID, keys: goalKeyPlan(page) }) : []
    const goalKeyRow = isKeyInHeader ? [] : goalKeys(page)

    return {
      proposal,
      goal: [
        block(
          'goal-title',
          [
            <Box key="goal-label" flexDirection="row" flexWrap="wrap" alignItems="center">
              <Text color={pal.muted}>{g.label}</Text>
              {headerKeys.flatMap(k => [
                <Text key={`goal-label-dot-${k.key}`} color={pal.muted}>
                  {STALL_GAP}
                </Text>,
                textKey(GOAL_KEYS_ID, k),
              ])}
            </Box>,
            ...(isTypingGoal && !p
              ? field()
              : [
                  <Box key="goal-text">
                    <Text wrap="wrap">
                      <Text bold>{g.text}</Text>
                      {g.count ? (
                        <Text color={pal.muted}>{`${STALL_GAP}${g.count}`.replaceAll(' ', '\u00a0')}</Text>
                      ) : null}
                    </Text>
                  </Box>,
                ]),
            ...(g.was ? [muted('goal-was', `${WAS_PREFIX}${g.was}`)] : []),
            ...(g.now ? [muted('goal-now', g.now)] : []),
            ...(g.awaiting ? [muted('goal-awaiting', g.awaiting)] : []),
          ],
          headerKeys.length > 0 && isSelected(GOAL_KEYS_ID),
        ),
        ...g.milestones.flatMap(milestoneLines),
        ...(!isTypingGoal && goalKeyRow.length > 0
          ? [block(`status-${GOAL_KEYS_ID}`, goalKeyRow, isSelected(GOAL_KEYS_ID))]
          : []),
      ],
    }
  }
  const goalKeys = (page: StatusPage) => keysLine({ id: GOAL_KEYS_ID, keys: goalKeyPlan(page) })
  /** Under the head, or under the empty state, while no goal is set: Set a goal, or the field it opened when no proposal shows. */
  const setGoal = (page: StatusPage): JSX.Element[] => {
    const lines = page.goal !== null || page.proposal !== null ? [] : isTypingGoal ? field() : goalKeys(page)

    return lines.length > 0 ? [block(`status-${GOAL_KEYS_ID}`, lines, isSelected(GOAL_KEYS_ID))] : []
  }
  /** Set a goal, or the field it opened, with no frame, for the empty page's centred column. */
  const setGoalBare = (page: StatusPage): JSX.Element[] =>
    isTypingGoal
      ? [
          <Box key="goal-field-bare" flexDirection="column" width="100%">
            {field()}
          </Box>,
        ]
      : goalKeys(page)
  return { goalAbove, setGoal, setGoalBare, markRun }
}

export type PaneStatusGoal = ReturnType<typeof paneStatusGoal>
