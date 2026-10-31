import { isRowTab, isShownTab } from '../../hooks/view'
import { ARRIVAL_TABS } from '../../hooks/arrivals'
import { PRESS_TIMEOUT_MS } from '../../hooks/session-view'
import { tabState, selection, drafts, optionsShown, unfolded, inboxWindow, handoff, root } from './tab-state'
import type { Kept, CandidatePage, PageHandoff } from './tab-state'
import { later, cancelTimer, dispose, callTool, READ_TIMEOUT_MS } from './tab-host'
import { applyPageVariables } from './tab-motion'

const KEPT_KEY = 'inbox-tab-kept'

function capturedState(): Kept {
  return {
    version: isRowTab(tabState.tab) ? 1 : 2,
    isDemo: tabState.isDemo,
    tab: tabState.tab,
    selection: {
      needsYou: selection.needsYou?.id ?? null,
      findings: selection.findings?.id ?? null,
      prs: selection.prs?.id ?? null,
    },
    typing: tabState.typing,
    drafts: [...drafts],
    optionsShown: [...optionsShown],
    unfolded: [...unfolded],
    shownSince: tabState.shownSince,
  }
}

export function restoreState(incoming?: Kept) {
  let kept: Kept | null = incoming ?? inboxWindow.__inboxKept ?? null
  if (!incoming) {
    delete inboxWindow.__inboxKept
    try {
      const raw = sessionStorage.getItem(KEPT_KEY)
      sessionStorage.removeItem(KEPT_KEY)
      kept ??= raw ? (JSON.parse(raw) as Kept) : null
    } catch {}
  }
  if (kept?.version !== 1 && kept?.version !== 2) return
  tabState.isDemo = kept.isDemo
  if (isShownTab(kept.tab)) tabState.tab = kept.tab
  // A page swap is not a leave, so the rows the old page kept in place stay.
  if (typeof kept.shownSince === 'number') tabState.shownSince = kept.shownSince
  for (const t of ARRIVAL_TABS) {
    const id = kept.selection[t]
    selection[t] = id ? { id, openedAt: 0 } : null
  }
  tabState.typing = kept.typing
  tabState.focusTyping = tabState.typing !== null
  // A draft an earlier page kept as text began before now, so a row that closed before this page stays closed.
  for (const [id, draft] of kept.drafts)
    drafts.set(id, typeof draft === 'string' ? { text: draft, since: Date.now() } : draft)
  for (const id of kept.optionsShown) optionsShown.add(id)
  for (const g of kept.unfolded)
    for (const fold of g === 'finding' ? (['issue', 'opportunity'] as const) : [g]) unfolded.add(fold)
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
    const deadline = Date.now() + PRESS_TIMEOUT_MS
    while (tabState.activePresses > 0 && Date.now() < deadline) await new Promise<void>(resolve => later(resolve, 30))
    if (tabState.activePresses > 0) throw new Error('The current press is still running.')
    if (tabState.isDisposed || tabState.requestedPage !== target || staged.aborted) return
    const kept = capturedState()
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
