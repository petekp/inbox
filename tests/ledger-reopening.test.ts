import { describe, expect, test } from 'claude-code/testing'

import { CLAUDE_CODE } from '../hooks/model-text'
import { EMPTY } from '../hooks/ledger'
import { closeByAgent, closeFinding, closeItem, pruneClosed, reopenFinding, reopenItem } from '../hooks/ledger-close'
import { addAgentItem, addFinding, applyUpdate } from '../hooks/ledger-update'
import { parseReply } from '../hooks/reply-parse'
import { recordClose } from '../hooks/tools'
import type { Item } from '../types'

describe('reopening', () => {
  const item = (id: string, options: string[] = []): Item => ({
    id,
    kind: 'question',
    label: null,
    from: 'record',
    ask: `Ask ${id}?`,
    options,
    rec: null,
    helps: [],
    turn: 1,
    at: 1,
  })

  test('an item goes back in id order, as it was before it closed', () => {
    const open = { ...EMPTY, items: [item('i1'), item('i2', ['Yes', 'No']), item('i10')] }
    const dismissed = closeItem(open, 'i2', { how: 'dismissed', outcome: 'dismissed' }, 5)
    const reopened = reopenItem(dismissed, 'i2')
    expect(reopened.items.map(i => i.id)).toEqual(['i1', 'i2', 'i10'])
    expect(reopened.items[1]).toEqual(item('i2', ['Yes', 'No']))
    expect(reopened.closed).toEqual([])
  })

  test('an item whose close record kept no item stays closed', () => {
    const closed = {
      ...EMPTY,
      closed: [{ id: 'i2', kind: 'question' as const, ask: 'Push?', outcome: 'done', how: 'done' as const, at: 1 }],
    }
    expect(reopenItem(closed, 'i2')).toBe(closed)
  })

  test('a closed finding goes back as it was', () => {
    const finding = { kind: 'issue' as const, title: 'Hotkeys vanish', detail: 'In ANSI', path: null, at: 1 }
    const one = addFinding(EMPTY, finding).ledger
    const two = addFinding(one, { ...finding, title: 'Tabs unreadable' }).ledger
    const dismissed = closeFinding(two, 'f1', { how: 'dismissed', outcome: 'dismissed' }, 9)
    expect(dismissed.findings.map(f => f.id)).toEqual(['f2'])
    expect(dismissed.closedFindings).toEqual([
      { ...finding, id: 'f1', how: 'dismissed', outcome: 'dismissed', closedAt: 9 },
    ])
    expect(reopenFinding(dismissed, 'f1')).toEqual(two)
  })

  test('closing an id that is already closed says how it closed and changes nothing', () => {
    const finding = { kind: 'issue' as const, title: 'Hotkeys vanish', detail: 'In ANSI', path: null, at: 1 }
    const open = addFinding(EMPTY, finding).ledger
    const dismissed = closeFinding(open, 'f1', { how: 'dismissed', outcome: 'dismissed' }, 5)
    const again = recordClose(CLAUDE_CODE, dismissed, { id: 'f1', reason: 'fixed' }, 9, {
      lastActions: {},
      turnStartedAt: null,
    })
    expect(again.result).toBe('Already closed: the user dismissed it.')
    expect(again.ledger).toBe(dismissed)
    const fixed = closeFinding(open, 'f1', { how: 'update', outcome: 'fixed in the theme' }, 5)
    expect(
      recordClose(CLAUDE_CODE, fixed, { id: 'f1', reason: 'x' }, 9, { lastActions: {}, turnStartedAt: null }).result,
    ).toBe('Already closed: the inbox closed it (fixed in the theme).')
    const expired = closeFinding(open, 'f1', { how: 'expired', outcome: 'list full' }, 5)
    expect(
      recordClose(CLAUDE_CODE, expired, { id: 'f1', reason: 'x' }, 9, { lastActions: {}, turnStartedAt: null }).result,
    ).toBe('Already closed: it expired.')
    expect(
      recordClose(CLAUDE_CODE, expired, { id: 'f7', reason: 'x' }, 9, { lastActions: {}, turnStartedAt: null }).result,
    ).toContain('Not closed:')
  })

  test('Claude and the per-turn update close findings with how and outcome, and the update closes one only as fixed', () => {
    const finding = { kind: 'issue' as const, title: 'Hotkeys vanish', detail: 'In ANSI', path: null, at: 1 }
    const open = addFinding(addFinding(EMPTY, finding).ledger, { ...finding, title: 'Tabs unreadable' }).ledger
    const answered = closeByAgent(CLAUDE_CODE, open, 'f1', { answer: 'leave it' }, 5)
    expect(answered.closed).toMatchObject({ finding: { id: 'f1' } })
    const updated = applyUpdate(answered.ledger, parseReply('FIXED: f2 | fixed in the theme')!, 6, 1)
    expect(updated.findings).toEqual([])
    expect(updated.closedFindings.map(f => [f.id, f.how, f.outcome, f.closedAt])).toEqual([
      ['f1', 'answered', 'leave it', 5],
      ['f2', 'update', 'fixed in the theme', 6],
    ])
    expect(applyUpdate(open, parseReply('CLOSED: f2 | set aside for now')!, 6, 1).findings.map(f => f.id)).toEqual([
      'f1',
      'f2',
    ])
    for (const outcome of ['Dismiss button now closes the dialog', 'moved the null check later in init'])
      expect(applyUpdate(open, parseReply(`FIXED: f2 | ${outcome}`)!, 6, 1).findings.map(f => f.id)).toEqual(['f1'])
    for (const outcome of ['dismissed by the user', 'user declined', 'later', 'not now', 'deferred to next sprint'])
      expect(applyUpdate(open, parseReply(`FIXED: f2 | ${outcome}`)!, 6, 1).findings.map(f => f.id)).toEqual([
        'f1',
        'f2',
      ])
  })

  test('a question or finding that raises a finding the person dismissed is not added', () => {
    const finding = {
      kind: 'opportunity' as const,
      title: 'Missing tests for the parser',
      detail: 'A regression would go unnoticed.',
      path: null,
      at: 1,
    }
    const dismissed = {
      ...closeFinding(addFinding({ ...EMPTY, turn: 2 }, finding).ledger, 'f1', { how: 'dismissed', outcome: '' }, 2),
      turn: 3,
    }
    const question = {
      kind: 'question' as const,
      ask: 'Add tests for the parser?',
      options: ['Yes', 'No'],
      rec: null,
      helps: [],
    }
    expect(addAgentItem(dismissed, question, 3)).toMatchObject({ is: 'closed', record: { how: 'dismissed' } })
    expect(
      applyUpdate(dismissed, parseReply('NEW: decide | - | Add tests for the parser? | Yes / No | -')!, 4, 3, 3).items,
    ).toEqual([])
    expect(addAgentItem(dismissed, { ...question, ask: 'Add a CLI flag for verbose logs?' }, 3).is).toBe('added')
    const wider = 'Add the missing tests for the parser and the release script before v2?'
    expect(addAgentItem(dismissed, { ...question, ask: wider }, 3).is).toBe('added')
    expect(addFinding(dismissed, { ...finding, title: 'The parser is missing tests' }).isAdded).toBe(false)
  })

  test('the closed lists keep what the person dismissed past the newest 12', () => {
    const finding = { kind: 'issue' as const, title: 'Old dismissed thing', detail: 'd', path: null, at: 1 }
    let ledger = closeFinding(addFinding(EMPTY, finding).ledger, 'f1', { how: 'dismissed', outcome: '' }, 1)
    for (let n = 0; n < 15; n += 1)
      ledger = closeFinding(
        addFinding(ledger, { ...finding, title: `Other ${n}` }).ledger,
        `f${n + 2}`,
        { how: 'update', outcome: 'fixed' },
        2,
      )
    const pruned = pruneClosed(ledger, new Set())
    expect(pruned.closedFindings.length).toBe(13)
    expect(pruned.closedFindings[0]!.id).toBe('f1')
  })

  test('a finding added to a full list closes the oldest as expired, so it stays in Closed', () => {
    const finding = { kind: 'issue' as const, title: '', detail: 'd', path: null, at: 1 }
    const full = Array.from({ length: 30 }, (_, n) => n).reduce(
      (l, n) => addFinding(l, { ...finding, title: `Problem number ${n}` }).ledger,
      EMPTY,
    )
    const r = addFinding(full, { ...finding, title: 'One more problem', at: 7 })
    expect([r.isAdded, r.expired?.id]).toEqual([true, 'f1'])
    expect(r.ledger.findings.length).toBe(30)
    expect(r.ledger.closedFindings.map(f => [f.id, f.how, f.outcome, f.closedAt])).toEqual([
      ['f1', 'expired', 'list full', 7],
    ])
  })

  test('a finding the person dismissed is not recorded again, but an expired or fixed one is', () => {
    const finding = { kind: 'issue' as const, title: 'Hotkeys vanish in ANSI mode', detail: 'd', path: null, at: 1 }
    const open = addFinding(EMPTY, finding).ledger
    const dismissed = closeFinding(open, 'f1', { how: 'dismissed', outcome: 'dismissed' }, 5)
    const again = addFinding(dismissed, { ...finding, title: 'Hotkeys vanish in ANSI mode', at: 6 })
    expect([again.isAdded, again.dismissed?.id, again.ledger]).toEqual([false, 'f1', dismissed])
    expect(addFinding(dismissed, { ...finding, title: 'In the ANSI mode, hotkeys vanish' }).isAdded).toBe(false)
    expect(addFinding(dismissed, { ...finding, title: 'Hotkeys vanish in ANSI mode on macOS' }).isAdded).toBe(false)
    expect(addFinding(dismissed, { ...finding, title: 'Hotkeys vanished in ANSI mode' }).isAdded).toBe(false)
    expect(addFinding(dismissed, { ...finding, title: 'Tabs unreadable' }).isAdded).toBe(true)
    for (const closing of [
      { how: 'expired' as const, outcome: 'list full' },
      { how: 'update' as const, outcome: 'fixed in the theme' },
    ]) {
      const r = addFinding(closeFinding(open, 'f1', closing, 5), finding)
      expect([r.isAdded, r.dismissed]).toEqual([true, null])
    }
  })

  test('a dismissed finding blocks a rewording of it, but not one about a different subject in the same words', () => {
    const finding = {
      kind: 'issue' as const,
      title: 'package.json has no license field',
      detail: 'd',
      path: null,
      at: 1,
    }
    const dismissed = closeFinding(
      addFinding(EMPTY, finding).ledger,
      'f1',
      { how: 'dismissed', outcome: 'dismissed' },
      5,
    )
    const r = addFinding(dismissed, { ...finding, title: 'package.json has no engines field', at: 6 })
    expect([r.isAdded, r.dismissed]).toEqual([true, null])
    const reworded = addFinding(dismissed, { ...finding, title: 'package.json is missing a license field', at: 6 })
    expect([reworded.isAdded, reworded.dismissed?.id]).toEqual([false, 'f1'])
  })

  test('a dismissed finding blocks one that swaps a word for its synonym, but not one with a different word there', () => {
    const finding = { kind: 'issue' as const, title: 'Hotkeys vanish in ANSI mode', detail: 'd', path: null, at: 1 }
    const dismissed = closeFinding(
      addFinding(EMPTY, finding).ledger,
      'f1',
      { how: 'dismissed', outcome: 'dismissed' },
      5,
    )
    const swapped = addFinding(dismissed, { ...finding, title: 'Hotkeys disappear in ANSI mode', at: 6 })
    expect([swapped.isAdded, swapped.dismissed?.id]).toEqual([false, 'f1'])
    const other = addFinding(dismissed, { ...finding, title: 'Hotkeys lag in ANSI mode', at: 6 })
    expect([other.isAdded, other.dismissed]).toEqual([true, null])
  })

  test('a finding an item asks about closes into that item', () => {
    const finding = { kind: 'issue' as const, title: 'Research folder sits in the app', detail: 'd', path: null, at: 1 }
    const open = addFinding(addFinding(EMPTY, finding).ledger, { ...finding, title: 'Tabs unreadable' }).ledger
    const reply =
      'NEW: do | - | Tell Claude when QA ends, to move the research folder out of the app | - | -\nASKED: f1 | new 1'
    const updated = applyUpdate(open, parseReply(reply)!, 6, 1)
    expect(updated.items.map(i => i.id)).toEqual(['i3'])
    expect(updated.findings.map(f => f.id)).toEqual(['f2'])
    expect(updated.closedFindings.map(f => [f.id, f.how, f.outcome])).toEqual([['f1', 'update', 'asked as i3']])
    const later = applyUpdate(updated, parseReply('ASKED: f2 | i3')!, 7, 2)
    expect(later.findings.map(f => f.id)).toEqual(['f2'])
  })

  test('an ASKED line naming no open item leaves the finding open', () => {
    const finding = { kind: 'issue' as const, title: 'Tabs unreadable', detail: 'd', path: null, at: 1 }
    const open = addFinding(EMPTY, finding).ledger
    expect(applyUpdate(open, parseReply('ASKED: f1 | i9\nASKED: f1 | new 1')!, 6, 1).findings.map(f => f.id)).toEqual([
      'f1',
    ])
  })

  test('a new item that rewords an open finding closes it, and a finding that rewords an open item is not added', () => {
    const finding = {
      kind: 'issue' as const,
      title: 'Release notes miss the login fix',
      detail: 'd',
      path: null,
      at: 1,
    }
    const open = addFinding(EMPTY, finding).ledger
    const asked = applyUpdate(
      open,
      parseReply('NEW: decide | - | Add the login fix to the release notes? | Yes / No | -')!,
      6,
      1,
    )
    expect(asked.findings).toEqual([])
    expect(asked.closedFindings.map(f => f.outcome)).toEqual(['asked as i2'])
    const again = addFinding(asked, finding)
    expect([again.isAdded, again.id]).toEqual([false, 'i2'])
  })
})
