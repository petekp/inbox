import { expect, mock } from 'claude-code/testing'
import { test } from './test-with-timeout'
import type { LinksProps } from '../hooks/pane/links-client'
import type { TabsProps } from '../hooks/pane/tabs-client'
import { demoView } from '../core/view/demo'
import { PRESS_GUARD_MS, SETTLED_MS } from '../core/view/timing'
import { inboxView, perTurnStatus } from '../core/view/view'
import { NO_SESSION_PRS } from '../core/domain/help-steps'
import { rowKeyPlan } from '../core/view/action-plan'
import { ROW_COPY } from '../core/view/rows'
import { w, world } from './hooks-world'
import { PANE, selectRow, leaveAndReturn, replyKey } from './hooks-helpers'

test('in the terminal and desktop looks, an open row’s follow-ups are never split between rows: the terminal gives them a row of their own when they do not fit after its buttons, and desktop draws Reply as a Button and its links box asks for the width of the rest', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: 'demo' } as never)
  const { ledger, lastActions, notes, turns } = demoView(1_000_000, 'Claude')
  const view = inboxView({
    ledger,
    lastActions,
    notes,
    turns,
    sessionPrs: NO_SESSION_PRS,
    settleWindowMs: SETTLED_MS,
    status: perTurnStatus({ is: 'fresh' }),
    now: 1_000_000,
    replies: {},
    discarded: {},
    shownSince: 1_000_000,
    lastTypedMessageAt: null,
    listInput: null,
  })
  const row = view.findings.rows.find(r => r.state.is === 'open')!
  const plan = rowKeyPlan(row, false)
  const labelsOf = (planned: typeof plan.keys) =>
    planned.flatMap(k => (k.slot === 'action' || k.slot === 'choice' ? [k.action.label] : []))
  const buttonLabels = labelsOf(plan.keys)
  const followUpLabels = labelsOf(plan.more)
  expect(buttonLabels.length).toBeGreaterThan(0)
  expect(followUpLabels.length).toBeGreaterThan(1)
  const textOf = (node: unknown): string =>
    typeof node === 'string' ? node : ((node as { children?: unknown[] } | null)?.children ?? []).map(textOf).join('')
  const shownLabels = (node: unknown): string[] => {
    if (typeof node !== 'object' || node === null) return []
    const el = node as { type?: string; props?: Record<string, unknown>; children?: unknown[] }
    if (el.type === 'Client')
      return ((el.props?.props as Partial<LinksProps> | undefined)?.links ?? []).map(l => l.label)
    if (el.type === 'Button') return [typeof el.props?.label === 'string' ? el.props.label : textOf(el)]
    return (el.children ?? []).flatMap(shownLabels)
  }
  const holds = (shown: string[], label: string) => shown.some(s => s.endsWith(label))

  for (const look of ['terminal', 'desktop'] as const) {
    const pane =
      look === 'terminal'
        ? await $.ui.mount(PANE)
        : await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 120 } })
    if (look === 'terminal') await pane.press({ key: 'tab-findings' })
    else {
      const { tabs: bar, gap } = (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
      const x = bar
        .slice(
          0,
          bar.findIndex(t => t.id === 'findings'),
        )
        .reduce((sum, t) => sum + t.width + gap, 0)
      await pane.pointer({ type: 'down', x, y: 1, button: 'left', in: 'tabs' })
    }
    await clock.settle()
    await clock.advance(PRESS_GUARD_MS)
    const selectKey = look === 'terminal' ? `title-${row.id}` : `select-${row.id}`
    if (await pane.find({ key: selectKey }))
      if (look === 'terminal') await pane.press({ key: selectKey })
      else await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: selectKey })
    await clock.settle()

    const forms = new Set<string>()
    for (let columns = 26; columns <= 120; columns++) {
      await pane.redraw({ ...PANE.props, bodyColumns: columns })
      const holdsFollowUps = (await pane.findAll({ type: 'Box' })).filter(
        b => b.props.flexWrap === 'wrap' && followUpLabels.some(l => holds(b.children.flatMap(shownLabels), l)),
      )
      const wrapsGroup = (b: (typeof holdsFollowUps)[number]) =>
        b.children.some(
          c =>
            (c as { type?: string }).type === 'Box' &&
            (c as { props?: { flexWrap?: string } }).props?.flexWrap === 'wrap' &&
            followUpLabels.some(l => holds(shownLabels(c), l)),
        )
      const outer = holdsFollowUps.filter(wrapsGroup)
      const rows = (outer.length > 0 ? outer : holdsFollowUps).map(b => b.children.flatMap(shownLabels))
      expect(rows, `${look} at ${columns} columns`).toHaveLength(1)
      expect(
        followUpLabels.every(l => holds(rows[0]!, l)),
        `${look} at ${columns} columns: ${rows[0]!.join(', ')}`,
      ).toBe(true)
      if (look === 'desktop') {
        const followUpButtons = (await pane.findAll({ type: 'Button' })).filter(b =>
          followUpLabels.some(l => holds(shownLabels(b), l)),
        )
        expect(
          followUpButtons.map(b => shownLabels(b).join('')),
          `desktop at ${columns} columns draws its follow-ups but Reply as links`,
        ).toEqual(['Reply'])
        const linksBox = (await pane.findAll({ type: 'Box' })).find(b =>
          b.children.some(c => (c as { props?: { key?: string } }).props?.key === `links-${row.id}`),
        )!
        const { links, gap, slack } = (await pane.find({ key: `links-${row.id}` }))?.props.props as LinksProps
        expect(
          [linksBox.props.width, linksBox.props.flexShrink, linksBox.props.minWidth],
          `desktop at ${columns} columns`,
        ).toEqual([Math.ceil(links.reduce((sum, l) => sum + l.width + slack, gap * (links.length - 1))), 1, 0])
      }
      forms.add(buttonLabels.some(l => holds(rows[0]!, l)) ? 'shared' : 'own')
    }
    expect([...forms].sort(), look).toEqual(look === 'terminal' ? ['own', 'shared'] : ['shared'])
    await pane.unmount()
  }
})

