import { actionLines } from './action-plan'
import { desktopButtonPt, desktopTextPt } from './desktop-metrics'
import type { LinksProps } from './links-client'
import type { PaneBase, PaneClient, PaneHandlers, Row } from './pane-context'
import { followUpPresses, type KeyAction } from './pane-keys'
import {
  DESKTOP_CELL_PT,
  DESKTOP_BUTTON_PAD_CELLS,
  DESKTOP_LINK_GAP_CELLS,
  DESKTOP_LINK_SLACK_CELLS,
  DESKTOP_MARK_CELLS,
  DESKTOP_SIDE_CELLS,
  FRAME_INSET_PT,
} from './pane-sizes'
import { actionLabel, fieldExit, ROW_COPY } from './rows'
import { wrapped } from './terminal-text'
import { cellWidth } from './text'

const HOTKEY_SEPARATOR = ': '

/** Cells a terminal button's label starts in from the button's edge, after its hotkey and the separator. */
export const terminalLabelCells = (k: Pick<KeyAction, 'hotkey'>) =>
  k.hotkey ? k.hotkey.length + HOTKEY_SEPARATOR.length : 0

/** A terminal button's label wrapped to fit `width` cells with its hotkey, each line after the first starting under the first. */
const terminalLabelLines = (label: string, k: Pick<KeyAction, 'hotkey'>, width: number) =>
  cellWidth(label) + terminalLabelCells(k) <= width ? [label] : wrapped(label, width - terminalLabelCells(k))

