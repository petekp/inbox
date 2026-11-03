import { expect, mock, test } from 'claude-code/testing'
import type { TabsProps } from '../hooks/tabs-client'
import { GH_TIMEOUT_MS } from '../hooks/gh'
import { w, world } from './hooks-world'
import { PANE } from './hooks-helpers'
import { PR_POLL_MS } from '../hooks/mod-sessions'

test('opening the PRs tab while another PR fetch runs still finds the branch’s PR', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const view = (number: number, title: string) =>
    JSON.stringify({
      number,
      title,
      url: `https://github.com/acme/greet/pull/${number}`,
      isDraft: false,
      state: 'OPEN',
      baseRefName: 'main',
      mergeable: 'MERGEABLE',
      reviewDecision: 'APPROVED',
      statusCheckRollup: [],
    })
  const noThreads = JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } })
  let isSlow = true
  w.ghAnswers.push(
    {
      match: argv => argv.includes('view') && argv.includes('12'),
      stdout: view(12, 'Linked work'),
      hold: () => (isSlow ? ((isSlow = false), clock.sleep(5000)) : Promise.resolve()),
    },
    { match: argv => argv.includes('view') && !argv.includes('12'), stdout: view(13, 'Branch work') },
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
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-prs' })
  await clock.advance(5000)

  expect(await pane.find({ text: /Linked work/ })).toBeDefined()
  expect(await pane.find({ text: /Branch work/ })).toBeDefined()
})

