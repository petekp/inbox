import { expect, mock } from 'claude-code/testing'
import { test } from './test-with-timeout'
import type { Engine, MockClock } from 'claude-code/testing'
import { w, world } from './hooks-world'
import { PANE } from './hooks-helpers'

const PR_12_VIEW = JSON.stringify({
  number: 12,
  title: 'Linked work',
  url: 'https://github.com/acme/greet/pull/12',
  isDraft: false,
  state: 'OPEN',
  baseRefName: 'main',
  mergeable: 'MERGEABLE',
  reviewDecision: 'APPROVED',
  statusCheckRollup: [],
})
const isPr12View = (argv: readonly string[]) => argv.includes('view') && argv.includes('12')
const NO_THREADS = {
  match: (argv: readonly string[]) => argv.includes('graphql'),
  stdout: JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } }),
}

async function linkPr12($: Engine) {
  await $.prompt.submit({ text: 'open the PR', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Opened https://github.com/acme/greet/pull/12.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
}

async function minutes(clock: MockClock, count: number) {
  for (let n = 0; n < count * 4; n++) {
    await clock.advance(15_000)
    await clock.settle()
  }
}

test('while the PRs tab shows, the poll fetches the PRs again between 2 and 2.5 minutes after the last fetch, though each fetch takes 3 seconds', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const startedAt: number[] = []
  w.ghAnswers.push(
    {
      match: isPr12View,
      stdout: PR_12_VIEW,
      hold: async () => {
        startedAt.push(clock.now())
        await clock.sleep(3000)
      },
    },
    NO_THREADS,
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await linkPr12($)
  const pane = await $.ui.mount(PANE)
  w.paneState = { isShown: true, isFocused: true }
  await pane.press({ key: 'tab-prs' })
  await clock.advance(3000)
  await clock.settle()
  const firstPoll = startedAt.length
  await minutes(clock, 10)
  const gaps = startedAt.slice(firstPoll - 1).flatMap((at, n, all) => (n === 0 ? [] : [at - all[n - 1]!]))

  expect(gaps.length).toBeGreaterThanOrEqual(4)
  for (const gap of gaps) {
    expect(gap).toBeGreaterThanOrEqual(120_000)
    expect(gap).toBeLessThanOrEqual(150_000)
  }
})

for (const isTabShown of [true, false]) {
  const tab = isTabShown ? 'shows' : 'is hidden'
  const most = isTabShown ? 6 : 2

  test(`while the PRs tab ${tab}, a linked PR GitHub cannot read is read at most ${most} times in 10 minutes`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    w.ghAnswers.push({ match: isPr12View, stdout: '', fails: 'Could not resolve to a PullRequest' }, NO_THREADS)
    const reads = () => w.ran.filter(argv => argv[2] === 'graphql' && argv[4]?.includes('pullRequest(number: 12)'))

    await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
    const pane = await $.ui.mount(PANE)
    w.paneState = { isShown: isTabShown, isFocused: isTabShown }
    if (isTabShown) await pane.press({ key: 'tab-prs' })
    await clock.settle()
    await linkPr12($)
    await clock.settle()
    expect(reads().length).toBe(1)
    await minutes(clock, 10)

    expect(reads().length).toBeLessThanOrEqual(most)
  })

  test(`while the PRs tab ${tab} and gh is missing, the poll looks for gh at most ${most} times in 10 minutes`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    w.isGhMissing = true
    const looks = () => w.ran.filter(argv => argv[1] === '--version').length

    await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
    const pane = await $.ui.mount(PANE)
    w.paneState = { isShown: isTabShown, isFocused: isTabShown }
    if (isTabShown) await pane.press({ key: 'tab-prs' })
    await clock.settle()
    await linkPr12($)
    await clock.settle()
    const perLook = looks()
    expect(perLook).toBeGreaterThan(0)
    await minutes(clock, 10)

    expect(looks() / perLook).toBeLessThanOrEqual(most)
  })
}

test('the poll starts no fetch while one runs, so a fetch that takes 20 seconds is followed by the next only 2 minutes after it ends', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const runs: { startedAt: number; endedAt: number }[] = []
  w.ghAnswers.push(
    {
      match: isPr12View,
      stdout: PR_12_VIEW,
      hold: async () => {
        const startedAt = clock.now()
        await clock.sleep(20_000)
        runs.push({ startedAt, endedAt: clock.now() })
      },
    },
    NO_THREADS,
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const pane = await $.ui.mount(PANE)
  w.paneState = { isShown: true, isFocused: true }
  await pane.press({ key: 'tab-prs' })
  await clock.settle()
  await linkPr12($)
  await minutes(clock, 10)
  const waits = runs.slice(1).map((run, n) => run.startedAt - runs[n]!.endedAt)

  expect(runs.length).toBeGreaterThanOrEqual(4)
  for (const wait of waits) expect(wait).toBeGreaterThanOrEqual(120_000)
})

test('when the save that ends a fetch fails, the poll still fetches the PRs again', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let fetches = 0
  w.ghAnswers.push({ match: isPr12View, stdout: PR_12_VIEW, hold: async () => void fetches++ }, NO_THREADS)
  let isFetching = false
  let isRefusing = false
  let refused = 0
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    const written = e.value as { prViews: { isFetching: boolean } }
    if (isRefusing && isFetching && !written.prViews.isFetching) {
      refused++
      return { deny: 'store refused' }
    }
    isFetching = written.prViews.isFetching
    return next(e)
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const pane = await $.ui.mount(PANE)
  w.paneState = { isShown: true, isFocused: true }
  await pane.press({ key: 'tab-prs' })
  await linkPr12($)
  await clock.settle()
  const before = fetches
  isRefusing = true
  await minutes(clock, 6)

  expect(before).toBeGreaterThan(0)
  expect(refused).toBeGreaterThan(0)
  expect(fetches).toBeGreaterThanOrEqual(before + 2)
})

test('Open PR opens the PR’s page and reads the PR again, so the tab shows a change made on GitHub', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let title = 'Linked work'
  w.ghAnswers.push(
    {
      match: isPr12View,
      get stdout() {
        return JSON.stringify({ ...JSON.parse(PR_12_VIEW), title })
      },
    },
    NO_THREADS,
  )
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await linkPr12($)
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-prs' })
  await clock.settle()
  expect(await pane.find({ text: /Linked work$/ })).toBeDefined()

  title = 'Linked work, renamed'
  await pane.press({ key: 'open-acme/greet#12' })
  await clock.settle()

  expect(w.ran).toContainEqual(['open', 'https://github.com/acme/greet/pull/12'])
  expect(await pane.find({ text: /Linked work, renamed$/ })).toBeDefined()
})
