import { expect, mock, test } from 'claude-code/testing'
import { PRESS_GUARD_MS, SETTLED_MS } from '../hooks/timing'
import { w, world } from './hooks-world'
import { PANE, leaveAndReturn } from './hooks-helpers'

test('Resolve conflicts reads the PR from GitHub before it sends: it reads Refreshing while gh answers, sends while the conflicts remain, and sends nothing once a push resolved them', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let mergeable = 'CONFLICTING'
  let release: (() => void) | null = null
  let isHeld = false
  w.ghAnswers.push(
    {
      match: argv => argv.includes('view') && argv.includes('12'),
      get stdout() {
        return JSON.stringify({
          number: 12,
          title: 'Add a greeting CLI',
          url: 'https://github.com/acme/greet/pull/12',
          isDraft: false,
          state: 'OPEN',
          baseRefName: 'main',
          mergeable,
          reviewDecision: 'APPROVED',
          statusCheckRollup: [
            {
              __typename: 'CheckRun',
              name: 'test',
              workflowName: 'CI',
              status: 'COMPLETED',
              conclusion: 'CANCELLED',
              startedAt: '2026-10-08T09:00:00Z',
            },
            {
              __typename: 'CheckRun',
              name: 'test',
              workflowName: 'CI',
              status: 'COMPLETED',
              conclusion: 'SUCCESS',
              startedAt: '2026-10-08T09:05:00Z',
            },
          ],
        })
      },
      hold: () => (isHeld ? new Promise<void>(r => (release = r)) : Promise.resolve()),
    },
    {
      match: argv => argv.includes('graphql'),
      stdout: JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } }),
    },
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'open the PR', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Opened https://github.com/acme/greet/pull/12.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-prs' })
  await clock.settle()
  expect(await pane.find({ text: /^ ·\sconflicts with main$/ })).toBeDefined()
  expect(await pane.find({ key: 'fix-acme/greet#12-test-key' })).toBeUndefined()

  isHeld = true
  const first = pane.press({ key: 'resolve-acme/greet#12' })
  await clock.settle()
  expect(await pane.find({ text: /Refreshing PR #12…/ })).toBeDefined()
  expect(w.sent).toEqual([])
  release!()
  await first
  await clock.settle()
  expect(w.sent.at(-1)).toContain('PR #12 (https://github.com/acme/greet/pull/12) conflicts with main.')
  expect(await pane.find({ text: /✓ Asked to resolve conflicts ·/ })).toBeDefined()

  isHeld = false
  mergeable = 'MERGEABLE'
  await clock.advance(PRESS_GUARD_MS)
  expect((await pane.find({ key: 'resolve-acme/greet#12' }))?.props.label).toBe('Resolve conflicts again')
  const sends = w.sent.length
  await pane.press({ key: 'resolve-acme/greet#12' })
  await clock.settle()
  expect(w.sent.length).toBe(sends)
  expect(await pane.find({ key: 'resolve-acme/greet#12' })).toBeUndefined()
  expect(await pane.find({ text: /^This changed before your press\. Nothing was sent\.$/ })).toBeDefined()
})

test('a PR’s Dismiss settles its block until the person types their next message or leaves the tab, with Undo that brings it back, a ready PR’s Merge asks Claude unless it stopped being ready, and a fetch keeps a Dismiss made while it ran, and the branch PR when its lookup fails', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let decision = 'APPROVED'
  const view = (number: number, title: string) =>
    JSON.stringify({
      number,
      title,
      url: `https://github.com/acme/greet/pull/${number}`,
      isDraft: false,
      state: 'OPEN',
      baseRefName: 'main',
      mergeable: 'MERGEABLE',
      reviewDecision: decision,
      statusCheckRollup: [],
    })
  const noThreads = JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } })
  let onFetched: (() => void) | undefined
  let isFetching = false
  on('state.set', { plugin: 'inbox', key: 'session' } as const, async (_$, e, next) => {
    const r = await next(e)
    const wasFetching = isFetching
    isFetching = e.value.prViews.isFetching
    if (wasFetching && !isFetching) onFetched?.()
    return r
  })
  let isSlow = false
  let branchFails: string | undefined
  let branchHold = false
  let releaseBranch = () => {}
  w.ghAnswers.push(
    {
      match: argv => argv.includes('view') && argv.includes('12'),
      get stdout() {
        return view(12, 'Linked work')
      },
      hold: () => (isSlow ? clock.sleep(5000) : Promise.resolve()),
    },
    {
      match: argv => argv.includes('view') && !argv.includes('12'),
      stdout: view(13, 'Branch work'),
      get fails() {
        return branchFails
      },
      hold: () => (branchHold ? new Promise<void>(r => (releaseBranch = r)) : Promise.resolve()),
    },
    { match: argv => argv.includes('graphql'), stdout: noThreads },
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'open the PR', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Opened https://github.com/acme/greet/pull/12.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  w.paneState = { isShown: true, isFocused: true }
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-prs' })
  await clock.settle()
  expect(await pane.find({ text: /Linked work/ })).toBeDefined()
  expect(await pane.find({ text: /Branch work/ })).toBeDefined()
  const linked = () => (JSON.parse(w.stored.get('s:session-1') ?? '{}') as { ledger?: { prs: string[] } }).ledger?.prs

  await pane.press({ key: 'dismiss-pr-acme/greet#12' })
  expect(await pane.find({ key: 'settled-pr:acme/greet#12' })).toBeDefined()
  expect(await pane.find({ key: 'open-acme/greet#12' })).toBeUndefined()
  expect(linked()).toEqual([])
  await pane.press({ key: 'undo-pr:acme/greet#12' })
  expect(await pane.find({ key: 'settled-pr:acme/greet#12' })).toBeUndefined()
  expect(await pane.find({ key: 'open-acme/greet#12' })).toBeDefined()
  expect(linked()).toEqual(['acme/greet#12'])
  await clock.advance(3000)

  expect(await pane.find({ key: 'merge-acme/greet#12' })).toBeDefined()
  await pane.press({ key: 'merge-acme/greet#12' })
  expect(w.sent.at(-1)).toContain('Merge PR #12 (https://github.com/acme/greet/pull/12) into main.')
  await clock.settle()
  expect(await pane.find({ text: /✓ Asked to merge\u2007·/ })).toBeDefined()
  expect((await pane.find({ key: 'merge-acme/greet#12' }))?.props.label).toBe('Merge again')
  const merges = w.sent.length
  await clock.advance(PRESS_GUARD_MS)
  w.beforeAct = async () => {
    decision = 'CHANGES_REQUESTED'
    const fetched = new Promise<void>(resolve => (onFetched = resolve))
    await $.command.run({ command: 'inbox', args: '' } as never)
    await fetched
  }
  await pane.press({ key: 'merge-acme/greet#12' })
  expect(w.sent.length).toBe(merges)
  expect(await pane.find({ text: /^This changed before your press\. Nothing was sent\.$/ })).toBeDefined()
  decision = 'APPROVED'

  branchFails = 'HTTP 502'
  isSlow = true
  await pane.press({ key: 'tab-needsYou' })
  await pane.press({ key: 'tab-prs' })
  await pane.press({ key: 'dismiss-pr-acme/greet#12' })
  isSlow = false
  await clock.advance(2500)
  expect(await pane.find({ key: 'settled-pr:acme/greet#12' })).toBeDefined()
  await clock.advance(2600)
  expect(await pane.find({ key: 'settled-pr:acme/greet#12' })).toBeDefined()
  await clock.advance(SETTLED_MS)
  expect(await pane.find({ key: 'settled-pr:acme/greet#12' })).toBeDefined()
  expect(await pane.find({ key: 'undo-pr:acme/greet#12' })).toBeUndefined()
  await $.prompt.submit({ text: 'what is next?', wait: false, origin: { kind: 'composer' } })
  await clock.settle()
  expect(await pane.find({ key: 'settled-pr:acme/greet#12' })).toBeUndefined()
  await leaveAndReturn(pane, clock, 'prs')

  expect(await pane.find({ text: /Linked work/ })).toBeUndefined()
  expect(await pane.find({ text: /Branch work/ })).toBeDefined()

  expect(await pane.find({ text: 'Last refresh failed: HTTP 502' })).toBeDefined()
  expect((await pane.find({ key: 'refresh-acme/greet#13' }))?.props.label).toBe('Refresh PRs')
  branchFails = undefined
  branchHold = true
  const lookups = () => w.ran.filter(argv => argv[0] === 'gh' && argv.includes('view')).length
  const before = lookups()
  const refreshing = pane.press({ key: 'refresh-acme/greet#13' })
  await clock.settle()
  expect(await pane.find({ text: 'Last refresh failed: HTTP 502' })).toBeDefined()
  expect(await pane.find({ text: 'Refreshing PRs…' })).toBeDefined()
  expect(await pane.find({ key: 'refresh-acme/greet#13' })).toBeDefined()
  branchHold = false
  releaseBranch()
  await refreshing
  await clock.settle()
  expect(lookups()).toBe(before + 1)
  expect(await pane.find({ text: '✓ Refreshed PRs' })).toBeDefined()
  expect(await pane.find({ text: /Last refresh failed/ })).toBeUndefined()
  expect(await pane.find({ key: 'refresh-acme/greet#13' })).toBeUndefined()
  expect(await pane.find({ text: /Branch work/ })).toBeDefined()
})
