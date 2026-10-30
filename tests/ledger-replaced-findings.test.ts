import { describe, expect, test } from 'claude-code/testing'

import {
  EMPTY,
  addAgentItem,
  addFinding,
  applyUpdate,
  closeItem,
  closedState,
  parseReply,
  reopenFinding,
  upgradeLedger,
} from '../hooks/ledger'
import { applyPress } from '../hooks/presses'

describe('a finding replaced by a question', () => {
  const finding = (title: string, detail = 'd') => ({
    kind: 'issue' as const,
    title,
    detail,
    path: null,
    at: 1,
  })
  const ctx = { now: 9, turnsStarted: 1, extraSteps: [], comparePage: '/plugin/hooks/compare-page.html' }
  const asked = () => {
    const open = addFinding(EMPTY, finding('Dismissed findings come back when recorded again')).ledger
    const reply =
      'NEW: decide | - | Fix dismissed findings coming back when recorded again? | Yes / Not now | -\nASKED: f1 | new 1'
    return applyUpdate(open, parseReply(reply)!, 6, 1)
  }

  test('an ASKED line for an unrelated item leaves the finding open', () => {
    const open = addFinding(EMPTY, finding('Tabs unreadable in light theme')).ledger
    const reply = 'NEW: decide | - | Merge the release branch? | Yes / No | -\nASKED: f1 | new 1'
    const updated = applyUpdate(open, parseReply(reply)!, 6, 1)
    expect([updated.findings.map(f => f.id), updated.closedFindings]).toEqual([['f1'], []])
  })

  test('an item labelled with the finding id, or asking from its detail, or naming its PR, takes its place', () => {
    const open = addFinding(
      EMPTY,
      finding('Tabs unreadable', 'The Findings tab text vanishes in the light theme'),
    ).ledger
    const replies = [
      'NEW: decide | f1 | Which approach do you want? | A / B | -',
      'NEW: decide | - | Should the Findings tab text stay visible in the light theme? | Yes / No | -',
    ]
    for (const reply of replies)
      expect(applyUpdate(open, parseReply(`${reply}\nASKED: f1 | new 1`)!, 6, 1).findings).toEqual([])
    const withPr = addFinding(EMPTY, finding('Review thread open on PR #42')).ledger
    const named = addAgentItem(
      withPr,
      { kind: 'question', ask: 'Reply to the reviewer on #42?', options: [], rec: null, helps: [] },
      6,
    )
    expect(named.ledger.findings).toEqual([])
    const other = addAgentItem(
      withPr,
      { kind: 'question', ask: 'Reply to the reviewer on #43?', options: [], rec: null, helps: [] },
      6,
    )
    expect(other.ledger.findings.map(f => f.id)).toEqual(['f1'])
  })

  test('an unrelated question sharing common words with a finding does not replace it', () => {
    const open = addFinding(
      EMPTY,
      finding('Row flickers when idle', 'The inbox tab redraws the row on every tick'),
    ).ledger
    const ask = 'Should the Codex inbox tab keep its row order?'
    const fallback = applyUpdate(open, parseReply(`NEW: decide | - | ${ask} | Yes / No | -`)!, 6, 1)
    expect([fallback.items.length, fallback.findings.map(f => f.id)]).toEqual([1, ['f1']])
    const added = addAgentItem(open, { kind: 'question', ask, options: [], rec: null, helps: [] }, 6)
    expect(added.ledger.findings.map(f => f.id)).toEqual(['f1'])
    const claimed = parseReply('NEW: decide | - | Merge the release branch? | Yes / No | -\nASKED: f1 | new 1')!
    expect(applyUpdate(open, claimed, 6, 1).findings.map(f => f.id)).toEqual(['f1'])
  })

  test('the finding comes back when its question is dismissed, expired, put off or no longer applies', () => {
    const closings = [
      { how: 'dismissed' as const, outcome: 'dismissed' },
      { how: 'expired' as const, outcome: 'expired, unanswered' },
      { how: 'answered' as const, outcome: 'Not now' },
      { how: 'claude' as const, outcome: 'closed by Claude: no longer applies' },
    ]
    for (const closing of closings) {
      const ledger = closeItem(asked(), 'i2', closing, 8)
      expect([ledger.findings.map(f => [f.id, f.askedAs]), ledger.closedFindings]).toEqual([[['f1', undefined]], []])
    }
  })

  test('an update that closes the question as put off brings the finding back', () => {
    const ledger = applyUpdate(asked(), parseReply('CLOSED: i2 | the person put it off for later')!, 8, 2)
    expect(ledger.findings.map(f => f.id)).toEqual(['f1'])
  })

  test('the finding stays closed when the question is answered or done', () => {
    for (const closing of [
      { how: 'answered' as const, outcome: 'Yes' },
      { how: 'done' as const, outcome: 'done' },
      { how: 'update' as const, outcome: 'fixed in the last commit' },
    ]) {
      const ledger = closeItem(asked(), 'i2', closing, 8)
      expect([ledger.findings, ledger.closedFindings.map(f => f.id)]).toEqual([[], ['f1']])
    }
  })

  test('the link survives a save', () => {
    const saved = JSON.parse(JSON.stringify(asked()))
    expect(upgradeLedger(saved).closedFindings[0]?.askedAs).toBe('i2')
  })

  test('a finding saved as "asked as iN" before the link was kept comes back when that question is dismissed', () => {
    const saved = JSON.parse(JSON.stringify(asked()))
    delete saved.closedFindings[0].askedAs
    const dismissed = closeItem(upgradeLedger(saved), 'i2', { how: 'dismissed', outcome: 'dismissed' }, 8)
    expect([dismissed.findings.map(f => [f.id, f.askedAs]), dismissed.closedFindings]).toEqual([
      [['f1', undefined]],
      [],
    ])
    const fixed = JSON.parse(JSON.stringify(saved))
    fixed.closedFindings[0].outcome = 'fixed in the theme'
    expect(upgradeLedger(fixed).closedFindings[0]?.askedAs).toBeUndefined()
  })

  test('Fix on a finding closes the question that asks about it', () => {
    const linked = reopenFinding(asked(), 'f1')
    const r = applyPress(linked, undefined, { action: 'address', id: 'f1' }, ctx)
    if ('stale' in r) throw new Error('stale')
    expect([r.ledger.items, r.ledger.closed.map(c => c.id), r.effects.map(e => e.kind)]).toEqual([[], ['i2'], ['send']])
  })
})

