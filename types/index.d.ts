/** Where the session stands, as the ledger model last summarized it. */
export type Card = {
  goal: string
  done: string[]
  now: string
  running: string[]
  updatedAt: number
}

/** Something the agent put to the person that is still unanswered. */
export type Item = {
  id: string
  kind: 'question' | 'task'
  /** The agent's own number or id for it ("1", "D3"), so "1. yes" maps back. */
  label: string | null
  ask: string
  options: string[]
  /** The option the agent recommended, exactly as `options` has it. */
  rec: string | null
  /** Steps the agent's reply spelled out, one press each. */
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

/** An item that closed, and how. */
export type Closed = {
  id: string
  kind: Item['kind']
  ask: string
  /** The reply's own number for it, when it had one. */
  label?: string
  /** What the pane shows for how it closed, such as the person's answer. */
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
}

/** A row that just closed, kept where it stood in its group for a few seconds. */
export type Settled = Closed & { index: number }

/** The row a jump moved the pane to, so the tab and row can show where it went. */
export type Arrival = { tab: Tab; id: string | null; at: number }

/**
 * What a press does, which decides what its row shows at once. Talk asks Claude
 * to talk or draft; Hand-off gives Claude the row's work, so the row folds;
 * Local opens or copies on the person's machine; Mark changes state and sends
 * nothing, or closes a question with its answer; View changes only the screen.
 */
export type PressKind = 'talk' | 'handoff' | 'local' | 'mark' | 'view'

/** What a row's last action did, shown on the row so the person sees the press went through. */
export type LastAction = {
  kind: Exclude<PressKind, 'view'>
  /** The action's id, as `actionId` makes it, so that action reads "… again". */
  action: string
  /** The label of the action pressed, as in "Discuss". The row shows it after a ✓. */
  text: string
  at: number
  /** The turns started when it was pressed, so a handed-off row folds until the update for a later turn applies. */
  turnsStarted?: number
  /** Where the row was, and its title, for a row the press removed: it shows its last action in its place for a few seconds. */
  tab?: Tab
  title?: string
  index?: number
  /** The latest Local press's outcome: its opens and copies, pending until each has run. Talk, Hand-off and Mark presses clear it. */
  result?: LocalResult
}

/** One open or copy of a Local press, by the name the row shows for it, and why it failed. */
export type LocalPart = {
  kind: 'open' | 'copy'
  name: string
  /** A command only the person can run, so the row says where to run it. */
  isCommand: boolean
  /** Null until it ran, and when it worked. */
  error: string | null
}

/** What a Local press did. The words are built per surface when the row is drawn. */
export type LocalResult = { state: 'pending' | 'done' | 'failed'; parts: LocalPart[]; at: number }

/**
 * A short note on a row that is not a press's result: a press that found its
 * row gone or changed, or a press on a sample entry, which sends nothing.
 */
export type RowNote = { note: 'stale' | 'sample'; at: number }

/** Something Claude noticed outside the current task and recorded for the person. */
export type Finding = {
  id: string
  kind: 'issue' | 'opportunity'
  title: string
  detail: string
  /** The file it is about, as Claude gave it. */
  path: string | null
  at: number
}

/** A finding that closed, and how, as `Closed` says it for an item. */
export type ClosedFinding = Finding & Pick<Closed, 'how' | 'outcome'> & { closedAt: number }

export type PrCheck = { name: string; bucket: 'pass' | 'fail' | 'pending' | 'skip'; url: string | null }

/** An unresolved review thread, told by its first comment. */
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
  replies: number
  url: string
  /** When its first comment was written; null when GitHub gave no time, or for a thread saved before the mod kept it. */
  at: number | null
}

/** A PR as gh last reported it. */
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
  fetchedAt: number
  /** Why the last fetch failed; the rest is from the fetch before. */
  error: string | null
}

export type Ledger = {
  card: Card | null
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

/** A permission prompt or question dialog in the session that waits on the person. */
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
  /** The minute of the last clock tick, so the "last active" text redraws. */
  minute: number
}

/** The most recent other session in this project, offered on a fresh start. */
export type Previous = {
  savedAt: number
  ledger: Ledger
  isBroughtIn: boolean
}

export type Tab = 'needsYou' | 'findings' | 'prs'

/** A tab's selected row: its id, and its position for when that row goes away. */
export type Cursor = { id: string | null; index: number }

/** The PR tab's data: each PR's latest view, the current branch's PR, and whether a fetch runs. */
export type PrViews = { views: Record<string, PrView>; branchRef: string | null; isFetching: boolean }

/**
 * The sample state `/inbox demo` shows in place of the session's own. Presses
 * on it change only this copy, so nothing reaches the real inbox, its store or Claude.
 */
export type DemoCopy = {
  ledger: Ledger
  stop: Stop | null
  /** Items that just closed on the copy, shown in place until SETTLED_MS after their `at`. */
  settled: Settled[]
  prViews: PrViews
  lastActions: Record<string, LastAction>
  /** Each sample row's latest note, by the row's id. */
  notes: Record<string, RowNote>
  /** The turn counts a sample row handed to Claude folds by. */
  turns: Pick<Presence, 'turnsStarted' | 'turnsApplied'>
}

declare module 'claude-code' {
  interface PluginState {
    inbox: {
      /** The Claude Code theme in use, such as `dark` or `light-ansi`; '' until read. */
      theme: string
      ledger: Ledger
      presence: Presence
      previous: Previous | null
      tab: Tab
      prViews: PrViews
      selection: Record<Tab, Cursor>
      stop: Stop | null
      dialogs: Dialog[]
      /** The row whose free-text field is open, if any. */
      typing: string | null
      /** Each row's unsent typed words, by the row's id, kept while the field closes or another row opens. */
      drafts: Record<string, string>
      /** Each row's latest note, by the row's id. */
      notes: Record<string, RowNote>
      /** Items that just closed, shown in place for a few seconds. */
      settled: Settled[]
      /** The pane's latest jump to a new row. */
      arrival: Arrival | null
      /** Each row's last action, by the row's id. */
      lastActions: Record<string, LastAction>
      /** The Needs you groups whose closed items show. Each starts folded. */
      unfolded: Item['kind'][]
      /** The rows whose folded details show, by the row's id. */
      shownDetails: string[]
      /** The questions whose every option shows, by the row's id. Until then, one with more than 5 options shows 4. */
      optionsShown: string[]
      /** The pane's list of the keys no row shows is unfolded. */
      isKeyListShown: boolean
      /** The sample entries the band and pane show instead of the session's own, while `/inbox demo` is on. */
      demo: DemoCopy | null
    }
  }
}
