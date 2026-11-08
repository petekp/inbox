import { expect, mock, test } from 'claude-code/testing'
import { SETTLED_MS } from '../hooks/timing'
import { NOT_SAVED } from '../hooks/tools'
import { storedLength, w, world } from './hooks-world'
import { BAND, PANE, replyKey } from './hooks-helpers'

const FINDING = {
  tool: 'mcp__inbox__record',
  kind: 'finding',
  finding_kind: 'issue',
  title: 'Retry loop never backs off',
  detail: 'The fetch retry spins with no delay.',
} as const

test('while the store is full, a finding Claude records shows to the person, its answer says it is not saved, and the next save that fits writes it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  w.storeLimit = storedLength()

  const full = await $.tool.call(FINDING)
  expect(full.result).toBe(`Recorded. The user sees it in the Finds tab of the /inbox pane. ${NOT_SAVED}`)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /Finds 1/ })).toBeDefined()

  w.storeLimit = undefined
  const roomy = await $.tool.call({ ...FINDING, title: 'README is stale', detail: 'It names the old command.' })
  expect(roomy.result).toBe('Recorded. The user sees it in the Finds tab of the /inbox pane.')
  expect(w.stored.get('s:session-1')).toContain('Retry loop never backs off')
})

test('while the store is full, a typed reply and an answer button still reach Claude', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('ui.focus', () => ({}))
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  w.storeLimit = storedLength()

  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'answer-i1-0' })
  await clock.advance(SETTLED_MS)
  expect(w.sent).toEqual(['Re "Use Node or Python?": Node'])

  await pane.press({ key: 'typekey-i2' })
  await pane.input({ key: await replyKey(pane, 'i2'), text: 'Call it hello' })
  expect(w.sent).toEqual(['Re "Use Node or Python?": Node', 'Re "Name the command greet?": Call it hello'])
  await clock.settle()
  expect((await pane.find({ key: 'row-i2' }))?.text).toMatch(/✓ Replied: Call it hello/)
})

test('a full store makes room by dropping the shared PR views no fetch reads any more, and the save lands', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const now = clock.now()
  const view = (ref: string, fetchedAt: number, title: string) => ({ ref, fetchedAt, title })
  const views = {
    'acme/app#1': view('acme/app#1', now - 10 * 60_000, 'x'.repeat(20_000)),
    'acme/app#2': view('acme/app#2', now, 'Add a greeting'),
  }
  w.stored.set('gh:shared', JSON.stringify({ views, limit: null }))
  w.storeLimit = storedLength()

  const r = await $.tool.call(FINDING)
  expect(r.result).toBe('Recorded. The user sees it in the Finds tab of the /inbox pane.')
  expect(Object.keys(JSON.parse(w.stored.get('gh:shared') ?? '{}').views)).toEqual(['acme/app#2'])
  expect(w.stored.get('s:session-1')).toContain('Retry loop never backs off')
})
