import type { PrCheck, PrFetchFailure, PrThread, PrView } from '../types'
import { checkKey, parseRef } from './prs'

/** How many PRs one GraphQL query reads. GitHub counts a query's nodes, and 50 PRs stay well under its limit. */
export const PRS_PER_QUERY = 50

/**
 * What one PR's node carries: its view fields, who wrote it, its newest commit's date and check rollup, and its
 * review threads, each with its first and latest comment.
 */
const PR_FIELDS = `fragment PrFields on PullRequest {
  number title url isDraft state baseRefName mergeable reviewDecision
  author { login }
  commits(last: 1) { nodes { commit { committedDate statusCheckRollup { contexts(first: 100) { nodes {
    __typename
    ... on CheckRun { name status conclusion startedAt completedAt detailsUrl checkSuite { workflowRun { workflow { name } } } }
    ... on StatusContext { context state targetUrl createdAt }
  } } } } } }
  reviewThreads(first: 100) { nodes {
    id isResolved isOutdated path line originalLine
    comments(first: 1) { totalCount nodes { author { login } body url createdAt } }
    last: comments(last: 1) { nodes { author { login } body url createdAt } }
  } }
}`

/** The alias of a repo and of a PR in the query, by their places in `refs`. */
const repoAlias = (n: number) => `r${n}`
const prAlias = (n: number) => `p${n}`

/**
 * One query that reads every PR of `refs`, in any number of repos: each repo is an alias, and each PR an alias under
 * it. Reads the viewer too, to tell the PRs the viewer wrote. A ref's repo and number come from a GitHub link, so
 * they hold only the characters a link does.
 */
export function prsQuery(refs: string[]): string {
  const repos = new Map<string, string[]>()
  for (const ref of refs) {
    const { repo } = parseRef(ref)
    repos.set(repo, [...(repos.get(repo) ?? []), ref])
  }
  const fields = [...repos.values()].map((repoRefs, n) => {
    const { owner, name } = parseRef(repoRefs[0] ?? '')
    const prs = repoRefs.map(
      ref => `${prAlias(refs.indexOf(ref))}: pullRequest(number: ${parseRef(ref).number}) { ...PrFields }`,
    )

    return `${repoAlias(n)}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${prs.join(' ')} }`
  })

  return `query { viewer { login } ${fields.join(' ')} }\n${PR_FIELDS}`
}

type RollupEntry = {
  __typename?: string
  name?: string
  context?: string
  status?: string
  conclusion?: string
  state?: string
  detailsUrl?: string
  targetUrl?: string
  startedAt?: string
  createdAt?: string
  completedAt?: string
  checkSuite?: { workflowRun?: { workflow?: { name?: string } } | null } | null
}

type CommentNode = { author: { login: string } | null; body: string; url: string; createdAt?: string }

type ThreadNode = {
  id: string
  isResolved: boolean
  isOutdated: boolean
  path: string
  line: number | null
  originalLine: number | null
  comments: { totalCount: number; nodes: CommentNode[] }
  last: { nodes: CommentNode[] }
}

/** A PR's node in the query's answer. */
export type PrNode = {
  number: number
  title?: string
  url: string
  isDraft?: boolean
  state?: string
  baseRefName?: string
  mergeable?: string
  reviewDecision?: string | null
  author?: { login: string } | null
  commits?: {
    nodes?: {
      commit?: { committedDate?: string; statusCheckRollup?: { contexts?: { nodes?: RollupEntry[] } } | null }
    }[]
  }
  reviewThreads?: { nodes?: ThreadNode[] } | null
}

type GraphQlError = { type?: string; message?: string; path?: (string | number)[] }

type PrsAnswerJson = {
  data?: { viewer?: { login: string } | null } & Record<string, Record<string, PrNode | null> | null>
  errors?: GraphQlError[]
}

/** An ISO time as ms, or undefined when it is missing or GitHub's zero time. */
function msOf(iso: string | undefined): number | undefined {
  const ms = iso ? Date.parse(iso) : NaN
  return Number.isFinite(ms) && ms > 0 ? ms : undefined
}

/** A check run or a commit status as pass, fail, cancelled, pending or skip; the two spell it differently. */
function bucket(e: RollupEntry): PrCheck['bucket'] {
  const result = (e.conclusion || e.state || '').toUpperCase()
  if (e.status && e.status.toUpperCase() !== 'COMPLETED') return 'pending'
  if (['SUCCESS', 'NEUTRAL'].includes(result)) return 'pass'
  if (['SKIPPED', 'STALE'].includes(result)) return 'skip'
  if (result === 'CANCELLED') return 'cancelled'
  if (['PENDING', 'EXPECTED', 'QUEUED', 'IN_PROGRESS', ''].includes(result)) return 'pending'

  return 'fail'
}

