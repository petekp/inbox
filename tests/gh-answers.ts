import type { PrNode } from '../hooks/pr-query'

/** A PR as `gh pr view --json` prints it, which the tests describe each PR with. */
export type ViewJson = {
  number: number
  title?: string
  url: string
  isDraft?: boolean
  state?: string
  baseRefName?: string
  mergeable?: string
  reviewDecision?: string
  statusCheckRollup?: Record<string, unknown>[]
}

/** A PR's part of the old threads answer, which the tests describe its threads, author and latest commit with. */
export type ThreadsJson = {
  author?: { login: string } | null
  commits?: { nodes?: { commit?: { committedDate?: string } }[] }
  reviewThreads?: { nodes?: unknown[] }
}

/** The PRs a query asks for, in its order: each with its repo and number. */
export function queriedPrs(query: string): { repo: string; number: string }[] {
  const repos = [...query.matchAll(/r\d+: repository\(owner: "([^"]+)", name: "([^"]+)"\)/g)]

  return repos.flatMap((m, n) => {
    const segment = query.slice(m.index, repos[n + 1]?.index)

    return [...segment.matchAll(/p\d+: pullRequest\(number: (\d+)\)/g)].map(p => ({
      repo: `${m[1]}/${m[2]}`,
      number: p[1]!,
    }))
  })
}

/** A PR's node in the query's answer, from the view and threads the tests describe it with. */
export function prNodeOf(view: ViewJson, threads: ThreadsJson = {}): PrNode {
  const contexts = (view.statusCheckRollup ?? []).map(e => {
    const { workflowName, ...rest } = e as { workflowName?: string }
    return { ...rest, ...(workflowName ? { checkSuite: { workflowRun: { workflow: { name: workflowName } } } } : {}) }
  })

  return {
    number: view.number,
    title: view.title,
    url: view.url,
    isDraft: view.isDraft,
    state: view.state,
    baseRefName: view.baseRefName,
    mergeable: view.mergeable,
    reviewDecision: view.reviewDecision,
    ...(threads.author === undefined ? {} : { author: threads.author }),
    commits: {
      nodes: [
        {
          commit: {
            committedDate: threads.commits?.nodes?.[0]?.commit?.committedDate,
            statusCheckRollup: { contexts: { nodes: contexts } },
          },
        },
      ],
    },
    reviewThreads: (threads.reviewThreads ?? { nodes: [] }) as PrNode['reviewThreads'],
  }
}

/** What a stand-in gh answers for one queried PR: its node, or why GitHub could not give it. */
export type PrAnswer = { node: PrNode } | { error: string; type?: string } | null

/**
 * The JSON a stand-in gh prints for the PRs query: each queried PR's node under its aliases, and GitHub's errors for
 * the rest, with the path to each. A PR with no answer is one GitHub does not find.
 */
export function prsAnswerOf(
  query: string,
  answerOf: (number: string, repo: string) => PrAnswer,
  viewer?: string,
): string {
  const repos = [...query.matchAll(/(r\d+): repository\(owner: "([^"]+)", name: "([^"]+)"\)/g)]
  const data: Record<string, unknown> = { ...(viewer ? { viewer: { login: viewer } } : {}) }
  const errors: { type: string; path: string[]; message: string }[] = []
  repos.forEach((m, n) => {
    const segment = query.slice(m.index, repos[n + 1]?.index)
    const repo = `${m[2]}/${m[3]}`
    const prs: Record<string, PrNode | null> = {}
    for (const p of segment.matchAll(/(p\d+): pullRequest\(number: (\d+)\)/g)) {
      const answer = answerOf(p[2]!, repo)
      if (answer && 'node' in answer) prs[p[1]!] = answer.node
      else {
        prs[p[1]!] = null
        errors.push(
          answer
            ? { type: answer.type ?? 'HTTP', path: [m[1]!, p[1]!], message: answer.error }
            : {
                type: 'NOT_FOUND',
                path: [m[1]!, p[1]!],
                message: `Could not resolve to a PullRequest with the number of ${p[2]}.`,
              },
        )
      }
    }
    data[m[1]!] = prs
  })

  return JSON.stringify(errors.length > 0 ? { data, errors } : { data })
}

/** gh's answer when GitHub's hourly limit is used up, as gh prints it: the body on stdout, the line on stderr, exit 1. */
export const LIMIT_ANSWER = {
  exitCode: 1,
  stdout:
    '{"errors":[{"type":"RATE_LIMIT","code":"graphql_rate_limit","message":"API rate limit already exceeded for user ID 1."}]}',
  stderr: 'gh: API rate limit already exceeded for user ID 1.',
}

/** `gh api rate_limit`'s answer with the GraphQL limit resetting at `resetAt`, in ms. */
export function rateLimitAnswer(resetAt: number): string {
  return JSON.stringify({
    resources: { graphql: { limit: 5000, used: 5000, remaining: 0, reset: Math.floor(resetAt / 1000) } },
  })
}