test('in a theme without tone colors, a replied question’s ✓ and its label take the done color whether its row is selected or not', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('ui.focus', () => ({}))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Plan ready. 1. Node or Python? 2. Call it greet?',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  await selectRow(pane, 'i1')
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'typekey-i1' })
  await pane.input({ key: await replyKey(pane, 'i1'), text: 'Deno', kind: 'change' })
  await pane.press({ key: 'send-i1' })
  await clock.settle()
  type Drawn = { type: string; props: Record<string, unknown>; children?: unknown[] }
  const resultIn = (el: Drawn | undefined): Drawn | undefined =>
    el?.type === 'Text' && el.children?.join('') === '✓ Replied: Deno'
      ? el
      : (el?.children ?? [])
          .filter((c): c is Drawn => typeof c === 'object')
          .reduce<Drawn | undefined>((found, c) => found ?? resultIn(c), undefined)
  const doneMark = async () => resultIn(await pane.find({ key: 'row-i1' }))?.props.color
  expect((await pane.find({ key: 'row-i1' }))?.text).toMatch(/✓ Replied: Deno/)
  expect(await doneMark()).toBe('suggestion')

  await selectRow(pane, 'i2')
  expect((await pane.find({ key: 'row-i1' }))?.text).toMatch(/✓ Replied: Deno/)
  expect(await doneMark()).toBe('suggestion')
})

for (const surface of ['terminal', 'desktop'] as const)
  test(`in the ${surface} look, a handed-off task’s result label takes the done color of its ✓`, async ($, on) => {
    mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    await $.session.start({ cwd: '/tmp/project', surface, isInteractive: true })
    await $.command.run({ command: 'inbox', args: 'demo' } as never)
    w.paneState = { isShown: true, isFocused: true }
    const pane = await $.ui.mount({ ...PANE, surface })
    type Drawn = { type: string; props: Record<string, unknown>; children?: unknown[] }
    const labelIn = (el: Drawn | undefined): Drawn | undefined =>
      el?.type === 'Text' && el.children?.join('') === '✓ Run gesture tests'
        ? el
        : (el?.children ?? [])
            .filter((c): c is Drawn => typeof c === 'object')
            .reduce<Drawn | undefined>((found, c) => found ?? labelIn(c), undefined)
    const row = (await pane.find({ key: 'select-d18' })) as Drawn | undefined
    const color =
      surface === 'desktop'
        ? (row?.props.props as { colors: { after: string } }).colors.after
        : labelIn((await pane.find({ key: 'row-d18' })) as Drawn)?.props.color

    expect(color).toBe('suggestion')
  })