test('the PRs tab shows a linked PR only when the viewer wrote it and a fetch found it open, and keeps it once it merges, while a task naming a teammate’s PR keeps its Open PR step', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.ledgerReply = 'NEW: do | - | Review #20 | - | -'
  const states: Record<string, string> = { '12': 'OPEN', '20': 'OPEN', '9': 'MERGED' }
  const titles: Record<string, string> = { '12': 'Mine open', '20': 'Teammate open', '9': 'Mine merged' }
  const authors: Record<string, string> = { '12': 'me', '20': 'sam', '9': 'me' }
  for (const number of Object.keys(states))
    w.ghAnswers.push(
      {
        match: argv => argv.includes('view') && argv.includes(number),
        get stdout() {
          return JSON.stringify({
            number: Number(number),
            title: titles[number],
            url: `https://github.com/acme/greet/pull/${number}`,
            isDraft: false,
            state: states[number],
            baseRefName: 'main',
            mergeable: 'MERGEABLE',
            reviewDecision: 'APPROVED',
            statusCheckRollup: [],
          })
        },
      },
      {
        match: argv => argv.includes('graphql') && argv.includes(`number=${number}`),
        stdout: JSON.stringify({
          data: {
            viewer: { login: 'me' },
            repository: { pullRequest: { author: { login: authors[number] }, reviewThreads: { nodes: [] } } },
          },
        }),
      },
    )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'what changed?', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer:
      'Opened https://github.com/acme/greet/pull/12. Sam has https://github.com/acme/greet/pull/20 open, and https://github.com/acme/greet/pull/9 merged last week.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  expect((await pane.find({ key: 'help-i1-0-key' }))?.props.label).toBe('Open PR #20')
  await pane.press({ key: 'tab-prs' })
  await clock.settle()

  expect(await pane.find({ text: /Mine open/ })).toBeDefined()
  expect(await pane.find({ text: /Teammate open/ })).toBeUndefined()
  expect(await pane.find({ text: /Mine merged/ })).toBeUndefined()

  states['12'] = 'MERGED'
  await pane.press({ key: 'tab-needsYou' })
  await pane.press({ key: 'tab-prs' })
  await clock.settle()

  expect(await pane.find({ text: /Mine open/ })).toBeDefined()
  expect(await pane.find({ text: /Merged/ })).toBeDefined()
  await pane.press({ key: 'tab-needsYou' })
  expect((await pane.find({ key: 'help-i1-0-key' }))?.props.label).toBe('Open PR #20')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the ${surface} PRs tab says gh is missing until gh starts again`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    const notice = /could not find gh/
    w.isGhMissing = true

    await $.session.start({ cwd: '/tmp/project', surface, isInteractive: true })
    const pane = await $.ui.mount({ ...PANE, surface })
    const show = async (id: string) => {
      if (surface === 'terminal') return pane.press({ key: `tab-${id}` })
      const { tabs, gap } = (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
      const x = tabs
        .slice(
          0,
          tabs.findIndex(t => t.id === id),
        )
        .reduce((sum, t) => sum + t.width + gap, 0)

      return pane.pointer({ type: 'down', x, y: 1, button: 'left', in: 'tabs' })
    }
    await show('prs')
    await clock.settle()
    expect(await pane.find({ text: notice })).toBeDefined()

    w.isGhMissing = false
    await show('needsYou')
    await clock.settle()
    await show('prs')
    await clock.settle()
    expect(await pane.find({ text: /No PRs/ })).toBeDefined()
    expect(await pane.find({ text: notice })).toBeUndefined()
  })

  test(`the ${surface} PRs tab does not say gh is missing when every gh run times out`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    w.slowGhClock = clock

    await $.session.start({ cwd: '/tmp/project', surface, isInteractive: true })
    const pane = await $.ui.mount({ ...PANE, surface })
    if (surface === 'terminal') await pane.press({ key: 'tab-prs' })
    else {
      const { tabs, gap } = (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
      const x = tabs
        .slice(
          0,
          tabs.findIndex(t => t.id === 'prs'),
        )
        .reduce((sum, t) => sum + t.width + gap, 0)
      await pane.pointer({ type: 'down', x, y: 1, button: 'left', in: 'tabs' })
    }
    await clock.settle()
    await clock.advance(GH_TIMEOUT_MS)
    expect(w.ran.some(argv => argv[0] === 'gh' && argv[1] === 'pr')).toBe(true)
    expect(await pane.find({ text: /No PRs/ })).toBeDefined()
    expect(await pane.find({ text: /could not find gh/ })).toBeUndefined()
  })

  test(`the ${surface} PRs tab says gh is not signed in until gh answers without asking for a sign-in`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    const notice = /gh is not signed in to GitHub/
    w.ghAnswers.push({
      match: argv => argv[0] === 'gh' && argv[1] === 'pr',
      stdout: '',
      fails: 'To get started with GitHub CLI, please run:  gh auth login',
      exitCode: 4,
    })

    await $.session.start({ cwd: '/tmp/project', surface, isInteractive: true })
    const pane = await $.ui.mount({ ...PANE, surface })
    const show = async (id: string) => {
      if (surface === 'terminal') return pane.press({ key: `tab-${id}` })
      const { tabs, gap } = (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
      const x = tabs
        .slice(
          0,
          tabs.findIndex(t => t.id === id),
        )
        .reduce((sum, t) => sum + t.width + gap, 0)

      return pane.pointer({ type: 'down', x, y: 1, button: 'left', in: 'tabs' })
    }
    await show('prs')
    await clock.settle()
    expect(await pane.find({ text: notice })).toBeDefined()
    expect(await pane.find({ text: /could not find gh/ })).toBeUndefined()

    w.ghAnswers.pop()
    await show('needsYou')
    await clock.settle()
    await show('prs')
    await clock.settle()
    expect(await pane.find({ text: /No PRs/ })).toBeDefined()
    expect(await pane.find({ text: notice })).toBeUndefined()
  })
}

test('a session whose only PRs an order ranks fetches them when a turn ends, on the poll, when it loads again, and when [Try again] reads it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let fetches = 0
  w.ghAnswers.push(
    {
      match: argv => argv.includes('view') && argv.includes('40') && ++fetches > 0,
      stdout: JSON.stringify({
        number: 40,
        title: 'Ranked work',
        url: 'https://github.com/acme/greet/pull/40',
        isDraft: false,
        state: 'OPEN',
        baseRefName: 'main',
        mergeable: 'MERGEABLE',
        reviewDecision: '',
        statusCheckRollup: [],
      }),
    },
    {
      match: argv => argv.includes('graphql'),
      stdout: JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } }),
    },
  )
  const fetches40 = async (step: () => Promise<unknown>) => {
    const before = fetches
    await step()
    await clock.settle()
    return fetches > before
  }
  const switchTo = async (from: string, to: string) => {
    await $.session.end({ reason: 'resume', sessionId: from, resume: { id: from } })
    await $.classic.SessionStart({ source: 'resume', session_id: to })
  }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const turnFetched = await fetches40(async () => {
    await $.prompt.submit({ text: 'rank them', wait: false, origin: { kind: 'composer' } })
    await $.tool.call({
      tool: 'mcp__inbox__order_prs',
      repo: 'acme/greet',
      numbers: [40],
      label: 'Review this',
      why: 'It is small.',
    })
    await $.turn.complete({ answer: 'Ranked it.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  })
  expect(turnFetched).toBe(true)
  expect(await fetches40(() => clock.advance(PR_POLL_MS))).toBe(true)

  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  await clock.settle()
  expect(await fetches40(() => switchTo('session-2', 'session-1'))).toBe(true)

  const pane = await $.ui.mount(PANE)
  await switchTo('session-1', 'session-2')
  await clock.settle()
  w.storeRefusal = 'the store is busy'
  await switchTo('session-2', 'session-1')
  await clock.settle()
  expect(await pane.find({ text: 'Could not read the inbox.' })).toBeDefined()
  w.storeRefusal = undefined
  expect(await fetches40(() => pane.press({ key: 'read-again' }))).toBe(true)
})
