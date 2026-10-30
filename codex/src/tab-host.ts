import { render } from 'preact'
import { POLL_MS } from './settle'
import { tabState, inboxWindow, handoff, root, instanceAbort, timers, animations, pending } from './tab-state'

export type HostContext = Parameters<typeof applyHost>[0]

if (handoff) handoff.dispose = dispose

export function later(run: () => void, ms: number): number {
  if (tabState.isDisposed) return 0
  const id = window.setTimeout(() => {
    timers.delete(id)
    if (!tabState.isDisposed) run()
  }, ms)
  timers.add(id)
  return id
}

export function cancelTimer(id: number | undefined) {
  if (id === undefined) return
  window.clearTimeout(id)
  timers.delete(id)
}

export function dispose() {
  if (tabState.isDisposed) return
  tabState.isDisposed = true
  instanceAbort.abort()
  for (const timer of timers) window.clearTimeout(timer)
  timers.clear()
  for (const animation of animations) {
    animation.onfinish = null
    animation.oncancel = null
    animation.cancel()
  }
  animations.clear()
  for (const request of pending.values()) request.reject(new Error('Inbox page replaced'))
  pending.clear()
  render(null, root)
  if (tabState.isActive) document.body.classList.remove('still')
}

export function request(method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
  if (tabState.isDisposed) return Promise.reject(new Error('Inbox page replaced'))
  return new Promise((resolve, reject) => {
    const id = (inboxWindow.__inboxRequestId = (inboxWindow.__inboxRequestId ?? Date.now()) + 1)
    const timer =
      timeoutMs === undefined
        ? undefined
        : later(() => {
            if (pending.delete(id)) reject(new Error(`The inbox did not answer in ${Math.round(timeoutMs / 1000)} s`))
          }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*')
  })
}

window.addEventListener(
  'message',
  e => {
    if (tabState.isDisposed) return
    const m = e.data
    if (!m || m.jsonrpc !== '2.0') return
    if (m.id != null && !m.method && pending.has(m.id)) {
      const p = pending.get(m.id)!
      pending.delete(m.id)
      cancelTimer(p.timer)
      if (m.error) p.reject(m.error)
      else p.resolve(m.result)
      return
    }
    if (m.method === 'ui/notifications/host-context-changed') {
      if (tabState.isActive) applyHost(m.params ?? {})
      else tabState.stagedHostChanges = mergeHostContext(tabState.stagedHostChanges, m.params ?? {})
    }
    if (!tabState.isActive) return
    if (m.id != null && m.method) parent.postMessage({ jsonrpc: '2.0', id: m.id, result: {} }, '*')
  },
  { signal: instanceAbort.signal },
)

export function applyHost(ctx: { theme?: string; styles?: { variables?: Record<string, string> } }) {
  if (tabState.isDisposed || !tabState.isActive) return
  if (ctx.theme) document.documentElement.dataset.theme = ctx.theme
  for (const [k, v] of Object.entries(ctx.styles?.variables ?? {})) document.documentElement.style.setProperty(k, v)
}

function mergeHostContext(current: HostContext, next: HostContext): HostContext {
  return {
    ...current,
    ...next,
    styles: {
      ...current.styles,
      ...next.styles,
      variables: { ...current.styles?.variables, ...next.styles?.variables },
    },
  }
}

export async function callTool<T>(name: string, args: unknown = {}, timeoutMs?: number): Promise<T> {
  const r = (await request('tools/call', { name, arguments: args }, timeoutMs)) as
    { structuredContent?: T; isError?: boolean; content?: { text?: string }[] } | undefined
  if (tabState.isDisposed) throw new Error('Inbox page replaced')
  if (!r || r.isError || r.structuredContent === undefined)
    throw new Error((r?.isError && r.content?.[0]?.text) || 'The answer had nothing to show')

  return r.structuredContent
}

export const READ_TIMEOUT_MS = 3 * POLL_MS