test('on desktop, a cancelled question’s ✗ is drawn as a shape and a dismissed one’s ✕ as text, so the two read apart, and the terminal labels the dismissed one’s Reopen as plainly as any other button', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const ask = (text: string) =>
    $.tool.call({ tool: 'mcp__inbox__record', kind: 'question', ask: text, options: ['Yes', 'No'] })
  await ask('Add a gaze-only mode too?')
  await ask('Fall back to voice when your hands are busy?')
  const pane = await $.ui.mount(PANE)
  await clock.settle()
  await selectRow(pane, 'i1')
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'dismiss-i1' })
  await $.tool.call({
    tool: 'mcp__inbox__close',
    id: 'i2',
    reason: 'no longer applies: voice already takes over',
  } as never)
  await clock.advance(SETTLED_MS)
  await leaveAndReturn(pane, clock, 'needsYou')
  await pane.press({ key: 'fold-question' })
  await clock.settle()
  expect((await pane.find({ key: 'reopen-i1', type: 'Button' }))?.props.label).toBe(ROW_COPY.reopen)

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  await clock.settle()
  await desktop.post({ isUnfolded: true }, { in: 'fold-question' })
  await clock.settle()
  const cancelledMark = (await desktop.find({ key: 'closed-i2-mark' }))?.children.find(
    c => typeof c === 'object' && (c as { type?: string }).type === 'Svg',
  ) as { props: { alt?: string } } | undefined
  expect(cancelledMark?.props.alt).toBe('✗')
  expect((await desktop.find({ key: 'closed-i1' }))?.text).toMatch(/✕/)
  expect(await desktop.find({ key: 'closed-i1-mark' })).toBeUndefined()
})

test('on desktop at 30 and 56 columns, an unselected row’s title keeps every word its two lines hold, and is cut only past them: between words, or inside a word only when one word is wider than a line', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }
  w.surfaces = ['desktop']
  await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
  const titles = [
    'Rebuild the bundles',
    'Snoozed glances come back after a restart',
    'Snoozed glances come back after a restart, so a glance snoozed for an hour returns at once in the view',
    'The saved layout keeps snoozed glances, and a restart shows them again, so a glance snoozed for an hour returns at once.',
    'Put on the glasses and pair them with this Mac',
    'hooks/pane-row-lines.tsx:rowClientProps/desktopSpanLines/terminalText',
    'Put on the glasses and pair them with this Mac, then check the glances outdoors',
  ]
  for (const ask of titles) await $.tool.call({ tool: 'mcp__inbox__record', kind: 'task', ask })
  await clock.settle()
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 30 } })
  const shownTitle = async (id: string) => (await pane.find({ type: 'Text', in: `select-${id}` }))?.text

  expect(await shownTitle('i2')).toBe(titles[1])
  expect(await shownTitle('i5')).toBe(titles[4])
  expect(await shownTitle('i6')).toMatch(/^hooks\/pane-row-lines\S+…$/)
  expect(await shownTitle('i7')).toBe('Put on the glasses and pair them with this…')
  expect(await shownTitle('i4')).toMatch(/…$/)
  await pane.redraw({ ...PANE.props, bodyColumns: 56 })
  expect(await shownTitle('i3')).toBe(titles[2])
  expect(await shownTitle('i4')).toMatch(/…$/)
})

