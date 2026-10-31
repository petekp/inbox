import { expect, mock, test } from 'claude-code/testing'
import { TAB_HEIGHT, tabLines, type TabsProps } from '../hooks/tabs-client'
import { cellWidth } from '../hooks/text'
import { shownTabs } from '../hooks/tabs'
import { w, world } from './hooks-world'
import { PANE } from './hooks-helpers'

test('the pane footer shows the version from the plugin manifest', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: '' } as never)
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: 'v1.2.3' })).toBeDefined()
})

test('the pane footer marks a build that follows the next branch', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  w.paneState = { isShown: true, isFocused: true }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: '' } as never)
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: 'v1.2.3 · next' })).toBeDefined()
})

test('/inbox opens on the tab that has rows when the tab it would show is empty', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: false, isFocused: false }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'No lint script',
    detail: 'Only tests run.',
  })
  await clock.settle()
  w.paneState = { isShown: true, isFocused: true }
  await $.command.run({ command: 'inbox', args: '' } as never)
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ key: 'address-f1' })).toBeDefined()
})

test('on a next build, at 20 desktop columns the tabs show their symbols with their counts, at 69 their words, and the Status page draws there', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  w.statusReply =
    'HEAD: Adding a greeting CLI | Building a CLI that greets by name\nNEW: working | Runtime | Node or Python\nLINK: i1 | Runtime\nNEW: working | Plan | being written\nDONE: s2 | written'
  w.surfaces = ['desktop']

  await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'No lint script',
    detail: 'Only tests run.',
  })
  await clock.settle()
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 20 } })
  const tabBar = async () => (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
  expect((await tabBar()).tabs.map(t => [t.id, t.label, t.badge])).toEqual(
    shownTabs(true).map(t => [t.id, t.symbol, t.id === 'needsYou' ? '2' : t.id === 'findings' ? '1' : null]),
  )
  await pane.redraw({ ...PANE.props, bodyColumns: 69 })
  expect((await tabBar()).tabs.map(t => t.label)).toEqual(shownTabs(true).map(t => t.label))
  expect((await tabBar()).isEachFramed).toBe(true)

  const { tabs, gap } = await tabBar()
  await pane.pointer({ type: 'down', x: tabs[0]!.width + gap, y: 1, button: 'left', in: 'tabs' })
  await clock.settle()
  expect((await tabBar()).shown).toBe('needsYou')
  await pane.pointer({ type: 'down', x: 0, y: 1, button: 'left', in: 'tabs' })
  await clock.settle()
  expect((await tabBar()).shown).toBe('overview')
  expect((await pane.find({ key: 'status-head' }))?.text).toBe(
    'Adding a greeting CLIBuilding a CLI that greets by name',
  )
  expect((await pane.find({ key: 'status-s2-text' }))?.text).toBe('written')
  expect(await pane.find({ key: 'select-f3' })).toBeUndefined()
})

for (const isNextBuild of [false, true])
  test(`on a ${isNextBuild ? 'next' : 'release'} build, the terminal tabs show their words down to the narrowest pane they fit, docked and inline, and their symbols below it`, async ($, on) => {
    const tabs = shownTabs(isNextBuild)
    expect(['✅', '👩‍💻', ...shownTabs(true).map(t => t.symbol)].map(cellWidth)).toEqual([2, 2, 2, 2, 2, 2])
    mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    w.files = isNextBuild ? ['/.next-build'] : []
    await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
    for (const placement of ['dock', 'inline'] as const) {
      const pane = await $.ui.mount({ ...PANE, props: { ...PANE.props, placement } })
      const names = async (bodyColumns: number) => {
        await pane.redraw({ ...PANE.props, placement, bodyColumns })
        const buttons = await pane.findAll({ type: 'Button' })

        return tabs.flatMap(t => buttons.filter(b => b.key === `tab-${t.id}`).map(b => [t, b.props.label] as const))
      }
      expect((await pane.findAll({ type: 'Button' })).some(b => b.key === 'tab-overview')).toBe(isNextBuild)
      const namings = []
      for (let bodyColumns = 79; bodyColumns >= 14; bodyColumns--) {
        const drawn = await names(bodyColumns)
        expect(drawn.length).toBeGreaterThan(0)
        const isWords = drawn.every(([t, label]) => label === t.label)
        if (!isWords) for (const [t, label] of drawn) expect(label).toBe(t.symbol)
        namings.push(isWords)
      }
      expect(namings[0]).toBe(true)
      expect(namings.at(-1)).toBe(false)
      expect(namings.indexOf(false)).toBe(namings.lastIndexOf(true) + 1)
      await pane.unmount()
    }
  })

