import type { PrCheck, PrThread, PrView } from '../types'

const NL = '\n'
const PR_URL = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/g

/** "owner/repo#123" for each GitHub PR link in the text, in order, without repeats. */
export function prRefs(text: string): string[] {
  return [...new Set([...text.matchAll(PR_URL)].map(m => `${m[1]}#${m[2]}`))]
}

/**
 * The PRs of `refs` that the text names as "#123", in its order. A number two
 * of `refs` share names neither, since the text does not say which repo.
 */
export function namedPrs(text: string, refs: string[]): string[] {
  const numbers = new Set([...text.matchAll(/#(\d+)\b/g)].map(m => m[1]))
  const known = [...new Set(refs)]

  return [...numbers].flatMap(n => {
    const named = known.filter(ref => parseRef(ref).number === n)
    return named.length === 1 ? named : []
  })
}

/** "owner/repo#123" as its parts. */
export function parseRef(ref: string): { repo: string; owner: string; name: string; number: string } {
  const [repo = '', number = ''] = ref.split('#')
  const [owner = '', name = ''] = repo.split('/')

  return { repo, owner, name, number }
}

/** The fields `gh pr view --json` returns that the tab uses. */
export const VIEW_FIELDS = 'number,title,url,isDraft,state,baseRefName,mergeable,reviewDecision,statusCheckRollup'

/**
 * Unresolved review threads: the first comment, which states the finding, and
 * who wrote the last one, which says whose turn it is. The latest commit's
 * time tells a reply that came after the lines changed from one before.
 */
export const THREADS_QUERY = `query($owner: String!, $repo: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      commits(last: 1) { nodes { commit { committedDate } } }
      reviewThreads(first: 100) {
        nodes {
          id isResolved isOutdated path line originalLine
          comments(first: 1) { totalCount nodes { author { login } body url createdAt } }
          last: comments(last: 1) { nodes { author { login } body url createdAt } }
        }
      }
    }
  }
}`

type RollupEntry = {
  __typename?: string
  name?: string
  context?: string
  status?: string
  conclusion?: string
  state?: string
  detailsUrl?: string
  targetUrl?: string
}

/** gh's check rollup as pass, fail, pending or skip; a check run and a commit status spell it differently. */
function bucket(e: RollupEntry): PrCheck['bucket'] {
  const result = (e.conclusion || e.state || '').toUpperCase()
  if (e.status && e.status.toUpperCase() !== 'COMPLETED') return 'pending'
  if (['SUCCESS', 'NEUTRAL'].includes(result)) return 'pass'
  if (['SKIPPED', 'STALE'].includes(result)) return 'skip'
  if (['PENDING', 'EXPECTED', 'QUEUED', 'IN_PROGRESS', ''].includes(result)) return 'pending'

  return 'fail'
}

/** Reads `gh pr view --json VIEW_FIELDS` output; null when it is not that. */
export function readView(ref: string, json: string): Omit<PrView, 'threads' | 'fetchedAt' | 'error'> | null {
  try {
    const v = JSON.parse(json) as Record<string, unknown>
    if (typeof v.number !== 'number') return null
    const rollup = Array.isArray(v.statusCheckRollup) ? (v.statusCheckRollup as RollupEntry[]) : []

    return {
      ref,
      number: v.number,
      title: String(v.title ?? ''),
      url: String(v.url),
      isDraft: v.isDraft === true,
      state: String(v.state ?? 'OPEN'),
      base: String(v.baseRefName ?? ''),
      mergeable: String(v.mergeable ?? 'UNKNOWN'),
      reviewDecision: String(v.reviewDecision ?? ''),
      checks: rollup.map(e => ({
        name: e.name ?? e.context ?? 'check',
        bucket: bucket(e),
        url: e.detailsUrl ?? e.targetUrl ?? null,
      })),
    }
  } catch {
    return null
  }
}

type ThreadNode = {
  id: string
  isResolved: boolean
  isOutdated: boolean
  path: string
  line: number | null
  originalLine: number | null
  comments: {
    totalCount: number
    nodes: { author: { login: string } | null; body: string; url: string; createdAt?: string }[]
  }
  last: { nodes: { author: { login: string } | null; body: string; url: string; createdAt?: string }[] }
}

type ThreadsAnswer = {
  data?: {
    viewer?: { login: string }
    repository?: {
      pullRequest?: {
        commits?: { nodes?: { commit?: { committedDate?: string } }[] }
        reviewThreads?: { nodes?: ThreadNode[] }
      }
    }
  }
}

/** Reads the THREADS_QUERY answer: open threads only, oldest first. */
export function readThreads(json: string): PrThread[] {
  try {
    const data = (JSON.parse(json) as ThreadsAnswer).data
    const viewer = data?.viewer?.login
    const pr = data?.repository?.pullRequest
    const headAt = Date.parse(pr?.commits?.nodes?.[0]?.commit?.committedDate ?? '') || null

    return (pr?.reviewThreads?.nodes ?? [])
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

        // With either time unknown, someone else's reply keeps the thread waiting.
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
          replies: Math.max(0, t.comments.totalCount - 1),
          url: first?.url ?? '',
          at: Date.parse(first?.createdAt ?? '') || null,
        }
      })
  } catch {
    return []
  }
}