test('in the terminal and desktop looks, a question’s context draws whole, muted like its recommendation’s reason, first under its title, on its selected row only', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const context = 'Price lookups take 900 ms, and the checkout page waits on them while the cache is cold.'
  const question = {
    tool: 'mcp__inbox__record',
    kind: 'question',
    rec: 'In-memory',
    why: 'the API runs as one process',
  } as const
  await $.tool.call({
    ...question,
    ask: 'Which cache should the price API use?',
    context,
    options: ['Redis', 'In-memory'],
  })
  await $.tool.call({
    ...question,
    ask: 'Where should the cache keep its keys?',
    options: ['In-memory', 'On disk'],
    rec: 'On disk',
    why: 'keys outlive restarts',
  })
  await clock.settle()

  for (const look of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount(
      look === 'terminal' ? PANE : { ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 120 } },
    )
    const select = async (id: string) => {
      await clock.advance(PRESS_GUARD_MS)
      if (look === 'terminal') await selectRow(pane, id)
      else if (await pane.find({ key: `select-${id}` }))
        await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: `select-${id}` })
      await clock.settle()
    }
    const texts = async () => (await pane.findAll({ type: 'Text' })).map(t => t.text ?? '')

    await select('i1')
    const shown = await texts()
    const title = shown.findIndex(t => t.includes('Which cache should the price API use?'))
    const why = shown.indexOf('Recommended: the API runs as one process')
    expect([title < shown.indexOf(context), shown.indexOf(context) < why], look).toEqual([true, true])
    const contextColor = (await pane.find({ type: 'Text', text: context }))?.props.color
    const whyColor = (await pane.find({ type: 'Text', text: 'Recommended: the API runs as one process' }))?.props.color
    expect(contextColor, look).toBe(whyColor)

    await select('i2')
    expect(await texts(), look).not.toContain(context)
  }
})

test('in the terminal and desktop looks, a recommended answer with a description draws its reason after the description on its own line, the earlier answer draws between the context and the answers, and the answers hang on the row’s tree', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: 'demo' } as never)
  await clock.settle()

  for (const look of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount(
      look === 'terminal' ? PANE : { ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 120 } },
    )
    await clock.advance(PRESS_GUARD_MS)
    if (look === 'terminal') await selectRow(pane, 'd11')
    else if (await pane.find({ key: 'select-d11' }))
      await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'select-d11' })
    await clock.settle()
    const texts = (await pane.findAll({ type: 'Text' })).map(t => t.text ?? '')
    expect(
      texts.some(t => t.includes('Touch thumb and finger together to clear the glance. Recommended: a flick fires')),
      look,
    ).toBe(true)
    expect(
      texts.some(t => t.startsWith('Flick')),
      look,
    ).toBe(true)
    const earlierAt = texts.findIndex(t =>
      t.includes('3 days ago, in glasses-app, to “Which gesture should clear a glance?”'),
    )
    const contextAt = texts.findIndex(t => t.startsWith('A glance stays up until it times out'))
    const optionAt = texts.findIndex(t => t.includes('Touch thumb and finger together'))
    expect([contextAt < earlierAt, earlierAt < optionAt], look).toEqual([true, true])
    if (look === 'terminal') {
      for (const key of ['trunk-d11', 'tree-context', 'tree-option-0', 'tree-option-1', 'tree-holds-up'])
        expect(await pane.find({ key }), `${look} ${key}`).toBeTruthy()
    } else {
      expect(await pane.find({ key: 'row-d11-trunk' }), look).toBeTruthy()
      expect(await pane.find({ key: 'row-d11-option-0-tree' }), look).toBeTruthy()
      expect(await pane.find({ key: 'row-d11-holds-up-tree' }), look).toBeTruthy()
    }
  }
})

test('in the terminal, a collapsed row’s title takes two lines and ends in an ellipsis, and the open row shows it whole', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const ask = (text: string) =>
    $.tool.call({ tool: 'mcp__inbox__record', kind: 'question', ask: text, options: ['Yes', 'No'] })
  await ask('Short one?')
  await ask('Should the glance fade out when you look away from it for more than two seconds, or stay until dismissed?')
  const pane = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 40 } })
  await clock.settle()
  const titleLines = async () => [
    ...new Set((await pane.findAll({ type: 'Text', text: /glance|away|seconds|dismissed/ })).map(t => t.text)),
  ]

  expect(await titleLines()).toEqual(['Should the glance fade', 'out when you look away…'])
  await selectRow(pane, 'i2')
  expect((await titleLines()).join(' ')).toMatch(/until dismissed\?$/)
})