describe('closedState', () => {
  test('an item ends handled, dismissed, or lapsed when the work overtook it', () => {
    const cases: [Parameters<typeof closedState>[0], string][] = [
      [{ how: 'answered', outcome: 'Postgres' }, 'handled'],
      [{ how: 'done', outcome: 'done' }, 'handled'],
      [{ how: 'claude', outcome: 'closed by Codex: fixed' }, 'handled'],
      [{ how: 'claude', outcome: 'closed by Claude: no longer applies, the spec dropped it' }, 'lapsed'],
      [{ how: 'update', outcome: 'done: removed the XLSX export' }, 'handled'],
      [{ how: 'update', outcome: 'no longer applies: XLSX removed from spec' }, 'lapsed'],
      [{ how: 'expired', outcome: 'expired' }, 'lapsed'],
      [{ how: 'dismissed', outcome: 'dismissed' }, 'dismissed'],
    ]
    expect(cases.map(([d]) => closedState(d))).toEqual(cases.map(([, state]) => state))
  })
})

describe('upgradeLedger', () => {
  test('a ledger saved with a card counts as one update applied, and one saved without counts none', () => {
    const { updates: _updates, ...base } = EMPTY
    expect(upgradeLedger({ ...base, card: { goal: 'g', done: [], now: '', running: [] } } as never).updates).toBe(1)
    expect(upgradeLedger(base as never).updates).toBe(0)
    expect(upgradeLedger({ ...base, updates: 4 } as never).updates).toBe(4)
  })

  test('a ledger saved before PR orders loads with no order, one saved before reasons loads with no reason and no statuses, and a newer order keeps both', () => {
    const { prOrder: _prOrder, ...old } = EMPTY
    const order = { refs: ['acme/greet#12'], label: 'Merge order', by: 'Claude', at: 5 }
    expect(upgradeLedger(old as never).prOrder).toBeNull()
    expect(upgradeLedger({ ...EMPTY, prOrder: order } as never).prOrder).toEqual({
      ...order,
      why: null,
      statuses: null,
    })
    const newer = {
      ...order,
      why: '#12 is green.',
      statuses: { 'acme/greet#12': { status: 'ready' as const, threads: [], failing: [] } },
    }
    expect(upgradeLedger({ ...EMPTY, prOrder: newer }).prOrder).toEqual(newer)
  })

  test('converts a ledger saved with `decided` and the kinds decide and do', () => {
    const item = { id: 'i1', label: null, ask: 'Push?', options: [], rec: null, helps: [], turn: 1, at: 5 }
    const record = { id: 'i3', ask: 'Login', outcome: 'done', how: 'done', at: 9 }
    const { closed, closedFindings, ...base } = EMPTY
    const saved = {
      ...base,
      items: [
        { ...item, kind: 'decide' },
        { ...item, id: 'i2', kind: 'do' },
      ],
      decided: [
        { ...record, kind: 'do' },
        { ...record, id: 'i4', kind: 'decide' },
        { ...record, id: 'i5' },
      ],
    }
    const upgraded = upgradeLedger(saved as never)

    expect(upgraded.items.map(i => [i.kind, i.from])).toEqual([
      ['question', 'update'],
      ['task', 'update'],
    ])
    expect(upgraded.closed.map(d => [d.id, d.kind])).toEqual([
      ['i3', 'task'],
      ['i4', 'question'],
      ['i5', 'question'],
    ])
    expect('decided' in upgraded).toBe(false)
    expect(upgraded.closedFindings).toEqual([])
  })
})
