import { render } from 'preact'
import type { ComponentChildren } from 'preact'
import { COLLAPSE_KEY, FOLD_ALL_KEY, helpVersionText, UNDO_KEY } from '../../core/view/help'
import { DEMO_NOTICE, bannerOf, READING_TEXT } from '../../core/view/banners'
import { isRowTab, shownTabs } from '../../core/view/tabs'
import { tabState, handoff, root, instanceAbort } from './tab-state'
import { noteShownRows, rowsInView, SUBJECTS_ATTRIBUTE } from './tab-shown'
import type { Kept, Lists } from './tab-state'
import type { DrawnPrs } from './tab-pr-steps'
import type { DrawnStatus } from './tab-status-steps'
import { later, dispose, request, applyHost, READ_TIMEOUT_MS } from './tab-host'
import type { HostContext } from './tab-host'
import { measure, animateDraw } from './tab-motion'
import { wakeForMoves } from './tab-wake'
import { applyPageVariables } from './tab-page-variables'
import './list-input'
import { afterDraw, dispatch, drawnTab, openFresh, poll, read, selectedId } from './tab-ui'
import { restoreState } from './tab-swap'
import { foldAllHere } from './tab-fold-all'
import { pressCollapseKey, tabRows } from './tab-rows'
import { Banner } from './tab-parts'
import { pressHerdrAskKey } from './tab-herdr-ask'
import { rowActions, stepLists } from './tab-list'
import { NeedsYou, Findings } from './tab-groups'
import { prClearKeys, prOrderKeys, Prs } from './tab-prs'
import { StatusTab } from './tab-status'
import { settleAnswers, watchAnswerWidths } from './tab-ask-tree'
import { HelpPage, Status, TabBar, toggleDemo } from './tab-chrome'

let isLoadingShown = false
let initializing: Promise<boolean> | null = null
let didStart = false
let hostContext: HostContext = {}

const LOADING_DELAY_MS = 300

function App({
  lists,
  prs,
  status,
}: {
  lists: Lists | null
  prs: DrawnPrs | null
  status: DrawnStatus | null
}): ComponentChildren {
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
      {tabState.ui.isHelpShown ? (
        <HelpPage version={helpVersionText(VERSION, v.isNextBuild === true)} />
      ) : shown === 'needsYou' ? (
        <NeedsYou v={v} lists={lists} now={now} />
      ) : shown === 'findings' ? (
        <Findings v={v} lists={lists} now={now} />
      ) : shown === 'prs' ? (
        prs ? (
          <Prs v={v} prs={prs} now={now} />
        ) : null
      ) : (
        <StatusTab v={v} drawn={status ?? { head: [], fold: [], goal: [], later: [], rows: [] }} />
      )}
      <footer>
        {tabState.isDemo || !DEMO_BUTTON ? null : (
          <button type="button" class="demo-toggle" onClick={() => void toggleDemo()}>
            Show demo
          </button>
        )}
        <div class="footer-end">
          <Status />
        </div>
      </footer>
    </>
  )
}

/** The page last drawn, its tab and whether Help shows, so that a switch to another page draws it at once. */
let drawnPage: string | null = null

function draw() {
  if (tabState.isDisposed || !tabState.isActive) return
  const page = `${drawnTab()}${tabState.ui.isHelpShown ? ' help' : ''}`
  const isPageSwitch = drawnPage !== null && page !== drawnPage
  if (isPageSwitch) document.documentElement.classList.add('page-switched', 'page-switching')
  drawnPage = page
  const before = measure()
  const step = tabState.view ? stepLists(tabState.view) : null
  tabState.lastLists = step?.lists ?? null
  tabState.lastPrs = step?.prs ?? null
  tabState.lastStatus = step?.status ?? null
  tabState.lastBanners = step?.banners ?? null
  const app = () => <App lists={tabState.lastLists} prs={tabState.lastPrs} status={tabState.lastStatus} />
  render(app(), root)
  if (settleAnswers(root)) render(app(), root)
  wakeForMoves()
  watchAnswers()
  animateDraw(before, step?.changed ?? new Set(), step?.drawnAt ?? Date.now())
  if (isPageSwitch) endPageSwitch()
  noteStatusInView()
  const focusField = tabState.focusField
  const fieldToFocus = focusField !== null ? document.getElementById(`type-${focusField}`) : null
  if (fieldToFocus) {
    tabState.focusField = null
    fieldToFocus.focus()
  }
  afterDraw()
}

