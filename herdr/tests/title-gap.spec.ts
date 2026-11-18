import './gpui-stand-in'
import { expect, test } from 'bun:test'
import { CONTROL_GAP_PT, INSIDE_GAP_PT } from '../../hooks/layout'
import type { RowView } from '../../hooks/rows'
import type { Painted } from './gpui-stand-in'
import { demoScreen, uiOn } from './fixtures'

const { restingLayout } = await import('./frames')
const { tabBlocks } = await import('../src/draw')

type Form = 'side by side' | 'stacked'
type Case = { form: Form; hasContext: boolean; hasHoldsUp: boolean; hasNotes: boolean }

const CASES: Case[] = (['side by side', 'stacked'] as const).flatMap(form =>
  [false, true].flatMap(hasContext =>
    [false, true].flatMap(hasHoldsUp => [false, true].map(hasNotes => ({ form, hasContext, hasHoldsUp, hasNotes }))),
  ),
)

const nameOf = (c: Case) =>
  [c.form, c.hasContext ? 'context' : null, c.hasHoldsUp ? 'Holds up' : null, c.hasNotes ? 'notes' : null]
    .filter(Boolean)
    .join(', ')

function questionOf(c: Case, base: RowView): RowView {
  const [first, second] = base.optionDescriptions.map(d => d.option)
  const describe = (option: string | undefined, description: string) => ({
    option: option ?? '',
    description: c.form === 'stacked' ? description : null,
    reason: option === first ? 'a dismissed glance should stay gone' : null,
    isFolded: false,
  })

  return {
    ...base,
    contextLine: c.hasContext ? 'Testers asked whether a glance they cleared should come back.' : null,
    holdsUpLine: c.hasHoldsUp ? 'Holds up Pinch to dismiss' : null,
    earlierLine: null,
    optionDescriptions: c.hasNotes
      ? [describe(first, 'Keep it cleared.'), describe(second, 'Show it again when you look.')]
      : base.optionDescriptions.map(d => ({ ...d, description: null, reason: null })),
  }
}

/** The first thing a row's panel draws: a button's top edge, or a line of text's top past its own padding. */
function firstDrawn(n: Painted): Painted | null {
  const flow = n.kids.filter(k => !k.style.isAbsolute)
  if (n.id?.startsWith('button ') || (n.text !== null && flow.length === 0)) return n
  for (const k of flow) {
    const found = firstDrawn(k)
    if (found) return found
  }

  return null
}

test('a question’s first body element sits under its title by the scale’s gap for what it is, in every form', () => {
  const screen = demoScreen()
  const base = screen.view.needsYou.questions.find(r => r.id === 'd12')!
  const gaps = CASES.map(c => {
    const question = questionOf(c, base)
    const view = { ...screen.view, needsYou: { ...screen.view.needsYou, questions: [question] } }
    const blocks = tabBlocks({ ...screen, view }, uiOn('needsYou', { selected: question.id }))
    const wide = Object.fromEntries(question.optionDescriptions.map((_, n) => [`answer ${question.id} ${n}`, 1000]))
    const { placed } = restingLayout(blocks, c.form === 'stacked' ? wide : {})
    const nodes = [...placed.keys()]
    const title = placed.get(nodes.find(n => n.id === `title ${question.id}`)!)!
    const first = firstDrawn(nodes.find(n => n.id === `panel ${question.id}`)!)!
    const isButton = first.id?.startsWith('button ') === true
    const top = placed.get(first)!.top + (isButton ? 0 : (first.style.pt ?? 0))

    return { name: nameOf(c), first: isButton ? 'answers' : 'text', gap: top - (title.top + title.height) }
  })

  expect(gaps).toEqual(
    CASES.map(c => {
      const startsWithAnswers = !c.hasContext && !c.hasHoldsUp

      return {
        name: nameOf(c),
        first: startsWithAnswers ? 'answers' : 'text',
        gap: startsWithAnswers ? CONTROL_GAP_PT : INSIDE_GAP_PT,
      }
    }),
  )
})
