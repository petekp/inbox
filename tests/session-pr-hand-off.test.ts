import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { CLAUDE_CODE } from '../hooks/model-text'
import { press } from '../hooks/host-press'
import { checkKey } from '../hooks/prs'
import type { PrPress } from '../hooks/pr-press'
import { checkActions, prBlockActions, threadActions } from '../hooks/pr-tab'
import { prMarkId } from '../hooks/pr-rows'
import { withFetchedPrs } from '../hooks/session-presses'
import { notePrompt, turnEnded } from '../hooks/session-turns'
import { NO_HOLDS, PR_READ_WAIT_MS, timedChangeAt } from '../hooks/timing'
import type { PrThread, PrView, Session } from '../types'
import { BLOCKED_PR, FIX_REF } from './session-helpers'
import { blockedPrHost, repliedTo } from './session-pr-helpers'

const waiting = (id: string): PrThread => ({
  id,
  author: 'sam',
  reply: null,
  isWaiting: true,
  isOutdated: false,
  isLinesChanged: false,
  path: 'a.ts',
  line: 1,
  body: 'Please rename this.',
  url: 'https://github.com/acme/app/pull/12#r1',
  at: 1,
})

const READY: PrView = {
  ...BLOCKED_PR,
  mergeable: 'MERGEABLE',
  reviewDecision: 'APPROVED',
  checks: [{ name: 'test', bucket: 'pass', url: null }],
}

type Kind = {
  name: string
  press: PrPress
  start: PrView
  problemGone: Partial<PrView>
  working: string
  button: string
  plan: (s: Session, now: number) => { label: string; isOut: boolean } | null
}

const presses = (s: Session, now: number) => ({ lastActions: s.lastActions, turns: s.presence, now })
const blockAction = (action: string) => (s: Session, now: number) => {
  const pr = s.prViews.views[FIX_REF]!
  const found = prBlockActions(pr, () => false, null, presses(s, now)).find(a => a.press.action === action)

  return found ? { label: found.label, isOut: found.isOut } : null
}

const KINDS: Kind[] = [
  {
    name: 'Resolve conflicts',
    press: { action: 'pr-conflicts', ref: FIX_REF },
    start: BLOCKED_PR,
    problemGone: { mergeable: 'MERGEABLE' },
    working: 'Resolving conflicts…',
    button: 'Resolve conflicts',
    plan: blockAction('pr-conflicts'),
  },
  {
    name: 'Merge',
    press: { action: 'pr-merge', ref: FIX_REF },
    start: READY,
    problemGone: { state: 'MERGED' },
    working: 'Merging…',
    button: 'Merge',
    plan: blockAction('pr-merge'),
  },
  {
    name: 'Address all',
    press: { action: 'pr-address-all', ref: FIX_REF },
    start: { ...READY, threads: [waiting('t1'), waiting('t2')] },
    problemGone: { threads: [] },
    working: 'Addressing…',
    button: 'Address all 2 threads',
    plan: blockAction('pr-address-all'),
  },
  {
    name: 'Address',
    press: { action: 'thread-address', ref: FIX_REF, thread: 't1' },
    start: { ...READY, threads: [waiting('t1')] },
    problemGone: { threads: [] },
    working: 'Addressing…',
    button: 'Address',
    plan: (s, now) => {
      const pr = s.prViews.views[FIX_REF]!
      const thread = pr.threads.find(t => t.id === 't1')
      const found = thread && threadActions(pr, thread, presses(s, now)).find(a => a.press.action === 'thread-address')

      return found ? { label: found.label, isOut: found.isOut } : null
    },
  },
  {
    name: 'Fix',
    press: { action: 'check-fix', ref: FIX_REF, check: checkKey({ name: 'test' }) },
    start: { ...READY, checks: [{ name: 'test', bucket: 'fail', url: null }] },
    problemGone: { checks: [] },
    working: 'Fixing…',
    button: 'Fix',
    plan: (s, now) => {
      const pr = s.prViews.views[FIX_REF]!
      const check = pr.checks[0]
      const found = check && checkActions(pr, check, presses(s, now)).find(a => a.press.action === 'check-fix')

      return found ? { label: found.label, isOut: found.isOut } : null
    },
  },
]

const fetchedAfter = (change: Partial<PrView>, after: number) => async (s: Session) =>
  withFetchedPrs(s, { [FIX_REF]: { ...s.prViews.views[FIX_REF]!, ...change, fetchedAt: after } }, null, false, after)

for (const kind of KINDS) {
  test(`${kind.name} reads ${kind.working} until the reply, then offers again only once a fetch has read the PR after it`, async () => {
    const t = await blockedPrHost((pr, at) => ({ ...pr, fetchedAt: at }), { ...kind.start, fetchedAt: 1 })
    const plan = async () => kind.plan(await t.host.read(), await t.host.now())
    expect(await plan()).toEqual({ label: kind.button, isOut: false })

    await press(t.host, kind.press, false, NO_HOLDS)
    expect(await plan()).toEqual({ label: kind.button, isOut: true })
    const sent = t.delivered.length

    await t.host.update(async s => repliedTo(s, t.delivered[0]!, await t.host.now()))
    expect(await plan()).toEqual({ label: kind.button, isOut: true })
    await press(t.host, kind.press, false, NO_HOLDS)
    expect(t.delivered.length).toBe(sent)

    await t.host.update(fetchedAfter({}, (await t.host.now()) + 100))
    expect(await plan()).toEqual({ label: `${kind.button} again`, isOut: false })

    await t.host.update(fetchedAfter(kind.problemGone, (await t.host.now()) + 200))
    expect(await plan()).toBeNull()
  })
}

