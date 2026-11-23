import type { Elements, RenderInput, RenderSurface } from 'claude-code'

import type { Tab } from '../../types'
import { drawnLists, latestUndo, rowsIn, tabUndos } from '../../core/view/action-plan'
import { bannerOf, DEMO_NOTICE } from '../../core/view/banners'
import { helpKeys, UNDO_KEY } from '../../core/view/help'
import { setDemo } from './mod-demo'
import { drawnState, later } from './mod-drawn'
import { closeField } from './mod-pane-input'
import { noteStatusTop, paneHandlers, paneViewKeys, restoreDesktopFocus } from './mod-pane-handlers'
import { matchPaneEscape, paneOpened } from './mod-pane-open'
import { scrollToOpenRow } from './mod-pane-scroll'
import type { Mod } from './mod-ports'
import { cancelUndoScroll, paneState } from './mod-state'
import { currentOwner } from './mod-sessions'
import { applyUiEvents, hostFactsOf } from './mod-ui'
import { landTerminalFrame } from './mod-ui-loop'
import { herdrAskKeys } from '../pane/pane-herdr-ask'
import { lookOf, paletteFor } from '../pane/palettes'
import { paneAskRows, paneAskTabs } from '../pane/pane-asks'
import type { PaneClient, Row } from '../pane/pane-context'
import { paneFrame } from '../pane/pane-frame'
import { paneHelp } from '../pane/pane-help'
import {
  closeKeysWithoutRow,
  KEY_BINDING_SUFFIX,
  openedField,
  openFields,
  paneHasKeys,
  undoKey,
} from '../pane/pane-keys'
import { panePrBlocks, panePrRows } from '../pane/pane-prs'
import { paneRowFrame } from '../pane/pane-row-frame'
import { paneRowKeys } from '../pane/pane-row-keys'
import { paneRowLines } from '../pane/pane-row-lines'
import { paneRowParts } from '../pane/pane-row-parts'
import { paneRows } from '../pane/pane-rows'
import { RESIZE_SCROLL_MS, settledLayoutId } from '../pane/pane-selection'
import { DESKTOP_ROW_PAD, DESKTOP_WIDE_AT, INLINE_RAIL_AT, RAIL_GUTTER, TAB_PAD } from '../pane/pane-sizes'
import { paneStatus } from '../pane/pane-status'
import { paneStatusLines } from '../pane/pane-status-lines'
import { paneText } from '../pane/pane-text'
import { prBlockRows, threadSentIn } from '../../core/view/pr-rows'
import { prNeedsYou } from '../../core/domain/prs'
import { NEEDS_YOU_GROUPS } from '../../core/view/rows'
import { statusKeyRows, statusSelected } from '../../core/view/status-keys'
import { isRowTab, type ShownTab, shownTabs, tabBadge } from '../../core/view/tabs'
import { glued } from '../pane/terminal-text'
import { cellWidth } from '../../core/domain/text'
import { PRESS_GUARD_MS } from '../../core/view/timing'
import { noticeOf, rowErrorOf } from '../../core/view/ui-controller'
import { collapsedOf, selectedOf } from '../../core/view/ui-controller-selection'
import type { UiEvent } from '../../core/view/ui-controller-types'
import { footerError } from '../../core/view/view'

