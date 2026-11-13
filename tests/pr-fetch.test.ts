import { expect, test } from 'claude-code/testing'

import { press } from '../hooks/host-press'
import { fetchPrs } from '../hooks/host-prs'
import { CLOSED_PR_REFRESH_MS, fetchTracked, LIMIT_RETRY_MS, NO_PR_SHARED, PR_SHARED_MS } from '../hooks/pr-fetch'
import type { PrShared } from '../hooks/pr-fetch'
import { runFailureOf } from '../hooks/pr-query'
import { fetchFailureNotice, PR_REFRESH_LABEL, refreshProblem } from '../hooks/pr-refresh'
import { ghNoticeOf, PR_REFRESH_ID } from '../hooks/pr-rows'
import { applyPrPress, prBlockActions } from '../hooks/pr-tab'
import { feedbackOf, feedbackText } from '../hooks/feedback'
import { emptySession } from '../hooks/session-files'
import { sessionView } from '../hooks/session-view'
import { clockTime } from '../hooks/text'
import { NO_HOLDS, SETTLED_MS } from '../hooks/timing'
import type { PrView, Session } from '../types'
import type { SessionHost } from '../hooks/session-host'
import { BLOCKED_PR } from './session-helpers'
import { LIMIT_ANSWER, prNodeOf, prsAnswerOf, queriedPrs, rateLimitAnswer } from './gh-answers'
import type { PrAnswer, ViewJson } from './gh-answers'

const NOW = 1_000_000

const viewJson = (ref: string, state = 'OPEN'): ViewJson => {
  const [repo, number] = ref.split('#') as [string, string]
  return { number: Number(number), title: `Work ${number}`, url: `https://github.com/${repo}/pull/${number}`, state }
}

const savedView = (ref: string, state = 'OPEN', fetchedAt = NOW - 10 * 60_000): PrView => ({
  ...BLOCKED_PR,
  ref,
  number: Number(ref.split('#')[1]),
  url: `https://github.com/${ref.replace('#', '/pull/')}`,
  state,
  mergeable: 'MERGEABLE',
  checks: [],
  fetchedAt,
})

type Answer = { exitCode: number; stdout: string; stderr: string }

/** A stand-in gh that answers the PRs query from `answerOf`, and records each run. */
function ghStandIn(answerOf: (number: string, repo: string) => PrAnswer, more: Partial<Record<string, Answer>> = {}) {
  const runs: string[][] = []
  const queried: string[][] = []
  const run = async (args: string[]): Promise<Answer> => {
    runs.push(args)
    const named = more[args[1] ?? ''] ?? more[args.join(' ')]
    if (named) return named
    if (args[1] === 'graphql') {
      const query = args[3]!.slice('query='.length)
      queried.push(queriedPrs(query).map(p => `${p.repo}#${p.number}`))
      return { exitCode: 0, stdout: prsAnswerOf(query, answerOf, 'me'), stderr: '' }
    }

    return { exitCode: 1, stdout: '', stderr: 'no pull requests found' }
  }

  return { run, runs, queried }
}

const ask = { findsBranchPr: false, isPress: false }
const prState = (views: Record<string, PrView>) => ({ views, branchRef: null, isFetching: false })
const links = (refs: string[]) => ({ prs: refs, prOrder: null })

