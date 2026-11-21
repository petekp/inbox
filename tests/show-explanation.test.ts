import { expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { test } from './test-with-timeout'
import { QUEUED_AFTER_MS, SETTLED_MS } from '../core/view/timing'
import { w, arrive, world } from './hooks-world'
import { PANE } from './hooks-helpers'
import type { LinksProps } from '../hooks/pane/links-client'

const FULLSCREEN = { columns: 160, rows: 40, isFullscreen: true }

async function planReady($: Engine, on: On, surface: 'terminal' | 'desktop' = 'terminal') {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('ui.focus', () => ({}))
  if (surface === 'desktop') {
    w.paneState = { isShown: true, isFocused: true }
    w.surfaces = ['desktop']
  }
  await $.session.start({
    cwd: '/tmp/project',
    surface: surface === 'desktop' ? null : surface,
    isInteractive: surface === 'terminal',
  })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()

  return clock
}

async function explain($: Engine, pane: { press(q: { key: string }): Promise<unknown> }, turnId: string) {
  w.inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await arrive($)
  await $.turn.start({ text: w.sent.at(-1) ?? '', turnId })
}

async function reply($: Engine, uuid: string, text: string, agentId?: string) {
  await $.session.append({
    message: { type: 'assistant', role: 'assistant', content: [{ type: 'text', text }] },
    door: 'response',
    uuid,
    ...(agentId ? { agentId } : {}),
  } as never)
}

async function endTurn($: Engine, turnId: string) {
  await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId, reason: 'answer' })
}

const savedExplanation = () =>
  (JSON.parse(w.stored.get('s:session-1')!) as { lastActions: Record<string, { explanation?: unknown }> }).lastActions
    .i1?.explanation

const hasShowExplanation = async (pane: { find(q: { key: string }): Promise<unknown> }) =>
  (await pane.find({ key: 'show-explanation-i1' })) !== undefined

test("after an answered Explain, the fullscreen terminal offers Show explanation for the reply's first text, and its press reports a refused scroll", async ($, on) => {
  const clock = await planReady($, on)
  const pane = await $.ui.mount({ ...PANE, viewport: FULLSCREEN })
  const classic = await $.ui.mount({ ...PANE, requestId: 'classic', viewport: { ...FULLSCREEN, isFullscreen: false } })

  await explain($, pane, 't2')
  await clock.settle()
  expect(await hasShowExplanation(pane)).toBe(false)

  await reply($, 'sub-1', 'A subagent speaks first.', 'agent-1')
  await reply($, 'empty-1', ' ')
  await reply($, 'reply-1', 'It ships today because the cache is warm.')
  await endTurn($, 't2')
  await clock.settle()
  await Promise.all([pane.redraw(), classic.redraw()])

  expect(await hasShowExplanation(pane)).toBe(true)
  expect(savedExplanation()).toEqual({ replyId: 'reply-1', isFirstReply: true })
  expect(await hasShowExplanation(classic)).toBe(false)

  await pane.press({ key: 'show-explanation-i1-key' })
  await clock.settle()
  expect(await pane.find({ text: /^Could not show the explanation: / })).toBeDefined()
})

test('the Claude app draws no Show explanation, though its pane reports isFullscreen', async ($, on) => {
  const clock = await planReady($, on, 'desktop')
  const pane = await $.ui.mount({
    ...PANE,
    surface: 'desktop',
    props: { ...PANE.props, bodyColumns: 69 },
    viewport: FULLSCREEN,
  })
  const linkKeys = async () => ((await pane.find({ key: 'links-i1' }))?.props.props as LinksProps).links.map(l => l.key)
  const links = (await pane.find({ key: 'links-i1' }))?.props.props as LinksProps
  const explainAt = links.links
    .slice(
      0,
      links.links.findIndex(l => l.key === 'explain-i1'),
    )
    .reduce((x, l) => x + l.width + links.gap, 0)
  w.inFlight.push(pane.pointer({ type: 'down', x: explainAt, y: 0, button: 'left', in: 'links-i1' }))
  await arrive($)
  await $.turn.start({ text: w.sent.at(-1) ?? '', turnId: 't2' })
  await reply($, 'reply-1', 'It ships today.')
  await endTurn($, 't2')
  await clock.settle()
  await pane.redraw()

  expect(savedExplanation()).toEqual({ replyId: 'reply-1', isFirstReply: true })
  expect(await linkKeys()).toContain('explain-i1')
  expect(await linkKeys()).not.toContain('show-explanation-i1')
})

test('a turn that ends before any reply text leaves no Show explanation, and a later turn does not attach to it', async ($, on) => {
  const clock = await planReady($, on)
  const pane = await $.ui.mount({ ...PANE, viewport: FULLSCREEN })

  await explain($, pane, 't2')
  await endTurn($, 't2')
  await clock.settle()
  await $.turn.start({ text: 'A background task finished.', turnId: 't3' })
  await reply($, 'notification-1', 'A background task finished.')
  await endTurn($, 't3')
  await clock.advance(SETTLED_MS)
  await pane.redraw()

  expect(await hasShowExplanation(pane)).toBe(false)
  expect(savedExplanation()).toBeUndefined()
})

test('Show explanation pressed while Explain again is out keeps Explain again out', async ($, on) => {
  const clock = await planReady($, on)
  const pane = await $.ui.mount({ ...PANE, viewport: FULLSCREEN })
  await explain($, pane, 't2')
  await reply($, 'reply-1', 'It ships today.')
  await endTurn($, 't2')
  await clock.advance(SETTLED_MS)

  await explain($, pane, 't3')
  await clock.settle()
  const sentBefore = w.sent.length
  await pane.press({ key: 'show-explanation-i1-key' })
  await clock.settle()
  await pane.press({ key: 'explain-i1-key' })
  await clock.settle()

  expect(w.sent.length).toBe(sentBefore)
  expect(await hasShowExplanation(pane)).toBe(true)
})

test('Show explanation pressed while Explain again is queued keeps Explain again out', async ($, on) => {
  const clock = await planReady($, on)
  const pane = await $.ui.mount({ ...PANE, viewport: FULLSCREEN })
  await explain($, pane, 't2')
  await reply($, 'reply-1', 'It ships today.')
  await endTurn($, 't2')
  await clock.advance(SETTLED_MS)

  w.submitAnswer = 'hold'
  w.inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.advance(QUEUED_AFTER_MS + 500)
  const sentBefore = w.sent.length
  await pane.press({ key: 'show-explanation-i1-key' })
  await clock.settle()
  await pane.press({ key: 'explain-i1-key' })
  await clock.settle()

  expect(w.sent.length).toBe(sentBefore)
})
