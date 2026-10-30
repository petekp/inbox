import type { Feedback } from '../../hooks/view'
import { makeServer } from '../src/server'
import { updateState } from '../src/state'
import { fakeRunner, tempDir } from './helpers'

export async function setup(
  queueCode: number,
  now = () => 100,
  fallbackCli = async () => 'codex',
  isNextBuild = false,
) {
  const dir = tempDir()
  await updateState(dir, 's1', s => ({
    ...s,
    root: '/repo',
    cliPath: '/apps/codex',
    ledger: {
      ...s.ledger,
      nextId: 2,
      items: [
        {
          id: 'i1',
          kind: 'question',
          label: null,
          from: 'record',
          ask: 'Ship it?',
          options: ['Yes', 'No'],
          rec: null,
          helps: [],
          turn: 1,
          at: 1,
        },
      ],
    },
  }))
  const runner = fakeRunner(() =>
    queueCode === 0
      ? { code: 0, stdout: 'Queued message q1\n', stderr: '' }
      : { code: queueCode, stdout: '', stderr: 'no such thread' },
  )
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now,
    exec: runner.exec,
    tabHtml: '<html></html>',
    fallbackCli,
    isNextBuild,
  })
  const call = (name: string, args: Record<string, unknown>, meta: Record<string, unknown>) =>
    handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args, _meta: meta } }) as Promise<{
      result: {
        structuredContent: {
          error: string | null
          note: string | null
          view: { needsYou: { questions: { id: string; state: { is: string }; feedback: Feedback | null }[] } }
        }
        content: { text: string }[]
      }
    }>

  return { dir, calls: runner.calls, call, handle }
}

export const ANSWER = { press: { action: 'answer', id: 'i1', option: 'Yes' }, thread: 's1' }

export const GH_VIEW = JSON.stringify({
  number: 7,
  title: 'Add the PRs tab',
  url: 'https://github.com/acme/app/pull/7',
  state: 'OPEN',
  baseRefName: 'main',
  mergeable: 'MERGEABLE',
  reviewDecision: '',
  statusCheckRollup: [{ name: 'lint', conclusion: 'FAILURE', workflowName: 'CI' }],
})
export const GH_THREADS = JSON.stringify({
  data: {
    viewer: { login: 'me' },
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: [
            {
              id: 'T1',
              isResolved: false,
              isOutdated: false,
              path: 'src/a.ts',
              line: 4,
              originalLine: 4,
              comments: { totalCount: 1, nodes: [{ author: { login: 'rev' }, body: 'Rename this', url: 'u' }] },
              last: { nodes: [] },
            },
          ],
        },
      },
    },
  },
})

export type PrView = {
  prs: {
    drawn: {
      pr: { ref: string; number: number; threads: unknown[]; error?: string | null }
      state: { is: string; canUndo?: boolean }
      rank: number | null
    }[]
    count: number
    isGhSignedOut: boolean
    order: {
      title: string
      why: string | null
      changed: { text: string | null; actions: { label: string; hotkey?: string }[]; showsPress: boolean } | null
    } | null
  }
  isFetchingPrs: boolean
  isGhMissing: boolean
  lastActions: Record<string, { action: string }>
}
export type PrReply = { result: { structuredContent: PrView & { error: string | null; view: PrView } } }

export async function prServer(
  answer: (args: string[]) => { code: number; stdout: string; stderr: string },
  now = () => 100,
) {
  const dir = tempDir()
  await updateState(dir, 's1', s => ({ ...s, root: '/repo', cliPath: '/apps/codex' }))
  const runner = fakeRunner(answer)
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now,
    exec: runner.exec,
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
  })
  const call = (name: string, args: Record<string, unknown>) =>
    handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args, _meta: { thread_id: 's1' } },
    }) as Promise<PrReply>

  return { dir, calls: runner.calls, call }
}

export const ghAnswer = (args: string[]) => {
  if (args[0] === 'gh' && args[1] === 'pr') return { code: 0, stdout: GH_VIEW, stderr: '' }
  if (args[0] === 'gh') return { code: 0, stdout: args.includes('api') ? GH_THREADS : 'gh 2.0', stderr: '' }
  return { code: 0, stdout: 'Queued message q1\n', stderr: '' }
}

export const PRS_STALE_MS = 3 * 60_000

export async function viewAfterFetch(call: (name: string, args: Record<string, unknown>) => Promise<PrReply>) {
  await call('inbox_view', {})
  await new Promise(resolve => setTimeout(resolve, 50))

  return call('inbox_view', {})
}
