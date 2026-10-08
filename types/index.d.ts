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
  /** What the pane shows for how it closed, such as the person's answer. */
  outcome: string
  /**
   * How it closed: the person answered it, marked a task done or ran its
   * command, or dismissed it; it expired unanswered; Claude closed it with a
   * reason; or the per-reply update closed it, with an outcome the model wrote.
   */
  how: 'answered' | 'done' | 'dismissed' | 'expired' | 'claude' | 'update'
  at: number
}

/** An item that just closed, and where its row stood among the open items of its kind. */
export type Settled = Closed & { index: number }

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

export type PrCheck = { name: string; bucket: 'pass' | 'fail' | 'pending' | 'skip'; url: string | null }

/** An unresolved review thread, told by its first comment. */
export type PrThread = {
  id: string
  author: string
  /** The thread's latest comment, when anyone answered the first. */
  reply: { author: string; body: string; url: string } | null
  /** Someone other than the viewer wrote its last comment, so it waits on them. */
  isWaiting: boolean
  isOutdated: boolean
  path: string
  line: number | null
  body: string
  replies: number
  url: string
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

/** `all`: a script that runs the project's checks together, such as `check.sh`. */
export type CheckKind = 'tests' | 'types' | 'lint' | 'build' | 'validate' | 'all'

/** The latest result of one check command Claude ran, such as `npm test`, in one folder. */
export type Check = {
  name: string
  kind: CheckKind
  /** The folder it ran in, absolute; null for the session's own folder. */
  folder: string | null
  result: 'pass' | 'fail' | 'unknown'
  /** The output's summary line, such as "24 pass, 1 fail". */
  summary: string
  ranAt: number
  /** The top folder of the git repo it ran in, whose edits make it stale; null outside git. */
  repo: string | null
  /**
   * Files it reads changed after it ran: any file for a lint, a validation or
   * a check script, and a file other than Markdown for the rest.
   */
  isStale: boolean
  /** The piece of Claude's command that ran it, as written, such as `npm test > t.log`. */
  command: string
  /** Up to three output lines that name what failed, when the command ran no other check. */
  failures: string[]
  /** A turn of Claude's ended with it failing, so the Needs you tab lists it. */
  isLeftFailing: boolean
  /** The person dismissed its row in the Needs you tab. */
  isDismissed: boolean
  /** The Stop hook already sent Claude back over this result, so it does not again. */
  isSentBack: boolean
  /** When the person pressed Fix on its row, so it no longer waits on them; null before. The next run replaces the result. */
  fixSentAt: number | null
}

/**
 * The working tree's content, read without writing to the repo: HEAD, and the
 * blob id of each path that differs from it ('' for a deleted path).
 */
export type Snapshot = { head: string | null; dirty: Record<string, string> }

/** The checks Claude ran. */
export type Checks = {
  results: Check[]
  /** The session's repos: the one it started in, and each repo where Claude edited a file. Only their results count. */
  repos: string[]
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

/** A failing PR check the person pressed Fix on: when, and the check's URL then. A rerun has a new URL, so the mark lapses. */
export type PrFixSent = { at: number; url: string | null }

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
      /** The PR checks the person pressed Fix on, by their row's id. */
      prFixesSent: Record<string, PrFixSent>
      selection: Record<Tab, Cursor>
      stop: Stop | null
      dialogs: Dialog[]
      checks: Checks
      /** Each checked repo's working tree as last read, by its top folder, kept apart from `checks` because no drawing reads it. */
      snapshots: Record<string, Snapshot>
      /** The row whose free-text field is open, if any. */
      typing: string | null
      /** Items that just closed, shown in place with their outcome for a few seconds. */
      settled: Settled[]
      /** The Needs you groups whose closed items show. Each starts folded. */
      unfolded: Item['kind'][]
      /** The pane's list of the keys no row shows is unfolded. */
      isKeyListShown: boolean
      /** A failing check's row shows its output and command under the summary. */
      isCheckDetailShown: boolean
      /** The band and pane show sample entries instead of the session's own, for `/inbox demo`. */
      isDemo: boolean
    }
  }
}