test('a fetch reads every tracked PR of every repo, with its threads and author, in one gh run, keeps the view of a PR GitHub does not find with why, and says why a PR with no view could not be read', async () => {
  const refs = ['acme/app#1', 'acme/app#2', 'acme/lib#3', 'acme/app#4']
  const gh = ghStandIn((number, repo) =>
    number === '2' || number === '4'
      ? null
      : {
          node: prNodeOf(viewJson(`${repo}#${number}`), {
            author: { login: number === '3' ? 'sam' : 'me' },
            reviewThreads: {
              nodes: [
                {
                  id: `T${number}`,
                  isResolved: false,
                  isOutdated: false,
                  path: 'a.ts',
                  line: 1,
                  originalLine: 1,
                  comments: { totalCount: 1, nodes: [{ author: { login: 'sam' }, body: 'Rename it', url: 'u' }] },
                  last: { nodes: [] },
                },
              ],
            },
          }),
        },
  )
  const fetched = await fetchTracked(
    gh.run,
    prState({ 'acme/app#2': savedView('acme/app#2') }),
    links(refs),
    ask,
    () => NOW,
  )

  expect(gh.runs).toHaveLength(1)
  expect(gh.queried).toEqual([['acme/app#1', 'acme/app#2', 'acme/app#4', 'acme/lib#3']])
  expect(fetched.failure).toBeNull()
  expect(fetched.read).toEqual(['acme/app#1', 'acme/lib#3'])
  expect(fetched.views['acme/app#1']).toMatchObject({
    title: 'Work 1',
    isYours: true,
    wasSeenOpen: true,
    fetchedAt: NOW,
    error: null,
  })
  expect(fetched.views['acme/app#1']?.threads.map(t => [t.id, t.isWaiting])).toEqual([['T1', true]])
  expect(fetched.views['acme/lib#3']).toMatchObject({ isYours: false, base: '' })
  expect(fetched.views['acme/app#2']).toMatchObject({
    title: 'Add a CLI',
    error: 'not found on GitHub, or no access to acme/app',
  })
  expect(fetched.views['acme/app#4']).toBeUndefined()
  expect(fetched.unread).toEqual({ 'acme/app#4': 'not found on GitHub, or no access to acme/app' })
})

test('a merged PR is never read again, a closed one only once an hour, and a press reads a closed one now', async () => {
  const views = {
    'acme/app#1': savedView('acme/app#1', 'MERGED', NOW - 1),
    'acme/app#2': savedView('acme/app#2', 'CLOSED', NOW - CLOSED_PR_REFRESH_MS + 1),
    'acme/app#3': savedView('acme/app#3', 'CLOSED', NOW - CLOSED_PR_REFRESH_MS),
    'acme/app#4': savedView('acme/app#4', 'OPEN', NOW - 1),
  }
  const refs = Object.keys(views)
  const gh = ghStandIn((number, repo) => ({ node: prNodeOf(viewJson(`${repo}#${number}`)) }))
  await fetchTracked(gh.run, prState(views), links(refs), ask, () => NOW)
  expect(gh.queried).toEqual([['acme/app#3', 'acme/app#4']])

  await fetchTracked(gh.run, prState(views), links(refs), { ...ask, isPress: true }, () => NOW)
  expect(gh.queried[1]).toEqual(['acme/app#2', 'acme/app#3', 'acme/app#4'])
})

test('a view another session read lately, and since this session last read the PR, stands in for a read, with this session’s own record of having seen the PR open, unless a press asked', async () => {
  const refs = ['acme/app#1', 'acme/app#2', 'acme/app#3']
  const shared = {
    'acme/app#1': {
      ...savedView('acme/app#1', 'MERGED', NOW - PR_SHARED_MS + 1),
      wasSeenOpen: true,
      title: 'Shared 1',
    },
    'acme/app#2': savedView('acme/app#2', 'OPEN', NOW - PR_SHARED_MS),
    'acme/app#3': savedView('acme/app#3', 'OPEN', NOW - 1),
  }
  const own = { 'acme/app#3': shared['acme/app#3'] }
  const gh = ghStandIn((number, repo) => ({ node: prNodeOf(viewJson(`${repo}#${number}`)) }))
  const fetched = await fetchTracked(gh.run, prState(own), links(refs), ask, () => NOW, shared)
  expect(gh.queried).toEqual([['acme/app#2', 'acme/app#3']])
  expect(fetched.views['acme/app#1']).toMatchObject({ title: 'Shared 1', wasSeenOpen: false })
  expect(fetched.read).toEqual(['acme/app#2', 'acme/app#3'])

  const pressed = await fetchTracked(gh.run, prState(own), links(refs), { ...ask, isPress: true }, () => NOW, shared)
  expect(gh.queried[1]).toEqual(refs)
  expect(pressed.views['acme/app#1']?.title).toBe('Work 1')
})

