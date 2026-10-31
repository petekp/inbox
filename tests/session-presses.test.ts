import { expect, test } from 'claude-code/testing'

import { CLAUDE_CODE } from '../hooks/model-text'
import { endTurn, notePrompt } from '../hooks/session-turns'
import { pressOn, recorded, withFetchedPrs } from '../hooks/session-presses'
import { sessionView } from '../hooks/session-view'
import type { PrView, RowNote } from '../types'
import { runUpdates } from '../hooks/session-host'
import { press, wakeForDone } from '../hooks/host-press'
import { allRows, COMPARE_LIMIT_MS, feedbackOf, feedbackText, NO_HOLDS } from '../hooks/view'
import { checkRowId, prMarkId } from '../hooks/pr-rows'
import { fakeHost } from './session-fake-host'
import { FIX_REF, BLOCKED_PR } from './session-helpers'

test('a refused Done message leaves its row reading Not sent, with Undo', async () => {
  let clock = 1_000_000
  const scripted = fakeHost(async () => null).host
  const host = {
    ...scripted,
    now: () => clock,
    deliver: async () => ({ state: 'rejected' as const, reason: 'queue refused' }),
  }
  await host.update(s => recorded(CLAUDE_CODE, s, 'record', { kind: 'task', ask: 'Sign in to npm' }, clock).state)
  const id = (await host.read()).ledger.items[0]!.id
  await press(host, { action: 'done', id }, false, NO_HOLDS)
  clock += host.settleWindowMs
  await wakeForDone(host)
  const view = sessionView(await host.read(), clock, host.settleWindowMs, true)

  expect(view.needsYou.closed.tasks.map(c => c.delivery)).toEqual([{ error: 'queue refused', canUndo: true }])
})

test('Compare reads Comparing… after its reply until the agent records the question again with its page, or until its limit passes', async () => {
  const { host, delivered } = fakeHost(async () => 'NONE')
  const record = async (args: Record<string, unknown>) => {
    let result = ''
    await host.update(async s => {
      const r = recorded(CLAUDE_CODE, s, 'record', args, await host.now())
      result = r.result
      return r.state
    })
    return result
  }
  const turn = async (prompt: string, reply: string) => {
    await host.update(s => notePrompt(CLAUDE_CODE, s, prompt, false).state)
    await host.update(s => endTurn(CLAUDE_CODE, s, reply, false))
    await runUpdates(host)
  }
  const question = {
    kind: 'question',
    ask: 'Which cache should the API use?',
    options: ['Redis', 'In-memory'],
    design_choice: true,
  }
  await host.update(s => notePrompt(CLAUDE_CODE, s, 'Add caching to the API', false).state)
  await record(question)
  await host.update(s => endTurn(CLAUDE_CODE, s, 'Which cache should the API use?', false))
  await runUpdates(host)
  const id = (await host.read()).ledger.items[0]!.id
  const row = async (later = 0) => {
    const view = sessionView(await host.read(), (await host.now()) + later, host.settleWindowMs, true)
    const r = allRows(view).find(x => x.id === id)!

    return { feedback: r.feedback && feedbackText(r.feedback, 'terminal'), actions: r.actions.map(a => a.label) }
  }

  await press(host, { action: 'compare', id }, false, NO_HOLDS)
  await turn(delivered.at(-1)!, 'A subagent is comparing the two caches.')
  expect(await row()).toEqual({
    feedback: 'Comparing…',
    actions: ['Redis', 'In-memory', 'Reply', 'Explain', 'Compare', 'Dismiss'],
  })
  expect(await row(COMPARE_LIMIT_MS)).toEqual({
    feedback: 'No comparison came back',
    actions: ['Redis', 'In-memory', 'Reply', 'Explain', 'Compare again', 'Dismiss'],
  })

  const reported = await record({ ...question, steps: ['/tmp/project/.scratch/compare/caches.html', 'npm test'] })
  expect(reported).toBe(
    'Already open, so this record updated it and added its new steps. Some steps were not an absolute file path or a link, so they are left out.',
  )
  expect(await row()).toEqual({
    feedback: '✓ Compared',
    actions: ['Redis', 'In-memory', 'Open caches.html', 'Reply', 'Explain', 'Compare again', 'Dismiss'],
  })

  await press(host, { action: 'compare', id }, false, NO_HOLDS)
  await turn(delivered.at(-1)!, 'A subagent is comparing the two caches again.')
  expect(await row()).toEqual({
    feedback: 'Comparing…',
    actions: ['Redis', 'In-memory', 'Open caches.html', 'Reply', 'Explain', 'Compare again', 'Dismiss'],
  })
})

