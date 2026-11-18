import { expect, mock } from 'claude-code/testing'
import { test } from './test-with-timeout'
import { CONTROL_GAP_PT, INSIDE_GAP_PT } from '../hooks/layout'
import { DESKTOP_LINE_PT } from '../hooks/pane-sizes'
import { w, world } from './hooks-world'
import { PANE } from './hooks-helpers'

type Node = { type?: string; props: Record<string, unknown>; children: unknown[] }
type Case = { form: 'side by side' | 'stacked'; hasContext: boolean; hasNotes: boolean }

const CASES: Case[] = (['side by side', 'stacked'] as const).flatMap(form =>
  [false, true].flatMap(hasContext => [false, true].map(hasNotes => ({ form, hasContext, hasNotes }))),
)

const nameOf = (c: Case) =>
  [c.form, c.hasContext ? 'context' : null, c.hasNotes ? 'notes' : null].filter(Boolean).join(', ')

const buttonsIn = (n: unknown): number =>
  ((n as Node).type === 'Button' ? 1 : 0) +
  ((n as Node).children ?? []).reduce<number>((sum, k) => sum + buttonsIn(k), 0)

/** The space a Box draws on desktop, in points: it draws its written padding at half, over lines of `DESKTOP_LINE_PT`. */
const drawnPt = (written: unknown) => (Number(written ?? 0) * DESKTOP_LINE_PT) / 2

test('a question’s first body element sits under its title by the scale’s gap for what it is, on desktop', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }
  w.surfaces = ['desktop']
  await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 69 } })
  const gaps = []
  for (const [n, c] of CASES.entries()) {
    if (n > 0) await $.tool.call({ tool: 'mcp__inbox__close', id: `i${n}`, reason: 'next case' })
    const short = ['Keep', 'Bring back']
    await $.tool.call({
      tool: 'mcp__inbox__record',
      kind: 'question',
      ask: `Bring a dismissed glance back, case ${n}?`,
      ...(c.hasContext ? { context: 'Testers asked whether a cleared glance should come back' } : {}),
      options: c.form === 'stacked' ? short.map(o => `${o} the glance where it was, with every setting it had`) : short,
      ...(c.hasNotes && c.form === 'stacked' ? { option_notes: ['Leaves it cleared', 'Shows it again'] } : {}),
      rec: c.form === 'stacked' ? `Keep the glance where it was, with every setting it had` : 'Keep',
      ...(c.hasNotes ? { why: 'a cleared glance should stay cleared' } : {}),
    })
    await clock.settle()
    const titleKey = `row-i${n + 1}-title`
    const card = (await pane.findAll({ type: 'Box' })).find(b =>
      b.children.some(k => (k as Node).props?.key === titleKey),
    )!
    const frames = card.children as Node[]
    const at = frames.findIndex(k => k.props.key === titleKey)
    const [title, first] = [frames[at]!, frames[at + 1]!]
    const isButtons = buttonsIn(first) > 0
    const answers = frames.slice(at + 1).find(k => buttonsIn(k) > 0)!
    gaps.push({
      name: nameOf(c),
      answersOnFirstLine: buttonsIn(answers),
      first: isButtons ? 'answers' : 'text',
      gap: drawnPt(title.props.paddingBottom) + drawnPt(first.props.paddingTop),
    })
  }

  expect(gaps).toEqual(
    CASES.map(c => ({
      name: nameOf(c),
      answersOnFirstLine: c.form === 'side by side' ? 2 : 1,
      first: c.hasContext ? 'text' : 'answers',
      gap: c.hasContext ? INSIDE_GAP_PT : CONTROL_GAP_PT,
    })),
  )
})