test('a hand-off whose turn ended with no answer stops reading as working, and its button waits for a fetch', async () => {
  const t = await blockedPrHost((pr, at) => ({ ...pr, fetchedAt: at }), { ...BLOCKED_PR, fetchedAt: 1 })
  await press(t.host, { action: 'pr-conflicts', ref: FIX_REF }, false, NO_HOLDS)
  expect(await t.shownOn(prMarkId(FIX_REF))).toBe('Resolving conflicts…')

  await t.host.update(async s =>
    turnEnded(notePrompt(CLAUDE_CODE, s, t.delivered[0]!, false).state, await t.host.now()),
  )
  expect(await t.shownOn(prMarkId(FIX_REF))).not.toBe('Resolving conflicts…')

  await t.host.update(fetchedAfter({}, (await t.host.now()) + 100))
  const s = await t.host.read()
  const conflicts = prBlockActions(s.prViews.views[FIX_REF]!, () => false, null, presses(s, await t.host.now()))
  expect(conflicts.find(a => a.press.action === 'pr-conflicts')?.label).toBe('Resolve conflicts again')
})

test('a hand-off button waits for a fetch only until PR_READ_WAIT_MS after the reply, for a host that fetches none', async () => {
  const t = await blockedPrHost((pr, at) => ({ ...pr, fetchedAt: at }), { ...BLOCKED_PR, fetchedAt: 1 })
  await press(t.host, { action: 'pr-conflicts', ref: FIX_REF }, false, NO_HOLDS)
  await t.host.update(async s => repliedTo(s, t.delivered[0]!, await t.host.now()))

  const s = await t.host.read()
  const at = s.lastActions[prMarkId(FIX_REF)]!.repliedAt!
  const conflicts = (now: number) =>
    prBlockActions(s.prViews.views[FIX_REF]!, () => false, null, presses(s, now)).find(
      a => a.press.action === 'pr-conflicts',
    )
  expect(conflicts(at + PR_READ_WAIT_MS - 1)?.isOut).toBe(true)
  expect(conflicts(at + PR_READ_WAIT_MS)).toMatchObject({ isOut: false, label: 'Resolve conflicts again' })
})

for (const kind of KINDS.filter(k => ['Merge', 'Address all', 'Address'].includes(k.name))) {
  test(`${kind.name} pressed after the wait reads the PR first, and sends nothing once the problem is gone`, async () => {
    const t = await blockedPrHost((pr, at) => ({ ...pr, ...kind.problemGone, fetchedAt: at }), {
      ...kind.start,
      fetchedAt: 1,
    })
    await press(t.host, kind.press, false, NO_HOLDS)
    await t.host.update(async s => repliedTo(s, t.delivered[0]!, await t.host.now()))
    const clock = t.host.now
    t.host.now = async () => (await clock()) + PR_READ_WAIT_MS

    await press(t.host, kind.press, false, NO_HOLDS)
    expect(t.delivered.length).toBe(1)
  })
}

test('a turn that ends with no time stamps a hand-off at the host clock, never before its press', async () => {
  const t = await blockedPrHost((pr, at) => ({ ...pr, fetchedAt: at }), { ...BLOCKED_PR, fetchedAt: 1 })
  await press(t.host, { action: 'pr-conflicts', ref: FIX_REF }, false, NO_HOLDS)
  const clock = (await t.host.now()) + 5_000
  await t.host.update(async s => turnEnded(notePrompt(CLAUDE_CODE, s, t.delivered[0]!, false).state, null, clock))

  const last = (await t.host.read()).lastActions[prMarkId(FIX_REF)]!
  expect(last.repliedAt).toBe(clock)
})

test('a hand-off button ending its wait for a fetch is a time a look redraws at', async () => {
  const t = await blockedPrHost((pr, at) => ({ ...pr, fetchedAt: at }), { ...BLOCKED_PR, fetchedAt: 1 })
  await press(t.host, { action: 'pr-conflicts', ref: FIX_REF }, false, NO_HOLDS)
  expect(timedChangeAt((await t.host.read()).lastActions, await t.host.now())).toBeNull()

  await t.host.update(async s => repliedTo(s, t.delivered[0]!, await t.host.now()))
  const { lastActions } = await t.host.read()
  const at = lastActions[prMarkId(FIX_REF)]!.repliedAt! + PR_READ_WAIT_MS
  expect(timedChangeAt(lastActions, at - 1)).toBe(at)
  expect(timedChangeAt(lastActions, at)).toBeNull()
})
