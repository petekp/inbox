export type Item = {
  id: string
  kind: 'question' | 'task'
  /** The agent's own number or id for it ("1", "D3"), so "1. yes" maps back. */
  label: string | null
  ask: string
  options: string[]
  /** The option the agent recommended, exactly as `options` has it. */
  rec: string | null
  helps: Help[]
  /** The person-prompt count when the agent asked it. */
  turn: number
  /** When the agent asked it; null for an item saved before the mod kept the time. */
  at: number | null
  /**
   * What added it: the agent's record tool, or a NEW or TODO line of the per-reply update. An item saved before the
   * mod kept this reads as 'update'.
   */
  from: 'record' | 'update'
  /** The open Codex dialog question this item copies. Only the Codex host sets it. */
  dialog?: DialogLink
  /**
   * The agent marked it a design choice: its options are designs or approaches it could try and show side by side.
   * Only these show Compare. An item saved before the mark kept this has none.
   */
  isDesignChoice?: boolean
  /** When the agent last recorded it again while it was open, as it does to report a comparison. */
  reportedAt?: number
  /**
   * Each option's description, by its label as `options` has it, from a dismissed dialog question this item copies.
   */
  optionDescriptions?: Record<string, string>
}

/**
 * A question in a Codex `request_user_input_async` dialog: the call's `call_id`, the question's index in the call's
 * `questions`, and its title.
 */
export type DialogLink = { callId: string; index: number; question: string }

/** A question in an agent's dialog, with each option's description by its label. Codex's dialog gives none. */
export type DialogQuestion = { question: string; options: string[]; descriptions: Record<string, string> }

/**
 * A dialog question from ledger turn `turn` that an item may copy: a question of a Codex dialog, which stays open, or
 * of a dialog the person dismissed in another host. `callId` and `index` name a Codex dialog question, and `callId` is
 * null in other hosts. `itemId` is the item that copies it, once linked.
 */
export type TurnDialogQuestion = DialogQuestion & {
  callId: string | null
  index: number
  turn: number
  itemId: string | null
}

/**
 * A one-press step toward finishing an item. The mod never runs a command:
 * `run` asks Claude to run it, under the usual permission checks, and
 * `terminal` copies one that only the person can run.
 */
export type Help =
  | { kind: 'open'; path: string }
  | { kind: 'copy'; text: string; name: string | null }
  | { kind: 'run'; command: string; name: string | null }
  | { kind: 'terminal'; command: string; name: string | null }
  | { kind: 'link'; url: string; name: string | null }

export type Closed = {
  id: string
  kind: Item['kind']
  ask: string
  label?: string
  outcome: string
  /**
   * How it closed: the person answered it, marked a task done or ran its
   * command, or dismissed it; it expired unanswered; Claude closed it with a
   * reason; or the per-reply update closed it, with an outcome the model wrote.
   */
  how: 'answered' | 'done' | 'dismissed' | 'expired' | 'claude' | 'update'
  at: number
  /** The item as it was while open, so it can be reopened; missing on a record saved before the mod kept it. */
  item?: Item
  /** A Done notification that may have reached the agent, so Undo cannot retract it. */
  isSentToAgent?: true
  doneNotification?: { id: string; error?: string }
}
