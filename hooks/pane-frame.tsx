import { bannerOf, type BannerView, tabBarBanners, versionLabel } from './banners'
import { feedbackText } from './feedback'
import { HELP_COPY } from './help'
import { BANNER_GAP_PT, BANNER_PAD_Y_PT } from './layout'
import { TOOLS_REFUSED_TEXT } from './mod-records'
import { mod } from './mod-state'
import type { PaneBase, PaneClient, PaneHandlers } from './pane-context'
import {
  DESKTOP_LINE_PT,
  DESKTOP_TAB_PAD,
  desktopTabSizes,
  FRAMED_TAB_LAYOUTS,
  INLINE_TAB_GAPS,
  RAIL_GUTTER,
  TAB_PAD,
} from './pane-sizes'
import { fitTabs, isRowTab, tabName, type TabNaming } from './tabs'
import { TAB_HEIGHT, tabLines, type TabsProps } from './tabs-client'
import { cellWidth } from './text'
import type { BannerTone } from './tones'

export function paneFrame(
  {
    hasClient,
    elements,
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
    shownStatus,
    lineNote,
    tabText,
    termProgram,
    Button,
    tabTone,
    raiseEdge,
    raise,
    status,
    railWidth,
    hasRail,
    blankLine,
    isHelpShown,
  }: PaneClient &
    Pick<
      PaneBase,
      | 'e'
      | 'tabList'
      | 'badgeOf'
      | 'shownTab'
      | 'pal'
      | 'look'
      | 'isInline'
      | 'Text'
      | 'isNarrowDesktop'
      | 'Box'
      | 'shownStatus'
      | 'lineNote'
      | 'tabText'
      | 'termProgram'
      | 'Button'
      | 'tabTone'
      | 'raiseEdge'
      | 'raise'
      | 'status'
      | 'railWidth'
      | 'hasRail'
      | 'blankLine'
      | 'isHelpShown'
    >,
  { showTab, updateHelpShown }: Pick<PaneHandlers, 'showTab' | 'updateHelpShown'>,
) {
  const tabColumns = e.props.bodyColumns - 2
  const tabSizes = desktopTabSizes(
    tabList.map(t => ({ ...t, badge: badgeOf(t.id), isShown: t.id === shownTab })),
    tabColumns,
  )
  const tabProps: TabsProps | null = hasClient
    ? {
        tabs: tabList.map((t, n) => ({
          id: t.id,
          label: tabName(t, tabSizes.naming),
          badge: badgeOf(t.id),
          badgeColor: isRowTab(t.id) ? (pal.tone[t.id] ?? pal.mark[t.id]) : null,
          width: tabSizes.widths[n]!,
        })),
        shown: shownTab,
        gap: tabSizes.gap,
        isEachFramed: tabSizes.isEachFramed,
        columns: tabColumns,
        colors: {
          tab: pal.tab ?? null,
          raised: pal.raised,
          raisedText: pal.raisedText ?? null,
          muted: pal.muted,
        },
      }
    : null
  const leadColor: Record<BannerTone, string | undefined> = {
    error: pal.tone.error ?? pal.mark.error,
    warning: pal.tone.needsYou ?? pal.mark.needsYou,
    notice: undefined,
  }
  /**
   * A banner as a rounded box. The terminal paints a Box's fill inside its border, so a docked banner's fill sits
   * inside its rounded border. The inline pane draws the fill alone, so a tab still fits its height.
   */
  const banner = (
    b: BannerView,
    more: {
      /** Drawn in place of the bold lead, as while a press runs. */
      lead?: JSX.Element
      after?: JSX.Element
      isBodyBelow?: boolean
      extra?: JSX.Element | null
      action?: JSX.Element | null
    } = {},
  ) => {
    const { line, fill } = pal.banner[b.tone]
    const frame =
      look === 'desktop'
        ? { borderStyle: 'single', borderColor: line, paddingY: (2 * BANNER_PAD_Y_PT) / DESKTOP_LINE_PT }
        : isInline
          ? { paddingX: 1 }
          : { borderStyle: 'round', borderColor: line, paddingX: 1 }
    const lead = more.lead ?? (
      <Text bold color={leadColor[b.tone]}>
        {b.lead}
      </Text>
    )
    const isActionBelow = isNarrowDesktop && Boolean(more.action)

    return (
      <Box
        key={`banner-${b.kind}`}
        {...(isActionBelow
          ? { flexDirection: 'column', alignItems: 'flex-start', rowGap: (2 * BANNER_PAD_Y_PT) / DESKTOP_LINE_PT }
          : { flexDirection: 'row', alignItems: 'center', columnGap: 2 })}
        {...frame}
        {...(fill ? { backgroundColor: fill } : {})}
      >
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <Text wrap="wrap">
            {lead}
            {more.after ?? null}
            {b.body && !more.isBodyBelow ? ` ${b.body}` : ''}
          </Text>
          {b.body && more.isBodyBelow ? <Text wrap="wrap">{b.body}</Text> : null}
          {more.extra ?? null}
        </Box>
        {more.action ? <Box flexShrink={0}>{more.action}</Box> : null}
      </Box>
    )
  }
  const statusLines = tabBarBanners(
    mod.toolsRefused ? [bannerOf('tools-refused', TOOLS_REFUSED_TEXT)] : [],
    shownStatus.error,
    lineNote
      ? { text: feedbackText({ is: 'note', note: lineNote.note, at: lineNote.at }, look), isError: false }
      : null,
  ).map(b => banner(b))
  const namesWidth = (naming: TabNaming) =>
    tabList.reduce((sum, t) => sum + cellWidth(tabText(t.id, tabName(t, naming))), 0)
  const framedTabs = fitTabs(
    FRAMED_TAB_LAYOUTS,
    (naming, r) =>
      namesWidth(naming) + 2 * r.pad.length * tabList.length + r.gap * (tabList.length - 1) <=
      e.props.bodyColumns - 1 - r.right,
  )
  const { pad } = framedTabs.layout
  const inlineTabs = fitTabs(
    INLINE_TAB_GAPS,
    (naming, gap) => namesWidth(naming) + gap * (tabList.length - 1) <= e.props.bodyColumns - 3,
  )
  const tabNaming = isInline ? inlineTabs.naming : look === 'desktop' ? tabSizes.naming : framedTabs.naming
  const hasTabLine = !isInline && look !== 'desktop'
  const tabLine = pal.tab ?? pal.divider
  // Terminal.app draws block characters from its font, which leaves a seam between a half block and the filled
  // line beside it. There a tab is its filled name line alone.
  const hasHalfLines = termProgram !== 'Apple_Terminal'
  const tabs = (
    <Box
      paddingLeft={isInline ? 2 : 1}
      paddingRight={isInline ? 1 : framedTabs.layout.right}
      flexDirection="row"
      {...(hasTabLine ? { overflow: 'hidden' as const } : {})}
    >
      {/* ─ draws at the middle of its cell, where the tabs' ▀ ends, and the tabs draw over it. The tabs' Box
            clips it, as a row clips the tree (anthropics/claude-code#100030). */}
      {hasTabLine ? (
        <Box position="absolute" bottom={0} left={0} right={0} height={1}>
          <Text color={tabLine}>{'─'.repeat(e.props.bodyColumns)}</Text>
        </Box>
      ) : null}
      <Box
        flexDirection="row"
        flexWrap="wrap"
        columnGap={isInline ? inlineTabs.layout : look === 'desktop' ? 2 : framedTabs.layout.gap}
      >
        {hasClient && tabProps ? (
          <elements.Client
            key="tabs"
            module="./tabs-client.tsx"
            height={TAB_HEIGHT * tabLines(tabProps.tabs, tabProps.gap, tabProps.columns).length}
            props={tabProps}
          />
        ) : null}
        {tabProps
          ? null
          : tabList.map(t => {
              const { id } = t
              const label = tabName(t, tabNaming)
              const badge = badgeOf(id)

              if (isInline)
                return (
                  <Box key={`tab-block-${id}`} flexDirection="row">
                    {shownTab === id ? (
                      <Text bold underline>
                        {label}
                      </Text>
                    ) : (
                      <Button plain key={`tab-${id}`} label={label} onPress={() => void showTab(id)} />
                    )}
                    {badge !== null ? (
                      <Text bold={shownTab === id} color={tabTone(id)}>
                        {' '}
                        {badge}
                      </Text>
                    ) : null}
                  </Box>
                )

              const width = cellWidth(tabText(id, label)) + 2 * pad.length

              // The key stays the
              // same in every drawing: the app takes the focus off the pane when the element holding
              // it leaves, and the next click would only bring it back.
              // A Button sizes to its label, so non-breaking spaces widen the tab; plain spaces would collapse.
              // A native tab element would replace this (anthropics/claude-code#100890).
              if (look === 'desktop')
                return (
                  <Button
                    key={`tab-${id}`}
                    label={`${DESKTOP_TAB_PAD}${badge === null ? label : `${label} ${badge}`}${DESKTOP_TAB_PAD}`}
                    {...(shownTab === id ? { variant: 'primary' as const } : {})}
                    onPress={() => void showTab(id)}
                  />
                )

              if (shownTab === id)
                return (
                  <Box flexDirection="column" flexShrink={0}>
                    <Text color={pal.raised}>{(hasHalfLines ? '▄' : ' ').repeat(width)}</Text>
                    <Text backgroundColor={pal.raised}>
                      {pad}
                      <Text bold color={pal.raisedText} backgroundColor={pal.raised}>
                        {label}
                      </Text>
                      {badge !== null ? (
                        <Text bold color={tabTone(id) ?? pal.raisedText} backgroundColor={pal.raised}>
                          {' '}
                          {badge}
                        </Text>
                      ) : null}
                      {pad}
                    </Text>
                    {hasHalfLines ? (
                      <Text color={pal.raised}>{'▀'.repeat(width)}</Text>
                    ) : (
                      <Text color={tabLine}>{'─'.repeat(width)}</Text>
                    )}
                  </Box>
                )

              const show = () => void showTab(id)
              const edgeFill = hasHalfLines ? pal.tab : undefined
              const edgeHover = edgeFill ? raiseEdge : { inverse: false }

              return (
                <Box key={`tab-block-${id}`} flexDirection="column" flexShrink={0}>
                  <Button plain key={`tab-${id}-above`} hover={edgeHover} onPress={show}>
                    {edgeFill ? (
                      <Text color={edgeFill} hover={raiseEdge}>
                        {'▄'.repeat(width)}
                      </Text>
                    ) : (
                      ' '.repeat(width)
                    )}
                  </Button>
                  <Box flexDirection="row" backgroundColor={pal.tab}>
                    {pad ? <Button plain key={`tab-${id}-before`} label={pad} hover={raise} onPress={show} /> : null}
                    <Button plain key={`tab-${id}`} label={label} hover={raise} onPress={show} />
                    {badge !== null ? (
                      <Text color={tabTone(id)} hover={raise}>
                        {' '}
                        {badge}
                      </Text>
                    ) : null}
                    {pad ? <Button plain key={`tab-${id}-after`} label={pad} hover={raise} onPress={show} /> : null}
                  </Box>
                  <Button plain key={`tab-${id}-below`} hover={edgeHover} onPress={show}>
                    {edgeFill ? (
                      <Text color={edgeFill} hover={raiseEdge}>
                        {'▀'.repeat(width)}
                      </Text>
                    ) : (
                      <Text color={tabLine}>{'─'.repeat(width)}</Text>
                    )}
                  </Button>
                </Box>
              )
            })}
      </Box>
    </Box>
  )
  const faint = (text: string) =>
    look === 'desktop' ? <Text color={pal.age}>{text}</Text> : <Text dimColor>{text}</Text>
  const statusText = faint(status)
  const versionText = mod.version ? faint(versionLabel(mod.version, mod.isNextBuild)) : null
  const rail = (
    <Box flexDirection="column" flexShrink={0} paddingLeft={1} marginRight={RAIL_GUTTER}>
      {tabList.map(({ id, label }) => {
        const badge = badgeOf(id)
        const fill = ' '.repeat(railWidth - cellWidth(tabText(id, label)) - TAB_PAD.length)
        if (shownTab === id)
          return (
            <Text key={`rail-${id}`} backgroundColor={pal.raised}>
              {TAB_PAD}
              <Text bold color={pal.raisedText} backgroundColor={pal.raised}>
                {label}
              </Text>
              {badge !== null ? (
                <Text bold color={tabTone(id) ?? pal.raisedText} backgroundColor={pal.raised}>
                  {' '}
                  {badge}
                </Text>
              ) : null}
              {fill}
            </Text>
          )
        const show = () => void showTab(id)

        return (
          <Box key={`rail-${id}`} flexDirection="row">
            <Button plain key={`tab-${id}-before`} label={TAB_PAD} hover={raise} onPress={show} />
            <Button plain key={`tab-${id}`} label={label} hover={raise} onPress={show} />
            {badge !== null ? (
              <Button plain key={`tab-${id}-count`} hover={raise} onPress={show}>
                <Text color={tabTone(id)}> {badge}</Text>
              </Button>
            ) : null}
            <Button plain key={`tab-${id}-after`} label={fill} hover={raise} onPress={show} />
          </Box>
        )
      })}
    </Box>
  )
  const statusBlock = statusLines.some(Boolean) ? (
    <Box
      flexDirection="column"
      rowGap={look === 'desktop' ? (2 * BANNER_GAP_PT) / DESKTOP_LINE_PT : isInline ? 0 : 1}
      paddingX={hasRail ? 1 : isInline ? 2 : 1}
      paddingTop={hasRail ? 0 : 1}
    >
      {statusLines}
    </Box>
  ) : null
  const footer = (
    <Box flexDirection="column" paddingX={1} paddingTop={blankLine}>
      <Box flexDirection="row" paddingX={1} justifyContent="space-between" columnGap={3}>
        {/* The same key in both states, so a desktop pane keeps its focus on the Button. */}
        <Button
          plain
          dimColor={look !== 'desktop'}
          key="help"
          label={isHelpShown ? HELP_COPY.close : HELP_COPY.open}
          onPress={() => void updateHelpShown(shown => !shown)}
        />
        <Box flexDirection="row" columnGap={2}>
          {statusText}
          {versionText}
        </Box>
      </Box>
    </Box>
  )

  return { banner, tabs, rail, statusBlock, footer }
}

export type PaneFrame = ReturnType<typeof paneFrame>
