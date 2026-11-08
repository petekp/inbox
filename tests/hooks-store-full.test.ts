import { expect, mock, test } from 'claude-code/testing'
import { SAVED_PR_VIEWS_MAX } from '../hooks/mod-saves'
import { SESSION_VERSION } from '../hooks/session-version'
import { SETTLED_MS } from '../hooks/timing'
import { NOT_SAVED } from '../hooks/tools'
import type { PrView, Session } from '../types'
import { storedLength, w, world } from './hooks-world'
import { BAND, PANE, replyKey, SAVED_SESSION } from './hooks-helpers'

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

const SAVED_PRS = { branchRef: null, isFetching: false }

function prView(n: number, state: string, readAgo: number, checksLength: number) {
  return {
    ref: `acme/greet#${n}`,
    number: n,
    title: `PR ${n}`,
    url: `https://github.com/acme/greet/pull/${n}`,
    isDraft: false,
    state,
    base: 'main',
    mergeable: 'MERGEABLE',
    reviewDecision: 'APPROVED',
    checks: [{ name: 'x'.repeat(checksLength), bucket: 'pass', url: null }],
    threads: [],
    isYours: true,
    error: null,
    fetchedAt: 1_000_000 - readAgo,
    wasSeenOpen: true,
  }
}

function savedWithPrs(views: ReturnType<typeof prView>[]) {
  return JSON.stringify({
    ...SAVED_SESSION,
    version: SESSION_VERSION,
    ledger: { ...SAVED_SESSION.ledger, prs: views.map(v => v.ref) },
    prViews: { ...SAVED_PRS, views: Object.fromEntries(views.map(v => [v.ref, v])) },
  })
}

test('a save keeps its PR views within the cap by emptying the checks and threads of merged and closed PRs first and then of the open PRs read longest ago, while the drawn session keeps them whole', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.isGhMissing = true
  let drawn: Session | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    drawn = e.value as never
    return next(e)
  })
  const share = Math.ceil(SAVED_PR_VIEWS_MAX / 4)
  w.stored.set(
    's:session-1',
    savedWithPrs([
      prView(1, 'MERGED', 1_000, share),
      prView(2, 'OPEN', 5_000, share),
      prView(3, 'OPEN', 100, share),
      prView(4, 'OPEN', 200, share),
      prView(5, 'CLOSED', 0, share),
      prView(6, 'OPEN', 300, share),
    ]),
  )
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()

  await $.tool.call(FINDING)
  const kept: Record<string, PrView> = JSON.parse(w.stored.get('s:session-1') ?? '{}').prViews.views
  const emptied = Object.keys(kept).filter(ref => kept[ref]!.checks.length === 0)
  expect(Object.keys(kept)).toHaveLength(6)
  expect(emptied.sort()).toEqual(['acme/greet#1', 'acme/greet#2', 'acme/greet#5'])
  expect(kept['acme/greet#2']).toMatchObject({ state: 'OPEN', wasSeenOpen: true, threads: [] })
  const drawnViews = Object.values((drawn as Session | null)?.prViews.views ?? {})
  expect(drawnViews.filter(view => view.checks.length === 1)).toHaveLength(6)
})

test('an open PR whose checks a save emptied, and which merged while its conversation was closed, shows as Merged when the conversation loads again', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.isGhMissing = true
  const half = Math.ceil(SAVED_PR_VIEWS_MAX * 0.6)
  w.stored.set('s:session-1', savedWithPrs([prView(1, 'OPEN', 5_000, half), prView(2, 'OPEN', 100, half)]))
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  await $.tool.call(FINDING)
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  await clock.settle()
  w.paneState = { isShown: true, isFocused: true }
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-prs' })

  w.isGhMissing = false
  const states: Record<string, string> = { '1': 'MERGED', '2': 'OPEN' }
  for (const number of Object.keys(states))
    w.ghAnswers.push(
      {
        match: argv => argv.includes('view') && argv.includes(number),
        stdout: JSON.stringify({
          number: Number(number),
          title: `PR ${number}`,
          url: `https://github.com/acme/greet/pull/${number}`,
          isDraft: false,
          state: states[number],
          baseRefName: 'main',
          mergeable: 'MERGEABLE',
          reviewDecision: 'APPROVED',
          statusCheckRollup: [],
        }),
      },
      {
        match: argv => argv.includes('graphql') && argv.includes(`number=${number}`),
        stdout: JSON.stringify({
          data: {
            viewer: { login: 'me' },
            repository: { pullRequest: { author: { login: 'me' }, reviewThreads: { nodes: [] } } },
          },
        }),
      },
    )
  await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
  await $.classic.SessionStart({ source: 'resume', session_id: 'session-1' })
  await clock.settle()

  expect(await pane.find({ text: /PR 1/ })).toBeDefined()
  expect(await pane.find({ text: /Merged/ })).toBeDefined()
})
