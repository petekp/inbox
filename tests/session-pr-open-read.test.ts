import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { press } from '../core/runtime/host-press'
import type { PrPress } from '../core/view/pr-press'
import type { RowPress } from '../core/domain/presses'
import { NO_HOLDS } from '../core/view/timing'
import type { Item, PrView } from '../types'
import { fakeHost } from './session-fake-host'
import { BLOCKED_PR, FIX_REF } from './session-helpers'

const PR: PrView = {
  ...BLOCKED_PR,
  threads: [
    {
      id: 'T1',
      author: 'sam',
      reply: null,
      isWaiting: true,
      isOutdated: false,
      isLinesChanged: false,
      path: 'a.ts',
      line: 1,
      body: 'Please rename this.',
      url: 'https://github.com/acme/app/pull/12#r1',
      at: 1,
    },
  ],
  checks: [
    { name: 'test', bucket: 'fail', url: 'https://github.com/acme/app/actions/runs/7/job/1' },
    { name: 'lint', bucket: 'fail', url: null },
  ],
}

const task = (ask: string, helps: Item['helps'] = []): Item => ({
  id: 'i1',
  kind: 'task',
  label: null,
  from: 'record',
  ask,
  options: [],
  rec: null,
  helps,
  turn: 1,
  at: 1,
})

async function pressedHost(p: RowPress | PrPress, item?: Item) {
  const { host, performed } = fakeHost(async () => null)
  const steps: string[] = []
  host.perform = async (_s, e) => {
    steps.push(`perform ${e.kind}`)
    performed.push(e)
    return null
  }
  host.fetchPrsInBackground = () => void steps.push('read')
  await host.update(s => ({
    ...s,
    ledger: { ...s.ledger, prs: [FIX_REF], items: item ? [item] : [] },
    prViews: { ...s.prViews, views: { [FIX_REF]: PR } },
  }))
  const outcome = await press(host, p, false, NO_HOLDS)

  return { steps, outcome }
}

const OPENS_PR: [string, RowPress | PrPress, Item?][] = [
  ['Open PR', { action: 'pr-open', ref: FIX_REF }],
  ['a thread’s Open', { action: 'thread-open', ref: FIX_REF, thread: 'T1' }],
  ['a check’s Open log with no log of its own', { action: 'log', ref: FIX_REF, check: 'lint' }],
  ['a task’s Open PR #12', { action: 'step', id: 'i1', step: 0, label: 'Open PR #12' }, task('Review PR #12')],
  [
    'a task’s link to the PR, named Open PR #12 whatever its name',
    { action: 'step', id: 'i1', step: 0, label: 'Open PR #12' },
    task('Review it', [{ kind: 'link', url: 'https://github.com/ACME/app/pull/12', name: 'the PR' }]),
  ],
  [
    'a task’s unnamed link to the PR, named Open PR #12',
    { action: 'step', id: 'i1', step: 0, label: 'Open PR #12' },
    task('Review it', [{ kind: 'link', url: 'https://github.com/acme/app/pull/12', name: null }]),
  ],
]

for (const [name, p, item] of OPENS_PR)
  test(`${name} opens the PR's page, then starts a read of the PRs`, async () => {
    const { steps, outcome } = await pressedHost(p, item)
    expect(outcome.error).toBeNull()
    expect(steps).toEqual(['perform open', 'read'])
  })

const OPENS_NO_TRACKED_PR: [string, RowPress | PrPress, Item?][] = [
  ['a check’s Open log', { action: 'log', ref: FIX_REF, check: 'test' }],
  [
    'a task’s link to a PR the session does not track, named by its repo and number whatever its name',
    { action: 'step', id: 'i1', step: 0, label: 'Open app#99' },
    task('Review it', [{ kind: 'link', url: 'https://github.com/acme/app/pull/99', name: 'the PR' }]),
  ],
  [
    'a task’s unnamed link to a PR the session does not track, named by its repo and number',
    { action: 'step', id: 'i1', step: 0, label: 'Open app#99' },
    task('Review it', [{ kind: 'link', url: 'https://github.com/acme/app/pull/99', name: null }]),
  ],
  [
    'a task’s Copy',
    { action: 'step', id: 'i1', step: 0, label: 'Copy the PR link' },
    task('Share it', [{ kind: 'copy', text: 'https://github.com/acme/app/pull/12', name: 'the PR link' }]),
  ],
]

for (const [name, p, item] of OPENS_NO_TRACKED_PR)
  test(`${name} starts no read of the PRs`, async () => {
    const { steps } = await pressedHost(p, item)
    expect(steps.length).toBe(1)
    expect(steps).not.toContain('read')
  })
