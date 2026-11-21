import { expect, test } from 'bun:test'

import { closeItem } from '../../core/domain/ledger-close'
import { sessionView } from '../../core/view/session-view'
import { FOLD_QUIET_MS, SETTLED_MS } from '../../core/view/timing'
import { freshUi } from '../../core/view/ui-controller-types'
import type { SettledOutcome } from '../../core/view/ui-controller-types'
import type { ShownTab } from '../../core/view/tabs'
import { demoState } from '../src/demo'
import { OMP_LOOK } from '../src/panel'
import { demoOf, flush, open, sharingUi } from './controller-harness'

const NOT_SENT: SettledOutcome = { error: 'Not sent: omp is busy', note: null, isUnconfirmed: false }

async function openedOn(tab: ShownTab, isAsksEmpty = false): Promise<ShownTab | undefined> {
  const demo = demoOf(() => 1_700_000_000_000)
  const shown: ShownTab[] = []
  const { panel } = open({
    savedUi: async () => freshUi(OMP_LOOK, tab),
    shown: t => void shown.push(t),
    screen: async (holds, notes) => {
      const screen = await demo.screen(holds, notes)
      if (!isAsksEmpty) return screen
      const needsYou = { ...screen.view.needsYou, questions: [], tasks: [], count: 0 }
      return { ...screen, view: { ...screen.view, needsYou } }
    },
  })
  await panel.start()

  return shown.at(-1)
}

test('a panel reopened on another row tab moves to Asks while a row waits there, and otherwise keeps its tab', async () => {
  expect(await openedOn('findings')).toBe('needsYou')
  expect(await openedOn('findings', true)).toBe('findings')
})

test('a panel reopened on the Status page keeps it', async () => {
  expect(await openedOn('overview')).toBe('overview')
  expect(await openedOn('overview', true)).toBe('overview')
})

async function agentClosing() {
  let notify = () => {}
  const harness = open({
    onChange: listener => {
      notify = listener
      return () => {}
    },
  })
  const state = demoState(harness.now())
  harness.source.screen = async (holds, notes) => ({
    ...(await demoOf(harness.now).screen(holds, notes)),
    view: sessionView(state, harness.now(), SETTLED_MS, holds, notes),
  })
  await harness.panel.start()
  const close = async (id: string) => {
    state.ledger = closeItem(state.ledger, id, { how: 'claude', outcome: 'closed by omp: done' }, harness.now())
    notify()
    await flush()
  }
  const selected = () => harness.panel.render(200).find(l => l.includes('❯')) ?? ''

  return { ...harness, close, selected }
}

test('a close by the agent waits while keys came within FOLD_QUIET_MS, then moves the cursor to the next waiting row on its own', async () => {
  const { panel, close, selected, runFor } = await agentClosing()
  panel.handleInput('down')
  expect(selected()).toContain('Bring a dismissed glance back')
  await close('d12')
  expect(selected()).toContain('Bring a dismissed glance back')
  await runFor(FOLD_QUIET_MS)
  expect(selected()).toContain('Show glances while you are walking')
})

test('a close by the agent after keys went quiet moves the cursor at once', async () => {
  const { panel, close, selected, advance } = await agentClosing()
  panel.handleInput('down')
  advance(FOLD_QUIET_MS)
  await close('d12')
  expect(selected()).toContain('Show glances while you are walking')
})

async function heldPress(overrides: Parameters<typeof open>[0] = {}) {
  const answers: ((outcome: SettledOutcome) => void)[] = []
  const harness = open({ press: () => new Promise(resolve => answers.push(resolve)), ...overrides })
  await harness.panel.start()
  for (const [key, text] of [['t'], ['o', 'o'], ['h', 'h'], ['enter']] as [string, string?][]) {
    harness.panel.handleInput(key, text)
    await flush()
  }
  const answer = async (outcome: SettledOutcome) => {
    answers.shift()!(outcome)
    await flush()
    await flush()
  }
  const field = () => {
    const lines = harness.panel.render(80)
    const at = lines.findIndex(l => l.includes('Your answer:'))
    return at < 0 ? null : lines[at + 1]!.replace(/^ │ /, '').trim()
  }

  return { ...harness, answer, field }
}

test('a refused reply reopens its field with the words when the person has not moved', async () => {
  const { answer, field } = await heldPress()
  expect(field()).toBeNull()
  await answer(NOT_SENT)
  expect(field()).toBe('oh')
})

test('a refused reply leaves its field shut when the person moved meanwhile, and Reply then opens with the words', async () => {
  const { panel, answer, field, advance } = await heldPress()
  advance(1)
  panel.handleInput('down')
  await answer(NOT_SENT)
  expect(field()).toBeNull()
  panel.handleInput('up')
  panel.handleInput('t')
  expect(field()).toBe('oh')
})

test('a reply’s draft stays while its press is out, and leaves once the session saves the reply as sent', async () => {
  const { kept, overrides } = sharingUi()
  let release = async () => {}
  let clock = () => 0
  const demo = demoOf(() => clock())
  const harness = open({
    ...overrides,
    screen: demo.screen,
    press: (p, holds, pressId) =>
      new Promise(resolve => {
        release = async () => resolve(await demo.press(p, holds, pressId))
      }),
  })
  clock = harness.now
  await harness.panel.start()
  for (const [key, text] of [['t'], ['o', 'o'], ['h', 'h'], ['enter']] as [string, string?][]) {
    harness.panel.handleInput(key, text)
    await flush()
  }
  expect(Object.values(kept.drafts).map(d => d.text)).toEqual(['oh'])
  await release()
  await flush()
  await flush()
  expect(Object.values(kept.drafts).map(d => d.text)).toEqual([])
})

test('a row the person dismisses keeps its Undo in place, and the cursor moves to the next waiting row at once, though the panel reads the change only after the press answers', async () => {
  const { panel } = open({ onChange: () => () => {} })
  await panel.start()
  panel.handleInput('x')
  await flush()
  await flush()
  const lines = panel.render(200)
  expect(lines.find(l => l.includes('Dismiss a glance with a pinch'))).toContain('Undo')
  expect(lines.find(l => l.includes('❯'))).toContain('Bring a dismissed glance back')
})

test('a panel closed while Help shows opens again on its tab, not on Help', async () => {
  const { overrides } = sharingUi()
  const first = open(overrides)
  await first.panel.start()
  first.panel.handleInput('?')
  expect(first.panel.render(80).join('\n')).toContain('help')
  first.panel.dispose()
  const second = open(overrides)
  await second.panel.start()
  expect(second.panel.render(80).join('\n')).toContain('Questions')
})

test('a read that fails at a wake is tried again, so the panel still redraws when a later row’s error goes', async () => {
  let isFailing = false
  let clock = () => 0
  const demo = demoOf(() => clock())
  const harness = open({
    screen: async (holds, notes) => {
      if (isFailing) throw new Error('unreadable')
      return demo.screen(holds, notes)
    },
    press: async () => NOT_SENT,
  })
  clock = harness.now
  const { panel, runFor, calls } = harness
  await panel.start()
  panel.handleInput('b')
  await flush()
  await flush()
  await runFor(2000)
  panel.handleInput('down')
  panel.handleInput('b')
  await flush()
  await flush()
  isFailing = true
  await runFor(SETTLED_MS - 1000)
  isFailing = false
  const rendersBefore = calls.renders
  await runFor(2 * SETTLED_MS)
  expect(calls.renders).toBeGreaterThan(rendersBefore)
})
