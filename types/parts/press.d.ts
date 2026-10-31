/**
 * What a press does, which decides what its row shows at once. Talk asks Claude
 * to talk or draft; Hand-off gives Claude the row's work, so the row folds;
 * Local opens or copies on the person's machine; Mark changes state and sends
 * nothing while it can be undone, or closes a question with its answer; View changes only the screen.
 */
export type PressKind = 'talk' | 'handoff' | 'local' | 'mark' | 'view'

export type LastAction = {
  kind: Exclude<PressKind, 'view'>
  /** The action's id, as `actionId` makes it, so that action reads "… again". */
  action: string
  /** The label of the action pressed, as in "Discuss". */
  text: string
  at: number
  /** Order of presses in the Claude host while their saves may overlap. */
  pressOrder?: number
  /** The turns started when it was pressed, so a handed-off row folds until the update for a later turn applies. */
  turnsStarted?: number
  /** The latest Local press's outcome: its opens and copies, pending until each has run. Talk, Hand-off and Mark presses clear it. */
  result?: LocalResult
  /** Whether the press's message reached the agent. Missing on a press that sent nothing, and on one saved before the mod kept it, which reads as arrived. */
  delivery?: Delivery
  /** Undo on a finding Fix handed off, which lists the row again while the agent works on it. */
  isKept?: true
  /** It repeated the latest action, so its button keeps reading "… again" while the press is out. */
  isRepeat?: true
}

/**
 * A sent message's way to the agent: queued after sending, unconfirmed when
 * an identical arrival cannot identify its press, arrived when identified,
 * or failed when it will not enter.
 */
export type Delivery =
  | { state: 'queued'; message: string; id?: string }
  | { state: 'unconfirmed'; message: string; id?: string }
  | { state: 'arrived' }
  | { state: 'failed'; reason: string; id?: string }

/** A message the mod sent, as builds before the shared session saved it. */
export type SentPrompt = { id: string; sessionId: string; text: string; pressedAt: number | null }

export type LocalPart = {
  kind: 'open' | 'copy' | 'refresh-prs'
  name: string
  /** A command only the person can run, so the row says where to run it. */
  isCommand: boolean
  /** Null until it ran, and when it worked. */
  error: string | null
}

/**
 * The words are built per surface when the row is drawn. `action` is the id of the action pressed, as `actionId`
 * makes it, so its button draws as out while the result is pending. Missing on a result saved before the mod kept it.
 */
export type LocalResult = {
  state: 'pending' | 'done' | 'failed'
  parts: LocalPart[]
  at: number
  pressId?: string
  action?: string
}

/**
 * A short note on a row that is not a press's result: a press that found its
 * row gone or changed.
 */
export type RowNote = { note: 'stale'; at: number }

/**
 * A reply the person began in a row's field and has not sent. `since` is when they began it, as the time of the
 * view that showed the row open, so a close the person could not have seen then holds the row in place.
 */
export type Draft = { text: string; since: number }