test('a PR that arrives while the Asks tab is empty moves the pane to the PRs tab', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }
  w.ledgerReply = 'NONE'
  let release = () => {}
  let onFetched = () => {}
  let isFetching = false
  on('state.set', { plugin: 'inbox', key: 'session' } as const, async (_$, e, next) => {
    const r = await next(e)
    const wasFetching = isFetching
    isFetching = e.value.prViews.isFetching
    if (wasFetching && !isFetching) onFetched()
    return r
  })
  w.ghAnswers.push(
    {
      match: argv => argv.includes('view') && argv.includes('12'),
      stdout: JSON.stringify({
        number: 12,
        title: 'Add a greeting CLI',
        url: 'https://github.com/acme/greet/pull/12',
        isDraft: false,
        state: 'OPEN',
        baseRefName: 'main',
        mergeable: 'MERGEABLE',
        reviewDecision: 'REVIEW_REQUIRED',
        statusCheckRollup: [],
      }),
      hold: () => new Promise(r => (release = r)),
    },
    {
      match: argv => argv.includes('graphql'),
      stdout: JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } }),
    },
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: '' } as never)
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: 'Nothing needed' })).toBeDefined()
  await $.prompt.submit({ text: 'open the PR', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Opened https://github.com/acme/greet/pull/12.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  expect(isFetching).toBe(true)
  expect(await pane.find({ text: 'Nothing needed' })).toBeDefined()

  const fetched = new Promise<void>(r => (onFetched = r))
  release()
  await fetched
  await clock.settle()
  expect(await pane.find({ text: 'Nothing needed' })).toBeUndefined()
  expect(await pane.find({ text: /Add a greeting CLI/ })).toBeDefined()
})

for (const isNextBuild of [false, true])
  test(`on a ${isNextBuild ? 'next' : 'release'} build, the desktop tabs fit one line at the narrowest dock, by their words, and narrower still they wrap, each line within the pane, and a tab on the second line takes its click`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    w.files = isNextBuild ? ['/.next-build'] : []
    w.surfaces = ['desktop']
    await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
    const pane = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 26 } })
    const tabBar = async () => await pane.find({ key: 'tabs' })
    const narrowest = (await tabBar())?.props.props as TabsProps
    expect(narrowest.tabs.map(t => t.id)).toEqual(shownTabs(isNextBuild).map(t => t.id))
    if (isNextBuild) expect(narrowest.tabs.map(t => t.label)).toEqual(shownTabs(true).map(t => t.label))
    expect(tabLines(narrowest.tabs, narrowest.gap, narrowest.columns)).toHaveLength(1)
    await pane.redraw({ ...PANE.props, bodyColumns: 12 })
    const { tabs, gap, columns } = (await tabBar())?.props.props as TabsProps
    const lines = tabLines(tabs, gap, columns)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines)
      expect(line.reduce((sum, t) => sum + t.width, gap * (line.length - 1))).toBeLessThanOrEqual(columns)
    expect((await tabBar())?.props.height).toBe(TAB_HEIGHT * lines.length)
    const last = lines.at(-1)![0]!
    await pane.pointer({ type: 'down', x: 1, y: TAB_HEIGHT * (lines.length - 1) + 1, button: 'left', in: 'tabs' })
    await clock.settle()
    expect(((await tabBar())?.props.props as TabsProps).shown).toBe(last.id)
  })