test('while a press is out, its button stays out and a second press sends nothing, even when a newer note shows on the row', async () => {
  const { host } = fakeHost(async () => null)
  const question = { kind: 'question', ask: 'Ship it?', options: ['Yes', 'No'] }
  await host.update(s => recorded(CLAUDE_CODE, s, 'record', question, 1).state)
  const id = (await host.read()).ledger.items[0]!.id
  await press(host, { action: 'explain', id }, false, NO_HOLDS)
  const s = await host.read()
  const at = await host.now()
  const explainOf = (notes: Record<string, RowNote>) => {
    const row = allRows(sessionView(s, at, host.settleWindowMs, true, NO_HOLDS, notes)).find(r => r.id === id)!
    const explain = row.actions.find(a => a.press.action === 'explain')!

    return { feedback: row.feedback?.is, label: explain.label, isOut: explain.isOut }
  }
  const again = pressOn(
    s,
    { action: 'explain', id },
    at,
    { settleWindowMs: host.settleWindowMs, holds: NO_HOLDS },
    host,
  )

  expect('stale' in again ? null : again.effects).toEqual([])
  expect(explainOf({})).toEqual({ feedback: 'working', label: 'Explain', isOut: true })
  expect(explainOf({ [id]: { note: 'stale', at } })).toEqual({ feedback: 'note', label: 'Explain', isOut: true })
})

async function blockedPrHost(refreshed: (pr: PrView, at: number) => PrView) {
  const { host, delivered } = fakeHost(async () => null)
  await host.update(s => ({
    ...s,
    ledger: { ...s.ledger, prs: [FIX_REF] },
    prViews: { ...s.prViews, views: { [FIX_REF]: BLOCKED_PR } },
  }))
  const shownWhileRefreshing: string[] = []
  const shownOn = async (rowId: string) => {
    const s = await host.read()
    const f = feedbackOf(rowId, s.lastActions[rowId], undefined, s.presence, await host.now())
    return f ? feedbackText(f, 'terminal') : null
  }
  host.refreshPrs = async () => {
    for (const id of [prMarkId(FIX_REF), checkRowId(FIX_REF, 'test')]) {
      const text = await shownOn(id)
      if (text) shownWhileRefreshing.push(text)
    }
    const at = await host.now()
    await host.update(s => withFetchedPrs(s, { [FIX_REF]: refreshed(s.prViews.views[FIX_REF]!, at) }, null, false))
  }

  return { host, delivered, shownWhileRefreshing, shownOn }
}

test('Resolve conflicts and Fix check the PR on GitHub first, reading Refreshing at once, and send nothing once the problem is gone', async () => {
  const resolved = await blockedPrHost((pr, at) => ({ ...pr, mergeable: 'MERGEABLE', fetchedAt: at }))
  const conflicts = await press(resolved.host, { action: 'pr-conflicts', ref: FIX_REF }, false, NO_HOLDS)
  expect(resolved.shownWhileRefreshing).toEqual(['Refreshing PR #12…'])
  expect(conflicts.note).toBe('stale')
  expect(resolved.delivered).toEqual([])

  const passed = await blockedPrHost((pr, at) => ({
    ...pr,
    checks: [{ name: 'test', bucket: 'pass', url: null }],
    fetchedAt: at,
  }))
  const fix = await press(passed.host, { action: 'check-fix', ref: FIX_REF, check: 'test' }, false, NO_HOLDS)
  expect(passed.shownWhileRefreshing).toEqual(['Refreshing PR #12…'])
  expect(fix.note).toBe('stale')
  expect(passed.delivered).toEqual([])
})

test('Resolve conflicts and Fix send their message when the PR on GitHub still has the problem, after an earlier press of the same fix', async () => {
  const still = await blockedPrHost((pr, at) => ({ ...pr, fetchedAt: at }))
  for (const round of [1, 2]) {
    const conflicts = await press(still.host, { action: 'pr-conflicts', ref: FIX_REF }, false, NO_HOLDS)
    const fix = await press(still.host, { action: 'check-fix', ref: FIX_REF, check: 'test' }, false, NO_HOLDS)
    expect([conflicts.note, fix.note]).toEqual([null, null])
    expect(still.delivered.length).toBe(2 * round)
    for (const text of still.delivered.slice(-2))
      await still.host.update(s => endTurn(CLAUDE_CODE, notePrompt(CLAUDE_CODE, s, text, false).state, 'Done.', false))
  }
  expect(still.delivered[2]).toContain('PR #12 (https://github.com/acme/app/pull/12) conflicts with main.')
  expect(still.delivered[3]).toContain('The test check failed on PR #12')
  expect(await still.shownOn(prMarkId(FIX_REF))).toBe('✓ Asked to resolve conflicts')
})

test('a fix press whose check of the PR fails sends nothing and says why on its row', async () => {
  const unread = await blockedPrHost(pr => ({ ...pr, error: 'HTTP 502' }))
  const conflicts = await press(unread.host, { action: 'pr-conflicts', ref: FIX_REF }, false, NO_HOLDS)
  expect(conflicts.note).toBe(null)
  expect(unread.delivered).toEqual([])
  expect(await unread.shownOn(prMarkId(FIX_REF))).toBe('Could not refresh PR #12: HTTP 502')
})
