import type { ClientElements, ClientModule } from 'claude-code'

type ClientTab = {
  id: string
  label: string
  /** What follows the label: a row tab's count. */
  badge: string | null
  /** A null color is the theme's own. */
  badgeColor: string | null
  width: number
}

/** A null color is the theme's own. */
export type TabsProps = {
  tabs: ClientTab[]
  shown: string
  /** While Help shows, the Help tab is the shown one and the tabs above it are not. */
  isHelpShown: boolean
  /** The Help tab, drawn opposite the tabs at the right end of the first line. */
  help: { label: string; width: number }
  gap: number
  /** False when only the shown tab has its rounded frame, so the others take only their label's width. */
  isEachFramed: boolean
  columns: number
  colors: { tab: string | null; raised: string; raisedText: string | null; muted: string | null }
  /**
   * The desktop app draws a new Client only after the pane's own elements, so the pane draws these tabs itself until
   * the Client posts. The Client then draws nothing, and the two never show at once.
   */
  isDrawnByPane: boolean
}

type State = { hover: string | null }

export const TAB_HEIGHT = 1.5
export const TAB_COUNT_GAP = '  '

/** The tabs on each line: a tab that would pass `columns` starts the next line. */
function tabLines<T extends { width: number }>(tabs: T[], gap: number, columns: number): T[][] {
  const lines: T[][] = []
  let used = 0
  for (const tab of tabs) {
    const last = lines.at(-1)
    if (last && used + gap + tab.width <= columns) {
      last.push(tab)
      used += gap + tab.width
    } else {
      lines.push([tab])
      used = tab.width
    }
  }

  return lines
}

const HELP_TAB_ID = 'help'

/** The lines the tabs take, with the first line's right end kept for the Help tab. */
export function tabLinesOf(props: TabsProps): ClientTab[][] {
  const first = tabLines(props.tabs, props.gap, props.columns - props.help.width - props.gap)[0] ?? []

  return [first, ...tabLines(props.tabs.slice(first.length), props.gap, props.columns)]
}

function tabAt(props: TabsProps, x: number, y: number): string | null {
  const line = tabLinesOf(props)[Math.floor(y / TAB_HEIGHT)]
  if (y < 0 || !line) return null
  if (y < TAB_HEIGHT && x >= props.columns - props.help.width && x < props.columns) return HELP_TAB_ID
  let left = 0
  for (const tab of line) {
    if (x >= left && x < left + tab.width) return tab.id
    left += tab.width + props.gap
  }

  return null
}

/** The tab row, drawn by the Client or, until the Client posts, by the pane with its own elements. */
export function tabsTree(props: TabsProps, { Box, Text }: Pick<ClientElements, 'Box' | 'Text'>, hover: string | null) {
  const { colors } = props

  const tabBox = (tab: ClientTab) => {
    const isShown = tab.id === HELP_TAB_ID ? props.isHelpShown : !props.isHelpShown && tab.id === props.shown
    const isHovered = !isShown && tab.id === hover
    const isFramed = isShown || props.isEachFramed || tab.id === HELP_TAB_ID
    const background = isShown ? colors.raised : isHovered && isFramed ? (colors.tab ?? colors.raised) : null
    const onRaised = background !== null && background === colors.raised ? colors.raisedText : null
    const labelColor = onRaised ?? (isShown || isHovered ? null : colors.muted)
    const badge =
      tab.badge === null ? null : Text({ ...(tab.badgeColor ? { color: tab.badgeColor } : {}), children: tab.badge })

    return Box({
      key: tab.id,
      width: tab.width,
      height: TAB_HEIGHT,
      ...(isFramed ? { borderStyle: 'single' as const, borderColor: '#0000' } : {}),
      alignItems: 'center',
      justifyContent: 'center',
      ...(background ? { backgroundColor: background } : {}),
      children: Text({
        ...(labelColor ? { color: labelColor } : {}),
        bold: isShown,
        children: badge ? [tab.label, TAB_COUNT_GAP, badge] : tab.label,
      }),
    })
  }

  const helpBox = tabBox({
    id: HELP_TAB_ID,
    label: props.help.label,
    badge: null,
    badgeColor: null,
    width: props.help.width,
  })

  return Box({
    flexDirection: 'column',
    children: tabLinesOf(props).map((line, n) => {
      const tabsRow = Box({ key: `tabs-${n}`, flexDirection: 'row', gap: props.gap, children: line.map(tabBox) })

      return Box({
        key: `line-${n}`,
        flexDirection: 'row',
        ...(n === 0 ? { width: props.columns, justifyContent: 'space-between' as const } : {}),
        children: n === 0 ? [tabsRow, helpBox] : tabsRow,
      })
    }),
  })
}

const Tabs: ClientModule<TabsProps, State> = (props, surface) => {
  // Set on every call, so the listener reads this call's props; a later call replaces it.
  surface.onPointer(e => {
    const at = e.type === 'leave' ? null : tabAt(props, e.x, e.y)
    if (at !== (surface.state?.hover ?? null)) surface.setState({ hover: at })
    if (e.type !== 'down' || e.button === 'right' || at === null) return
    if (at === HELP_TAB_ID) surface.post({ isHelp: true })
    else if (props.isHelpShown || at !== props.shown) surface.post({ tab: at })
  })
  if (!props.isDrawnByPane) return tabsTree(props, surface.elements, surface.state?.hover ?? null)
  surface.post({ isRunning: true })

  return surface.elements.Box({})
}

export default Tabs
