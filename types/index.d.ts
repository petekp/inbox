export type Card = {
  goal: string
  /** The newest 4 results the model wrote, oldest first: the milestones with source `done`. Older versions read it. */
  done: string[]
  now: string
  running: string[]
}

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

export type SentPrompt = { id: string; sessionId: string; text: string; pressedAt: number | null }

export type LocalPart = {
  kind: 'open' | 'copy'
  name: string
  /** A command only the person can run, so the row says where to run it. */
  isCommand: boolean
  /** Null until it ran, and when it worked. */
  error: string | null
}

/** The words are built per surface when the row is drawn. */
export type LocalResult = { state: 'pending' | 'done' | 'failed'; parts: LocalPart[]; at: number; pressId?: string }

/**
 * A short note on a row that is not a press's result: a press that found its
 * row gone or changed, or a press on a sample entry, which sends nothing.
 */
export type RowNote = { note: 'stale' | 'sample'; at: number }

/**
 * A reply the person began in a row's field and has not sent. `since` is when they began it, as the time of the
 * view that showed the row open, so a close the person could not have seen then holds the row in place.
 */
export type Draft = { text: string; since: number }

export type Finding = {
  id: string
  kind: 'issue' | 'opportunity'
  title: string
  detail: string
  /** The file it is about, as Claude gave it. */
  path: string | null
  at: number
  /** The item that replaced this finding by asking about it. A finding closed as "asked as iN" reopens when that item closes with the work undone. */
  askedAs?: string
}

export type FoldKind = Item['kind'] | Finding['kind']

export type ClosedFinding = Finding & Pick<Closed, 'how' | 'outcome'> & { closedAt: number }

export type PrCheck = {
  name: string
  bucket: 'pass' | 'fail' | 'pending' | 'skip'
  url: string | null
  /** The GitHub Actions workflow that ran it, such as "CI". Absent for a commit status, and on a check saved before the mod kept it. */
  workflow?: string
  /** When it started and finished, in ms; absent when GitHub gave no time. */
  startedAt?: number
  finishedAt?: number
}

export type PrThread = {
  id: string
  author: string
  /** The thread's latest comment, when anyone answered the first. Its `at` is as the thread's. */
  reply: { author: string; body: string; url: string; at: number | null } | null
  /** Someone other than the viewer wrote its last comment, so it waits on them. */
  isWaiting: boolean
  isOutdated: boolean
  /**
   * Outdated, and no one else replied after the PR's latest commit: a later
   * commit changed the lines it was on, and nothing since says that left it unfixed.
   */
  isLinesChanged: boolean
  path: string
  line: number | null
  body: string
  url: string
  /** When its first comment was written; null when GitHub gave no time, or for a thread saved before the mod kept it. */
  at: number | null
}

export type PrView = {
  /** "owner/repo#123" */
  ref: string
  number: number
  title: string
  url: string
  isDraft: boolean
  state: string
  base: string
  mergeable: string
  reviewDecision: string
  checks: PrCheck[]
  threads: PrThread[]
  /** Why the last fetch failed; the rest is from the fetch before. */
  error: string | null
}

/** One result the session reached, shown on the Map tab. */
export type Milestone = {
  id: string
  /** What recorded it: a DONE line, a question the person answered, or a finding fixed. */
  source: 'done' | 'answered' | 'fixed'
  text: string
  /** The person's answer, or the change that fixed a finding; null for the other sources. */
  detail: string | null
  /** The id of the item or finding, for the sources that have one. */
  ref: string | null
  /** When it happened; null when unknown, shown with no age. */
  at: number | null
}

export type Ledger = {
  card: Card | null
  /** Results so far, oldest first. */
  milestones: Milestone[]
  items: Item[]
  closed: Closed[]
  findings: Finding[]
  /** Findings that closed, oldest first. Kept apart from `closed`, which the model-read texts list. */
  closedFindings: ClosedFinding[]
  /** PRs this session created or linked, as "owner/repo#123". */
  prs: string[]
  nextId: number
  /** How many prompts the person has sent this session. */
  turn: number
  /** The turn whose reply added the newest items; 0 when none. */
  batchTurn: number
}

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

export type Presence = {
  lastActiveAt: number
  isAway: boolean
  isUpdating: boolean
  /**
   * `behind` and `failed`: the ledger may have missed a turn, so the next
   * update re-reads the whole conversation. Only `failed` shows in the pane.
   */
  ledgerState: 'current' | 'behind' | 'failed'
  /**
   * The turns started in this process, and how many of them reached the
   * ledger. A load that finds more started than applied catches up.
   */
  turnsStarted: number
  turnsApplied: number
  /** The minute of the last clock tick while away, so the pane's ages redraw each minute. */
  minute: number
}

export type Tab = 'needsYou' | 'findings' | 'prs'

/** A tab that shows a page, not rows. It has no count and never takes part in arrivals. */
export type PageTab = 'map'

export type ShownTab = Tab | PageTab

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
}

export type Turns = Pick<Presence, 'turnsStarted' | 'turnsApplied'>

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

declare module 'claude-code' {
  interface PluginState {
    inbox: {
      /** The Claude Code theme in use, such as `dark` or `light-ansi`; '' until read. */
      theme: string
      ledger: Ledger
      presence: Presence
      tab: ShownTab
      prViews: PrViews
      selection: Record<Tab, Cursor>
      stop: Stop | null
      dialogs: Dialog[]
      /** The row whose free-text field is open, if any. */
      typing: string | null
      /** Each row's unsent typed words, by the row's id, kept while the field closes or another row opens. */
      drafts: Record<string, Draft>
      /** When the person discarded each held row's reply, by the row's id, so the row folds without settling. */
      discarded: Record<string, number>
      /** Each row's latest note, by the row's id. */
      notes: Record<string, RowNote>
      /** Each row's last action, by the row's id. */
      lastActions: Record<string, LastAction>
      /** Prompts this mod submitted without an observed stored prompt row. */
      sent: SentPrompt[]
      /** Message texts whose older unsaved send history cannot be matched safely. */
      untrackedSent: { sessionId: string; text: string }[]
      /** The Needs you groups and the kinds of finding whose closed items show. Each starts folded. */
      unfolded: FoldKind[]
      foldHover: FoldKind | null
      /** The questions whose every option shows, by the row's id. */
      optionsShown: string[]
      isKeyListShown: boolean
      /** The sample entries the band and pane show instead of the session's own, while `/inbox demo` is on. */
      demo: DemoCopy | null
      /** Whether `/inbox demo recording` started the demo, which then leaves out the notices that mark its samples. */
      isDemoRecording: boolean
      /** The conversation whose saved session the store could not read. Saves skip it until a read succeeds. */
      unreadable: string | null
    }
  }
}
