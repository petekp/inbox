import { render } from 'preact'
import type { ComponentChildren } from 'preact'
import { HELP_COPY } from '../../hooks/help'
import { versionLabel, DEMO_NOTICE, bannerOf, READING_TEXT } from '../../hooks/banners'
import { isRowTab, shownTabs } from '../../hooks/tabs'
import { tabState, handoff, root, instanceAbort } from './tab-state'
import type { Kept, Lists } from './tab-state'
import { later, dispose, request, applyHost, READ_TIMEOUT_MS } from './tab-host'
import type { HostContext } from './tab-host'
import { measure, animateDraw, revealSelected, applyPageVariables, wakeForMoves } from './tab-motion'
import { switchTab, drawnTab, selectedIndex, select, rowActions } from './tab-selection'
import { restoreState } from './tab-swap'
import { read, poll } from './tab-read'
import { tabRows } from './tab-rows'
import { Banner } from './tab-parts'
import { stepLists } from './tab-list'
import { NeedsYou, Findings } from './tab-groups'
import { prTabKeys, prOrderKeys, Prs } from './tab-prs'
import { StatusTab } from './tab-status'
import { HelpPage, Status, TabBar, toggleDemo } from './tab-chrome'

let isLoadingShown = false
let initializing: Promise<boolean> | null = null
let didStart = false
let hostContext: HostContext = {}

const LOADING_DELAY_MS = 300

function App({ lists }: { lists: Lists | null }): ComponentChildren {
  if (!tabState.view || !lists)
    return tabState.readError !== null ? (
      <Banner
        banner={bannerOf('read-failed', `Could not read the inbox. ${tabState.readError}`)}
        label="Reload"
        press={() => void (tabState.isConnected ? read() : initialize())}
      />
    ) : isLoadingShown ? (
      <div class="notice muted">{READING_TEXT}</div>
    ) : null
  const v = tabState.view
  const now = v.at
  const shown = drawnTab()

  return (
    <>
      {tabState.isDemo && !DEMO_RECORDING ? (
        <div class="banner-place">
          <Banner banner={bannerOf('demo', DEMO_NOTICE)} label="Hide demo" press={() => void toggleDemo()} />
        </div>
      ) : null}
      <TabBar v={v} />
      {tabState.isHelpShown ? (
        <HelpPage v={v} />
      ) : shown === 'needsYou' ? (
        <NeedsYou v={v} lists={lists} now={now} />
      ) : shown === 'findings' ? (
        <Findings v={v} lists={lists} now={now} />
      ) : shown === 'prs' ? (
        <Prs v={v} now={now} />
      ) : (
        <StatusTab page={v.statusPage} />
      )}
      <footer>
        <button
          type="button"
          class="help-toggle"
          title={`${HELP_COPY.open} (?)`}
          aria-pressed={tabState.isHelpShown}
          onClick={() => {
            tabState.isHelpShown = !tabState.isHelpShown
            draw()
          }}
        >
          {tabState.isHelpShown ? HELP_COPY.close : HELP_COPY.open}
        </button>
        {tabState.isDemo || !DEMO_BUTTON ? null : (
          <button type="button" class="demo-toggle" onClick={() => void toggleDemo()}>
            Show demo
          </button>
        )}
        <div class="footer-end">
          <Status v={v} />
          <span class="version">{versionLabel(VERSION, v.isNextBuild === true)}</span>
        </div>
      </footer>
    </>
  )
}

function draw() {
  if (tabState.isDisposed || !tabState.isActive) return
  const before = measure()
  const step = tabState.view ? stepLists(tabState.view) : null
  tabState.lastLists = step?.lists ?? null
  wakeForMoves()
  render(<App lists={tabState.lastLists} />, root)
  animateDraw(before, step?.changed ?? new Set())
  const fieldToFocus =
    tabState.focusTyping && tabState.typing ? document.getElementById(`type-${tabState.typing}`) : null
  if (fieldToFocus) {
    tabState.focusTyping = false
    fieldToFocus.focus()
  }
}

tabState.draw = draw