test('a session with 40 tracked PRs, 10 of them merged, reads the rest in one gh run a poll, two with the branch lookup, where it ran two per PR', async () => {
  const refs = Array.from({ length: 40 }, (_, n) => `acme/app#${n + 1}`)
  const views = Object.fromEntries(refs.map((ref, n) => [ref, savedView(ref, n < 10 ? 'MERGED' : 'OPEN')]))
  const order = { refs: refs.slice(10), label: null, why: null, statuses: null, dismissed: [], by: 'Claude', at: 0 }
  const tracked = { prs: refs.slice(0, 10), prOrder: order }
  const gh = ghStandIn((number, repo) => ({ node: prNodeOf(viewJson(`${repo}#${number}`)) }))
  await fetchTracked(gh.run, prState(views), tracked, ask, () => NOW)
  expect(gh.runs.map(r => r.slice(0, 2))).toEqual([['api', 'graphql']])
  expect(gh.queried[0]).toHaveLength(30)

  await fetchTracked(gh.run, prState(views), tracked, { ...ask, findsBranchPr: true }, () => NOW)
  expect(gh.runs.slice(1).map(r => r.slice(0, 2))).toEqual([
    ['pr', 'view'],
    ['api', 'graphql'],
  ])
})

/** A host over one session and the shared record, whose gh is `run`. */
function hostOf(run: (args: string[]) => Promise<Answer>, start: Session, now: () => number) {
  let state = start
  let shared: PrShared = NO_PR_SHARED
  const host: Pick<SessionHost<Session>, 'now' | 'read' | 'update' | 'gh'> = {
    now,
    read: async () => state,
    update: async change => (state = await change(state)),
    gh: {
      shared: {
        read: async () => shared,
        write: async change => {
          shared = change(shared)
        },
      },
      find: async () => 'gh',
      forget: () => {},
      run: () => run,
      noteMissing: () => {},
    },
  }

  return { host, state: () => state, shared: () => shared }
}

test('a limit error stops every session’s polling until GitHub’s reset time, keeps each PR’s view with no error of its own, says so once at the top, and a press reads again at once', async () => {
  const base = emptySession()
  const refs = ['acme/app#1', 'acme/app#2']
  const start: Session = {
    ...base,
    ledger: { ...base.ledger, prs: refs },
    prViews: prState(Object.fromEntries(refs.map(ref => [ref, savedView(ref)]))),
  }
  const resetAt = NOW + 20 * 60_000
  let isLimited = true
  let clock = NOW
  const answers = ghStandIn((number, repo) => ({ node: prNodeOf(viewJson(`${repo}#${number}`)) }))
  const run = async (args: string[]) => {
    if (args[1] === 'rate_limit') return { exitCode: 0, stdout: rateLimitAnswer(resetAt), stderr: '' }
    if (args[1] === 'graphql' && isLimited) {
      answers.runs.push(args)
      return LIMIT_ANSWER
    }
    return answers.run(args)
  }
  const { host, state, shared } = hostOf(run, start, () => clock)
  const graphqlRuns = () => answers.runs.filter(r => r[1] === 'graphql').length

  await fetchPrs(host, false)
  const limit = { kind: 'limit', at: NOW, resetsAt: resetAt }
  expect(state().prViews.failure).toEqual(limit)
  expect(shared().limit).toEqual(limit)
  expect(Object.values(state().prViews.views).map(v => v.error)).toEqual([null, null])
  expect(ghNoticeOf({ isGhMissing: false, isGhSignedOut: false, failure: state().prViews.failure })).toEqual({
    kind: 'gh-limited',
    text: `GitHub's limit is used up. The PRs refresh after it resets at ${clockTime(resetAt)}.`,
  })
  const view = sessionView(state(), clock, 1000, NO_HOLDS).prs
  expect(view.refresh).toEqual({
    text: null,
    actions: [expect.objectContaining({ label: PR_REFRESH_LABEL, kind: 'local', isOut: false })],
    showsPress: false,
  })
  const presses = { lastActions: {}, turns: { turnsStarted: 0, turnsApplied: 0 }, now: clock }
  expect(prBlockActions(state().prViews.views['acme/app#1']!, () => false, null, presses).map(a => a.label)).toEqual([
    'Merge',
    'Open PR',
    'Dismiss',
  ])

  clock += 5 * 60_000
  await fetchPrs(host, false)
  expect(graphqlRuns()).toBe(1)
  expect(state().prViews.failure).toEqual(limit)

  const other = hostOf(run, start, () => clock)
  other.host.gh.shared = host.gh.shared
  await fetchPrs(other.host, false)
  expect(graphqlRuns()).toBe(1)
  expect(other.state().prViews.failure).toEqual(limit)

  await fetchPrs(host, true, true)
  expect(graphqlRuns()).toBe(2)
  expect(state().prViews.failure).toEqual({ ...limit, at: clock })

  clock = resetAt
  isLimited = false
  await fetchPrs(host, false)
  expect(graphqlRuns()).toBe(3)
  expect(state().prViews.failure).toBeUndefined()
  expect(shared().limit).toBeNull()
  expect(shared().views['acme/app#1']?.fetchedAt).toBe(resetAt)
  expect(sessionView(state(), clock, 1000, NO_HOLDS).prs.refresh).toBeNull()
})

