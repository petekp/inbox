import type { SessionStatus } from './status'
import type { Closed, Item } from './items'

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
  /** When a fetch last read the PR's state from GitHub. Absent on a view saved before the inbox kept it. */
  fetchedAt?: number
}

/** Where a PR stands, as its block's status line names it. `hooks/prs.ts:readiness` reads it. */
export type PrStatus = 'ready' | 'blocked' | 'waiting' | 'draft' | 'merged' | 'closed'

/**
 * What a ranked PR's block showed: its status, read without sent threads, and the ids of its waiting threads and the
 * names of its failing checks.
 */
export type RankedPrStatus = { status: PrStatus; threads: string[]; failing: string[] }

/**
 * The PRs an agent ranked, first to last, as "owner/repo#123", with its short name for the order, as "Merge in this
 * order", the reason it gave for the order, the agent's name, as "Claude", and when it set it. `statuses` holds each
 * ranked PR's status from the first view the tab had of it once the order was set. It is null on an order saved before
 * the inbox kept statuses, which never reads as changed.
 */
export type PrOrder = {
  refs: string[]
  label: string | null
  why: string | null
  statuses: Record<string, RankedPrStatus> | null
  by: string
  at: number
}

export type Ledger = {
  /** The session's Status page; null until the Status call writes one. Saved as `overview`, the tab's earlier name. */
  overview: SessionStatus | null
  items: Item[]
  closed: Closed[]
  findings: Finding[]
  /** Findings that closed, oldest first. Kept apart from `closed`, which the model-read texts list. */
  closedFindings: ClosedFinding[]
  /** PRs this session created or linked, as "owner/repo#123", until the person dismisses one. The PRs tab leaves out those `isLeftOut` names. */
  prs: string[]
  /** The order the agent set for the PRs tab with `order_prs`, or null for the tab's own order. */
  prOrder: PrOrder | null
  nextId: number
  /** How many prompts the person has sent this session. */
  turn: number
  /** The turn whose reply added the newest items; 0 when none. */
  batchTurn: number
  /** How many answers of the inbox model have been applied, including answers that changed nothing. */
  updates: number
}