/** Open threads whose last comment someone else wrote: the PRs tab lists these. */
export function waitingThreads(pr: PrView): PrThread[] {
  return pr.threads.filter(t => t.isWaiting)
}

/** Which of a PR's rows the person handed to Claude: a thread sent to it. */
export type Handoffs = {
  isThreadSent: (pr: PrView, t: PrThread) => boolean
}

export const NO_HANDOFFS: Handoffs = { isThreadSent: () => false }

/** Waiting threads still on the person: not sent to Claude, and not on lines a later commit changed. */
export function threadsOnYou(pr: PrView, h: Handoffs): PrThread[] {
  return waitingThreads(pr).filter(t => !t.isLinesChanged && !h.isThreadSent(pr, t))
}

/** Whether an open PR waits on the person: a merge conflict, a failing check, requested changes or a thread on them. */
export function prNeedsYou(pr: PrView, h: Handoffs): boolean {
  return (
    pr.state === 'OPEN' &&
    (pr.mergeable === 'CONFLICTING' ||
      failingChecks(pr).length > 0 ||
      pr.reviewDecision === 'CHANGES_REQUESTED' ||
      threadsOnYou(pr, h).length > 0)
  )
}

export function checkCounts(pr: PrView): Record<PrCheck['bucket'], number> {
  const counts = { pass: 0, fail: 0, pending: 0, skip: 0 }
  for (const c of pr.checks) counts[c.bucket] += 1

  return counts
}

/** "1 thread waiting on you", "3 threads waiting on you". */
function threadsWaiting(count: number): string {
  return `${count} ${count === 1 ? 'thread' : 'threads'} waiting on you`
}

/** Where a PR stands. A draft is open and not ready, whatever else blocks it. */
export type PrStatus = 'ready' | 'blocked' | 'draft' | 'merged' | 'closed'

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * What stands between the PR and merging, or that it is ready. A thread sent
 * to Claude or on changed lines still blocks, as it is still open on GitHub.
 * `text` is the whole line. `head` is its status words, as "Blocked", and `reasons` the rest, or ''.
 */
