import { expect, test } from 'claude-code/testing'

import { CLAUDE_CODE } from '../hooks/model-text'
import { press } from '../hooks/host-press'
import { prBlockActions } from '../hooks/pr-tab'
import { prMarkId } from '../hooks/pr-rows'
import { withFetchedPrs } from '../hooks/session-presses'
import { applied, endTurn, notePrompt, turnEnded } from '../hooks/session-turns'
import { NO_HOLDS } from '../hooks/timing'
import { BLOCKED_PR, FIX_REF } from './session-helpers'
import { blockedPrHost, NO_UPDATE } from './session-pr-helpers'

test('Resolve conflicts reads Resolving conflicts… until the reply, then offers again only once a fetch has read the PR after it', async () => {
  const conflicting = await blockedPrHost((pr, at) => ({ ...pr, fetchedAt: at }), { ...BLOCKED_PR, fetchedAt: 1 })
  const block = async () => {
    const s = await conflicting.host.read()
    const pr = s.prViews.views[FIX_REF]!
    const presses = { lastActions: s.lastActions, turns: s.presence, now: await conflicting.host.now() }
    const conflicts = prBlockActions(pr, () => false, null, presses).find(a => a.press.action === 'pr-conflicts')

    return conflicts ? { label: conflicts.label, isOut: conflicts.isOut } : null
  }
  expect(await block()).toEqual({ label: 'Resolve conflicts', isOut: false })

  await press(conflicting.host, { action: 'pr-conflicts', ref: FIX_REF }, false, NO_HOLDS)
  expect(await conflicting.shownOn(prMarkId(FIX_REF))).toBe('Resolving conflicts…')
  expect(await block()).toEqual({ label: 'Resolve conflicts', isOut: true })

  await conflicting.host.update(async s => {
    const now = await conflicting.host.now()
    const sent = notePrompt(CLAUDE_CODE, s, conflicting.delivered[0]!, false).state

    return applied(turnEnded(endTurn(CLAUDE_CODE, sent, 'Pushed.', false), now), NO_UPDATE, now + 5, now + 5)
  })
  expect(await conflicting.shownOn(prMarkId(FIX_REF))).toBe('✓ Asked to resolve conflicts')
  expect(await block()).toEqual({ label: 'Resolve conflicts', isOut: true })

  await conflicting.host.update(async s => {
    const at = (await conflicting.host.now()) + 10_000
    return withFetchedPrs(s, { [FIX_REF]: { ...s.prViews.views[FIX_REF]!, fetchedAt: at } }, null, false, at)
  })
  expect(await block()).toEqual({ label: 'Resolve conflicts again', isOut: false })

  await conflicting.host.update(async s => {
    const at = (await conflicting.host.now()) + 20_000
    return withFetchedPrs(
      s,
      { [FIX_REF]: { ...s.prViews.views[FIX_REF]!, mergeable: 'MERGEABLE', fetchedAt: at } },
      null,
      false,
      at,
    )
  })
  expect(await block()).toBeNull()
})