let pressedAt: { x: number; y: number } | null = null
document.addEventListener(
  'pointerdown',
  e => {
    if (!tabState.isActive) return
    if (!(e.target instanceof Element) || !root.contains(e.target) || !e.target.closest('.list, .fold')) return
    pressedAt = { x: e.clientX, y: e.clientY }
    document.body.classList.add('still')
  },
  { signal: instanceAbort.signal },
)
document.addEventListener(
  'pointermove',
  e => {
    if (!tabState.isActive) return
    if (!pressedAt || Math.hypot(e.clientX - pressedAt.x, e.clientY - pressedAt.y) < 3) return
    pressedAt = null
    document.body.classList.remove('still')
  },
  { signal: instanceAbort.signal },
)

document.addEventListener(
  'keydown',
  e => {
    if (!tabState.isActive) return
    if (e.metaKey || e.ctrlKey || e.altKey || !tabState.view) return
    const target = e.target as HTMLElement | null
    if (target?.closest('input, textarea')) {
      if (e.key === 'Escape' && target.tagName === 'INPUT') {
        tabState.typing = null
        draw()
      }
      return
    }
    if (e.key === '?' || (e.key === 'Escape' && tabState.isHelpShown)) {
      e.preventDefault()
      tabState.isHelpShown = e.key === '?' && !tabState.isHelpShown
      draw()
      return
    }
    const switched = shownTabs(tabState.view.isNextBuild === true).find(t => t.hotkey === e.key)
    if (switched) {
      switchTab(switched.id)
      draw()
      return
    }
    const t = drawnTab()
    if (tabState.isHelpShown || !isRowTab(t)) return
    const tabKey =
      t === 'prs'
        ? [...prOrderKeys(tabState.view), ...prTabKeys(tabState.view)].find(x => x.hotkey === e.key)
        : undefined
    if (tabKey) {
      e.preventDefault()
      if (!tabKey.isOut) tabKey.run()
      return
    }
    const rows = tabRows(tabState.view, t)
    const at = selectedIndex(rows, t, tabState.view)
    const move = e.key === 'j' || e.key === 'ArrowDown' ? 1 : e.key === 'k' || e.key === 'ArrowUp' ? -1 : 0
    if (move !== 0) {
      e.preventDefault()
      select(t, rows, Math.max(0, Math.min(rows.length - 1, at + move)))
      revealSelected()
      return
    }
    const row = rows[at]
    if (!row) return
    const { keys, more } = rowActions(row)
    const k = [...keys, ...more].find(x => x.hotkey === e.key)
    if (k) {
      e.preventDefault()
      if (!k.isOut) k.run()
    }
  },
  { signal: instanceAbort.signal },
)

function startConnected() {
  if (tabState.isDisposed || !tabState.isActive || !tabState.isConnected || didStart) return
  didStart = true
  applyHost(hostContext)
  applyHost(tabState.stagedHostChanges)
  parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} }, '*')
  void poll()
}

function initialize(): Promise<boolean> {
  if (tabState.isDisposed) return Promise.resolve(false)
  if (tabState.isConnected) return Promise.resolve(true)
  if (initializing) return initializing
  tabState.readError = null
  if (tabState.isActive) draw()
  initializing = request(
    'ui/initialize',
    {
      protocolVersion: '2026-01-26',
      appInfo: { name: 'inbox', version: VERSION },
      appCapabilities: { tools: {} },
    },
    READ_TIMEOUT_MS,
  )
    .then(r => {
      if (tabState.isDisposed) return false
      hostContext = (r as { hostContext?: Parameters<typeof applyHost>[0] } | undefined)?.hostContext ?? {}
      tabState.isConnected = true
      startConnected()
      return true
    })
    .catch(() => {
      if (tabState.isActive && !tabState.isDisposed) {
        tabState.readError = 'The inbox could not connect to Codex.'
        draw()
      }
      return false
    })
    .finally(() => {
      initializing = null
    })
  return initializing
}

function startPage() {
  startConnected()
  later(() => {
    isLoadingShown = true
    if (!tabState.view && tabState.readError === null) draw()
  }, LOADING_DELAY_MS)
}

function activatePage(kept: Kept) {
  if (tabState.isDisposed || !handoff || handoff.aborted) throw new Error('The new page stopped.')
  restoreState(kept)
  tabState.isActive = true
  applyPageVariables()
  draw()
}

if (handoff) handoff.ready({ initialize, activate: activatePage, start: startPage, dispose })
else {
  applyPageVariables()
  restoreState()
  void initialize()
  startPage()
}
