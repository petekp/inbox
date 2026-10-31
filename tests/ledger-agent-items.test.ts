import { describe, expect, test } from 'claude-code/testing'

import { CLAUDE_CODE } from '../hooks/model-text'
import { EMPTY } from '../hooks/ledger'
import { closeByAgent, closeItem } from '../hooks/ledger-close'
import { addAgentItem, applyUpdate } from '../hooks/ledger-update'
import { parseReply } from '../hooks/reply-parse'
import { recordClose, recordItem } from '../hooks/tools'

describe('items the agent recorded', () => {
  const ask = {
    kind: 'question' as const,
    ask: 'Which cache should the API use?',
    options: ['Redis', 'Memcached'],
    rec: null,
    helps: [],
  }
  const recorded = (turn = 1) => addAgentItem({ ...EMPTY, turn }, ask, 1000).ledger

  test("a CLOSED line closes one only with the person's answer", () => {
    for (const outcome of ['done: picked Redis', 'no longer applies: cache dropped', 'no longer applies', 'moot', ''])
      expect(applyUpdate(recorded(), parseReply(`CLOSED: i1 | ${outcome}`)!, 2000, 1).items.map(i => i.id)).toEqual([
        'i1',
      ])
    const answered = applyUpdate(recorded(), parseReply('CLOSED: i1 | Redis')!, 2000, 1)
    expect(answered.closed.map(c => [c.id, c.outcome, c.how])).toEqual([['i1', 'Redis', 'update']])
  })

  test("one stays open after 12 prompts, when the update's items expire", () => {
    const both = applyUpdate(recorded(), parseReply('NEW: do | - | Sign in to npm | - | -')!, 1500, 1)
    const later = applyUpdate({ ...both, turn: 14 }, parseReply('NONE')!, 2000, 14)
    expect([later.items.map(i => i.id), later.closed.map(c => [c.id, c.how])]).toEqual([['i1'], [['i2', 'expired']]])
  })

  test('a NEW line of its kind in the turn it was recorded adds nothing, and one that restates it adds its steps and recommendation', () => {
    const other = parseReply('NEW: decide | - | Ship the release today? | Yes / No | -')!
    expect(applyUpdate(recorded(3), other, 2000, 3).items.map(i => i.id)).toEqual(['i1'])
    expect(applyUpdate(recorded(3), other, 2000, 4).items.map(i => i.id)).toEqual(['i1', 'i2'])
    const restated = parseReply(
      'NEW: decide | - | Which cache should the API use? | Redis / Memcached | -\nHELP: new 1 | link | https://redis.io | docs',
    )!
    expect(applyUpdate(recorded(3), restated, 2000, 3).items.map(i => [i.id, i.helps])).toEqual([
      ['i1', [{ kind: 'link', url: 'https://redis.io/', name: 'docs' }]],
    ])
    const recommending = parseReply('NEW: decide | - | Which cache should the API use? | Redis / Memcached | Redis')!
    expect(applyUpdate(recorded(3), recommending, 2000, 4).items.map(i => [i.id, i.rec])).toEqual([['i1', 'Redis']])
  })

  test('a repeat record changes the recommendation to one of the open options and says so', () => {
    const record = { kind: 'question', ask: 'Which cache should the API use?', options: ['Redis', 'Memcached'] }
    const first = recordItem(CLAUDE_CODE, recorded(), { ...record, rec: 'Redis' }, 2000)
    const second = recordItem(CLAUDE_CODE, first.ledger, { ...record, rec: 'Memcached' }, 2100)
    const unstated = recordItem(CLAUDE_CODE, second.ledger, record, 2200)
    const elsewhere = recordItem(CLAUDE_CODE, second.ledger, { ...record, options: ['Valkey'], rec: 'Valkey' }, 2300)
    expect(
      [first, second, unstated, elsewhere].map(r => [r.ledger.items.map(i => i.rec), r.result, r.personLine]),
    ).toEqual([
      [['Redis'], 'Already open, so this record updated it and changed its recommendation to Redis.', null],
      [['Memcached'], 'Already open, so this record updated it and changed its recommendation to Memcached.', null],
      [['Memcached'], 'Already open, so this record updated it.', null],
      [['Memcached'], 'Already open, so this record updated it.', null],
    ])
  })

  test('a record or close gives the person a line naming what it changed, and none when it changed nothing', () => {
    const question = { kind: 'question', ask: 'Which cache should the API use?', options: ['Redis', 'Memcached'] }
    const first = recordItem(CLAUDE_CODE, EMPTY, question, 1000)
    expect(first.personLine).toBe('Question: Which cache should the API use?')
    expect(recordItem(CLAUDE_CODE, first.ledger, question, 1100).personLine).toBeNull()
    expect(recordItem(CLAUDE_CODE, EMPTY, { kind: 'question', ask: 'Ship it?' }, 1000).personLine).toBeNull()
    expect(recordItem(CLAUDE_CODE, EMPTY, { kind: 'task', ask: 'Sign in to npm' }, 1000).personLine).toBe(
      'Task: Sign in to npm',
    )

    const finding = { kind: 'finding', title: 'Retry loop never backs off', detail: 'It hammers the API.' }
    const found = recordItem(CLAUDE_CODE, first.ledger, finding, 1200)
    expect(found.personLine).toBe('Issue: Retry loop never backs off')
    expect(recordItem(CLAUDE_CODE, found.ledger, finding, 1300).personLine).toBeNull()
    expect(
      recordItem(CLAUDE_CODE, EMPTY, { ...finding, finding_kind: 'opportunity', title: 'Cache the token' }, 1200)
        .personLine,
    ).toBe('Opportunity: Cache the token')

    const closed = recordClose(CLAUDE_CODE, found.ledger, { id: 'i1', answer: 'Redis' }, 1400)
    expect(closed.personLine).toBe('Closed: Which cache should the API use?')
    expect(recordClose(CLAUDE_CODE, closed.ledger, { id: 'i1', answer: 'Redis' }, 1500).personLine).toBeNull()
    const findingId = found.ledger.findings[0]!.id
    expect(recordClose(CLAUDE_CODE, found.ledger, { id: findingId, reason: 'fixed' }, 1400).personLine).toBe(
      'Closed: Retry loop never backs off',
    )
  })

  test('the agent can record again what it closed, but not what the person or the update closed', () => {
    const closedByAgent = closeByAgent(
      CLAUDE_CODE,
      recorded(),
      'i1',
      { reason: 'no longer applies: cache dropped' },
      1500,
    )
    expect(addAgentItem(closedByAgent.ledger, { ...ask, rec: 'Redis' }, 2000)).toMatchObject({ is: 'added', id: 'i2' })
    const refusals = [
      [{ how: 'answered', outcome: 'Redis' }, 'Not recorded: the user answered it (Redis).'],
      [{ how: 'dismissed', outcome: 'dismissed' }, 'Not recorded: the user dismissed it.'],
      [{ how: 'update', outcome: 'Redis' }, 'Not recorded: the inbox closed it (Redis).'],
    ] as const
    for (const [closing, result] of refusals)
      expect(recordItem(CLAUDE_CODE, closeItem(recorded(), 'i1', closing, 1500), ask, 2000).result).toStartWith(result)
  })
})
