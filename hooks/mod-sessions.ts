import type { Away, DemoCopy, LastAction, Session } from '../types'
import { emptySession, upgradeSession, type SavedSession } from './session-files'
import { sessionToolFields, TOOL_FIELDS } from './tool-schemas'
import { recorded } from './session-presses'
import { CLAUDE_CODE } from './model-text'
import type { AgentTool } from './tools'
import { exclusiveKeys, orderedKeys } from './session-host'
import { withDemoPresence } from './demo'

/** The drawn conversation's session. `revision` counts its writes, so a write computed from an older one is retried. */
export type ModSession = Session & { revision: number }

export const NO_SESSION: ModSession = { ...emptySession(), revision: 0 }
export const PRESENT: Away = { lastActiveAt: 0, isAway: false, minute: 0 }
export const READ_FAILED_TEXT = 'Could not read the inbox.'
export const PR_POLL_MS = 2 * 60_000
export const AWAY_MS = 15 * 60_000
/** The conversations whose Status calls run one after another. They do not hold `queue`, so a ledger call never waits for one. */
export const resultsOrder = orderedKeys()

/** The conversation the session runs. /clear, /resume and /branch move it to another id, and each move is a new generation. */
export const conversation = { id: '', root: '', generation: 0 }

export type Owner = { id: string; generation: number }

export function currentOwner(): Owner {
  return { id: conversation.id, generation: conversation.generation }
}

export function isCurrent(owner: Owner): boolean {
  return owner.id === conversation.id && owner.generation === conversation.generation
}

export const MAX_TRIES = 20

/** A session change that landed: the session it read and the one it wrote, and whether that session is the drawn one. */
export type Changed = { before: Session; after: Session; isDrawn: boolean }

export type SavedRecord = SavedSession & { savedAt: number }

export const sessionKey = (id: string) => `s:${id}`

/** The conversations whose per-reply update runs now. */
export const updating = exclusiveKeys()

/**
 * The session a look draws: `session`, with the ledger, PR views, presses and turn counts of the sample while it shows,
 * and the sample's place and presence.
 */
export function drawnSession(
  session: Session,
  drawn: Pick<DemoCopy, 'ledger' | 'stop' | 'prViews' | 'lastActions' | 'turns'>,
  isDemo: boolean,
  now: number,
): Session {
  const { ledger, stop, prViews, lastActions, turns } = drawn
  const s = { ...session, ledger, stop, prViews, lastActions, presence: { ...session.presence, ...turns } }

  return isDemo ? withDemoPresence(s, now) : s
}

/** The `CLAUDE_CODE_ENTRYPOINT` values the desktop app gives the Claude Code sessions it starts. */
export const DESKTOP_APP_ENTRYPOINTS = ['claude-desktop', 'claude-desktop-3p']

/** An update a reload cut off reads as failed, so the next one catches up. */
export function cutOffUpdate<S extends Session>(s: S): S {
  return s.presence.isUpdating ? { ...s, presence: { ...s.presence, isUpdating: false, ledgerState: 'failed' } } : s
}

/** Row presses keep only their PR records, whose rows outlive a conversation's items. */
export function withoutRowActions(lastActions: Record<string, LastAction>): Record<string, LastAction> {
  return Object.fromEntries(Object.entries(lastActions).filter(([k]) => !/^[if]\d+$/.test(k)))
}

/** The mod's answer to an inbox tool call in `s`, which asks only for fields the conversation's agent has. */
export function answerToolCall(s: Session, tool: AgentTool, input: Record<string, unknown>, now: number) {
  return recorded(CLAUDE_CODE, s, tool, input, now, sessionToolFields(s))
}

/** How the mod came to load a conversation: as the mod started, or after /clear, /resume or a fork in the session. */
export type LoadedBy = 'mod-start' | 'clear' | 'resume' | 'fork'

/**
 * `drawn` with the tool fields of the conversation the mod loads. Claude Code keeps the tools of a conversation's first
 * request when it resumes on a later build, so only a conversation the mod saw start gets this build's fields: one with
 * no turns as the mod starts, or one that /clear began. A saved conversation keeps what it saved, and a fork its
 * parent's. Any other, and one an older build saved, gets 0.3.0's.
 */
export function withLoadedToolFields<S extends Session>(
  drawn: S,
  by: LoadedBy,
  saved: SavedRecord | undefined,
  parent: SavedRecord | undefined,
  turns: number | null,
): S {
  const isSeenStarting = by === 'clear' || (by === 'mod-start' && turns === 0)
  const forkFields = () => (parent ? upgradeSession(parent).toolFields : drawn.toolFields)
  const toolFields = saved
    ? upgradeSession(saved).toolFields
    : by === 'fork'
      ? forkFields()
      : isSeenStarting
        ? TOOL_FIELDS
        : null

  return toolFields === drawn.toolFields ? drawn : { ...drawn, toolFields }
}

/**
 * `loaded`, a saved session, brought back into the drawn conversation `drawn`. A message it still waited on reads
 * unconfirmed, and its sent records go.
 */
export function broughtBack(drawn: Session, loaded: Session): Session {
  const lastActions = Object.fromEntries(
    Object.entries(loaded.lastActions).map(([id, a]) => [
      id,
      a.delivery?.state === 'queued' ? { ...a, delivery: { ...a.delivery, state: 'unconfirmed' as const } } : a,
    ]),
  )
  // The stop and the turn belong to the process that saved them. Whether a turn runs now is this process's.
  const { isTurnRunning } = drawn.presence

  return cutOffUpdate({
    ...loaded,
    lastActions,
    sent: [],
    stop: null,
    turn: emptySession().turn,
    presence: { ...loaded.presence, isTurnRunning },
  })
}