/** When a run started: a check run's `startedAt`, or a commit status's `createdAt`. A run waiting to start is newer than any that started. */
function runStart(e: RollupEntry): number | undefined {
  const isWaiting = !!e.status && e.status.toUpperCase() !== 'COMPLETED'

  return msOf(e.startedAt ?? e.createdAt) ?? (isWaiting ? Infinity : undefined)
}

const workflowOf = (e: RollupEntry) => e.checkSuite?.workflowRun?.workflow?.name

/**
 * The rollup lists every run of a check on the head commit, such as a cancelled run and the run that replaced it.
 * Keeps the latest run of each check, by `checkKey`, in the place of the check's first run. A run is
 * later when it started later, or, when either has no start time, when it comes later in the rollup.
 */
function latestRuns(rollup: RollupEntry[]): RollupEntry[] {
  const latest = new Map<string, RollupEntry>()
  for (const e of rollup) {
    const key = checkKey({ name: e.name ?? e.context ?? '', workflow: workflowOf(e) })
    const kept = latest.get(key)
    const keptStart = kept && runStart(kept)
    const start = runStart(e)
    const isOlder = start !== undefined && keptStart !== undefined && start < keptStart
    if (!isOlder) latest.set(key, e)
  }

  return [...latest.values()]
}

function checksOf(node: PrNode): PrCheck[] {
  const rollup = node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes ?? []

  return latestRuns(rollup).map(e => {
    const workflow = workflowOf(e)
    const startedAt = runStart(e)
    const finishedAt = msOf(e.completedAt)
    return {
      name: e.name ?? e.context ?? 'check',
      bucket: bucket(e),
      url: e.detailsUrl ?? e.targetUrl ?? null,
      ...(workflow ? { workflow } : {}),
      ...(startedAt !== undefined && Number.isFinite(startedAt) ? { startedAt } : {}),
      ...(finishedAt ? { finishedAt } : {}),
    }
  })
}

/**
 * The PR's open threads, oldest first. A thread waits on the person unless the viewer wrote its latest comment. Its
 * lines changed when it is outdated and no one else replied after the PR's latest commit.
 */
function threadsOf(node: PrNode, viewer: string | undefined): PrThread[] {
  const headAt = Date.parse(node.commits?.nodes?.[0]?.commit?.committedDate ?? '') || null

  return (node.reviewThreads?.nodes ?? [])
    .filter(t => !t.isResolved)
    .map(t => {
      const first = t.comments.nodes[0]
      const last = t.comments.totalCount > 1 ? t.last.nodes[0] : undefined
      const reply = last
        ? {
            author: last.author?.login ?? 'ghost',
            body: last.body.trim(),
            url: last.url,
            at: Date.parse(last.createdAt ?? '') || null,
          }
        : null
      const isAnsweredSince =
        reply !== null && reply.author !== viewer && (headAt === null || reply.at === null || reply.at > headAt)

      return {
        id: t.id,
        author: first?.author?.login ?? 'ghost',
        reply,
        isWaiting: (reply?.author ?? first?.author?.login) !== viewer,
        isOutdated: t.isOutdated,
        isLinesChanged: t.isOutdated && !isAnsweredSince,
        path: t.path,
        line: t.line ?? t.originalLine,
        body: (first?.body ?? '').trim(),
        url: first?.url ?? '',
        at: Date.parse(first?.createdAt ?? '') || null,
      }
    })
}

/** A read PR's view, before the fetch adds what it knows: whether it was seen open, and when it was read. */
type ReadPr = Omit<PrView, 'wasSeenOpen' | 'fetchedAt'>

/**
 * A PR's view from its node. `isYours` is null when the answer names no viewer or the node no author. A null author
 * is a deleted account's, so not the viewer's. With `threadsError`, the node's threads could not be read, and the
 * view keeps `previous`'s, with the error.
 */
export function readPrNode(
  ref: string,
  node: PrNode,
  viewer: string | undefined,
  previous: PrView | undefined,
  threadsError: string | null,
): ReadPr {
  return {
    ref,
    number: node.number,
    title: String(node.title ?? ''),
    url: String(node.url),
    isDraft: node.isDraft === true,
    state: String(node.state ?? 'OPEN'),
    base: String(node.baseRefName ?? ''),
    mergeable: String(node.mergeable ?? 'UNKNOWN'),
    reviewDecision: String(node.reviewDecision ?? ''),
    checks: checksOf(node),
    threads: threadsError === null ? threadsOf(node, viewer) : (previous?.threads ?? []),
    isYours: viewer === undefined || node.author === undefined ? null : node.author?.login === viewer,
    error: threadsError,
  }
}

/** The plain words for a GraphQL error on one PR or its repo. GitHub answers NOT_FOUND both for a missing PR and for a repo the viewer cannot see. */
function errorWords(e: GraphQlError, repo: string): string {
  if (e.type === 'NOT_FOUND') return `not found on GitHub, or no access to ${repo}`

  return (e.message ?? e.type ?? 'GitHub could not read it').trim()
}