export function paneRowKeys(
  {
    hasClient,
    elements,
    listColumns,
    isOpenGuarded,
    look,
    Button,
    Box,
    pal,
    Text,
    space,
    Input,
    typing,
  }: PaneClient &
    Pick<
      PaneBase,
      'listColumns' | 'isOpenGuarded' | 'look' | 'Button' | 'Box' | 'pal' | 'Text' | 'space' | 'Input' | 'typing'
    >,
  {
    unlessGuarded,
    sendDraft,
    discardReply,
    updateTyping,
  }: Pick<PaneHandlers, 'unlessGuarded' | 'sendDraft' | 'discardReply' | 'updateTyping'>,
) {
  const shownLabel = (a: Pick<KeyAction, 'label' | 'variant'>) =>
    actionLabel({ label: a.label, isPrimary: a.variant === 'primary' })
  const desktopTextColumns = (markCells: number) => listColumns - markCells - DESKTOP_SIDE_CELLS
  const desktopColumnPt = (markCells: number) => desktopTextColumns(markCells) * DESKTOP_CELL_PT - 2 * FRAME_INSET_PT
  const desktopRowTextPt = desktopColumnPt(DESKTOP_MARK_CELLS)
  const desktopLabel = (a: Pick<KeyAction, 'label' | 'variant' | 'icon'>) =>
    a.icon ? `${a.icon} ${shownLabel(a)}` : shownLabel(a)
  // A native Button cuts a label wider than its row.
  const fittedDesktopLabel = (a: Pick<KeyAction, 'label' | 'variant' | 'icon'>) => {
    const icon = a.icon ? `${a.icon} ` : ''
    const fits = (label: string) => desktopButtonPt(icon + label, a.variant === 'primary') <= desktopRowTextPt

    return icon + actionLabel({ label: a.label, isPrimary: a.variant === 'primary' }, fits)
  }
  /** A terminal button's label, wrapped to `width` cells when it is given and the label is wider. */
  const terminalLabel = (a: Pick<KeyAction, 'label' | 'variant' | 'hotkey'>, width = Infinity) =>
    terminalLabelLines(shownLabel(a), a, width).join(`\n${' '.repeat(terminalLabelCells(a))}`)
  const keyedButton =
    (rowId: string, isFollowUp = false, width = Infinity) =>
    ({ hotkey, kind: _kind, emphasis, icon, isOut = false, note: _note, ...action }: KeyAction) => {
      const { label: _label, ...unlabeled } = action
      const isDim = isOpenGuarded || isOut
      const label = terminalLabel({ ...action, ...(hotkey ? { hotkey } : {}) }, width)

      return look === 'desktop' ? (
        <Button
          {...action}
          {...(isFollowUp ? { plain: true } : emphasis === 'primary' ? { variant: 'primary' as const } : {})}
          label={fittedDesktopLabel({ ...action, ...(icon ? { icon } : {}) })}
          {...(isDim || isFollowUp ? { dimColor: true } : {})}
          onPress={press => unlessGuarded(rowId, press, action.onPress)}
        />
      ) : (
        <Box key={`keyed-${action.key}`} flexDirection="row">
          <Button
            plain
            {...unlabeled}
            {...(isDim ? { dimColor: true } : {})}
            hover={{ color: pal.muted, inverse: true }}
            onPress={press => unlessGuarded(rowId, press, action.onPress)}
          >
            {hotkey ? (
              <Text color={pal.key} dimColor={isDim} hover={{ color: pal.muted, inverse: true }}>
                {hotkey}
              </Text>
            ) : null}
            {hotkey ? `${HOTKEY_SEPARATOR}${label}` : label}
          </Button>
        </Box>
      )
    }
  // Emptied here, after the drawing's reads, so a click that lands while they run still finds the last presses.
  followUpPresses.clear()
  const followUpLinks = (rowId: string, more: KeyAction[]) => {
    if (!hasClient) return null
    for (const a of more) followUpPresses.set(a.key, press => unlessGuarded(rowId, press, a.onPress))
    const props: LinksProps = {
      links: more.map(a => {
        const label = desktopLabel(a)
        return {
          key: a.key,
          label,
          width: desktopTextPt(label) / DESKTOP_CELL_PT + DESKTOP_LINK_SLACK_CELLS,
          ...(a.isOut ? { isOut: true } : {}),
        }
      }),
      gap: DESKTOP_LINK_GAP_CELLS,
      fallbackColumns: desktopTextColumns(DESKTOP_MARK_CELLS),
      isGuarded: isOpenGuarded,
      colors: { muted: pal.muted, hover: null },
    }

    const linksWidth = Math.ceil(props.links.reduce((sum, l) => sum + l.width, props.gap * (props.links.length - 1)))

    // A Client takes no flexShrink or minWidth, so this Box gives it the room left on its line. In the Claude app,
    // the wrapping row moves a Box this wide to the next line whole when the room left is narrower, and then shrinks
    // it to the line.
    return (
      <Box flexGrow={1} flexShrink={1} minWidth={0} width={linksWidth}>
        <elements.Client key={`links-${rowId}`} module="./links-client.tsx" width="100%" props={props} />
      </Box>
    )
  }
  const keyRow = (rowId: string, keys: KeyAction[], more: KeyAction[] = [], width = Infinity) => {
    // A click on a Client gives that Client the keys, so a field opened from one never gets the typing.
    const reply = hasClient && look === 'desktop' && more[0]?.key.startsWith('typekey-') ? more[0] : null
    const links = reply ? more.slice(1) : more

    return (
      <Box
        flexDirection="row"
        flexWrap="wrap"
        alignItems="center"
        columnGap={space.buttonGap}
        rowGap={look === 'desktop' ? 1 : 0}
      >
        {keys.map(keyedButton(rowId, false, width))}
        {look === 'terminal' && keys.length > 0 && more.length > 0 ? <Text color={pal.muted}>·</Text> : null}
        {reply || links.length > 0 ? (
          <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={space.buttonGap}>
            {reply ? (
              <Box marginLeft={-DESKTOP_BUTTON_PAD_CELLS} marginRight={-DESKTOP_BUTTON_PAD_CELLS}>
                {keyedButton(rowId, true)(reply)}
              </Box>
            ) : null}
            {links.length > 0 ? (followUpLinks(rowId, links) ?? links.map(keyedButton(rowId, true, width))) : null}
          </Box>
        ) : null}
      </Box>
    )
  }
  const keyBindings = (keys: KeyAction[], suffix = '') =>
    keys.flatMap(({ key, hotkey, kind: _kind, emphasis: _emphasis, icon: _icon, isOut: _isOut, note: _note, ...k }) =>
      hotkey ? [<Button key={`${key}${suffix}`} plain hotkey={hotkey} {...k} label={shownLabel(k)} />] : [],
    )
  const terminalKeyCells = (k: KeyAction) => terminalLabelCells(k) + cellWidth(shownLabel(k))
  /** A button wider than `width` wraps its label to fill the line. */
  const terminalActionLines = (keys: KeyAction[], more: KeyAction[], width: number) =>
    actionLines(
      keys.map(k => Math.min(width, terminalKeyCells(k))),
      more.map(k => Math.min(width, terminalKeyCells(k))),
      {
        width,
        gap: space.buttonGap,
        // keyRow's `·` and the gap after it.
        separator: 1 + space.buttonGap,
      },
    )
  /** The lines a row's buttons take, each line as tall as its button whose label wraps to the most lines. */
  const keyLines = (keys: KeyAction[], more: KeyAction[], width: number) => {
    const buttons = [...keys, ...more]

    return terminalActionLines(keys, more, width).lines.reduce(
      (sum, line) =>
        sum + Math.max(...line.map(at => terminalLabelLines(shownLabel(buttons[at]!), buttons[at]!, width).length)),
      0,
    )
  }
  // Desktop's links Box wraps as a whole by its own width, so only the terminal draws a second row.
  const actionRows = (rowId: string, keys: KeyAction[], more: KeyAction[], terminalWidth: number) =>
    look === 'terminal' && terminalActionLines(keys, more, terminalWidth).isFollowUpLineNew ? (
      <Box flexDirection="column">
        {keyRow(rowId, keys, [], terminalWidth)}
        {keyRow(rowId, [], more, terminalWidth)}
      </Box>
    ) : (
      keyRow(rowId, keys, more, terminalWidth)
    )
  const pressable = (keys: KeyAction[]) => keys.filter(k => Input || !k.key.startsWith('typekey-'))
  const rowActions = (row: Row): { options: KeyAction[]; keys: KeyAction[]; more: KeyAction[] } => {
    if (Input && row.typeHint && typing === row.id) return { options: [], keys: [], more: [] }

    return {
      options: row.optionKeys?.() ?? [],
      keys: pressable(row.keys()),
      more: pressable(row.moreKeys?.() ?? []),
    }
  }
  const fieldActions = (row: Row): KeyAction[] => [
    {
      key: `send-${row.id}`,
      label: ROW_COPY.send,
      kind: 'handoff',
      onPress: press => sendDraft(row.id, press.surface),
    },
    row.view && fieldExit(row.view) === 'discard'
      ? {
          key: `discard-${row.id}`,
          label: ROW_COPY.discard,
          kind: 'view',
          onPress: () => void discardReply(row.id),
        }
      : {
          key: `cancel-${row.id}`,
          label: ROW_COPY.cancel,
          kind: 'view',
          onPress: () => void updateTyping(t => (t === row.id ? null : t)),
        },
  ]

  return {
    desktopColumnPt,
    desktopRowTextPt,
    desktopLabel,
    keyRow,
    keyBindings,
    keyLines,
    terminalKeyCells,
    actionRows,
    rowActions,
    fieldActions,
    keyedButton,
  }
}

export type PaneRowKeys = ReturnType<typeof paneRowKeys>