export function readiness(
  pr: PrView,
  h: Handoffs = NO_HANDOFFS,
): { status: PrStatus; text: string; head: string; reasons: string } {
  if (pr.state === 'MERGED') return { status: 'merged', text: 'Merged', head: 'Merged', reasons: '' }
  if (pr.state !== 'OPEN') return { status: 'closed', text: 'Closed', head: 'Closed', reasons: '' }
  const { fail: failing, pending } = checkCounts(pr)
  const waiting = waitingThreads(pr)
  const open = threadsOnYou(pr, h).length
  const sent = waiting.filter(t => h.isThreadSent(pr, t)).length
  const changed = waiting.filter(t => t.isLinesChanged && !h.isThreadSent(pr, t)).length
  const blockers = [
    pr.isDraft ? 'draft' : null,
    pr.mergeable === 'CONFLICTING' ? `conflicts with ${pr.base}` : null,
    failing > 0 ? plural(failing, 'failing check', 'failing checks') : null,
    pr.reviewDecision === 'CHANGES_REQUESTED' ? 'changes requested' : null,
    open > 0 ? threadsWaiting(open) : null,
    sent > 0 ? `${plural(sent, 'thread', 'threads')} sent to Claude` : null,
    changed > 0 ? `${plural(changed, 'thread', 'threads')} on changed lines` : null,
    pr.reviewDecision === 'REVIEW_REQUIRED' ? 'needs approval' : null,
    pending > 0 ? `${pending} ${pending === 1 ? 'check' : 'checks'} running` : null,
  ].filter((b): b is string => b !== null)

  if (blockers.length > 0) {
    const reasons = blockers.join(', ')
    return { status: pr.isDraft ? 'draft' : 'blocked', text: `Blocked: ${reasons}`, head: 'Blocked', reasons }
  }
  const isApproved = pr.reviewDecision === 'APPROVED'

  return {
    status: 'ready',
    text: `Ready to merge${isApproved ? ': approved' : ''}, checks pass, no threads waiting on you`,
    head: 'Ready to merge',
    reasons: `${isApproved ? 'approved, ' : ''}checks pass, no threads waiting on you`,
  }
}

/**
 * The HTML tags review bots write in comments, such as `<sub>` and `<details>`.
 * Lowercase only, so a type parameter such as `Props<P>` stays.
 */
const HTML_TAG =
  /<\/?(?:a|b|br|code|details|div|em|h[1-6]|hr|i|img|kbd|li|ol|p|pre|span|strong|sub|summary|sup|table|tbody|td|th|thead|tr|ul)\b[^>]*>/g

/**
 * A review comment's Markdown without the HTML that review bots add, and with
 * each image as its alt text, so a bot's `![P1 Badge](…)` reads "P1".
 */
export function readableComment(body: string): string {
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(HTML_TAG, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt: string) => alt.replace(/\s*badge$/i, ''))
    .trim()
}

/** A review comment as one line of plain text, for a row that shows only its start. */
export function commentLine(body: string): string {
  return readableComment(body)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:#{1,6}|>)\s*/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
}

/** Where a thread sits in the diff: "path:line", or the path alone. */
export function threadWhere(t: PrThread, path = t.path): string {
  return `${path}${t.line ? `:${t.line}` : ''}`
}

export function failingChecks(pr: PrView): PrCheck[] {
  return pr.checks.filter(c => c.bucket === 'fail')
}

function threadText(t: PrThread): string {
  const where = threadWhere(t)

  const opening = [`${where}, from @${t.author}${t.isOutdated ? ' (on an outdated diff)' : ''}:`, t.body, t.url]
  const reply = t.reply ? ['', `Latest reply, from @${t.reply.author}:`, t.reply.body, t.reply.url] : []

  return [...opening, ...reply].join(NL)
}

/** The message each PR button sends to Claude. */
export const prompts = {
  resolve: (pr: PrView) =>
    [
      `PR #${pr.number} (${pr.url}) conflicts with ${pr.base}. Update its branch from ${pr.base}, resolve the conflicts, and verify.`,
      'Ask me before you push, and tell me how you resolved each conflict.',
    ].join(NL),
  address: (pr: PrView, threads: PrThread[]) =>
    [
      threads.length === 1
        ? `Address this review comment on PR #${pr.number} (${pr.url}). Fix it in code and verify.`
        : `Address these ${threads.length} review comments on PR #${pr.number} (${pr.url}). Fix each in code and verify.`,
      "Don't reply on GitHub or resolve the threads; tell me what you changed for each.",
      ...threads.map(t => NL + threadText(t)),
    ].join(NL),
  draft: (pr: PrView, t: PrThread) =>
    [
      `Draft a reply to this review comment on PR #${pr.number} (${pr.url}) for me to review. Don't post it.`,
      '',
      threadText(t),
    ].join(NL),
  discuss: (pr: PrView, t: PrThread) =>
    [
      `Let's talk through this review comment on PR #${pr.number} (${pr.url}) before changing anything.`,
      '',
      threadText(t),
    ].join(NL),
}
