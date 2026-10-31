import { expect, mock, test } from 'claude-code/testing'
import type { TabsProps } from '../hooks/tabs-client'
import { PRESS_GUARD_MS } from '../hooks/timing'
import { w, world } from './hooks-world'
import { PANE } from './hooks-helpers'

for (const look of ['terminal', 'desktop'] as const) {
  test(`in the ${look} look, Dismiss merged draws after the PR blocks while a merged PR shows, and settles each merged PR with its own Undo`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    const states: Record<number, string> = { 12: 'OPEN', 14: 'OPEN', 15: 'OPEN' }
    const view = (number: number) =>
      JSON.stringify({
        number,
        title: `Work ${number}`,
        url: `https://github.com/acme/greet/pull/${number}`,
        isDraft: false,
        state: states[number],
        baseRefName: 'main',
        mergeable: 'MERGEABLE',
        reviewDecision: '',
        statusCheckRollup: [],
      })
    w.ghAnswers.push(
      ...[12, 14, 15].map(n => ({
        match: (argv: readonly string[]) => argv.includes('view') && argv.includes(String(n)),
        get stdout() {
          return view(n)
        },
      })),
      {
        match: argv => argv.includes('graphql'),
        stdout: JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } }),
      },
    )
    await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
    await $.prompt.submit({ text: 'open the PRs', wait: false, origin: { kind: 'composer' } })
    await $.turn.complete({
      answer:
        'Opened https://github.com/acme/greet/pull/12, https://github.com/acme/greet/pull/14 and https://github.com/acme/greet/pull/15.',
      durationMs: 5,
      isAborted: false,
      turnId: 't1',
      reason: 'answer',
    })
    await clock.settle()
    states[12] = 'MERGED'
    states[14] = 'MERGED'
    await clock.advance(3 * 60_000)
    await $.command.run({ command: 'inbox', args: '' } as never)
    await clock.settle()
    w.paneState = { isShown: true, isFocused: true }
    const pane =
      look === 'terminal'
        ? await $.ui.mount(PANE)
        : await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 120 } })
    if (look === 'terminal') await pane.press({ key: 'tab-prs' })
    else {
      const { tabs: bar, gap } = (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
      const x = bar
        .slice(
          0,
          bar.findIndex(t => t.id === 'prs'),
        )
        .reduce((sum, t) => sum + t.width + gap, 0)
      await pane.pointer({ type: 'down', x, y: 1, button: 'left', in: 'tabs' })
    }
    await clock.settle()
    const buttonKeys = async () =>
      (await pane.findAll({ type: 'Button' })).map(b => b.key ?? '').filter(k => !k.endsWith('-key'))
    const keys = await buttonKeys()
    expect(keys.filter(k => k === 'dismiss-merged-tab')).toHaveLength(1)
    expect(keys.indexOf('dismiss-merged-tab')).toBeGreaterThan(
      Math.max(...keys.flatMap((k, n) => (/-acme\/greet#\d+$/.test(k) ? [n] : []))),
    )
    const linked = () => (JSON.parse(w.stored.get('s:session-1') ?? '{}') as { ledger?: { prs: string[] } }).ledger?.prs

    await clock.advance(PRESS_GUARD_MS)
    await pane.press({ key: 'dismiss-merged-tab' })
    await clock.settle()
    expect(linked()).toEqual(['acme/greet#15'])
    expect(await pane.find({ key: 'settled-pr:acme/greet#12' })).toBeDefined()
    expect(await pane.find({ key: 'settled-pr:acme/greet#14' })).toBeDefined()
    expect(await buttonKeys()).not.toContain('dismiss-merged-tab')
    if (look === 'desktop') return
    await pane.press({ key: 'undo-pr:acme/greet#12' })
    await clock.settle()
    expect(linked()).toEqual(['acme/greet#15', 'acme/greet#12'])
    expect(await pane.find({ key: 'settled-pr:acme/greet#12' })).toBeUndefined()
    expect(await pane.find({ key: 'settled-pr:acme/greet#14' })).toBeDefined()
    expect(await buttonKeys()).toContain('dismiss-merged-tab')
  })
}

for (const look of ['terminal', 'desktop'] as const) {
  test(`in the ${look} look, an order_prs call draws its order's lines and a rank before each ranked PR, ahead of the rest, a changed PR draws Rank again until the agent ranks again, and a merge, a later link, Dismiss, Undo and a clear each redraw it`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    const states: Record<number, string> = { 12: 'OPEN', 14: 'OPEN', 15: 'OPEN', 16: 'OPEN' }
    const failing = new Set<number>()
    const view = (number: number) =>
      JSON.stringify({
        number,
        title: `Work ${number}`,
        url: `https://github.com/acme/greet/pull/${number}`,
        isDraft: false,
        state: states[number],
        baseRefName: 'main',
        mergeable: 'MERGEABLE',
        reviewDecision: '',
        statusCheckRollup: failing.has(number)
          ? [{ __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: '' }]
          : [],
      })
    w.ghAnswers.push(
      ...[12, 14, 15, 16].map(n => ({
        match: (argv: readonly string[]) => argv.includes('view') && argv.includes(String(n)),
        get stdout() {
          return view(n)
        },
      })),
      {
        match: argv => argv.includes('graphql'),
        stdout: JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } }),
      },
    )
    const reply = async (answer: string, turnId: string) => {
      await $.prompt.submit({ text: 'go on', wait: false, origin: { kind: 'composer' } })
      await $.turn.complete({ answer, durationMs: 5, isAborted: false, turnId, reason: 'answer' })
      await clock.settle()
    }
    await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
    await reply('Opened https://github.com/acme/greet/pull/12 and https://github.com/acme/greet/pull/14.', 't1')
    const order = { repo: 'acme/greet', numbers: [14, 15, 12], label: 'Merge in this order', why: '#15 waits on #14.' }
    await $.tool.call({ tool: 'mcp__inbox__order_prs', ...order })
    await clock.advance(3 * 60_000)
    await $.command.run({ command: 'inbox', args: '' } as never)
    await clock.settle()
    w.paneState = { isShown: true, isFocused: true }
    const pane =
      look === 'terminal'
        ? await $.ui.mount(PANE)
        : await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 120 } })
    if (look === 'terminal') await pane.press({ key: 'tab-prs' })
    else {
      const { tabs: bar, gap } = (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
      const x = bar
        .slice(
          0,
          bar.findIndex(t => t.id === 'prs'),
        )
        .reduce((sum, t) => sum + t.width + gap, 0)
      await pane.pointer({ type: 'down', x, y: 1, button: 'left', in: 'tabs' })
    }
    await clock.settle()
    const heads = async () =>
      (await pane.findAll({ type: 'Text', text: /^(\d+\. )?#\d+ Work/ })).map(t =>
        (t.text ?? '').replace(/ Work[\s\S]*/, '').replace(' ', ' '),
      )
    const orderLine = () => pane.find({ type: 'Text', text: /^Merge in this order · set by Claude/ })
    const changedLine = () => pane.find({ type: 'Text', text: /^1 PR changed since$/ })

    expect(await orderLine()).toBeDefined()
    expect(await pane.find({ type: 'Text', text: '#15 waits on #14.' })).toBeDefined()
    expect(await heads()).toEqual(['1. #14', '2. #15', '3. #12'])
    expect(await changedLine()).toBeUndefined()

    failing.add(12)
    await clock.advance(3 * 60_000)
    expect(await changedLine()).toBeDefined()
    expect((await pane.find({ key: 'rank-again-order' }))?.props.label).toMatch(/Rank again$/)
    await pane.press({ key: 'rank-again-order' })
    expect(w.sent.at(-1)).toBe(
      'The PR order you set for the PRs tab, "Merge in this order", is out of date: #12 changed since you set it.\nRank its open PRs in acme/greet again (#14, #15, #12), and set the new order with order_prs.',
    )
    await clock.settle()
    expect(await pane.find({ type: 'Text', text: /^Ranking…/ })).toBeDefined()
    await $.turn.start({ text: w.sent.at(-1) ?? '', turnId: 't-rank' })
    await $.tool.call({ tool: 'mcp__inbox__order_prs', ...order })
    await $.turn.complete({
      answer: 'Ranked them again.',
      durationMs: 5,
      isAborted: false,
      turnId: 't-rank',
      reason: 'answer',
    })
    await clock.settle()
    expect(await changedLine()).toBeUndefined()
    expect(await pane.find({ key: 'rank-again-order' })).toBeUndefined()
    expect(await pane.find({ type: 'Text', text: /^✓ Ranked/ })).toBeDefined()

    await reply('Opened https://github.com/acme/greet/pull/16.', 't2')
    await clock.advance(3 * 60_000)
    expect(await heads()).toEqual(['1. #14', '2. #15', '3. #12', '#16'])

    states[14] = 'MERGED'
    await clock.advance(3 * 60_000)
    expect(await heads()).toEqual(['1. #15', '2. #12', '#16', '#14'])

    await pane.press({ key: 'dismiss-pr-acme/greet#15' })
    await clock.settle()
    expect(await pane.find({ key: 'settled-pr:acme/greet#15' })).toBeDefined()
    expect(await heads()).toEqual(['2. #12', '#16', '#14'])
    if (look === 'terminal') {
      await pane.press({ key: 'undo-pr:acme/greet#15' })
      await clock.settle()
      expect(await heads()).toEqual(['1. #15', '2. #12', '#16', '#14'])
    }

    await $.tool.call({ tool: 'mcp__inbox__order_prs', numbers: [] })
    await clock.settle()
    expect(await orderLine()).toBeUndefined()
    expect((await heads()).every(h => h.startsWith('#'))).toBe(true)
  })
}
