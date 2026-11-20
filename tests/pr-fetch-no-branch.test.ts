import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { press } from '../hooks/host-press'
import { fetchPrs } from '../hooks/host-prs'
import { NO_PR_SHARED } from '../hooks/pr-fetch'
import { refreshProblem } from '../hooks/pr-refresh'
import { ghNoticeOf, PR_REFRESH_ID } from '../hooks/pr-rows'
import { feedbackOf, feedbackText } from '../hooks/feedback'
import { emptySession } from '../hooks/session-files'
import { NO_HOLDS } from '../hooks/timing'
import type { Session } from '../types'
import type { SessionHost } from '../hooks/session-host'

const NOW = 1_000_000

const NO_BRANCH_ANSWERS = {
  'a detached HEAD': 'could not determine current branch: failed to run git: not on any branch',
  'a folder that is not a Git repository':
    'failed to run git: fatal: not a git repository (or any of the parent directories): .git\n',
  'a repository with no remote': 'no git remotes found',
  'a repository whose remotes are not on GitHub':
    'none of the git remotes configured for this repository point to a known GitHub host. To tell gh about a new GitHub host, please use `gh auth login`',
  'a branch with no PR': 'no pull requests found for branch "main"',
}

function hostOf(prLookup: { exitCode: number; stderr: string }) {
  let state: Session = emptySession()
  const run = async (args: string[]) => {
    if (args[0] === 'pr' && args[1] === 'view')
      return { exitCode: prLookup.exitCode, stdout: '', stderr: prLookup.stderr }

    return { exitCode: 1, stdout: '', stderr: `unexpected gh run: ${args.join(' ')}` }
  }
  const host: Pick<SessionHost<Session>, 'now' | 'read' | 'update' | 'gh'> = {
    now: () => NOW,
    read: async () => state,
    update: async change => (state = await change(state)),
    gh: {
      shared: { read: async () => NO_PR_SHARED, write: async () => undefined },
      find: async () => 'gh',
      forget: () => {},
      run: () => run,
      noteMissing: () => {},
    },
  }
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

  const refreshFeedback = () => {
    const feedback = feedbackOf(PR_REFRESH_ID, state.lastActions[PR_REFRESH_ID], undefined, state.presence, NOW)
    if (!feedback) throw new Error('Refresh PRs shows no feedback')

    return feedbackText(feedback, 'terminal')
  }

  return { host, pressHost, state: () => state, refreshFeedback }
}

const gh = (s: Session) => ({ isGhMissing: false, isGhSignedOut: false, failure: s.prViews.failure })

for (const [place, stderr] of Object.entries(NO_BRANCH_ANSWERS)) {
  test(`a session in ${place} has no branch PR, shows no notice, and Refresh PRs ends as a normal refresh`, async () => {
    const { host, pressHost, state, refreshFeedback } = hostOf({ exitCode: 1, stderr })
    await fetchPrs(host, true)
    expect(state().prViews.failure ?? null).toBeNull()
    expect(state().prViews.branchRef).toBeNull()
    expect(ghNoticeOf(gh(state()))).toBeNull()
    expect(refreshProblem({ ...state().prViews, isGhMissing: false }, state().ledger)).toBeNull()

    await press(pressHost, { action: 'pr-refresh' }, false, NO_HOLDS)
    expect(state().prViews.failure ?? null).toBeNull()
    expect(refreshFeedback()).toBe('✓ Refreshed PRs')
  })
}

test('a failed branch lookup that is a real failure still shows its notice and fails the Refresh PRs press', async () => {
  const { host, pressHost, state, refreshFeedback } = hostOf({
    exitCode: 1,
    stderr: 'gh: HTTP 502: Bad gateway (https://api.github.com/graphql)',
  })
  await fetchPrs(host, true)
  expect(state().prViews.failure).toEqual({ kind: 'error', at: NOW, text: 'HTTP 502: Bad gateway' })
  expect(ghNoticeOf(gh(state()))?.text).toBe('Could not read the PRs: HTTP 502: Bad gateway. They show as last read.')

  await press(pressHost, { action: 'pr-refresh' }, false, NO_HOLDS)
  expect(refreshFeedback()).toBe('Could not refresh PRs: HTTP 502: Bad gateway')
})
