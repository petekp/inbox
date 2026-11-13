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

  test('a question back closes no question, from a CLOSED line or the close tool, while a named option closes it', () => {
    const presses = { lastActions: {}, turnStartedAt: null }
    const asked = applyUpdate(
      { ...EMPTY, turn: 1 },
      parseReply('NEW: decide | - | Which cache should the API use? | Redis / Memcached | -')!,
      1000,
      1,
    )
    for (const ledger of [recorded(), asked])
      for (const outcome of ['Why not Memcached?', 'Is that the cheaper one?'])
        expect(applyUpdate(ledger, parseReply(`CLOSED: i1 | ${outcome}`)!, 2000, 1).items.map(i => i.id)).toEqual([
          'i1',
        ])
    const refused = recordClose(CLAUDE_CODE, recorded(), { id: 'i1', answer: 'Why not Memcached?' }, 2000, presses)
    expect(refused.result).toBe(
      'Not closed: the user asked a question back, so it stays open. Answer them in your reply, and close it when they decide.',
    )
    expect(refused.ledger.items.map(i => i.id)).toEqual(['i1'])
    expect(refused.personLine).toBeNull()
    for (const answer of ['Redis?', 'Redis', 'What you recommended'])
      expect(
        recordClose(CLAUDE_CODE, recorded(), { id: 'i1', answer }, 2000, presses).ledger.closed.map(c => c.outcome),
      ).toEqual([answer])
  })

  test('a recommendation keeps its reason until it moves to another option, and the answer names what a row lacks', () => {
    const input = { kind: 'question', ask: ask.ask, options: ask.options }
    const bare = recordItem(CLAUDE_CODE, { ...EMPTY, turn: 1 }, input, 1000)
    expect(bare.result).toContain('It has no rec')
    const why = recordItem(
      CLAUDE_CODE,
      bare.ledger,
      { ...input, rec: 'Redis', why: 'because it survives restarts' },
      1100,
    )
    expect(why.result).not.toContain('It has no')
    expect(why.ledger.items[0]).toMatchObject({ rec: 'Redis', recReason: 'it survives restarts' })
    const kept = applyUpdate(why.ledger, parseReply('UPDATE: i1 | - | Redis')!, 1200, 1)
    expect(kept.items[0]!.recReason).toBe('it survives restarts')
    const moved = applyUpdate(why.ledger, parseReply('UPDATE: i1 | - | Memcached')!, 1200, 1)
    expect(moved.items[0]).toMatchObject({ rec: 'Memcached' })
    expect(moved.items[0]!.recReason).toBeUndefined()
    const task = recordItem(CLAUDE_CODE, EMPTY, { kind: 'task', ask: 'Plug in the test phone' }, 1000)
    expect(task.result).toContain('It has no steps')
  })

  test("a question keeps why it came up and what each option does, a record of it again replaces them, and the answer names what's missing", () => {
    const input = { kind: 'question', ask: ask.ask, options: ask.options, rec: 'Redis', why: 'it survives restarts' }
    const bare = recordItem(CLAUDE_CODE, { ...EMPTY, turn: 1 }, input, 1000)
    expect(bare.result).toBe(
      'Recorded. The user sees it in the /inbox pane. It has no context or option_notes: record it again with context (why it came up) and option_notes (what picking each option does).',
    )
    const body = { context: 'The price lookups are slow', option_notes: ['Adds a server', ''] }
    const halfNoted = recordItem(CLAUDE_CODE, { ...EMPTY, turn: 1 }, { ...input, ...body }, 1000)
    expect(halfNoted.result).toContain(
      'It has no note on "Memcached": record it again with option_notes (what picking each option does).',
    )
    const enriched = recordItem(CLAUDE_CODE, bare.ledger, { ...input, ...body }, 1100)
    expect(enriched.result).toBe(
      'Already open, so this record updated it and gave it your context and gave its options your notes.',
    )
    expect(enriched.ledger.items[0]).toMatchObject({
      context: 'The price lookups are slow',
      optionDescriptions: { Redis: 'Adds a server' },
    })
    const renoted = recordItem(
      CLAUDE_CODE,
      enriched.ledger,
      { ...input, options: ['memcached', 'redis'], option_notes: ['Keeps prices in memory'] },
      1200,
    )
    expect(renoted.ledger.items[0]).toMatchObject({
      context: 'The price lookups are slow',
      optionDescriptions: { Redis: 'Adds a server', Memcached: 'Keeps prices in memory' },
    })

    const approval = { kind: 'question', ask: 'Approve the new settings layout?', options: ['Yes', 'No'] }
    const unseen = recordItem(CLAUDE_CODE, EMPTY, approval, 1000)
    expect(unseen.result).toContain(
      "The user can't approve what they can't see: when there is something to look at, record it again with a screenshot, page or file in steps.",
    )
    const seen = recordItem(CLAUDE_CODE, EMPTY, { ...approval, steps: ['/tmp/settings.png'] }, 1000)
    expect(seen.result).not.toContain("can't approve")
    const choice = recordItem(CLAUDE_CODE, EMPTY, input, 1000)
    expect(choice.result).not.toContain("can't approve")
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

    const closed = recordClose(CLAUDE_CODE, found.ledger, { id: 'i1', answer: 'Redis' }, 1400, {
      lastActions: {},
      turnStartedAt: null,
    })
    expect(closed.personLine).toBe('Closed: Which cache should the API use?')
    expect(
      recordClose(CLAUDE_CODE, closed.ledger, { id: 'i1', answer: 'Redis' }, 1500, {
        lastActions: {},
        turnStartedAt: null,
      }).personLine,
    ).toBeNull()
    const findingId = found.ledger.findings[0]!.id
    expect(
      recordClose(CLAUDE_CODE, found.ledger, { id: findingId, reason: 'fixed' }, 1400, {
        lastActions: {},
        turnStartedAt: null,
      }).personLine,
    ).toBe('Closed: Retry loop never backs off')
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

  test('a question recorded again in its turn with reworded text and the same options updates its row, and another option set adds one', () => {
    const first = recordItem(CLAUDE_CODE, { ...EMPTY, turn: 1 }, { ...ask }, 1000)
    const again = (input: Record<string, unknown>) => recordItem(CLAUDE_CODE, first.ledger, { ...ask, ...input }, 2000)
    const reworded = { ask: 'Which cache should the API use here?', context: 'Reads dominate the load.' }

    const same = again(reworded)
    expect(same.ledger.items.map(i => [i.id, i.context])).toEqual([['i1', 'Reads dominate the load.']])

    const otherOptions = again({ ...reworded, options: ['Redis', 'Valkey'] })
    expect(otherOptions.ledger.items.map(i => i.id)).toEqual(['i1', 'i2'])
  })
})
