import type { herdrReporter } from '../../core/remote/herdr'
import type { HerdrAsk } from '../../core/remote/herdr-ask'
import type { PrShared } from '../../core/domain/pr-fetch'
import type { Run } from '../../core/domain/gh'
import type { DelegateSession } from '../../core/remote/hc-terminals'
import type { SessionHost } from '../../core/runtime/session-host'
import type { prFetchTracker } from '../../core/runtime/host-prs'
import type { ShownTab } from '../../core/view/tabs'
import type { UiState } from '../../core/view/ui-controller-types'
import type { OmpState } from './state'
import type { HostDeps } from './host'
import type { OmpPresses } from './host-presses'
import type { InboxModel } from './panel'

/** The slice of omp's extension context the handlers read. */
export type OmpContext = {
  hasUI: boolean
  cwd: string
  sessionManager: { getSessionId(): string; getBranch(): readonly unknown[] }
  setTimeout(callback: () => void, ms: number): unknown
}

export type Memory = {
  isGhMissing: boolean
  /** What every session of this omp shares about GitHub: views read lately, and the last limit error. */
  prShared: PrShared
  /** The session omp shows now. Only it reports to the pane. */
  shownId: string | null
  /** The session the main agent runs. A `task:subagent:*` frame names no session, and only the main agent's own subagents send one here. */
  framesFor: string | null
  /** The working folder of the session omp shows, read when asked, which its presses open paths against. */
  shownCwd: (() => string) | null
  /** Why this omp could not install or update the inbox's Herdr mod at its start, or null. */
  herdrModFailure: string | null
  /** The question before omp installs the inbox's Herdr mod, while it shows. */
  herdrAsk: HerdrAsk | null
}

export type HostContext = {
  deps: HostDeps
  dir: string
  /** The open panels, with the tab each shows. */
  openPanels: Map<string, ShownTab>
  /** The tool call of the ask dialog each session's agent has open, by session id. */
  openAsks: Map<string, string>
  /** Each session's panel state from the shared controller, by session id. A panel starts from it when it opens. */
  uiStates: Map<string, UiState>
  prepared: Set<string>
  prFetches: ReturnType<typeof prFetchTracker>
  listeners: Map<string, Set<() => void>>
  reportToHerdr: ReturnType<typeof herdrReporter>
  /** Says why Herdr's labels or published file did not change. */
  logHerdr: (text: string) => void
  /** Follows the presses the Herdr look writes for the session omp shows. */
  presses: OmpPresses
  run: Run
  /** The delegate session omp runs as, as `core/remote/hc-terminals.ts:delegateSession` reads it, or null. */
  delegate(): Promise<DelegateSession | null>
  memory: Memory
  sendToAgent(ctx: OmpContext, text: string): Promise<string | null>
  askFor(ctx: OmpContext, id: string): SessionHost<OmpState>['ask']
  dropTools(): Promise<void>
  showBand(ctx: OmpContext): void
  inboxModelOf(ctx: OmpContext): InboxModel
  /** Tells the agent `notes` at its next turn, out of the person's view. */
  sendNotes(notes: string[]): void
}

/**
 * True for a session nobody watches: a subagent, or a main session run without a UI, such as print mode. An older omp
 * gives an extension no `ctx.agent`, and starts a subagent with no UI, so the read is guarded.
 */
export function isUnattended(ctx: OmpContext): boolean {
  const agent = (ctx as { agent?: { kind?: unknown } }).agent

  return agent?.kind === 'sub' || !ctx.hasUI
}

export const sessionIdOf = (ctx: OmpContext) => ctx.sessionManager.getSessionId()
