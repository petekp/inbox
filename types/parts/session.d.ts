import type { Place } from './status'
import type { TurnDialogQuestion } from './items'
import type { LastAction, RowNote } from './press'
import type { Ledger, PrView } from './ledger'

/** Why the session halted outside the conversation, from the error Claude Code classified it with. */
export type Stop = {
  kind: 'sign-in' | 'billing' | 'usage-limit' | 'api-error'
  /** Claude Code's word for the error, such as `authentication_failed`. */
  detail: string
  /** When a usage limit resets, as Claude Code said it: "7:33pm". */
  resets: string | null
  at: number
}

export type Dialog = {
  kind: 'permission' | 'question'
  text: string
  /** The tool call it is for, so it closes when that call ends. */
  key: string
}

/** Whether the person is away from the mod's session, and the minute of the last clock tick while away, so the pane's ages redraw each minute. */
export type Away = {
  lastActiveAt: number
  isAway: boolean
  minute: number
}

/** The mod's presence as builds before the shared session kept it. */
export type OldPresence = Away & {
  isUpdating: boolean
  ledgerState: 'current' | 'behind' | 'failed'
  turnsStarted: number
  turnsApplied: number
}

export type Tab = 'needsYou' | 'findings' | 'prs'

/** A tab that shows a page instead of rows. `'overview'` is the Status tab, under the id it was saved with. */
export type PageTab = 'overview'

/**
 * A tab's open row: its id, its position, and when a click or key opened it.
 * `id: null` with `openedAt: 0` means no row was opened in this conversation, so
 * the pane draws the tab's top row open. `openedAt: 0` with an id means the row
 * was open by that default when pressed, so it is not guarded.
 */
export type Cursor = { id: string | null; index: number; openedAt: number }

export type PrViews = {
  views: Record<string, PrView>
  branchRef: string | null
  isFetching: boolean
  /** The mod sets this when its last fetch found no gh to start. Codex keeps its own flag in the server. */
  isGhMissing?: boolean
  /** Set by the last fetch whose gh runs answered: whether one of them asked for a sign-in. */
  isGhSignedOut?: boolean
}

/**
 * The turns started in this session, and how many of them reached the
 * ledger. A load that finds more started than applied catches up.
 */
export type Turns = { turnsStarted: number; turnsApplied: number }

/**
 * The sample state `/inbox demo` shows in place of the session's own. Presses
 * on it change only this copy, so nothing reaches the real inbox, its store or Claude.
 */
export type DemoCopy = {
  ledger: Ledger
  stop: Stop | null
  prViews: PrViews
  lastActions: Record<string, LastAction>
  /** Each sample row's latest note, by the row's id. */
  notes: Record<string, RowNote>
  turns: Turns
}

export type Exchange = {
  /** What the person typed; null when something else started the turn. */
  person: string | null
  trigger: string | null
  activity: string[]
  reply: string
  /** The person-prompt count when the reply was written. */
  turn: number
  press: Press | null
  screen: string
  /** The agent's own task list when the reply was written. */
  tasks: HostTask[]
}

export type Press = { id: string; action: 'answer' | 'explain' | 'compare' | 'run' | 'done' }

/** The inbox text the agent last read beside a prompt, and the closed items it was told about. */
export type Told = { inbox: string | null; closed: string[] }

export type HostTaskStatus = 'pending' | 'in-progress' | 'done' | 'dropped' | 'blocked'

/** One task of the agent's own task list, as its host reports it. */
export type HostTask = { id: string; text: string; status: HostTaskStatus }

/**
 * Why a Status call wrote nothing. `no-answer`: the call gave no text. `refused`: it answered twice with text the
 * parser refused, and `answer` holds the start of the second answer.
 */
export type StatusFailure = { at: number; cause: 'no-answer' | 'refused'; answer: string | null }

/** One conversation's inbox: what every host saves and the shared session functions change. */
export type Session = {
  ledger: Ledger
  /** What the turn running now gathered for the per-reply update. */
  turn: {
    person: string | null
    /** What started the turn when the person's words did not, such as a task notification. */
    trigger: string | null
    activity: string[]
    press: Press | null
  }
  /** The inbox text the agent last read beside a prompt, and the closed items it was told about. */
  told: Told
  presence: {
    /** Prompts that started a turn, and how many of those turns the inbox model has summarized. */
    turnsStarted: number
    turnsApplied: number
    /** `behind`: the ledger may have missed a turn, and a host that can catch up does. Only `failed` shows. */
    ledgerState: 'current' | 'behind' | 'failed'
    /**
     * An exchange failed twice and was dropped, so its reply never reached the ledger. A later update that applies
     * keeps `failed` until a catch-up covers it.
     */
    hasDroppedReply: boolean
    isUpdating: boolean
    /** Whether the main agent's turn runs. A subagent's turn does not set it. */
    isTurnRunning: boolean
    /** When the running turn started; null when the host did not say. */
    turnStartedAt: number | null
    /** When the agent's last turn ended. */
    lastReplyAt: number | null
    /**
     * When the person last sent a message they typed. A message a press sent does not count. A row that settled before
     * it folds, once its Undo ends.
     */
    lastTypedMessageAt: number | null
  }
  /** Where the session started. Null until the host names it. */
  place: Place | null
  /**
   * Exchanges waiting for the inbox model, oldest first, with the turns started when each ended. `failed` marks
   * one whose first update failed: the next update tries it once more, then drops it.
   */
  pending: { ex: Exchange; turnsStarted: number; failed?: true }[]
  /**
   * Messages a press sent, saved before delivery. A prompt that arrives can match an accepted
   * record by its text; an uncertain one stays to block false matches with later presses.
   */
  sent: {
    text: string
    press: Press | null
    at: number
    row: string | null
    queuedId: string | null
    /** The row press's time in milliseconds; null for older records or messages without a row. */
    pressedAt: number | null
    /** The local press identity; null for older records or messages without a row. */
    deliveryId: string | null
    phase?: 'attempting' | 'accepted' | 'uncertain'
  }[]
  lastActions: Record<string, LastAction>
  /** The rows the person's replies in progress held at the latest view or press. Every write keeps their closed records. */
  heldRows: string[]
  /**
   * When the look began showing the tab it shows, at the latest write that knew. Null while no look shows the inbox.
   * Every write keeps the closed records of the rows closed or pressed since then, which stay drawn in place.
   */
  shownSince: number | null
  /** The PRs tab's data: each PR's latest view and the current branch's PR. `isFetching` is always false here; the host knows what runs. */
  prViews: PrViews
  /** Why the last turn stopped, until the next turn starts. */
  stop: Stop | null
  /** The last Status call that wrote nothing, until a later one writes. Saved under the tab's earlier name. */
  overviewFailure: StatusFailure | null
  /** When a Status call last wrote, or failed, or started while a turn ran. Null before the first. Saved under the tab's earlier name. */
  lastOverviewCallAt: number | null
  /** The agent's own task list, when its host reports one. Empty when the agent keeps none. */
  hostTasks: HostTask[]
  /**
   * The dialog questions an item may still copy: those of the current turn, and of a turn whose exchange waits for the
   * per-reply update.
   */
  dialogQuestions: TurnDialogQuestion[]
}