tabState.draw = draw

/**
 * Takes away the mark that keeps a switch's new banner and empty block from fading in. Their fade starts from their
 * first computed style, so the page's style is computed first, while the mark still holds.
 */
function endPageSwitch() {
  root.getBoundingClientRect()
  document.documentElement.classList.remove('page-switching')
}
const watchAnswers = watchAnswerWidths(root, draw, instanceAbort.signal)

/** Notes the Status subject rows on screen now, while the tab shows the real Status, for the look under way. The demo's ids name sample rows. */
function noteStatusInView() {
  if (!tabState.isActive || tabState.isDemo || tabState.ui.tab !== 'overview' || tabState.ui.isHelpShown) return
  const rows = Array.from(root.querySelectorAll(`[${SUBJECTS_ATTRIBUTE}]`), el => ({
    subjects: el.getAttribute(SUBJECTS_ATTRIBUTE) ?? '',
    top: el.getBoundingClientRect().top,
  }))
  noteShownRows(rowsInView(rows, window.innerHeight), Date.now())
}
window.addEventListener('scroll', noteStatusInView, { passive: true, signal: instanceAbort.signal })
window.addEventListener('resize', noteStatusInView, { passive: true, signal: instanceAbort.signal })

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
      const id = tabState.ui.typing
      if (e.key === 'Escape' && target.tagName === 'INPUT' && id !== null)
        dispatch([{ type: 'close-field', id, isDiscard: false }])
      return
    }
    const isHelpShown = tabState.ui.isHelpShown
    if (e.key === '?' || (e.key === 'Escape' && isHelpShown)) {
      e.preventDefault()
      dispatch([{ type: 'show-help', isShown: e.key === '?' && !isHelpShown }])
      return
    }
    if (pressHerdrAskKey(tabState.view, e.key)) {
      e.preventDefault()
      return
    }
    const switched = shownTabs().find(t => t.hotkey === e.key)
    if (switched) {
      dispatch([{ type: 'show-tab', tab: switched.id }])
      return
    }
    if (e.key === FOLD_ALL_KEY && !isHelpShown) {
      e.preventDefault()
      foldAllHere(null)
      return
    }
    const t = drawnTab()
    if (isHelpShown || !isRowTab(t)) return
    const tabKey =
      t === 'prs'
        ? [...prOrderKeys(tabState.view), ...prClearKeys(tabState.view)].find(x => x.hotkey === e.key)
        : undefined
    if (tabKey) {
      e.preventDefault()
      if (!tabKey.isOut) tabKey.run('key')
      return
    }
    const rows = tabRows(tabState.view, t)
    const move = e.key === 'j' || e.key === 'ArrowDown' ? 1 : e.key === 'k' || e.key === 'ArrowUp' ? -1 : 0
    if (move !== 0) {
      e.preventDefault()
      dispatch([{ type: 'step', by: move, ids: rows.map(r => r.id) }])
      return
    }
    if (e.key === UNDO_KEY) {
      const before = tabState.ui.nextPressId
      dispatch([{ type: 'undo-key' }])
      if (tabState.ui.nextPressId !== before) e.preventDefault()
      return
    }
    const id = selectedId(t)
    if (e.key === COLLAPSE_KEY) {
      e.preventDefault()
      pressCollapseKey(id)
      return
    }
    const row = rows.find(r => r.id === id)
    if (!row || tabState.view.collapsed.includes(row.id)) return
    const { options, keys, more } = rowActions(row)
    const k = [...options, ...keys, ...more].find(x => x.hotkey === e.key)
    if (k) {
      e.preventDefault()
      if (!k.isOut) k.run('key')
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
  if (!restoreState()) openFresh()
  void initialize()
  startPage()
}