/** Draws the inbox pane in the terminal and desktop looks, from the drawn session and the controller's state. */
export async function paneTree(m: Mod, e: RenderInput<'Pane'>, elements: Elements[RenderSurface]) {
  const hadKeys = paneHasKeys.get(e.surface) ?? false
  paneHasKeys.set(e.surface, e.props.isFocused)
  const isKeyboardHandedBack = hadKeys && !e.props.isFocused
  const { Box, Button, Link, Markdown, Text } = elements
  // Desktop draws every Button as a native button, and only clicks reach the pane: no letters, key hints or hidden hotkeys.
  const look = lookOf(e.surface)
  paneState.paneLook = look
  // The Claude app's pane reports `isFullscreen` too, but its `$.ui.scroll` answers "transcript not scrollable here".
  const canScrollConversation = e.surface === 'terminal' && e.viewport?.isFullscreen === true
  const hasClient = look === 'desktop' && 'Client' in elements
  // The mobile app draws no text field, so there the typed reply is not offered.
  const Input = 'Input' in elements ? elements.Input : null
  const isNarrowDesktop = look === 'desktop' && e.props.bodyColumns < DESKTOP_WIDE_AT
  const isAgeInSide = look === 'terminal'
  const isAgeDropped = isNarrowDesktop || isAgeInSide
  const isInline = e.props.placement === 'inline'
  paneState.isInlinePane = isInline
  if (e.surface === 'terminal') {
    paneState.isInlineTerminalPane = isInline
    if (!isInline && paneState.pendingUndoScroll) cancelUndoScroll()
  }
  const blankLine = isInline ? 0 : 1
  const space =
    look === 'desktop'
      ? { rowPad: 2 * DESKTOP_ROW_PAD, settledPad: 2 * DESKTOP_ROW_PAD, buttonGap: 1, isFoldGapped: false }
      : { rowPad: blankLine, settledPad: 0, buttonGap: 2, isFoldGapped: true }
  const [drawn, theme, termProgram] = await Promise.all([
    drawnState(m, canScrollConversation),
    m.atoms.theme.read(),
    m.setup.terminalProgram(),
    // A redraw loop on desktop blocks clicks, so only the terminal draws running marks and Undo in frames.
    look === 'terminal' ? m.atoms.runningFrame.read() : null,
  ])
  const { prViews: prState, lastActions, notes, turns, stop, isDemo, showsDemoNotices, isUnread, now } = drawn
  paneState.paintedVersions = { owner: currentOwner(), versions: drawn.view.drawnVersions }
  // The pane can draw before the controller hears that it opened, so the first frame shows the tab the open moves to.
  const opening: UiEvent[] = [{ type: 'opened' }, { type: 'read', host: hostFactsOf(drawn) }]
  const isOpenUnheard = paneState.isOpenUnheard && drawn.ui.shownSince === null
  const ui = isOpenUnheard ? applyUiEvents(drawn.ui, drawn.view, opening, now).ui : drawn.ui
  if (paneState.isOpenWaiting) {
    paneState.isOpenWaiting = false
    later(m, 0, () => paneOpened(m))
  }
  if (look === 'terminal') landTerminalFrame(m, ui, drawn.view, now)
  // A collapse the person made draws at once, before its save reaches the view.
  const view = { ...drawn.view, collapsed: collapsedOf(ui, drawn.view) }
  const { typing, drafts, unfolded, isHelpShown, optionsShown, statusSelection, statusUnfolded, closedAll } = ui
  const shownTab: ShownTab = ui.tab
  const tab: Tab = isRowTab(shownTab) ? shownTab : 'needsYou'
  const isStatusShown = shownTab === 'overview'
  const tabList = shownTabs()
  // A hot reload keeps the open field in `ui` but empties openFields, so the field takes its key and seed again here.
  if (typing !== null && !openFields.has(typing)) openFields.set(typing, openedField(typing, drafts[typing]))
  if (e.props.isFocused || typing !== paneState.fieldWithoutKeys) paneState.fieldWithoutKeys = null
  // Escape, or a click outside the pane, closes the field and keeps its draft, as Cancel does.
  if (isKeyboardHandedBack && typing !== null) later(m, 0, () => closeField(m, typing))
  if ((typing === null) !== paneState.paneClosesOnEscape) later(m, 0, () => matchPaneEscape(m))
  const size = isInline ? `${e.props.bodyColumns}x${e.props.scroll.bodyRows}` : null
  if (e.surface === 'terminal') paneState.terminalInlineSize = size
  if (size !== null && paneState.inlineSize !== null && size !== paneState.inlineSize) {
    const revision = paneState.undoScrollRevision
    later(m, RESIZE_SCROLL_MS, () =>
      revision === paneState.undoScrollRevision && !isStatusShown ? scrollToOpenRow(m, tab, e.surface) : undefined,
    )
  }
  paneState.inlineSize = size
  const shownPrs = view.prs.drawn
  const settledLayout = settledLayoutId(tab, view, shownPrs, lastActions, notes, now, paneState.terminalInlineSize)
  const pal = paletteFor(theme, look)
  const { inlineText, terminalText } = paneText({ Text, pal })
  const raise = {
    dimColor: false,
    backgroundColor: pal.raised,
    inverse: false,
    ...(pal.raisedText ? { color: pal.raisedText } : {}),
  }
  const raiseEdge = { dimColor: false, color: pal.raised, inverse: false }

  const client: PaneClient = hasClient ? { hasClient: true, elements } : { hasClient: false, elements }
  const handlers = paneHandlers(m)
  const { itemRow, findingRow } = paneAskRows(
    { now, look, isInline, Text, pal, optionsShown, Box, terminalText, inlineText },
    handlers,
  )
  const isThreadSent = threadSentIn(lastActions)
  const presses = { lastActions, turns, now }
  const { prKeyAction, checkRow, threadRow } = panePrRows(
    { Text, pal, presses, Link, Box, Markdown, terminalText, lastActions, look, now },
    handlers,
  )

  // The Status and Help draw no rows, so none are built while either shows.
  const isListShown = !isStatusShown && !isHelpShown
  const lists = drawnLists(
    view,
    () => true,
    r => (!isListShown ? null : r.type === 'finding' ? findingRow(r) : itemRow(r)),
  )
  const needsYouGroups = NEEDS_YOU_GROUPS.map(g => ({ ...g, entries: lists[g.list], rows: rowsIn(lists[g.list]) }))
  const findingEntries = lists.findings
  const prGroups = (isListShown ? shownPrs : []).map(d => ({
    ...d,
    ...prBlockRows(d.pr, d.state.is === 'settled', {
      thread: t => threadRow(d.pr, t),
      check: c => checkRow(d.pr, c),
    }),
  }))
  const prOrderKeys = (view.prs.order?.changed?.actions ?? []).map(a => prKeyAction(a, 'order'))
  const prRefreshKeys = (view.prs.refresh?.actions ?? []).map(a => prKeyAction(a, 'prs'))
  const prClearKeys = view.prs.clear.map(a => prKeyAction(a, 'prs'))
  const rows: Record<Tab, Row[]> = {
    needsYou: lists.byTab.needsYou,
    findings: lists.byTab.findings,
    prs: prGroups.flatMap(g => g.rows),
  }
  const tabCounts: Record<Tab, number> = {
    needsYou: view.needsYou.count,
    findings: view.findings.count,
    prs: shownPrs.filter(x => x.state.is === 'open' && prNeedsYou(x.pr, isThreadSent)).length,
  }
  const badgeOf = (id: ShownTab) => tabBadge(id, tabCounts)
  const tabTone = (id: ShownTab) => (isRowTab(id) ? pal.tone[id] : undefined)
  const tabText = (id: ShownTab, name: string) => `${name}${badgeOf(id) === null ? '' : ` ${badgeOf(id)}`}`
  const hasRail = isInline && look === 'terminal' && e.props.bodyColumns >= INLINE_RAIL_AT
  const railWidth = Math.max(...tabList.map(t => cellWidth(tabText(t.id, t.label)))) + 2 * TAB_PAD.length
  const listColumns = e.props.bodyColumns - 2 - (hasRail ? railWidth + RAIL_GUTTER : 0)
  const ids = rows[tab].map(r => r.id)
  const indexOf = new Map(ids.map((id, n) => [id, n]))
  const guard = ui.selection[tab].guard
  const at = isListShown ? ids.indexOf(selectedOf(ui, drawn.view, tab) ?? '') : -1
  const isOpenGuarded = !isStatusShown && guard !== null && now < guard.at + PRESS_GUARD_MS
  const isStatusUnfolded = (id: string) => statusUnfolded.includes(id)
  const isStatusCollapsed = (id: string) => view.collapsed.includes(id)
  const statusKeyRow = isStatusShown
    ? statusSelected(view.statusPage, statusSelection, isStatusUnfolded, isStatusCollapsed)
    : null
  const statusPressRows = isStatusShown ? statusKeyRows(view.statusPage, isStatusUnfolded, isStatusCollapsed) : []

  const {
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
    answersFit,
  } = paneRowKeys(
    { ...client, listColumns, isOpenGuarded, look, Button, Box, pal, Text, space, Input, typing },
    handlers,
  )
  const {
    feedbackLabel,
    pressLine,
    pressedAge,
    branch,
    desktopHairline,
    columnsFor,
    markWidth,
    treeRow,
    divided,
    withDoneText,
    feedbackColor,
    unselectedLine,
    ToneSvg,
    svgCell,
    runningDot,
    gutterMark,
    toned,
    sideAge,
    rowClientProps,
    withSideAge,
    markGlyph,
  } = paneRowLines({
    ...client,
    lastActions,
    notes,
    rowError: id => rowErrorOf(ui, id, now),
    turns,
    now,
    look,
    isAgeDropped,
    pal,
    Box,
    Text,
    e,
    isInline,
    isAgeInSide,
    listColumns,
    Button,
  })
  const { desktopFrame } = paneRowFrame({ space, Box })
  const rowFns = paneRows(
    {
      ...client,
      ui,
      indexOf,
      at,
      collapsed: new Set(view.collapsed),
      Box,
      space,
      Text,
      pal,
      Input,
      typing,
      drafts,
      look,
      now,
      isAgeInSide,
      listColumns,
      isInline,
      e,
      optionsShown,
      blankLine,
      Button,
      settledLayout,
      shownTab,
      columnsFor,
      gutterMark,
      toned,
      rowClientProps,
      feedbackLabel,
      pressedAge,
      withDoneText,
      feedbackColor,
      sideAge,
      withSideAge,
      unselectedLine,
      branch,
      desktopHairline,
      rowActions,
      desktopRowTextPt,
      keyLines,
      keyRow,
      fieldActions,
      actionRows,
      keyedButton,
      answersFit,
      desktopFrame,
    },
    handlers,
  )

  const shownError = footerError(shownTab, view.status, view.statusPage)

  const notice = noticeOf(ui, now)

  const keyList = helpKeys(look)
  const keyColumn = Math.max(0, ...keyList.map(k => cellWidth(k.keys))) + 2

  const { banner, tabs, rail, statusBlock, isTabRowFit, desktopTabLines } = paneFrame(
    {
      ...client,
      e,
      tabList,
      badgeOf,
      shownTab,
      pal,
      look,
      isInline,
      Text,
      isNarrowDesktop,
      Box,
      shownError,
      notice,
      tabText,
      termProgram,
      Button,
      tabTone,
      raiseEdge,
      raise,
      railWidth,
      hasRail,
      isHelpShown,
      space,
    },
    handlers,
  )

  const {
    groupEmpty,
    groupTitle,
    section,
    sections,
    terminalSectionGap,
    titleGap,
    foldButton,
    foldRow,
    desktopFoldLines,
    desktopFoldLinesOf,
    closedFold,
    undoPlace,
    settledContent,
    settledRow,
  } = paneRowParts(
    {
      ...client,
      ui,
      look,
      listColumns,
      Text,
      pal,
      Box,
      blankLine,
      isInline,
      space,
      now,
      Button,
      settledLayout,
      desktopFrame,
      treeRow,
      ToneSvg,
      desktopHairline,
      markGlyph,
      markWidth,
    },
    handlers,
  )
  const { emptyState, needsYouView, findingsView } = paneAskTabs(
    {
      listColumns,
      look,
      isInline,
      Box,
      Text,
      blankLine,
      pal,
      needsYouGroups,
      view,
      isUnread,
      unfolded,
      closedAll,
      Button,
      stop,
      glued,
      now,
      findingEntries,
      lists,
      divided,
      runningDot,
      ...rowFns,
      settledRow,
      closedFold,
      section,
      groupTitle,
      titleGap,
      groupEmpty,
      sections,
      banner,
    },
    handlers,
  )

  const { prsView } = panePrBlocks({
    look,
    pal,
    Text,
    Box,
    blankLine,
    isThreadSent,
    lastActions,
    prState,
    presses,
    space,
    Button,
    view,
    prOrderKeys,
    prRefreshKeys,
    prClearKeys,
    prGroups,
    section,
    undoPlace,
    settledContent,
    groupTitle,
    titleGap,
    sections,
    desktopFrame,
    markGlyph,
    divided,
    pressLine,
    ...rowFns,
    prKeyAction,
    desktopLabel,
    desktopRowTextPt,
    listColumns,
    keyRow,
    emptyState,
    banner,
  })

  const statusLines = paneStatusLines({
    Box,
    Text,
    pal,
    look,
    listColumns,
    terminalText,
    desktopColumnPt,
    markWidth,
    branch,
    desktopHairline,
  })
  const { statusKeys, statusView, statusTops } = paneStatus(
    {
      ...client,
      terminalText,
      Button,
      e,
      listColumns,
      look,
      Box,
      Text,
      pal,
      statusKeyRow,
      view,
      isInline,
      ...statusLines,
      Input,
      typing,
      drafts,
      markWidth,
      markGlyph,
      desktopFrame,
      keyRow,
      keyLines,
      terminalKeyCells,
      emptyState,
      sections,
      terminalSectionGap,
      section,
      foldRow,
      foldButton,
      desktopFoldLines,
      desktopFoldLinesOf,
      statusUnfolded,
    },
    handlers,
  )

  const { helpView } = paneHelp({
    pal,
    keyList,
    Box,
    keyColumn,
    Text,
    hasRail,
    ToneSvg,
    svgCell,
    markGlyph,
    markWidth,
    section,
    groupTitle,
    sections,
  })

  const selectedId = isListShown ? (ids[at] ?? null) : null
  const viewKeys = paneViewKeys(m, {
    tabList,
    isHelpShown,
    isListShown,
    stepIds: isStatusShown ? statusPressRows.map(r => r.id) : ids,
    statusFrom: isStatusShown ? (statusKeyRow?.id ?? null) : null,
    selectedId,
    collapsed: view.collapsed,
  })

  const selectedRow = isStatusShown || isHelpShown ? undefined : rows[tab][at]
  const selectedActions = selectedRow && !view.collapsed.includes(selectedRow.id) ? rowActions(selectedRow) : null
  const statusRowKeys = statusKeyRow && !isHelpShown ? statusKeys(statusKeyRow) : []
  const rowKeys = [
    ...statusRowKeys,
    ...(selectedActions
      ? [...selectedActions.options, ...selectedActions.keys, ...selectedActions.more]
      : closeKeysWithoutRow(statusRowKeys)),
    ...(tab === 'prs' && !isHelpShown ? [...prOrderKeys, ...prClearKeys] : []),
    // The goal's Undo takes the undo key on the Status, where no list row closes.
    ...(statusRowKeys.some(k => k.hotkey === UNDO_KEY)
      ? []
      : [
          undoKey(isListShown ? latestUndo(tabUndos(tab, lists, shownPrs)) : null, () =>
            m.sendUi([{ type: 'undo-key' }]),
          ),
        ]),
  ]

  if (isStatusShown && !isHelpShown && !isDemo)
    noteStatusTop({
      look,
      hasRail,
      isTabRowFit,
      isInline,
      desktopTabLines,
      hasStatusBlock: Boolean(statusBlock),
      showsDemoNotices,
      blankLine,
      tops: statusTops(),
      scroll: e.props.scroll,
      now,
    })
  const tabView = isHelpShown
    ? helpView()
    : isStatusShown
      ? statusView()
      : tab === 'findings'
        ? findingsView()
        : tab === 'prs'
          ? prsView()
          : needsYouView()
  const tree = (
    <Box flexDirection="column" minHeight={e.props.scroll.bodyRows} backgroundColor={pal.body}>
      {showsDemoNotices ? (
        <Box flexDirection="column" paddingX={isInline ? 2 : 1} marginBottom={blankLine}>
          {banner(bannerOf('demo', DEMO_NOTICE), {
            action: <Button key="hide-demo" label="Hide demo" onPress={() => void setDemo(m, false)} />,
          })}
        </Box>
      ) : null}
      {hasRail ? (
        <Box flexDirection="row" flexGrow={1}>
          {rail}
          <Box flexDirection="column" flexGrow={1} flexShrink={1}>
            {statusBlock}
            <Box flexDirection="column" paddingRight={1} flexGrow={1}>
              {tabView}
            </Box>
          </Box>
        </Box>
      ) : (
        [
          tabs,
          statusBlock,
          <Box flexDirection="column" paddingX={1} paddingTop={blankLine} flexGrow={1}>
            {tabView}
          </Box>,
        ]
      )}
      {/* Desktop takes no keys: a Button's hotkey does nothing there, so it gets neither the list of keys nor the hidden Buttons. */}
      {look === 'desktop' ? null : (
        <Box display="none">
          {keyBindings(viewKeys)}
          {keyBindings([...rowKeys, ...herdrAskKeys()], KEY_BINDING_SUFFIX)}
        </Box>
      )}
    </Box>
  )
  if (look === 'desktop') restoreDesktopFocus(m, tree)

  return tree
}
