/** Where a subject of the session's work stands. `done` and `dropped` close it. */
export type SubjectStatus = 'working' | 'queued' | 'waits-on-other' | 'done' | 'dropped'

/** One piece of the session's work that the person would name: a feature, a fix, a release or a stream. */
export type Subject = {
  id: string
  /** The handle the person would use, at most a few words. */
  name: string
  status: SubjectStatus
  /** Where it stands, in a few words. */
  text: string
  /** The plan a reversal replaced, shown until the person looks. */
  was: string | null
  createdAt: number
  /** When its status or where it stands last changed. Code sets it; the model never writes a time. */
  changedAt: number
  closedAt: number | null
  /** The subject a DROP moved this one's work into. A subject with one never shows. */
  into: string | null
}

/** What kind of work runs apart from the session's own turn. */
export type ChildKind = 'subagent' | 'background' | 'workflow' | 'delegate'

/** Work that runs apart from the turn. Code sets every field from the host's events except `subjectId`, which the Overview call links. */
export type Child = {
  id: string
  /** The host's handle for it: a tool call id, a task id or a delegate's Herdr name. */
  ref: string
  kind: ChildKind
  name: string
  subjectId: string | null
  startedAt: number
  endedAt: number | null
  /** When it last did anything. Null when the host reports no activity for its kind, so it never reads quiet. */
  lastActivityAt: number | null
}

/** The Overview tab's list. The Overview call changes it by id; code keeps the order and every time. */
export type Overview = {
  role: 'coordinator' | 'session'
  /** What the session is for, in the person's words; empty until the call writes it. */
  goal: string
  subjects: Subject[]
  children: Child[]
  /** The subject each ask holds up, by the ask's item id, as the Overview call linked them. */
  askSubjects: Record<string, string>
  nextId: number
  nextChildId: number
  /** When the person last looked: the last time a look ended. Null before the first look. */
  lastLookAt: number | null
  /** The look in progress, while the Overview tab is shown. Null otherwise. */
  look: { startedAt: number } | null
}

/** The folder a session started in, and its branch when the host last read it. */
export type Place = { folder: string; branch: string | null }

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
  /** Whether the person running gh wrote the PR; null when GitHub's answer did not say. */
  isYours: boolean | null
  /** Whether a fetch has found the PR open since the tab began tracking it; for a view saved before this field, whether that view was open. */
  wasSeenOpen: boolean
  /** Why the last fetch failed; the rest is from the fetch before. */
  error: string | null
}

export type Ledger = {
  /** The session's Overview page; null until the Overview call writes one. */
  overview: Overview | null
  items: Item[]
  closed: Closed[]
  findings: Finding[]
  /** Findings that closed, oldest first. Kept apart from `closed`, which the model-read texts list. */
  closedFindings: ClosedFinding[]
  /** PRs this session created or linked, as "owner/repo#123", until the person dismisses one. The PRs tab leaves out those `isLeftOut` names. */
  prs: string[]
  nextId: number
  /** How many prompts the person has sent this session. */
  turn: number
  /** The turn whose reply added the newest items; 0 when none. */
  batchTurn: number
  /** How many answers of the inbox model have been applied, including answers that changed nothing. */
  updates: number
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

/** A tab that shows a page instead of rows. */
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
 * Why an Overview call wrote nothing. `no-answer`: the call gave no text. `refused`: it answered twice with text the
 * parser refused, and `answer` holds the start of the second answer.
 */
export type OverviewFailure = { at: number; cause: 'no-answer' | 'refused'; answer: string | null }

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
  /** The PRs tab's data: each PR's latest view and the current branch's PR. `isFetching` is always false here; the host knows what runs. */
  prViews: PrViews
  /** Why the last turn stopped, until the next turn starts. */
  stop: Stop | null
  /** The last Overview call that wrote nothing, until a later one writes. */
  overviewFailure: OverviewFailure | null
  /** The agent's own task list, when its host reports one. Empty when the agent keeps none. */
  hostTasks: HostTask[]
  /**
   * The dialog questions an item may still copy: those of the current turn, and of a turn whose exchange waits for the
   * per-reply update.
   */
  dialogQuestions: TurnDialogQuestion[]
}

declare module 'claude-code' {
  interface PluginState {
    inbox: {
      /** The Claude Code theme in use, such as `dark` or `light-ansi`; '' until read. */
      theme: string
      /** The drawn conversation's session. `revision` counts its writes. */
      session: Session & { revision: number }
      away: Away
      tab: Tab
      /** The page tab shown in place of `tab`, or null while a row tab shows. */
      page: PageTab | null
      selection: Record<Tab, Cursor>
      dialogs: Dialog[]
      /** The row whose free-text field is open, if any. */
      typing: string | null
      /** Each row's unsent typed words, by the row's id, kept while the field closes or another row opens. */
      drafts: Record<string, Draft>
      /** When the person discarded each held row's reply, by the row's id, so the row folds without settling. */
      discarded: Record<string, number>
      /** Each row's latest note, by the row's id. */
      notes: Record<string, RowNote>
      /** The Asks groups and the kinds of finding whose closed items show. Each starts folded. */
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
      /** A fresh value redraws the pane, as when a row's note or a Queued label is due. */
      redraw: number
      /** A fresh value redraws only the pane, for the next frame of a running mark. */
      runningFrame: number
      /** Builds before the shared session kept the session in these fields. `upgradeDrawn` moves them into `session`. */
      ledger: Ledger
      presence: OldPresence
      prViews: PrViews
      stop: Stop | null
      lastActions: Record<string, LastAction>
      sent: SentPrompt[]
      untrackedSent: { sessionId: string; text: string }[]
    }
  }
}
