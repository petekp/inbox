import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { w, world } from './hooks-world'
import { PANE, selectRow } from './hooks-helpers'
import { SETTLED_MS } from '../hooks/timing'

async function showsQuestionLink($: Engine, on: On, surface: 'terminal' | 'desktop') {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }
  await $.session.start({ cwd: '/tmp/project', surface, isInteractive: true })
  await $.command.run({ command: 'inbox', args: '' } as never)
  const pane = await $.ui.mount({ ...PANE, surface })
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'question',
    ask: 'Should I merge [PR 7171](https://github.com/anthropics/claude-code/pull/7171)?',
    options: ['Yes', 'No'],
    detail: 'This blocks the release.\nRead [release notes](https://example.com/release).',
  } as never)
  await clock.settle()
  await selectRow(pane, 'i1')
  const links = await pane.findAll({ type: 'Link' })
  expect(links.map(link => link.props)).toContainEqual(
    expect.objectContaining({
      href: 'https://github.com/anthropics/claude-code/pull/7171',
      label: 'PR 7171',
    }),
  )
  expect(links.map(link => link.props)).toContainEqual(
    expect.objectContaining({
      href: 'https://example.com/release',
      label: 'release notes',
    }),
  )
}

test('the terminal pane draws a Markdown ask destination as a Link', async ($, on) => {
  await showsQuestionLink($, on, 'terminal')
})

test('the desktop pane draws a Markdown ask destination as a Link', async ($, on) => {
  await showsQuestionLink($, on, 'desktop')
})

async function answersLinkedOption($: Engine, on: On, surface: 'terminal' | 'desktop') {
  const clock = mock.clock(on, { now: 1_000_000 })
  const option = '[PR 7171](https://github.com/anthropics/claude-code/pull/7171)'
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }
  await $.session.start({ cwd: '/tmp/project', surface, isInteractive: true })
  await $.command.run({ command: 'inbox', args: '' } as never)
  const pane = await $.ui.mount({ ...PANE, surface })
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'question',
    ask: 'Merge this PR?',
    detail: 'Its [changes](https://github.com/anthropics/claude-code/pull/7171/files) are small.',
    options: [option, 'No'],
  } as never)
  await clock.settle()
  await selectRow(pane, 'i1')
  expect((await pane.find({ key: 'answer-i1-0' }))?.props.label).toContain('PR 7171')
  expect((await pane.find({ key: 'answer-i1-0' }))?.props.label).not.toContain('[PR 7171]')
  await pane.press({ key: 'answer-i1-0' })
  await clock.settle()
  expect(w.sent).toEqual([])
  expect((await pane.findAll({ type: 'Link' })).map(link => link.props)).toContainEqual(
    expect.objectContaining({ href: 'https://github.com/anthropics/claude-code/pull/7171', label: 'PR 7171' }),
  )

  await clock.advance(SETTLED_MS)
  if (surface === 'desktop') {
    const { tabs, gap } = (await pane.find({ key: 'tabs' }))?.props.props as {
      tabs: { id: string; width: number }[]
      gap: number
    }
    const findingsEnd = tabs[0]!.width + gap + tabs[1]!.width
    await pane.pointer({ type: 'down', x: findingsEnd - 1, y: 1.1, button: 'left', in: 'tabs' })
    await clock.settle()
    await pane.pointer({ type: 'down', x: 1, y: 1.1, button: 'left', in: 'tabs' })
  } else {
    await pane.press({ key: 'tab-findings' })
    await pane.press({ key: 'tab-needsYou' })
  }
  await clock.settle()
  if (surface === 'desktop') await pane.post({ isUnfolded: true }, { in: 'fold-question' })
  else await pane.press({ key: 'fold-question' })
  expect((await pane.findAll({ type: 'Link' })).map(link => link.props)).toContainEqual(
    expect.objectContaining({ href: 'https://github.com/anthropics/claude-code/pull/7171', label: 'PR 7171' }),
  )
}

test('answer feedback and the Closed line render a linked option in the terminal pane', async ($, on) => {
  await answersLinkedOption($, on, 'terminal')
})

test('answer feedback and the Closed line render a linked option in the desktop pane', async ($, on) => {
  await answersLinkedOption($, on, 'desktop')
})

async function showsFindingLinks($: Engine, on: On, surface: 'terminal' | 'desktop') {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface, isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Plan ready. 1. Node or Python? 2. Call it greet?',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'Read [PR 7171](https://github.com/anthropics/claude-code/pull/7171)',
    detail: 'See [release notes](https://example.com/release).',
  } as never)
  await clock.settle()
  w.paneState = { isShown: true, isFocused: true }
  const pane = await $.ui.mount({ ...PANE, surface })
  if (surface === 'desktop') {
    const { tabs, gap } = (await pane.find({ key: 'tabs' }))?.props.props as {
      tabs: { id: string; width: number }[]
      gap: number
    }
    const findingsEnd = tabs[0]!.width + gap + tabs[1]!.width
    await pane.pointer({ type: 'down', x: findingsEnd - 1, y: 1.1, button: 'left', in: 'tabs' })
  } else await pane.press({ key: 'tab-findings' })
  await selectRow(pane, 'f3')
  const links = await pane.findAll({ type: 'Link' })
  expect(links.map(link => link.props)).toContainEqual(
    expect.objectContaining({
      href: 'https://github.com/anthropics/claude-code/pull/7171',
      label: 'PR 7171',
    }),
  )
  expect(links.map(link => link.props)).toContainEqual(
    expect.objectContaining({ href: 'https://example.com/release', label: 'release notes' }),
  )
}

test('the terminal pane draws finding titles and details as Links', async ($, on) => {
  await showsFindingLinks($, on, 'terminal')
})

test('the desktop pane draws finding titles and details as Links', async ($, on) => {
  await showsFindingLinks($, on, 'desktop')
})
