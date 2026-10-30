import { describe, expect, test } from 'claude-code/testing'

import { latestBatch } from '../hooks/model-text'
import { EMPTY, addAgentItem, applyUpdate, closeItem, parseReply } from '../hooks/ledger'
import { REPLY } from './ledger-helpers'

describe('applyUpdate', () => {
  test('numbers new items, closes answered ones, and remembers the batch', () => {
    const first = applyUpdate({ ...EMPTY, turn: 1 }, parseReply(REPLY)!, 1000, 1)
    expect(first.items.map(i => i.id)).toEqual(['i1', 'i2', 'i3'])
    expect(latestBatch(first).length).toBe(3)

    const second = applyUpdate(
      { ...first, turn: 2 },
      parseReply('CLOSED: i1 | yes, renamed\nNEW: decide | - | Push the branch? | - | yes')!,
      2000,
      2,
    )
    expect(second.items.map(i => i.id)).toEqual(['i2', 'i3', 'i4'])
    expect(second.closed).toEqual([
      {
        id: 'i1',
        kind: 'question',
        ask: 'Rename greet.mjs to hello.mjs?',
        label: '1',
        outcome: 'yes, renamed',
        how: 'update',
        at: 2000,
        item: first.items[0],
      },
    ])
    expect(latestBatch(second).map(i => i.id)).toEqual(['i4'])
  })

  test('closes items left unanswered for more than 12 prompts as expired', () => {
    const first = applyUpdate({ ...EMPTY, turn: 1 }, parseReply(REPLY)!, 1, 1)
    const later = applyUpdate({ ...first, turn: 14 }, parseReply('NONE')!, 2, 14)
    expect(later.items.length).toBe(0)
    expect(later.closed.map(d => [d.id, d.outcome])).toEqual([
      ['i1', 'expired, unanswered'],
      ['i2', 'expired, unanswered'],
      ['i3', 'expired, unanswered'],
    ])
    expect(applyUpdate({ ...first, turn: 13 }, parseReply('NONE')!, 2, 13).items.length).toBe(3)
  })

  test('merges a reworded copy of an open item instead of adding it', () => {
    const first = applyUpdate(
      EMPTY,
      parseReply('NEW: decide | 2 | Make release backups use cp -n with a letter suffix? | Yes / No | Yes')!,
      1,
      1,
    )
    const again = applyUpdate(
      first,
      parseReply(
        [
          'NEW: decide | - | Use cp -n and a letter suffix for same-day release backups? | Yes / No | Yes',
          'NEW: decide | - | Also back up CHANGELOG.md before triage? | Yes / No | -',
        ].join('\n'),
      )!,
      2,
      2,
    )
    expect(again.items.map(i => i.ask)).toEqual([
      'Make release backups use cp -n with a letter suffix?',
      'Also back up CHANGELOG.md before triage?',
    ])
  })

  test('an UPDATE line gives an open question new options or a recommendation, and leaves tasks alone', () => {
    const first = applyUpdate(EMPTY, parseReply(REPLY)!, 1, 1)
    const recommended = applyUpdate(first, parseReply('UPDATE: i1 | - | No')!, 2, 2)
    expect(recommended.items[0]).toMatchObject({ options: ['Yes', 'No'], rec: 'No' })

    const unnamed = applyUpdate(recommended, parseReply('UPDATE: i1 | - | rename it later')!, 3, 3)
    expect(unnamed.items[0]).toMatchObject({ options: ['Yes', 'No'], rec: 'No' })

    const narrowed = applyUpdate(recommended, parseReply('UPDATE: i1 | hello.mjs / hello.mts | -')!, 3, 3)
    expect(narrowed.items[0]).toMatchObject({ options: ['hello.mjs', 'hello.mts'], rec: null })

    const task = applyUpdate(first, parseReply('UPDATE: i3 | Done / Skip | Done')!, 2, 2)
    expect(task.items[2]).toEqual(first.items[2])
    expect(applyUpdate(first, parseReply('UPDATE: i9 | A / B | A')!, 2, 2).items).toEqual(first.items)
  })

  test('a question naming a different number, or in another script, is not taken for an open one', () => {
    const first = applyUpdate(EMPTY, parseReply('NEW: decide | - | Approve the PR #41 merge? | Yes / No | -')!, 1, 1)
    const second = applyUpdate(first, parseReply('NEW: decide | - | Approve the PR #42 merge? | Yes / No | -')!, 2, 2)
    expect(second.items.map(i => i.ask)).toEqual(['Approve the PR #41 merge?', 'Approve the PR #42 merge?'])

    const tokyo = applyUpdate(EMPTY, parseReply('NEW: decide | - | 東京に移しますか？ | はい / いいえ | -')!, 1, 1)
    const osaka = applyUpdate(tokyo, parseReply('NEW: decide | - | 大阪に移しますか？ | はい / いいえ | -')!, 2, 2)
    expect(osaka.items.length).toBe(2)
  })

  test('an UPDATE keeps a question that a CLOSED line in the same answer names', () => {
    const first = applyUpdate(EMPTY, parseReply(REPLY)!, 1, 1)
    const both = applyUpdate(
      first,
      parseReply('CLOSED: i1 | renamed\nUPDATE: i1 | hello.mjs / hello.mts | hello.mjs')!,
      2,
      2,
    )
    expect(both.items[0]).toMatchObject({ id: 'i1', options: ['hello.mjs', 'hello.mts'], rec: 'hello.mjs' })
  })

  test('questions in the same frame from one batch are all added, and a later turn restating one is not', () => {
    const question = (ask: string) => ({ kind: 'question' as const, ask, options: [], rec: null, helps: [] })
    const license = addAgentItem(EMPTY, question('Which license do you prefer for greet?'), 1).ledger
    const both = addAgentItem(license, question('Which minimum Node version do you prefer for greet?'), 2)
    expect(both.is).toBe('added')
    expect(addAgentItem({ ...both.ledger, turn: 1 }, question('Which license should greet use?'), 3).is).toBe('open')
    const reply =
      'NEW: decide | - | Which license do you prefer for greet? | MIT / Apache-2.0 | -\nNEW: decide | - | Which minimum Node version do you prefer for greet? | 20 / 18 | -'
    expect(applyUpdate(EMPTY, parseReply(reply)!, 1, 1).items.length).toBe(2)
  })

  test('does not add an item that is already open', () => {
    const first = applyUpdate(EMPTY, parseReply(REPLY)!, 1, 1)
    const again = applyUpdate(first, parseReply('NEW: decide | 1 | rename greet.mjs to hello.mjs | - | -')!, 2, 2)
    expect(again.items.length).toBe(3)
  })

  const repeats: [string, string, number, number][] = [
    [
      'the id of an item closed during the update as its label',
      'NEW: decide | i1 | Something else entirely? | - | -',
      5000,
      0,
    ],
    [
      'the ask of an item closed during the update',
      'NEW: decide | - | Rename greet.mjs to hello.mjs? | - | -',
      5000,
      0,
    ],
    [
      'a restated ask of an item closed during the update',
      'NEW: decide | - | Should greet.mjs be renamed to hello.mjs? | - | -',
      5000,
      0,
    ],
    [
      'the label of an item closed during the update',
      'NEW: decide | 1 | Another question altogether? | - | -',
      5000,
      0,
    ],
    [
      'the label of an item closed before the prompt',
      'NEW: decide | 1 | Another question altogether? | - | -',
      6000,
      1,
    ],
    [
      'the ask of an item answered before the prompt',
      'NEW: decide | - | Rename greet.mjs to hello.mjs? | - | -',
      6000,
      0,
    ],
    ['an unrelated question', 'NEW: decide | 9 | Cut CHANGELOG.md down to this release? | - | -', 5000, 1],
    [
      'a follow-up in the words of an item answered before the prompt',
      'NEW: decide | - | Rename greet.mjs to hello.mjs in the docs too? | - | -',
      6000,
      1,
    ],
  ]
  for (const [name, line, promptAt, added] of repeats)
    test(`a NEW line with ${name} is ${added === 0 ? 'dropped' : 'added'}`, () => {
      const first = applyUpdate(
        { ...EMPTY, turn: 1 },
        parseReply('NEW: decide | 1 | Rename greet.mjs to hello.mjs? | - | -')!,
        1000,
        1,
      )
      const answered = closeItem(first, 'i1', { how: 'answered', outcome: 'yes' }, 5500)
      const next = applyUpdate({ ...answered, turn: 2 }, parseReply(line)!, 7000, 2, promptAt)
      expect(next.items.length).toBe(added)
    })

  test('a follow-up to an answered question is recorded, and a rewording of a dismissed one is not', () => {
    const question = (ask: string) => ({ kind: 'question' as const, ask, options: [], rec: null, helps: [] })
    const asked = addAgentItem({ ...EMPTY, turn: 1 }, question('Which cache should the product API use?'), 1).ledger
    const followUp = question('Which cache size should the product API use?')
    const answered = closeItem(asked, 'i1', { how: 'answered', outcome: 'In-memory' }, 2)
    expect(addAgentItem({ ...answered, turn: 2 }, followUp, 3).is).toBe('added')
    const dismissed = closeItem(asked, 'i1', { how: 'dismissed', outcome: 'dismissed' }, 2)
    expect(addAgentItem({ ...dismissed, turn: 2 }, followUp, 3).is).toBe('closed')
    const reworded = parseReply('NEW: decide | - | Which cache should we use for the product API? | - | -')!
    expect(applyUpdate({ ...dismissed, turn: 2 }, reworded, 4, 2, 3).items).toEqual([])
  })

  test('a dismissed question blocks a rewording of it, but not a question about something else in the same words', () => {
    const question = (ask: string) => ({ kind: 'question' as const, ask, options: [], rec: null, helps: [] })
    for (const [first, reworded, other] of [
      [
        'Which license should package.json use?',
        'Which license should we use in package.json?',
        'Which engines should package.json use?',
      ],
      [
        'Which test runner should we pick?',
        'Which test runner should we choose?',
        'Which test reporter should we pick?',
      ],
      [
        'Should I add a feature flag for the new cache?',
        'Add a feature flag to the cache before merging?',
        'Should I add a feature flag for the new search index?',
      ],
    ] as const) {
      const asked = addAgentItem({ ...EMPTY, turn: 1 }, question(first), 1).ledger
      const dismissed = { ...closeItem(asked, 'i1', { how: 'dismissed', outcome: 'dismissed' }, 2), turn: 2 }
      expect(addAgentItem(dismissed, question(other), 3).is).toBe('added')
      const asksOther = parseReply(`NEW: decide | - | ${other} | - | -`)!
      expect(applyUpdate(dismissed, asksOther, 4, 2, 3).items.map(i => i.ask)).toEqual([other])
      expect(addAgentItem(dismissed, question(reworded), 3).is).toBe('closed')
      const asksReworded = parseReply(`NEW: decide | - | ${reworded} | - | -`)!
      expect(applyUpdate(dismissed, asksReworded, 4, 2, 3).items).toEqual([])
    }
  })

  test('the inbox model can add a question again with choices after the person answered it with List the choices', () => {
    const question = { kind: 'question' as const, ask: 'Where should the job run?', options: [], rec: null, helps: [] }
    const asked = addAgentItem({ ...EMPTY, turn: 1 }, question, 1).ledger
    const reply = parseReply('NEW: decide | - | Where should the job run? | Nightly / Hourly | Nightly')!
    const listed = closeItem(asked, 'i1', { how: 'answered', outcome: 'List the choices' }, 2)
    expect(applyUpdate({ ...listed, turn: 2 }, reply, 4, 2, 3).items.map(i => i.options)).toEqual([
      ['Nightly', 'Hourly'],
    ])
    const other = closeItem(asked, 'i1', { how: 'answered', outcome: 'Nightly' }, 2)
    expect(applyUpdate({ ...other, turn: 2 }, reply, 4, 2, 3).items).toEqual([])
  })

  test('an update that closes an item as no longer applying keeps it open when its reason names nothing that made it moot', () => {
    const open = applyUpdate(
      { ...EMPTY, turn: 1 },
      parseReply('NEW: decide | - | Email failures or post in #ops? | - | -')!,
      1,
      1,
    )
    for (const reason of [
      'not related to this exchange',
      'unrelated, still open',
      'nothing in this exchange touches it',
    ])
      expect(applyUpdate(open, parseReply(`CLOSED: i1 | no longer applies: ${reason}`)!, 2, 2).items.length).toBe(1)
    expect(applyUpdate(open, parseReply('CLOSED: i1 | no longer applies: #ops was archived')!, 2, 2).items).toEqual([])
  })

  test('a NEW line with the ask of an item that expired before the prompt is added', () => {
    const first = applyUpdate(
      { ...EMPTY, turn: 1 },
      parseReply('NEW: decide | 1 | Rename greet.mjs to hello.mjs? | - | -')!,
      1000,
      1,
    )
    const expired = closeItem(first, 'i1', { how: 'expired', outcome: 'expired' }, 5500)
    const next = applyUpdate(
      { ...expired, turn: 2 },
      parseReply('NEW: decide | - | Rename greet.mjs to hello.mjs? | - | -')!,
      7000,
      2,
      6000,
    )
    expect(next.items.length).toBe(1)
  })
})
