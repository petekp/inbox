import { expect, mock, test } from 'claude-code/testing'
import type { LinksProps } from '../hooks/links-client'
import type { TabsProps } from '../hooks/tabs-client'
import { demoView } from '../hooks/demo'
import { PRESS_GUARD_MS, SETTLED_MS } from '../hooks/timing'
import { inboxView, perTurnStatus } from '../hooks/view'
import { rowKeyPlan } from '../hooks/action-plan'
import { w, world } from './hooks-world'
import { PANE, selectRow, leaveAndReturn, replyKey } from './hooks-helpers'

test(
  'in the terminal and desktop looks, an open row’s follow-ups are never split between rows: the terminal gives them a row of their own when they do not fit after its buttons, and desktop draws Reply as a Button and its links box asks for the width of the rest',
  { timeoutMs: 20_000 },
  async ($, on) => {
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
      extraSteps: {},
      settleWindowMs: SETTLED_MS,
      status: perTurnStatus({ isUpdating: false, isFailed: false, retries: true }),
      now: 1_000_000,
      replies: {},
      discarded: {},
      shownSince: 1_000_000,
      lastTypedMessageAt: null,
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
        const rows = (await pane.findAll({ type: 'Box' }))
          .filter(b => b.props.flexWrap === 'wrap')
          .map(b => b.children.flatMap(shownLabels))
          .filter(shown => followUpLabels.some(l => holds(shown, l)))
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
          const { links, gap } = (await pane.find({ key: `links-${row.id}` }))?.props.props as LinksProps
          expect(
            [linksBox.props.width, linksBox.props.flexShrink, linksBox.props.minWidth],
            `desktop at ${columns} columns`,
          ).toEqual([Math.ceil(links.reduce((sum, l) => sum + l.width, gap * (links.length - 1))), 1, 0])
        }
        forms.add(buttonLabels.some(l => holds(rows[0]!, l)) ? 'shared' : 'own')
      }
      expect([...forms].sort(), look).toEqual(look === 'terminal' ? ['own', 'shared'] : ['shared'])
      await pane.unmount()
    }
  },
)

test('in a theme without tone colors, a replied question’s ✓ takes the done color whether its row is selected or not', async ($, on) => {
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
  const markIn = (el: Drawn | undefined): Drawn | undefined =>
    el?.type === 'Text' && el.children?.join('') === '✓'
      ? el
      : (el?.children ?? [])
          .filter((c): c is Drawn => typeof c === 'object')
          .reduce<Drawn | undefined>((found, c) => found ?? markIn(c), undefined)
  const doneMark = async () => markIn(await pane.find({ key: 'row-i1' }))?.props.color
  expect((await pane.find({ key: 'row-i1' }))?.text).toMatch(/✓ Replied/)
  expect(await doneMark()).toBe('success')

  await selectRow(pane, 'i2')
  expect((await pane.find({ key: 'row-i1' }))?.text).toMatch(/✓ Replied/)
  expect(await doneMark()).toBe('success')
})

test('on desktop, a cancelled question’s ✗ is drawn as a shape and a dismissed one’s ✕ as text, so the two read apart', async ($, on) => {
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
