import { toolActivity } from '../../hooks/model-text'
import { endTurn as endSessionTurn, notePrompt as notePromptIn, sessionView } from '../../hooks/session'
import type { ScreenTab } from '../../hooks/model-text'
import type { SessionView } from '../../hooks/session'
import { NO_HOLDS, TABS } from '../../hooks/view'
import type { ReplyHolds } from '../../hooks/view'
import { SETTLE_WINDOW_MS } from './settle'
import type { Heard, SessionState } from './state'
import { CODEX } from './texts'

const TAB_OPEN_MS = 15_000

export function isTabOpen(s: SessionState, now: number): boolean {
  return now - s.tabSeenAt < TAB_OPEN_MS
}

/** The tab the Inbox tab shows, as the inbox model is told. */
export function screenTabOf(s: SessionState): ScreenTab {
  const shown = TABS.find(t => t.id === s.shownTab)

  return { label: shown?.label ?? s.shownTab, isPage: s.shownTab === 'progress' }
}

export function notePrompt(s: SessionState, text: string, now: number): { state: SessionState; notes: string[] } {
  return notePromptIn(CODEX, s, text, isTabOpen(s, now))
}

export function activityOf(tool: string, input: Record<string, unknown>): string | null {
  return toolActivity(tool, input)
}

export function patchFiles(patch: string): string[] {
  return [...patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)]
    .map(m => (m[1] ?? '').trim())
    .filter(Boolean)
}

export function endTurn(s: SessionState, reply: string, now: number): SessionState {
  return endSessionTurn(CODEX, s, reply, isTabOpen(s, now), { tab: screenTabOf(s) })
}

const MAX_PROMPT_TURNS = 10

export function noteHook(
  s: SessionState,
  hook: 'start' | 'prompt' | 'stop',
  now: number,
  turnId?: string,
): SessionState {
  const h = s.heard
  const heard: Heard =
    hook === 'start'
      ? { ...h, startAt: now }
      : hook === 'prompt'
        ? {
            ...h,
            promptAt: now,
            prompts: h.prompts + 1,
            promptTurns: turnId
              ? [...h.promptTurns.filter(t => t !== turnId), turnId].slice(-MAX_PROMPT_TURNS)
              : h.promptTurns,
          }
        : { ...h, stopAt: now, stops: h.stops + 1 }

  return { ...s, heard }
}

/**
 * Another plugin's Stop hook can send Codex back within the same turn, so the
 * turn ids decide.
 */
export function isPromptMissed(h: Heard, turnId: string | null): boolean {
  if (turnId !== null && (h.promptTurns.length > 0 || h.promptAt === null)) return !h.promptTurns.includes(turnId)

  return h.promptAt === null || (h.stopAt !== null && h.promptAt < h.stopAt)
}

export function noteToolCall(s: SessionState, turnId: string | null, now: number): SessionState {
  return isPromptMissed(s.heard, turnId) ? { ...s, heard: { ...s.heard, promptMissedAt: now } } : s
}

/**
 * Whether the session's hooks are running: `none` when no hook ran, `partial`
 * when SessionStart did not run but another hook did, when UserPromptSubmit
 * missed a turn since it last ran, or when it recorded two turns and Stop none,
 * so no reply reaches the inbox model.
 */
export type HeardState = 'heard' | 'none' | 'partial'

export function heardState(h: Heard): HeardState {
  if (h.startAt === null && h.promptAt === null && h.stopAt === null) return 'none'
  const isMissed = h.promptMissedAt !== null && (h.promptAt === null || h.promptMissedAt >= h.promptAt)
  // Prompts in one turn, such as a steer, share its turn id. A prompt with no turn id counts on its own.
  const turns = h.promptTurns.length > 0 ? h.promptTurns.length : h.prompts

  return h.startAt === null || isMissed || (turns >= 2 && h.stops === 0) ? 'partial' : 'heard'
}

export type View = SessionView & {
  heard: HeardState
  at: number
}

/**
 * The tab sends `thread` back with each press, which reads as stale in any other session.
 * `devPage` is the address of the page the server serves now. A tab showing another page replaces itself with it.
 * Tabs open from older builds read it by this name.
 * `serverBuild` is the fingerprint build.mjs stamped into the running server. `serverLoadError` says why a newer
 * build of the server did not load. `isPluginFolderGone` says the server found no installed copy of itself, as after
 * an uninstall.
 */
export type TabView = View & {
  thread: string
  devPage: string
  serverBuild?: string
  serverLoadError?: string
  isPluginFolderGone?: boolean
  isFetchingPrs: boolean
  isGhMissing: boolean
}

export function viewOf(s: SessionState, now: number, holds: ReplyHolds = NO_HOLDS): View {
  const canCatchUp = s.transcriptPath !== null

  return { ...sessionView(s, now, SETTLE_WINDOW_MS, canCatchUp, holds), heard: heardState(s.heard), at: now }
}