/**
 * What the query's answer says about each PR of `refs`: its node, or why it could not be read. A missing PR, or a
 * repo the viewer cannot see, leaves its node null with its error. An error on a PR's threads keeps the node, and
 * `threadsError` says why the threads are missing. Null when the JSON holds no data at all, as when the whole query
 * failed.
 */
export function readPrsAnswer(
  json: string,
  refs: string[],
): {
  viewer: string | undefined
  prs: Record<string, { node: PrNode | null; error: string | null; threadsError: string | null }>
} | null {
  let answer: PrsAnswerJson
  try {
    answer = JSON.parse(json) as PrsAnswerJson
  } catch {
    return null
  }
  const data = answer.data
  if (!data || typeof data !== 'object') return null
  const repos = [...new Set(refs.map(ref => parseRef(ref).repo))]
  const prs: Record<string, { node: PrNode | null; error: string | null; threadsError: string | null }> = {}
  refs.forEach((ref, n) => {
    const { repo } = parseRef(ref)
    const repoField = data[repoAlias(repos.indexOf(repo))]
    const node = repoField?.[prAlias(n)] ?? null
    const errors = (answer.errors ?? []).filter(e => {
      const [r, p, field] = e.path ?? []
      if (r !== repoAlias(repos.indexOf(repo))) return false
      return p === undefined || (p === prAlias(n) && (field === undefined || field === 'reviewThreads'))
    })
    const own = errors.find(e => e.path?.length === 2 || e.path?.length === 1)
    const threads = errors.find(e => e.path?.[2] === 'reviewThreads')
    prs[ref] = {
      node,
      error: node ? null : own ? errorWords(own, repo) : 'GitHub did not answer for it',
      threadsError: node && threads ? `could not read its review threads: ${errorWords(threads, repo)}` : null,
    }
  })

  return { viewer: data.viewer?.login, prs }
}

/** gh's exit code for a command that needs a sign-in when gh has no token, as `gh help exit-codes` says. */
const GH_SIGN_IN_CODE = 4

/**
 * Whether gh's answer asks for a sign-in: gh has no token, or GitHub refused the token with HTTP 401, as it does for
 * an expired or revoked one.
 */
export function asksForSignIn(r: { exitCode: number; stderr: string }): boolean {
  return r.exitCode === GH_SIGN_IN_CODE || (r.exitCode !== 0 && /\bHTTP 401\b/.test(r.stderr))
}

/** GitHub's answer when the hourly limit is used up, or when it asks a busy client to slow down for a while. */
const LIMIT = /rate limit/i
const UNREACHABLE =
  /error connecting to|dial tcp|no such host|connection refused|network is unreachable|TLS handshake|i\/o timeout|lookup .* failed/i

/** The `errors` array of a GraphQL answer as text, or an empty string when the answer has none. */
function errorsOf(stdout: string): string {
  try {
    return JSON.stringify((JSON.parse(stdout) as { errors?: unknown }).errors ?? '')
  } catch {
    return ''
  }
}

/**
 * Why a whole gh run gave no PRs, or null when its answer holds data. The limit and an unreachable GitHub come from
 * gh's words; any other failure keeps gh's first line, without its "gh:" prefix and the link it adds.
 */
export function runFailureOf(
  r: { exitCode: number; stdout: string; stderr: string },
  timedOutCode: number,
  at: number,
): PrFetchFailure | null {
  if (r.exitCode === timedOutCode) return { kind: 'timed-out', at }
  if (/"data"\s*:\s*\{/.test(r.stdout)) return null
  if (LIMIT.test(r.stderr) || LIMIT.test(errorsOf(r.stdout))) return { kind: 'limit', at, resetsAt: null }
  if (UNREACHABLE.test(r.stderr)) return { kind: 'unreachable', at }
  const line = r.stderr
    .trim()
    .split('\n')[0]
    ?.replace(/^gh:\s*/, '')
    .replace(/\s*\(https?:\/\/\S+\)\s*$/, '')
    .trim()
  const text = line || (r.exitCode === 0 ? "GitHub's answer could not be read" : `gh exited with ${r.exitCode}`)

  return { kind: 'error', at, text }
}

/**
 * When GitHub's GraphQL limit resets, from `gh api rate_limit`, or null when the answer does not say or the hourly
 * budget is not used up, as after a request to slow down.
 */
export function limitResetOf(json: string): number | null {
  try {
    const graphql = (JSON.parse(json) as { resources?: { graphql?: { reset?: number; remaining?: number } } }).resources
      ?.graphql
    const reset = graphql?.reset
    const isUsedUp = graphql?.remaining === undefined || graphql.remaining === 0
    return typeof reset === 'number' && reset > 0 && isUsedUp ? reset * 1000 : null
  } catch {
    return null
  }
}