test('a limit error GitHub gives no reset for stops polling for a while, and a fetch that cannot reach GitHub or gets an error says so at the top and keeps the views', async () => {
  const base = emptySession()
  const start: Session = {
    ...base,
    ledger: { ...base.ledger, prs: ['acme/app#1'] },
    prViews: prState({ 'acme/app#1': savedView('acme/app#1') }),
  }
  let answer: Answer = LIMIT_ANSWER
  const runs: string[][] = []
  const run = async (args: string[]) => {
    runs.push(args)
    return args[1] === 'rate_limit' ? { exitCode: 1, stdout: '', stderr: 'HTTP 500' } : answer
  }
  let clock = NOW
  const { host, state } = hostOf(run, start, () => clock)
  await fetchPrs(host, false)
  expect(state().prViews.failure).toEqual({ kind: 'limit', at: NOW, resetsAt: null })
  expect(fetchFailureNotice(state().prViews.failure!)).toBe(
    "GitHub's limit is used up. The PRs refresh once it resets.",
  )
  clock += LIMIT_RETRY_MS - 1
  await fetchPrs(host, false)
  expect(runs.filter(r => r[1] === 'graphql')).toHaveLength(1)
  clock += 1
  answer = { exitCode: 1, stdout: '', stderr: 'error connecting to api.github.com\ncheck your internet connection' }
  await fetchPrs(host, false)
  expect(state().prViews.failure).toEqual({ kind: 'unreachable', at: clock })
  expect(fetchFailureNotice(state().prViews.failure!)).toBe('Could not reach GitHub. The PRs show as last read.')
  answer = { exitCode: 1, stdout: '', stderr: 'gh: HTTP 502: Bad gateway (https://api.github.com/graphql)' }
  await fetchPrs(host, false)
  expect(state().prViews.failure).toEqual({ kind: 'error', at: clock, text: 'HTTP 502: Bad gateway' })
  expect(fetchFailureNotice(state().prViews.failure!)).toBe(
    'Could not read the PRs: HTTP 502: Bad gateway. They show as last read.',
  )
  expect(state().prViews.views['acme/app#1']?.error).toBeNull()
  expect(refreshProblem({ ...state().prViews, isGhMissing: false }, state().ledger)).toBe('HTTP 502: Bad gateway')
})

