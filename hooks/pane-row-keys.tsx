import { actionLines } from './action-plan'
import { DESKTOP_BUTTON_EXTRA_PT, desktopTextPt } from './desktop-metrics'
import type { LinksProps } from './links-client'
import type { PaneBase, PaneClient, PaneHandlers, Row } from './pane-context'
import { followUpPresses, type KeyAction } from './pane-keys'
import {
  DESKTOP_CELL_PT,
  DESKTOP_LINK_GAP_CELLS,
  DESKTOP_MARK_CELLS,
  DESKTOP_SIDE_CELLS,
  FRAME_INSET_PT,
} from './pane-sizes'
import { actionLabel, fieldExit, ROW_COPY } from './rows'
import { cellWidth } from './text'

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
  const desktopTextColumns = (markCells: number) => listColumns - markCells - DESKTOP_SIDE_CELLS - 1
  // A desktop text column after `markCells`, less a cell, since the measured column ran up to 10 pt narrower than this.
  const desktopColumnPt = (markCells: number) => desktopTextColumns(markCells) * DESKTOP_CELL_PT - 2 * FRAME_INSET_PT
  const desktopRowTextPt = desktopColumnPt(DESKTOP_MARK_CELLS)
  const desktopLabel = (a: Pick<KeyAction, 'label' | 'variant' | 'icon'>) =>
    a.icon ? `${a.icon} ${shownLabel(a)}` : shownLabel(a)
  // A native Button cuts a label wider than its row.
  const fittedDesktopLabel = (a: Pick<KeyAction, 'label' | 'variant' | 'icon'>) => {
    const icon = a.icon ? `${a.icon} ` : ''
    const fits = (label: string) => desktopTextPt(icon + label) + DESKTOP_BUTTON_EXTRA_PT <= desktopRowTextPt

    return icon + actionLabel({ label: a.label, isPrimary: a.variant === 'primary' }, fits)
  }
  const keyedButton =
    (rowId: string, isFollowUp = false) =>
    ({ hotkey, kind: _kind, emphasis, icon, isOut = false, ...action }: KeyAction) => {
      const { label: _label, ...unlabeled } = action
      const isDim = isOpenGuarded || isOut

      return look === 'desktop' ? (
        <Button
          {...action}
          {...(isFollowUp ? { plain: true } : emphasis === 'primary' ? { variant: 'primary' as const } : {})}
          label={fittedDesktopLabel({ ...action, ...(icon ? { icon } : {}) })}
          {...(isDim ? { dimColor: true } : {})}
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
            {hotkey ? `: ${shownLabel(action)}` : shownLabel(action)}
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
          width: desktopTextPt(label) / DESKTOP_CELL_PT,
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
  const keyRow = (rowId: string, keys: KeyAction[], more: KeyAction[] = []) => (
    <Box
      flexDirection="row"
      flexWrap="wrap"
      alignItems="center"
      columnGap={space.buttonGap}
      rowGap={look === 'desktop' ? 1 : 0}
    >
      {keys.map(keyedButton(rowId))}
      {look === 'terminal' && keys.length > 0 && more.length > 0 ? <Text color={pal.muted}>·</Text> : null}
      {more.length > 0 ? (followUpLinks(rowId, more) ?? more.map(keyedButton(rowId, true))) : null}
    </Box>
  )
  const keyBindings = (keys: KeyAction[], suffix = '') =>
    keys.flatMap(({ key, hotkey, kind: _kind, emphasis: _emphasis, icon: _icon, isOut: _isOut, ...k }) =>
      hotkey ? [<Button key={`${key}${suffix}`} plain hotkey={hotkey} {...k} label={shownLabel(k)} />] : [],
    )
  const terminalKeyCells = (k: KeyAction) => (k.hotkey ? k.hotkey.length + 2 : 0) + cellWidth(shownLabel(k))
  const terminalActionLines = (keys: KeyAction[], more: KeyAction[], width: number) =>
    actionLines(keys.map(terminalKeyCells), more.map(terminalKeyCells), {
      width,
      gap: space.buttonGap,
      // keyRow's `·` and the gap after it.
      separator: 1 + space.buttonGap,
    })
  const keyLines = (keys: KeyAction[], more: KeyAction[], width: number) =>
    terminalActionLines(keys, more, width).lines.length
  // Desktop's links Box wraps as a whole by its own width, so only the terminal draws a second row.
  const actionRows = (rowId: string, keys: KeyAction[], more: KeyAction[], terminalWidth: number) =>
    look === 'terminal' && terminalActionLines(keys, more, terminalWidth).isFollowUpLineNew ? (
      <Box flexDirection="column">
        {keyRow(rowId, keys)}
        {keyRow(rowId, [], more)}
      </Box>
    ) : (
      keyRow(rowId, keys, more)
    )
  const pressable = (keys: KeyAction[]) => keys.filter(k => Input || !k.key.startsWith('typekey-'))
  const rowActions = (row: Row): { keys: KeyAction[]; more: KeyAction[] } => {
    if (Input && row.typeHint && typing === row.id) return { keys: [], more: [] }

    return {
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
    actionRows,
    rowActions,
    fieldActions,
  }
}

export type PaneRowKeys = ReturnType<typeof paneRowKeys>
