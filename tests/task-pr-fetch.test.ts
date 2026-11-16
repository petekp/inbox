import { expect, test } from 'claude-code/testing'

import { fetchPrs } from '../hooks/host-prs'
import { NO_PR_SHARED } from '../hooks/pr-fetch'
import { emptySession } from '../hooks/session-files'
import type { SessionHost } from '../hooks/session-host'
import { prNodeOf, prsAnswerOf, queriedPrs } from './gh-answers'
import type { PrAnswer, ViewJson } from './gh-answers'
import type { Session, TaskNode } from '../types'

const NOW = 1_000_000

const viewJson = (ref: string, state = 'OPEN'): ViewJson => {
  const [repo, number] = ref.split('#') as [string, string]
  return { number: Number(number), title: `Work ${number}`, url: `https://github.com/${repo}/pull/${number}`, state }
}

type Answer = { exitCode: number; stdout: string; stderr: string }

function ghStandIn(answerOf: (number: string, repo: string) => PrAnswer) {
  const queried: string[][] = []
  const run = async (args: string[]): Promise<Answer> => {
    if (args[1] !== 'graphql') return { exitCode: 1, stdout: '', stderr: 'no pull requests found' }
    const query = args[3]!.slice('query='.length)
    queried.push(queriedPrs(query).map(pr => `${pr.repo}#${pr.number}`))
    return { exitCode: 0, stdout: prsAnswerOf(query, answerOf, 'me'), stderr: '' }
  }

  return { run, queried }
}

function hostOf(run: (args: string[]) => Promise<Answer>, start: Session) {
  let state = start
  let shared = NO_PR_SHARED
  const host: Pick<SessionHost<Session>, 'now' | 'read' | 'update' | 'gh'> = {
    now: () => NOW,
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

  return { host, state: () => state }
}

const taskWithPr = (id: string, pr: string): TaskNode => ({
  id,
  parentId: null,
  status: 'working',
  weight: 1,
  title: 'Build the feature',
  detail: '',
  notes: [],
  createdAt: NOW,
  updatedAt: NOW,
  history: [],
  links: { pr },
})

test('tracked merged PRs complete and save a task history event', async () => {
  const ref = 'acme/app#7'
  const url = 'https://github.com/acme/app/pull/7'
  const base = emptySession()
  const start = { ...base, ledger: { ...base.ledger, prs: [ref] }, taskTree: [taskWithPr('t1', url)] }
  const gh = ghStandIn((number, repo) => ({ node: prNodeOf(viewJson(`${repo}#${number}`, 'MERGED')) }))
  const { host, state } = hostOf(gh.run, start)

  await fetchPrs(host, false)

  expect(gh.queried).toEqual([[ref]])
  expect(state().taskTree[0]).toMatchObject({
    status: 'done',
    history: [{ source: 'pr', kind: 'completed', detail: url }],
  })
})

test('untracked closed PRs warn, and a failed GitHub fetch changes no task fact or warning', async () => {
  const url = 'https://github.com/acme/app/pull/8'
  const start = { ...emptySession(), taskTree: [taskWithPr('t1', url)] }
  const successful = ghStandIn((number, repo) => ({ node: prNodeOf(viewJson(`${repo}#${number}`, 'CLOSED')) }))
  const first = hostOf(successful.run, start)

  await fetchPrs(first.host, false)

  expect(successful.queried).toEqual([['acme/app#8']])
  expect(first.state().taskTree[0]?.status).toBe('working')
  expect(first.state().taskFactWarnings).toEqual([{ taskId: 't1', pr: url, message: 'PR closed without merge' }])

  const failed = hostOf(async () => ({ exitCode: 1, stdout: '', stderr: 'HTTP 502' }), start)
  await fetchPrs(failed.host, false)
  expect(failed.state().taskTree).toEqual(start.taskTree)
  expect(failed.state().taskFactWarnings).toEqual([])
})

test('untracked task PR checks are capped at eight per poll and continue after the saved cursor', async () => {
  const tasks = Array.from({ length: 10 }, (_, n) =>
    taskWithPr(`t${n + 1}`, `https://github.com/acme/app/pull/${n + 1}`),
  )
  const start = { ...emptySession(), taskTree: tasks }
  const gh = ghStandIn((number, repo) => ({ node: prNodeOf(viewJson(`${repo}#${number}`)) }))
  const { host, state } = hostOf(gh.run, start)

  await fetchPrs(host, false)
  expect(gh.queried).toEqual([Array.from({ length: 8 }, (_, n) => `acme/app#${n + 1}`)])
  expect(state().taskPrFactCursor).toBe('https://github.com/acme/app/pull/8')

  await fetchPrs(host, false)
  expect(gh.queried[1]).toEqual([
    'acme/app#9',
    'acme/app#10',
    'acme/app#1',
    'acme/app#2',
    'acme/app#3',
    'acme/app#4',
    'acme/app#5',
    'acme/app#6',
  ])
})
