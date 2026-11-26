import { isRowTab, isShownTab } from '../../core/view/tabs'
import { ARRIVAL_TABS } from '../../core/view/arrivals'
import { PRESS_TIMEOUT_MS } from '../../core/view/session-view'
import { restoredUi } from '../../core/view/ui-controller'
import { freshUi, NO_UI_CURSOR } from '../../core/view/ui-controller-types'
import type { UiState } from '../../core/view/ui-controller-types'
import type { Draft, FoldKind } from '../../types'
import { tabState, inboxWindow, handoff, root, CODEX_LOOK } from './tab-state'
import type { Kept, CandidatePage, PageHandoff } from './tab-state'
import { later, cancelTimer, dispose, callTool, READ_TIMEOUT_MS } from './tab-host'
import { applyPageVariables } from './tab-page-variables'

const KEPT_KEY = 'inbox-tab-kept'

/**
 * What a page keeps across a swap: the controller's state as `restoredUi` leaves it, under `ui`, and beside it the
 * fields a page from before `ui` reads, so an older page still opens on the same tab, rows, drafts and folds. Those
 * fields leave out a sent reply's draft, since an older page drops a draft once it sends it.
 */
export function keptOf(ui: UiState, isDemo: boolean): Kept {
  return {
    version: isRowTab(ui.tab) ? 1 : 2,
    isDemo,
    tab: ui.tab,
    selection: {
      needsYou: ui.selection.needsYou.id,
      findings: ui.selection.findings.id,
      prs: ui.selection.prs.id,
    },
    typing: ui.typing,
    drafts: Object.entries(ui.drafts).filter(([id, d]) => ui.sentReplies[id]?.text !== d.text.trim()),
    optionsShown: [...ui.optionsShown],
    unfolded: [...ui.unfolded],
    ...(ui.shownSince === null ? {} : { shownSince: ui.shownSince }),
    statusUnfolded: [...ui.statusUnfolded],
    ui: { version: 3, state: restoredUi(ui) },
  }
}

/** The controller's state from what a page kept: its `ui`, or for a page from before `ui`, the fields it kept. */
export function uiOfKept(kept: Kept, now: number): UiState {
  if (kept.ui?.version === 3) return restoredUi({ ...freshUi(CODEX_LOOK), ...kept.ui.state, config: CODEX_LOOK })
  const fresh = freshUi(CODEX_LOOK, isShownTab(kept.tab) ? kept.tab : 'overview')
  const cursor = (id: string | null) => (id ? { id, index: 0, guard: null } : NO_UI_CURSOR)
  // A draft an earlier page kept as text began before now, so a row that closed before this page stays closed.
  const draft = (d: Draft | string): Draft => (typeof d === 'string' ? { text: d, since: now } : d)
  const unfolded = kept.unfolded.flatMap((g): FoldKind[] => (g === 'finding' ? ['issue', 'opportunity'] : [g]))

  return {
    ...fresh,
    // A page swap is not a leave, so the rows the old page kept in place stay.
    shownSince: typeof kept.shownSince === 'number' ? kept.shownSince : now,
    selection: Object.fromEntries(ARRIVAL_TABS.map(t => [t, cursor(kept.selection[t])])) as UiState['selection'],
    typing: kept.typing,
    drafts: Object.fromEntries(kept.drafts.map(([id, d]) => [id, draft(d)])),
    optionsShown: [...kept.optionsShown],
    unfolded: [...new Set(unfolded)],
    statusUnfolded: [...(kept.statusUnfolded ?? [])],
  }
}

/** Takes the state the last page kept, if any. Returns whether there was one. */
export function restoreState(incoming?: Kept): boolean {
  let kept: Kept | null = incoming ?? inboxWindow.__inboxKept ?? null
  if (!incoming) {
    delete inboxWindow.__inboxKept
    try {
      const raw = sessionStorage.getItem(KEPT_KEY)
      sessionStorage.removeItem(KEPT_KEY)
      kept ??= raw ? (JSON.parse(raw) as Kept) : null
    } catch {}
  }
  if (kept?.version !== 1 && kept?.version !== 2) return false
  tabState.isDemo = kept.isDemo
  tabState.ui = uiOfKept(kept, Date.now())
  tabState.focusField = tabState.ui.typing

  return true
}

const PAGE_START_MS = 2_000

export const PAGE = handoff?.page ?? inboxWindow.__inboxPage
let isSwapping = false

