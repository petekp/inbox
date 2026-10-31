import type { herdrReporter } from '../../hooks/herdr'
import type { Run } from '../../hooks/gh'
import type { prFetchTracker, SessionHost } from '../../hooks/session-host'
import type { ShownTab } from '../../hooks/tabs'
import type { OmpState } from './state'
import type { HostDeps } from './host'

/** The slice of omp's extension context the handlers read. */
export type OmpContext = {
  hasUI: boolean
  cwd: string
  sessionManager: { getSessionId(): string; getBranch(): readonly unknown[] }
  setTimeout(callback: () => void, ms: number): unknown
}

export type Memory = {
  isGhMissing: boolean
  /** The session omp shows now. Only it reports to the pane. */
  shownId: string | null
  /** The session the main agent runs. A `task:subagent:*` frame names no session, and only the main agent's own subagents send one here. */
  framesFor: string | null
}

export type HostContext = {
  deps: HostDeps
  dir: string
  /** The open panels, with the tab each shows. */
  openPanels: Map<string, ShownTab>
  prepared: Set<string>
  prFetches: ReturnType<typeof prFetchTracker>
  listeners: Map<string, Set<() => void>>
  reportToHerdr: ReturnType<typeof herdrReporter>
  run: Run
  memory: Memory
  sendToAgent(ctx: OmpContext, text: string): string | null
  askFor(ctx: OmpContext, id: string): SessionHost<OmpState>['ask']
  dropTools(): Promise<void>
  showBand(ctx: OmpContext): void
  modelNameOf(ctx: OmpContext): string | null
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
