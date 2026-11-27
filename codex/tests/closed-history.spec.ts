import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demoSession } from '../../core/view/demo'
import { sessionView } from '../../core/view/session-view'
import { closedLinePlan } from '../../core/view/closed-line'
import { pressOn } from '../../core/runtime/session-presses'
import { NO_HOLDS, SETTLED_MS } from '../../core/view/timing'

test('closed history offers no restoration when an older item has no saved source', () => {
  const now = 1_000_000
  const s = demoSession(now, 'Claude')
  s.ledger.closed = s.ledger.closed.map(({ item: _item, ...row }) => row)
  const row = sessionView(s, now, SETTLED_MS).needsYou.closed.questions.find(row => row.how === 'dismissed')!
  assert.equal(closedLinePlan(row).action, null)
})

test('the shared demo Reopen action restores its dismissed question', () => {
  const now = 1_000_000
  const s = demoSession(now, 'Claude')
  const row = sessionView(s, now, SETTLED_MS).needsYou.closed.questions.find(row => row.how === 'dismissed')!
  const action = closedLinePlan(row).action!
  assert.equal(action.label, 'Reopen')
  const result = pressOn(
    s,
    action.press,
    now,
    { settleWindowMs: SETTLED_MS, holds: NO_HOLDS },
    { comparePage: '/fixture/compare.html', compareInBackground: true },
  )
  assert.ok(!('stale' in result))
  assert.ok(result.ledger.items.some(item => item.id === row.id))
  assert.ok(!result.ledger.closed.some(item => item.id === row.id))
})