export async function swapPage(target: string) {
  if (isSwapping || tabState.isDisposed || target === PAGE) return
  isSwapping = true
  let staged: PageHandoff | null = null
  let nextScript: HTMLScriptElement | null = null
  let committed = false
  try {
    const { html } = await callTool<{ html: string }>('inbox_tab_page', {}, READ_TIMEOUT_MS)
    if (tabState.isDisposed || tabState.requestedPage !== target) return
    if (!/<\/html>\s*$/i.test(html)) throw new Error('The new page is incomplete.')
    const incoming = new DOMParser().parseFromString(html, 'text/html')
    const pageRoot = incoming.getElementById('app')
    const pageStyle = incoming.getElementById('inbox-style') ?? incoming.head.querySelector('style')
    const pageScript = incoming.getElementById('inbox-script') ?? incoming.body.querySelector('script')
    const stamp = [...incoming.head.querySelectorAll('script')]
      .map(script => script.textContent?.match(/^\s*window\.__inboxPage\s*=\s*("[^"\n]+")\s*;?\s*$/)?.[1])
      .find(value => value !== undefined)
    const page = stamp ? (JSON.parse(stamp) as unknown) : null
    const supportsHandoff = incoming.querySelector('meta[name="inbox-handoff"]')?.getAttribute('content') === '1'
    const ownedStyle = document.getElementById('inbox-style')
    const ownedScript = document.getElementById('inbox-script')
    if (
      !(pageRoot instanceof HTMLDivElement) ||
      pageRoot.childNodes.length > 0 ||
      !(pageStyle instanceof HTMLStyleElement) ||
      !pageStyle.textContent ||
      !(pageScript instanceof HTMLScriptElement) ||
      pageScript.src ||
      !pageScript.textContent ||
      typeof page !== 'string' ||
      page !== target ||
      !/^ui:\/\/inbox\/tab-[a-f0-9]{12}$/.test(page) ||
      !supportsHandoff ||
      !(ownedStyle instanceof HTMLStyleElement) ||
      !(ownedScript instanceof HTMLScriptElement)
    )
      throw new Error('The new page is incomplete.')
    const nextRoot = document.createElement('div')
    nextRoot.id = 'app'
    const nextStyle = document.createElement('style')
    nextStyle.id = 'inbox-style'
    nextStyle.textContent = pageStyle.textContent
    nextScript = document.createElement('script')
    nextScript.id = 'inbox-script-candidate'
    nextScript.textContent = pageScript.textContent
    let ready!: (candidate: CandidatePage) => void
    const candidateReady = new Promise<CandidatePage>(resolve => (ready = resolve))
    staged = {
      page,
      root: nextRoot,
      aborted: false,
      ready: candidate => {
        if (!staged?.aborted && inboxWindow.__inboxHandoff === staged) ready(candidate)
      },
    }
    inboxWindow.__inboxHandoff = staged
    document.body.append(nextScript)
    const waitFor = <T>(promise: Promise<T>, ms: number) =>
      new Promise<T>((resolve, reject) => {
        const timeout = later(() => reject(new Error('The new page did not start.')), ms)
        void promise.then(
          value => {
            cancelTimer(timeout)
            resolve(value)
          },
          error => {
            cancelTimer(timeout)
            reject(error)
          },
        )
      })
    const candidate = await waitFor(candidateReady, PAGE_START_MS)
    if (!(await waitFor(candidate.initialize(), READ_TIMEOUT_MS))) throw new Error('The new page could not connect.')
    if (candidate.prepare) await waitFor(candidate.prepare(keptOf(tabState.ui, tabState.isDemo)), READ_TIMEOUT_MS)
    const deadline = Date.now() + PRESS_TIMEOUT_MS
    while (tabState.activePresses > 0 && Date.now() < deadline) await new Promise<void>(resolve => later(resolve, 30))
    if (tabState.activePresses > 0) throw new Error('The current press is still running.')
    if (tabState.isDisposed || tabState.requestedPage !== target || staged.aborted) return
    const kept = keptOf(tabState.ui, tabState.isDemo)
    root.replaceWith(nextRoot)
    try {
      ownedStyle.replaceWith(nextStyle)
      candidate.activate(kept)
      candidate.start()
    } catch (err) {
      if (nextRoot.isConnected) nextRoot.replaceWith(root)
      if (nextStyle.isConnected) nextStyle.replaceWith(ownedStyle)
      applyPageVariables()
      throw err
    }
    dispose()
    ownedScript.remove()
    nextScript.id = 'inbox-script'
    inboxWindow.__inboxPage = page
    committed = true
  } catch {
    if (!tabState.isDisposed && tabState.requestedPage === target) {
      tabState.updateError = { page: target, text: 'Could not load the inbox update.' }
      tabState.draw()
    }
  } finally {
    if (staged) {
      staged.aborted = true
      if (inboxWindow.__inboxHandoff === staged) delete inboxWindow.__inboxHandoff
      if (!committed) {
        try {
          staged.dispose?.()
        } catch {}
      }
    }
    if (!committed) nextScript?.remove()
    isSwapping = false
  }
}