test('Refresh PRs at the top reads Refreshing, then why it could not refresh, in the PRs’ own words, and Refreshed only once every PR was read', async () => {
  const base = emptySession()
  const refs = ['acme/app#1', 'acme/app#2']
  const start: Session = {
    ...base,
    ledger: { ...base.ledger, prs: refs },
    prViews: prState(Object.fromEntries(refs.map(ref => [ref, savedView(ref)]))),
  }
  const resetAt = NOW + 60_000
  let answerOf: (number: string) => PrAnswer = () => null
  let isLimited = true
  const gh = ghStandIn(number => answerOf(number), {})
  const run = async (args: string[]) => {
    if (args[1] === 'rate_limit') return { exitCode: 0, stdout: rateLimitAnswer(resetAt), stderr: '' }
    if (args[1] === 'graphql' && isLimited) return LIMIT_ANSWER
    return gh.run(args)
  }
  const { host, state } = hostOf(run, start, () => NOW)
  const pressHost = {
    ...host,
    deliver: async () => ({ state: 'accepted' as const, queuedId: null }),
    perform: async () => null,
    refreshPrs: () => fetchPrs(host, true, true),
    newId: () => 'id',
    comparePage: '',
    compareInBackground: false,
    settleWindowMs: 1000,
  }
  const refreshed = () =>
    feedbackText(
      feedbackOf(PR_REFRESH_ID, state().lastActions[PR_REFRESH_ID], undefined, state().presence, NOW)!,
      'terminal',
    )
  const pending = applyPrPress(start.ledger, start.prViews, {}, { action: 'pr-refresh' }, { now: NOW, turnsStarted: 0 })
  expect('stale' in pending ? null : pending.lasts[PR_REFRESH_ID]?.result?.state).toBe('pending')

  await press(pressHost, { action: 'pr-refresh' }, false, NO_HOLDS)
  expect(refreshed()).toBe(`Could not refresh PRs: GitHub's limit resets at ${clockTime(resetAt)}`)

  isLimited = false
  answerOf = number => (number === '1' ? { node: prNodeOf(viewJson('acme/app#1')) } : null)
  await press(pressHost, { action: 'pr-refresh' }, false, NO_HOLDS)
  expect(refreshed()).toBe('Could not refresh PRs: #2 could not be read')
  expect(sessionView(state(), NOW, 1000, NO_HOLDS).prs.refresh?.text).toBe('#2 could not be read')
  expect(state().prViews.views['acme/app#2']?.error).toBe('not found on GitHub, or no access to acme/app')

  answerOf = number => ({ node: prNodeOf(viewJson(`acme/app#${number}`)) })
  await fetchPrs(host, true)
  expect(sessionView(state(), NOW, 1000, { ...NO_HOLDS, shownSince: NOW - 1 }).prs.refresh).toBeNull()

  answerOf = number => ({ node: prNodeOf(viewJson(`acme/app#${number}`)) })
  await press(pressHost, { action: 'pr-refresh' }, false, NO_HOLDS)
  expect(refreshed()).toBe('✓ Refreshed PRs')
  const after = sessionView(state(), NOW, 1000, { ...NO_HOLDS, shownSince: NOW - 1 }).prs.refresh
  expect(after).toEqual({ text: null, actions: [], showsPress: true })
  const faded = sessionView(state(), NOW + SETTLED_MS, 1000, { ...NO_HOLDS, shownSince: NOW - 1 }).prs.refresh
  expect(faded).toBeNull()
})

test('an answer that holds data is never a limit, whatever its titles say, and a real limit answer still is', async () => {
  const titled = prNodeOf({ ...viewJson('acme/app#1'), title: 'Handle GitHub rate limits' })
  const good = { exitCode: 0, stdout: JSON.stringify({ data: { viewer: { login: 'me' }, pr0: titled } }), stderr: '' }
  expect(runFailureOf(good, 124, NOW)).toBeNull()

  const gh = ghStandIn(() => ({ node: titled }))
  const refs = ['acme/app#1']
  const fetched = await fetchTracked(gh.run, prState({}), links(refs), ask, () => NOW)
  expect(fetched.failure).toBeNull()
  expect(fetched.read).toEqual(refs)

  const limit = { kind: 'limit', at: NOW, resetsAt: null }
  expect(runFailureOf(LIMIT_ANSWER, 124, NOW)).toEqual(limit)
  expect(runFailureOf({ ...LIMIT_ANSWER, stderr: '' }, 124, NOW)).toEqual(limit)
  expect(runFailureOf({ ...LIMIT_ANSWER, stdout: '' }, 124, NOW)).toEqual(limit)
})

test('a limit that leaves the hourly budget unspent does not wait for the hourly reset', async () => {
  const resetAt = NOW + 50 * 60_000
  const unspent = JSON.stringify({ resources: { graphql: { limit: 5000, remaining: 4000, reset: resetAt / 1000 } } })
  const run = async (args: string[]) =>
    args[1] === 'rate_limit' ? { exitCode: 0, stdout: unspent, stderr: '' } : LIMIT_ANSWER
  const fetched = await fetchTracked(run, prState({}), links(['acme/app#1']), ask, () => NOW)
  expect(fetched.failure).toEqual({ kind: 'limit', at: NOW, resetsAt: null })
})
