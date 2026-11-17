import { describe, expect, test } from 'claude-code/testing'

import { CLAUDE_CODE } from '../hooks/model-text'
import { EMPTY, upgradeLedger } from '../hooks/ledger'
import { closeByAgent, closeItem } from '../hooks/ledger-close'
import { addAgentItem, applyUpdate } from '../hooks/ledger-update'
import { parseReply, stepHelp } from '../hooks/reply-parse'
import { recordClose, recordItem } from '../hooks/tools'
import { TOOL_FIELDS, V0_3_TOOL_FIELDS } from '../hooks/tool-schemas'
import { actionsOf } from '../hooks/action-plan'
import { pressed } from '../hooks/pressed'

describe('items the agent recorded', () => {
  const ask = {
    kind: 'question' as const,
    ask: 'Which cache should the API use?',
    options: ['Redis', 'Memcached'],
    rec: null,
    helps: [],
  }
  const recorded = (turn = 1) => addAgentItem({ ...EMPTY, turn }, ask, 1000).ledger

  test('reads named HTTPS task steps with the shared normalized href', () => {
    expect(stepHelp('[GitHub](https://github.com)')).toMatchObject({
      kind: 'link',
      url: 'https://github.com/',
      name: 'GitHub',
    })
    expect(stepHelp('[@](https://GITHUB.com/a@b)')).toMatchObject({
      kind: 'link',
      url: 'https://github.com/a%40b',
      name: '@',
    })
  })

  test('a ledger CLOSED line never closes a recorded item, while an update-origin item keeps its behavior', () => {
    for (const outcome of ['done: picked Redis', 'no longer applies: cache dropped', 'no longer applies', 'moot', ''])
      expect(applyUpdate(recorded(), parseReply(`CLOSED: i1 | ${outcome}`)!, 2000, 1).items.map(i => i.id)).toEqual([
        'i1',
      ])
    const answered = applyUpdate(recorded(), parseReply('CLOSED: i1 | Redis')!, 2000, 1)
    expect(answered.items.map(i => i.id)).toEqual(['i1'])
    expect(answered.closed).toEqual([])

    const fromUpdate = applyUpdate(
      { ...EMPTY, turn: 1 },
      parseReply('NEW: decide | - | Which cache should the API use? | Redis / Memcached | -')!,
      1000,
      1,
    )
    const closed = applyUpdate(fromUpdate, parseReply('CLOSED: i1 | Redis')!, 2000, 2)
    expect(closed.closed.map(c => [c.id, c.outcome, c.how])).toEqual([['i1', 'Redis', 'update']])
  })

  test("a person's answer press and the agent's close tool still close a recorded question", () => {
    const ledger = recorded()
    const answerPress = pressed(
      ledger,
      undefined,
      { action: 'answer', id: 'i1', option: 'Redis' },
      { now: 2000, turnsStarted: 2, extraSteps: [], holdMs: 0, comparePage: '', compareInBackground: false },
    )
    if ('stale' in answerPress) throw new Error('Expected the recorded answer press to be current.')
    expect(answerPress.ledger.items).toEqual([])
    expect(answerPress.ledger.closed).toMatchObject([{ id: 'i1', how: 'answered', outcome: 'Redis' }])

    const closeTool = recordClose(CLAUDE_CODE, ledger, { id: 'i1', answer: 'Redis' }, 2000, {
      lastActions: {},
      turnStartedAt: null,
    })
    expect(closeTool.ledger.items).toEqual([])
    expect(closeTool.ledger.closed).toMatchObject([{ id: 'i1', how: 'answered', outcome: 'Redis' }])
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
    const bare = recordItem(CLAUDE_CODE, { ...EMPTY, turn: 1 }, input, 1000, TOOL_FIELDS)
    expect(bare.result).toContain('It has no rec')
    const why = recordItem(
      CLAUDE_CODE,
      bare.ledger,
      { ...input, rec: 'Redis', why: 'because it survives restarts' },
      1100,
      TOOL_FIELDS,
    )
    expect(why.result).not.toContain('It has no')
    expect(why.ledger.items[0]).toMatchObject({ rec: 'Redis', recReason: 'it survives restarts' })
    const kept = applyUpdate(why.ledger, parseReply('UPDATE: i1 | - | Redis')!, 1200, 1)
    expect(kept.items[0]!.recReason).toBe('it survives restarts')
    const moved = applyUpdate(why.ledger, parseReply('UPDATE: i1 | - | Memcached')!, 1200, 1)
    expect(moved.items[0]).toMatchObject({ rec: 'Memcached' })
    expect(moved.items[0]!.recReason).toBeUndefined()
    const task = recordItem(CLAUDE_CODE, EMPTY, { kind: 'task', ask: 'Plug in the test phone' }, 1000, TOOL_FIELDS)
    expect(task.result).toContain('It has no steps')
  })

  test("a question keeps why it came up and what each option does, a record of it again replaces them, and the answer names what's missing", () => {
    const input = { kind: 'question', ask: ask.ask, options: ask.options, rec: 'Redis', why: 'it survives restarts' }
    const bare = recordItem(CLAUDE_CODE, { ...EMPTY, turn: 1 }, input, 1000, TOOL_FIELDS)
    expect(bare.result).toBe(
      'Recorded. The user sees it in the /inbox pane. It has no context or option_notes: record it again with context (why it came up) and option_notes (what picking each option does).',
    )
    const body = { context: 'The price lookups are slow', option_notes: ['Adds a server', ''] }
    const halfNoted = recordItem(CLAUDE_CODE, { ...EMPTY, turn: 1 }, { ...input, ...body }, 1000, TOOL_FIELDS)
    expect(halfNoted.result).toContain(
      'It has no note on "Memcached": record it again with option_notes (what picking each option does).',
    )
    const enriched = recordItem(CLAUDE_CODE, bare.ledger, { ...input, ...body }, 1100, TOOL_FIELDS)
    expect(enriched.result).toBe(
      'Already open as i1, so this record updated it and gave it your context and gave its options your notes. i1 is the only copy and stays open; do not close it to replace it.',
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
      TOOL_FIELDS,
    )
    expect(renoted.ledger.items[0]).toMatchObject({
      context: 'The price lookups are slow',
      optionDescriptions: { Redis: 'Adds a server', Memcached: 'Keeps prices in memory' },
    })

    const approval = { kind: 'question', ask: 'Approve the new settings layout?', options: ['Yes', 'No'] }
    const unseen = recordItem(CLAUDE_CODE, EMPTY, approval, 1000, TOOL_FIELDS)
    expect(unseen.result).toContain(
      "The user can't approve what they can't see: when there is something to look at, record it again with a screenshot, page or file in steps.",
    )
    const seen = recordItem(CLAUDE_CODE, EMPTY, { ...approval, steps: ['/tmp/settings.png'] }, 1000, TOOL_FIELDS)
    expect(seen.result).not.toContain("can't approve")
    const choice = recordItem(CLAUDE_CODE, EMPTY, input, 1000, TOOL_FIELDS)
    expect(choice.result).not.toContain("can't approve")
  })

  test("an agent whose record tool is 0.3.0's is asked only for the fields that tool takes", () => {
    const old = (input: Record<string, unknown>) => recordItem(CLAUDE_CODE, EMPTY, input, 1000, V0_3_TOOL_FIELDS).result
    const question = { kind: 'question', ask: ask.ask, options: ask.options }
    expect(old({ ...question, rec: 'Redis' })).toBe('Recorded. The user sees it in the /inbox pane.')
    expect(old(question)).toBe(
      'Recorded. The user sees it in the /inbox pane. It has no rec: when you can recommend an option, record it again with rec.',
    )
    expect(old({ kind: 'question', ask: 'Approve the new settings layout?', options: ['Yes', 'No'] })).toContain(
      "The user can't approve what they can't see",
    )
    expect(old({ kind: 'task', ask: 'Plug in the test phone' })).toContain('It has no steps')
  })

  test('unanswered questions and tasks stay open past 12 prompts', () => {
    const both = applyUpdate(recorded(), parseReply('NEW: do | - | Sign in to npm | - | -')!, 1500, 1)
    const later = applyUpdate({ ...both, turn: 14 }, parseReply('NONE')!, 2000, 14)
    expect(later.items.map(i => i.id)).toEqual(['i1', 'i2'])
    expect(later.closed).toEqual([])
  })

  test('recorded questions and tasks stay open when asks exceed 20', () => {
    const items = Array.from({ length: 20 }, (_, n) => ({
      ...ask,
      id: 'i' + (n + 1),
      kind: n === 1 ? ('task' as const) : ('question' as const),
      ask: 'Existing ask ' + (n + 1),
      label: null,
      turn: 1,
      at: 1000,
      from: 'record' as const,
    }))
    const full = { ...EMPTY, turn: 1, nextId: 21, items }
    const question = addAgentItem(full, { ...ask, ask: 'Which format?' }, 2000)
    const task = addAgentItem(question.ledger, { ...ask, kind: 'task', ask: 'Sign in to npm', options: [] }, 3000)

    expect(task.ledger.items.map(i => i.id)).toEqual([...items.map(i => i.id), 'i21', 'i22'])
    expect([question.is, task.is]).toEqual(['added', 'added'])
  })

  test('an older saved ledger loads unanswered items and keeps them open', () => {
    const loaded = upgradeLedger({
      ...EMPTY,
      turn: 14,
      nextId: 3,
      items: [
        {
          id: 'i1',
          kind: 'question',
          label: null,
          ask: 'Which cache?',
          options: ['Redis'],
          rec: null,
          helps: [],
          turn: 1,
        },
        { id: 'i2', kind: 'task', label: null, ask: 'Sign in to npm', options: [], rec: null, helps: [], turn: 1 },
      ],
    } as never)
    const later = applyUpdate(loaded, parseReply('NONE')!, 2000, 14)

    expect(loaded.items.map(i => i.from)).toEqual(['update', 'update'])
    expect(later.items.map(i => i.id)).toEqual(['i1', 'i2'])
    expect(later.closed).toEqual([])
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
    const first = recordItem(CLAUDE_CODE, recorded(), { ...record, rec: 'Redis' }, 2000, TOOL_FIELDS)
    const second = recordItem(CLAUDE_CODE, first.ledger, { ...record, rec: 'Memcached' }, 2100, TOOL_FIELDS)
    const unstated = recordItem(CLAUDE_CODE, second.ledger, record, 2200, TOOL_FIELDS)
    const elsewhere = recordItem(
      CLAUDE_CODE,
      second.ledger,
      { ...record, options: ['Valkey'], rec: 'Valkey' },
      2300,
      TOOL_FIELDS,
    )
    expect(
      [first, second, unstated, elsewhere].map(r => [r.ledger.items.map(i => i.rec), r.result, r.personLine]),
    ).toEqual([
      [
        ['Redis'],
        'Already open as i1, so this record updated it and changed its recommendation to Redis. i1 is the only copy and stays open; do not close it to replace it.',
        null,
      ],
      [
        ['Memcached'],
        'Already open as i1, so this record updated it and changed its recommendation to Memcached. i1 is the only copy and stays open; do not close it to replace it.',
        null,
      ],
      [
        ['Memcached'],
        'Already open as i1, so this record updated it. i1 is the only copy and stays open; do not close it to replace it.',
        null,
      ],
      [
        ['Memcached'],
        'Already open as i1, so this record updated it. i1 is the only copy and stays open; do not close it to replace it.',
        null,
      ],
    ])
  })

  test('a reworded duplicate names the kept question and says to leave it open', () => {
    const first = recordItem(
      CLAUDE_CODE,
      EMPTY,
      { kind: 'question', ask: 'Which cache should the product API use?', options: ['Redis', 'Memcached'] },
      2000,
      TOOL_FIELDS,
    )
    const second = recordItem(
      CLAUDE_CODE,
      { ...first.ledger, turn: first.ledger.turn + 1 },
      { kind: 'question', ask: 'Which cache should we use for the product API?', options: ['Redis', 'Memcached'] },
      2100,
      TOOL_FIELDS,
    )

    expect(second.result).toContain('Already open as i1')
    expect(second.result).toContain('i1 is the only copy and stays open; do not close it to replace it.')
    expect(second.ledger.items.map(item => item.id)).toEqual(['i1'])
  })

  test('option caps use the visible label while the press keeps the full link', () => {
    const option = '[PR 7171](https://github.com/anthropics/claude-code/pull/7171)'
    const result = recordItem(
      CLAUDE_CODE,
      EMPTY,
      {
        kind: 'question',
        ask: 'Merge this PR?',
        detail: 'Its [changes](https://github.com/anthropics/claude-code/pull/7171/files) are small.',
        options: [option, 'No'],
        rec: option,
      },
      1000,
    )
    const item = result.ledger.items[0]!
    const actions = actionsOf({ id: item.id, item, finding: null, steps: [] }, undefined, { is: 'open' }, null)
    const answer = pressed(
      result.ledger,
      undefined,
      { action: 'answer', id: item.id, option },
      { now: 1100, turnsStarted: 1, extraSteps: [], holdMs: 0, comparePage: '', compareInBackground: false },
    )
    if ('stale' in answer) throw new Error('Expected the recorded answer to be current.')

    expect(option.length).toBeGreaterThan(60)
    expect(item.options).toEqual([option, 'No'])
    expect(item.rec).toBe(option)
    expect(actions.find(action => action.press.action === 'answer')?.label).toBe('PR 7171')
    expect(answer.last?.text).toBe(option)
    expect(answer.effects).toEqual([])
  })

  test('a record or close gives the person a line naming what it changed, and none when it changed nothing', () => {
    const question = { kind: 'question', ask: 'Which cache should the API use?', options: ['Redis', 'Memcached'] }
    const first = recordItem(CLAUDE_CODE, EMPTY, question, 1000, TOOL_FIELDS)
    expect(first.personLine).toBe('Question: Which cache should the API use?')
    expect(recordItem(CLAUDE_CODE, first.ledger, question, 1100, TOOL_FIELDS).personLine).toBeNull()
    expect(
      recordItem(CLAUDE_CODE, EMPTY, { kind: 'question', ask: 'Ship it?' }, 1000, TOOL_FIELDS).personLine,
    ).toBeNull()
    expect(recordItem(CLAUDE_CODE, EMPTY, { kind: 'task', ask: 'Sign in to npm' }, 1000, TOOL_FIELDS).personLine).toBe(
      'Task: Sign in to npm',
    )

    const finding = { kind: 'finding', title: 'Retry loop never backs off', detail: 'It hammers the API.' }
    const found = recordItem(CLAUDE_CODE, first.ledger, finding, 1200, TOOL_FIELDS)
    expect(found.personLine).toBe('Issue: Retry loop never backs off')
    expect(recordItem(CLAUDE_CODE, found.ledger, finding, 1300, TOOL_FIELDS).personLine).toBeNull()
    expect(
      recordItem(
        CLAUDE_CODE,
        EMPTY,
        { ...finding, finding_kind: 'opportunity', title: 'Cache the token' },
        1200,
        TOOL_FIELDS,
      ).personLine,
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

  test('re-recording reopens agent, inbox and expired closes but refuses user closures', () => {
    const closedByAgent = closeByAgent(
      CLAUDE_CODE,
      recorded(),
      'i1',
      { reason: 'no longer applies: cache dropped' },
      1500,
    )
    const reopened = recordItem(CLAUDE_CODE, closedByAgent.ledger, ask, 2000, TOOL_FIELDS)
    expect(reopened.result).toStartWith('Reopened.')
    expect(reopened.ledger.items).toMatchObject([{ id: 'i2', from: 'record' }])

    for (const how of ['update', 'expired'] as const) {
      const outcome = how === 'update' ? 'done: 回答待ちのまま変更なし' : '回答待ちのまま変更なし'
      const closed = closeItem(recorded(), 'i1', { how, outcome }, 1500)
      const result = recordItem(CLAUDE_CODE, closed, ask, 2000, TOOL_FIELDS)
      expect(result.result).toStartWith('Reopened.')
      expect(result.ledger.items).toMatchObject([{ id: 'i2', from: 'record' }])
    }

    const refusals = [
      [{ how: 'answered', outcome: 'Redis' }, 'Not recorded: the user answered it (Redis).'],
      [{ how: 'update', outcome: 'はい' }, 'Not recorded: the user answered it (はい).'],
      [{ how: 'done', outcome: 'fixed' }, 'Not recorded: the user marked it done.'],
      [{ how: 'dismissed', outcome: 'dismissed' }, 'Not recorded: the user dismissed it.'],
    ] as const
    for (const [closing, result] of refusals)
      expect(
        recordItem(CLAUDE_CODE, closeItem(recorded(), 'i1', closing, 1500), ask, 2000, TOOL_FIELDS).result,
      ).toStartWith(result)
  })
})
