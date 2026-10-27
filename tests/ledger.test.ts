import { describe, expect, test } from 'claude-code/testing'

import {
  CLAUDE_CODE,
  MAX_TOOL_DESCRIPTION,
  answerNote,
  buildPrompt,
  carryText,
  guidedCloseDescription,
  latestBatch,
  questionNumbers,
} from '../hooks/model-text'
import {
  EMPTY,
  addAgentItem,
  addFinding,
  applyUpdate,
  closeByAgent,
  closeFinding,
  closeItem,
  closedState,
  parseReply,
  reopenFinding,
  reopenItem,
  tasksRunBy,
  upgradeLedger,
} from '../hooks/ledger'
import { readCommandRow, resetTime, stopKindOf } from '../hooks/claude'
import { herdrTokens } from '../hooks/herdr'
import { parseInline } from '../hooks/inline'
import { EMPTY_OVERVIEW } from '../hooks/overview'
import { applyPress } from '../hooks/presses'
import { emptySession, sessionView } from '../hooks/session'
import { agentTools, recordClose, recordItem } from '../hooks/tools'
import type { Dialog, Item, Ledger, Stop } from '../types'

const REPLY = `NEW: decide | 1 | Rename greet.mjs to hello.mjs? | Yes / No | yes
NEW: decide | 2 | Cut CHANGELOG.md down to this release? | - | -
NEW: do | - | Test pinch zoom on your Mac | - | -`

describe('parseReply', () => {
  test('reads every key of the line format', () => {
    const u = parseReply(REPLY)
    expect(u?.added.map(a => [a.kind, a.label, a.rec])).toEqual([
      ['question', '1', 'Yes'],
      ['question', '2', null],
      ['task', null, null],
    ])
    expect(u?.added[0]?.options).toEqual(['Yes', 'No'])
  })

  test('an answer written after "|" instead of " / " stays an answer, not the recommendation', () => {
    const [item] = parseReply(
      'NEW: decide | - | Which port? | Use another port / Stop docs site | Pick one for me | - | -',
    )!.added
    expect(item?.options).toEqual(['Use another port', 'Stop docs site', 'Pick one for me'])
    expect(item?.rec).toBe(null)
  })

  test('a decide line whose sixth field reads design is a design choice, and a do line never is', () => {
    const added = parseReply(
      [
        'NEW: decide | - | Which layout for settings? | One page / Tabs | Tabs | design',
        'NEW: decide | - | Which region is staging in? | us-east-1 / eu-west-1 | - | -',
        'NEW: do | - | Sign in to the registry | - | - | design',
      ].join('\n'),
    )!.added
    expect(added.map(i => [i.rec, i.isDesignChoice === true])).toEqual([
      ['Tabs', true],
      [null, false],
      [null, false],
    ])
  })

  test('keeps a recommendation only as the answer it names, by its words or its letter', () => {
    const [stray, named] = parseReply(
      [
        'NEW: decide | - | Refuse check commands in Bash? | Refuse / Keep both paths | Pick one for me',
        'NEW: decide | - | Which port? | Use 3001 / Stop docs site | I would use 3001 for now',
      ].join('\n'),
    )!.added
    expect([stray?.rec, named?.rec]).toEqual([null, 'Use 3001'])
    const [lettered] = parseReply('NEW: decide | - | Which cancel UI? | A: Cancel button / B: Manage flow | A')!.added
    expect(lettered?.rec).toBe('A: Cancel button')
  })

  test('a TODO line becomes a question about starting it, unless it rewords an open finding or the reply did it', () => {
    const u = parseReply(
      [
        'TODO: caching the product API responses.',
        'TODO: add install steps to the README',
        'TODO: add a --verbose flag',
        'NEW: decide | - | Which port? | 3000 / 3001 | -',
        'HELP: new 1 | link | https://example.com/ports | ports page',
        'TODO: -',
      ].join('\n'),
      'Added --verbose. See https://example.com/ports',
    )!
    const finding = {
      id: 'f4',
      kind: 'issue' as const,
      title: 'README lacks install steps',
      detail: 'd',
      path: null,
      at: 1,
    }
    const after = applyUpdate({ ...EMPTY, turn: 2, nextId: 5, findings: [finding] }, u, 10, 2)
    expect(after.items.map(i => [i.ask, i.options.join(' / '), i.helps.length])).toEqual([
      ['Which port?', '3000 / 3001', 1],
      ['Ready to start on caching the product API responses?', 'Proceed / Not yet', 0],
    ])
    expect(after.findings.map(f => f.id)).toEqual(['f4'])
  })

  test('a key written as "-" adds nothing', () => {
    const u = parseReply('NEW: do | - | - | - | -')!
    expect(u.added).toEqual([])
  })

  test('NONE is a valid answer that changes nothing, and an empty answer is not', () => {
    const u = parseReply('NONE')!
    expect(u.added).toEqual([])
    expect(u.closed).toEqual([])
    expect(parseReply('')).toBeNull()
  })

  test('keeps HELP lines quoted from the reply, attached to the item they name', () => {
    const reply = [
      'Edit ~/.claude/settings.json and paste:',
      '```',
      'first',
      '```',
      '```json',
      '{ "env": {} }',
      '```',
      'Then run `! node --version` and `npm login`. Docs: https://example.com/tokens',
    ].join('\n')
    const u = parseReply(
      [
        'NEW: do | - | Add the plugin folder to settings.json | - | -',
        'NEW: decide | - | Move the mod into the repo? | Yes / No | Yes',
        'HELP: new 1 | open | ~/.claude/settings.json | -',
        'HELP: new 1 | copy | block 2 | settings snippet',
        'HELP: new 1 | copy | ! node --version | -',
        'HELP: new 1 | run | `! node --version` | -',
        'HELP: new 1 | link | https://example.com/invented | -',
        'HELP: new 2 | open | ~/somewhere/else.md | -',
        'HELP: new 2 | run | npm login | -',
        'HELP: i4 | link | https://example.com/tokens | token page',
      ].join('\n'),
      reply,
    )
    expect(u?.added[0]?.helps).toEqual([
      { kind: 'open', path: '~/.claude/settings.json' },
      { kind: 'copy', text: '{ "env": {} }', name: 'settings snippet' },
      { kind: 'run', command: 'node --version', name: null },
    ])
    expect(u?.added[1]?.helps).toEqual([{ kind: 'terminal', command: 'npm login', name: null }])
    expect(u?.helped).toEqual([
      { id: 'i4', help: { kind: 'link', url: 'https://example.com/tokens', name: 'token page' } },
    ])
  })

  test("only a command that signs in or asks for a password is the person's to run on its own", () => {
    const commands: [string, 'run' | 'terminal'][] = [
      ['gh auth status', 'run'],
      ['npm test -- src/auth', 'run'],
      ['git log -- auth/', 'run'],
      ['./configure && make', 'run'],
      ['aws configure list', 'run'],
      ['curl https://api.example.com/login', 'run'],
      ['npm login', 'terminal'],
      ['gh auth login', 'terminal'],
      ['firebase login:ci', 'terminal'],
      ['sudo apt install jq', 'terminal'],
      ['make build && sudo make install', 'terminal'],
      ['ssh-add ~/.ssh/id_ed25519', 'terminal'],
    ]
    for (const [command, kind] of commands) {
      const u = parseReply(`NEW: decide | - | Run it? | Yes / No | -\nHELP: new 1 | run | ${command} | -`, command)
      expect([command, u?.added[0]?.helps[0]?.kind]).toEqual([command, kind])
    }
  })

  test('a terminal step is a command for the person to run, so it copies instead of asking the agent', () => {
    const reply = 'Only you hold the production credentials, so run `./scripts/migrate --env production` yourself.'
    const u = parseReply(
      [
        'NEW: do | - | Run the production migration | - | -',
        'HELP: new 1 | terminal | ./scripts/migrate --env production | migration',
      ].join('\n'),
      reply,
    )
    expect(u?.added[0]?.helps).toEqual([
      { kind: 'terminal', command: './scripts/migrate --env production', name: 'migration' },
    ])
  })

  test('a terminal step in a reply that gives no reason only the person can run it is the agent’s to run', () => {
    const reply = 'Run `./scripts/load.sh` when you want the data loaded; it takes about a minute.'
    const u = parseReply(
      ['NEW: do | - | Run the load script | - | -', 'HELP: new 1 | terminal | ./scripts/load.sh | load script'].join(
        '\n',
      ),
      reply,
    )
    expect(u?.added[0]?.helps).toEqual([{ kind: 'run', command: './scripts/load.sh', name: 'load script' }])
  })

  test('reads only the last answer when the model corrects itself and answers again', () => {
    const u = parseReply(
      [
        'NEW: do | - | Merge PR #41 | - | -',
        'CLOSED: i1 | yes',
        'Wait: that is not a new item. Corrected answer:',
        'NONE',
      ].join('\n'),
    )
    expect(u?.added).toEqual([])
    expect(u?.closed).toEqual([])
  })

  test('prose that only starts like a key is not a key', () => {
    expect(parseReply('NEWLY added: the parser\nUPDATED: the docs\nNEWS: none\nTODOS later')).toBeNull()
    expect(parseReply('NONE of the above')).not.toBeNull()
  })

  test('a step whose command holds "|" keeps the whole command', () => {
    const reply = 'Run `npm test | tee out.log` and send me the file.'
    const named = parseReply(
      [
        'NEW: decide | - | Run the tests? | Yes / No | -',
        'HELP: new 1 | run | npm test | tee out.log | test command',
      ].join('\n'),
      reply,
    )
    expect(named?.added[0]?.helps).toEqual([{ kind: 'run', command: 'npm test | tee out.log', name: 'test command' }])
    const unnamed = parseReply(
      ['NEW: decide | - | Run the tests? | Yes / No | -', 'HELP: new 1 | run | npm test | tee out.log'].join('\n'),
      reply,
    )
    expect(unnamed?.added[0]?.helps).toEqual([{ kind: 'run', command: 'npm test | tee out.log', name: null }])
  })

  test('an open step needs a path the reply names on its own, not a bare word', () => {
    const reply = 'The old migrations folder is unused. I left a note in docs/notes.md and the script in tools/run.sh.'
    const u = parseReply(
      [
        'NEW: decide | - | Delete the migrations folder? | Delete it / Keep it | -',
        'HELP: new 1 | open | migrations | -',
        'HELP: new 1 | open | docs/notes.md | -',
        'HELP: new 1 | open | notes.md | -',
        'HELP: new 1 | open | ols/run.sh | -',
      ].join('\n'),
      reply,
    )
    expect(u?.added[0]?.helps).toEqual([
      { kind: 'open', path: 'docs/notes.md' },
      { kind: 'open', path: 'notes.md' },
    ])
  })

  test('HELP "new N" counts every NEW line, including one dropped for having no ask', () => {
    const reply = 'Open docs/notes.md first.'
    const u = parseReply(
      [
        'NEW: decide | - | - | - | -',
        'NEW: decide | - | Keep the notes? | Yes / No | -',
        'HELP: new 2 | open | docs/notes.md | -',
      ].join('\n'),
      reply,
    )
    expect(u?.added[0]?.helps).toEqual([{ kind: 'open', path: 'docs/notes.md' }])
  })

  test('a NEW line that leaves out the label keeps its ask and its steps', () => {
    const reply = 'Run this on your phone:\n```\nnpm run ios -- --device\n```'
    const u = parseReply(
      [
        'NEW: do | Run the iPhone command, then tap through the cancel flow | - | - | -',
        'NEW: decide | D3 | - | - | -',
        'HELP: new 1 | terminal | block 1 | iPhone run',
      ].join('\n'),
      reply,
    )
    expect(u?.added.map(a => [a.ask, a.label, a.helps.map(h => h.kind)])).toEqual([
      ['Run the iPhone command, then tap through the cancel flow', null, ['terminal']],
    ])
  })

  test('returns null for prose with no keys', () => {
    expect(parseReply('Sure! Here is the ledger you asked for.')).toBe(null)
  })
})

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
    const asked = addAgentItem({ ...EMPTY, turn: 1 }, question('Which license should package.json use?'), 1).ledger
    const dismissed = { ...closeItem(asked, 'i1', { how: 'dismissed', outcome: 'dismissed' }, 2), turn: 2 }
    const engines = 'Which engines should package.json use?'
    expect(addAgentItem(dismissed, question(engines), 3).is).toBe('added')
    const asksEngines = parseReply(`NEW: decide | - | ${engines} | - | -`)!
    expect(applyUpdate(dismissed, asksEngines, 4, 2, 3).items.map(i => i.ask)).toEqual([engines])
    const reworded = 'Which license should we use in package.json?'
    expect(addAgentItem(dismissed, question(reworded), 3).is).toBe('closed')
    const asksReworded = parseReply(`NEW: decide | - | ${reworded} | - | -`)!
    expect(applyUpdate(dismissed, asksReworded, 4, 2, 3).items).toEqual([])
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

  test('a NEW line of its kind in the turn it was recorded adds nothing, and one that restates it adds its steps', () => {
    const other = parseReply('NEW: decide | - | Ship the release today? | Yes / No | -')!
    expect(applyUpdate(recorded(3), other, 2000, 3).items.map(i => i.id)).toEqual(['i1'])
    expect(applyUpdate(recorded(3), other, 2000, 4).items.map(i => i.id)).toEqual(['i1', 'i2'])
    const restated = parseReply(
      'NEW: decide | - | Which cache should the API use? | Redis / Memcached | -\nHELP: new 1 | link | https://redis.io | docs',
    )!
    expect(applyUpdate(recorded(3), restated, 2000, 3).items.map(i => [i.id, i.helps])).toEqual([
      ['i1', [{ kind: 'link', url: 'https://redis.io/', name: 'docs' }]],
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
    const again = recordClose(CLAUDE_CODE, dismissed, { id: 'f1', reason: 'fixed' }, 9)
    expect(again.result).toBe('Already closed: the user dismissed it.')
    expect(again.ledger).toBe(dismissed)
    const fixed = closeFinding(open, 'f1', { how: 'update', outcome: 'fixed in the theme' }, 5)
    expect(recordClose(CLAUDE_CODE, fixed, { id: 'f1', reason: 'x' }, 9).result).toBe(
      'Already closed: the inbox closed it (fixed in the theme).',
    )
    const expired = closeFinding(open, 'f1', { how: 'expired', outcome: 'list full' }, 5)
    expect(recordClose(CLAUDE_CODE, expired, { id: 'f1', reason: 'x' }, 9).result).toBe('Already closed: it expired.')
    expect(recordClose(CLAUDE_CODE, expired, { id: 'f7', reason: 'x' }, 9).result).toContain('Not closed:')
  })

  test('Claude and the per-turn update close findings with how and outcome, and the update closes one only as fixed', () => {
    const finding = { kind: 'issue' as const, title: 'Hotkeys vanish', detail: 'In ANSI', path: null, at: 1 }
    const open = addFinding(addFinding(EMPTY, finding).ledger, { ...finding, title: 'Tabs unreadable' }).ledger
    const answered = closeByAgent(CLAUDE_CODE, open, 'f1', { answer: 'leave it' }, 5)
    expect(answered.closed).toBe('finding')
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
    expect(addFinding(dismissed, { ...finding, title: 'Tabs unreadable' }).isAdded).toBe(true)
    for (const closing of [
      { how: 'expired' as const, outcome: 'list full' },
      { how: 'update' as const, outcome: 'fixed in the theme' },
    ]) {
      const r = addFinding(closeFinding(open, 'f1', closing, 5), finding)
      expect([r.isAdded, r.dismissed]).toEqual([true, null])
    }
  })

  test('a dismissed finding does not block one about a different subject in the same words', () => {
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

describe('answerNote', () => {
  const ledger = applyUpdate({ ...EMPTY, turn: 1 }, parseReply(REPLY)!, 1, 1)

  test('maps numbered answers to the latest batch by label', () => {
    const note = answerNote({ ...ledger, turn: 2 }, '1. yes\n2. keep it')
    expect(note).toContain('1 → "Rename greet.mjs to hello.mjs?"')
    expect(note).toContain('2 → "Cut CHANGELOG.md down to this release?"')
  })

  test('maps answers written on one line', () => {
    const note = answerNote({ ...ledger, turn: 2 }, '1. node 2. yes')
    expect(note).toContain('2 → "Cut CHANGELOG.md down to this release?"')
  })

  test('does not read a number mid-sentence as an answer', () => {
    expect(answerNote({ ...ledger, turn: 2 }, 'i was looking at bullet 2. it reads oddly')).toBe(null)
  })

  test('offers the recommendations for a bare "go"', () => {
    expect(answerNote({ ...ledger, turn: 2 }, 'go')).toContain('recommended: Yes')
  })

  test('ignores numbers once the batch is a turn old', () => {
    expect(answerNote({ ...ledger, turn: 3 }, '1. yes')).toBe(null)
  })

  test('says nothing for an ordinary prompt', () => {
    expect(answerNote({ ...ledger, turn: 2 }, 'can you also fix the toolbar?')).toBe(null)
  })
})

describe('questionNumbers', () => {
  const batch = applyUpdate(
    { ...EMPTY, turn: 1 },
    parseReply(
      [
        'NEW: decide | - | Rename greet.mjs? | Yes / No | -',
        'NEW: do | - | Test pinch zoom | - | -',
        'NEW: decide | - | Cut CHANGELOG.md? | Yes / No | -',
      ].join('\n'),
    )!,
    1,
    1,
  )

  test('numbers questions by their place in the whole batch, as answerNote reads "3. yes"', () => {
    expect([...questionNumbers(batch, 2)]).toEqual([
      ['i1', 1],
      ['i3', 3],
    ])
    expect(answerNote({ ...batch, turn: 2 }, '3. yes')).toContain('3 → "Cut CHANGELOG.md?"')
  })

  test('numbers only labeled items when any label has a number', () => {
    const labeled = { ...batch, items: batch.items.map(i => (i.id === 'i2' ? { ...i, label: '2' } : i)) }
    expect([...questionNumbers(labeled, 2)]).toEqual([])
    const both = { ...batch, items: batch.items.map(i => (i.id === 'i3' ? { ...i, label: 'D4' } : i)) }
    expect([...questionNumbers(both, 2)]).toEqual([['i3', 4]])
    const anId = { ...batch, items: batch.items.map(i => (i.id === 'i3' ? { ...i, label: 'f235 report' } : i)) }
    expect([...questionNumbers(anId, 2)].map(([, n]) => n)).not.toContain(235)
  })

  test('numbers nothing once the batch is a turn old', () => {
    expect(questionNumbers(batch, 3).size).toBe(0)
  })
})

describe('buildPrompt', () => {
  test('a long reply keeps its opening and its closing question, and long activity keeps its latest lines', () => {
    const reply = `Summary of the work.\n${'Detail line.\n'.repeat(2000)}Ship it now, or wait for review?`
    const activity = Array.from({ length: 400 }, (_, i) => `edited file-${i}.ts`)
    const ex = { person: 'go', trigger: null, activity, reply, turn: 1, press: null, screen: '', tasks: [] }
    const prompt = buildPrompt(EMPTY, ex)
    expect(prompt).toContain('Summary of the work.')
    expect(prompt).toContain('Ship it now, or wait for review?')
    expect(prompt).toContain('edited file-399.ts')
    expect(prompt).toContain('…[cut]')
  })
})

describe('guidedCloseDescription', () => {
  test('stays within the length Claude Code sends of a tool description', () => {
    const close = agentTools(CLAUDE_CODE).find(t => t.name === 'close')!
    expect(guidedCloseDescription(CLAUDE_CODE, close.description).length).toBeLessThanOrEqual(MAX_TOOL_DESCRIPTION)
  })
})

describe('carryText', () => {
  test('is empty for an empty ledger and lists open items otherwise', () => {
    expect(carryText(EMPTY, 'T')).toBe(null)
    const text = carryText(applyUpdate(EMPTY, parseReply(REPLY)!, 1, 1), 'T')
    expect(text).toContain('(1) "Rename greet.mjs to hello.mjs?"')
  })
})

describe("the person's own commands", () => {
  test('reads a ! command, its output and a slash command from their transcript rows', () => {
    expect(readCommandRow('<bash-input>npm login</bash-input>')).toEqual({ kind: 'shell', command: 'npm login' })
    expect(readCommandRow('<bash-stdout>Logged in</bash-stdout><bash-stderr></bash-stderr>')).toEqual({
      kind: 'output',
      stdout: 'Logged in',
      stderr: '',
    })
    expect(
      readCommandRow(
        '<command-name>/context</command-name>\n<command-message>context</command-message>\n<command-args></command-args>',
      ),
    ).toEqual({
      kind: 'slash',
      name: 'context',
      args: '',
    })
    expect(readCommandRow('add a greeting cli')).toBeNull()
  })

  test('a command closes only the task whose step is that exact command', () => {
    const reply = 'Run `npm login`, then `npm publish`.'
    const ledger = applyUpdate(
      EMPTY,
      parseReply(
        'NEW: do | - | Sign in to npm | - | -\nHELP: new 1 | run | npm login | sign-in\nNEW: do | - | Publish the package | - | -\nHELP: new 2 | run | npm publish | publish',
        reply,
      )!,
      1,
      1,
    )
    expect(tasksRunBy(ledger, '  npm   login ').map(i => i.ask)).toEqual(['Sign in to npm'])
    expect(tasksRunBy(ledger, 'npm login --scope=@me')).toEqual([])
  })
})

describe('the Herdr status line', () => {
  const statusOf = (ledger: Ledger, stop: Stop | null, dialogs: Dialog[]) =>
    herdrTokens(ledger, stop, sessionView({ ...emptySession(), ledger }, 3, 0, false), dialogs).inbox ?? ''

  test('names the first waiting item after the count, and the session’s goal when nothing waits', () => {
    const waiting = applyUpdate(EMPTY, parseReply(REPLY)!, 1, 1)
    expect(statusOf(waiting, null, [])).toBe('3 · Rename greet.mjs to hello.mjs?')
    const settled = applyUpdate(waiting, parseReply('CLOSED: i1 | yes\nCLOSED: i2 | no\nCLOSED: i3 | done')!, 2, 2)
    expect(statusOf(settled, null, [])).toBe('')
    const described = { ...settled, overview: { ...EMPTY_OVERVIEW, goal: 'Merge the reducer' } }
    expect(statusOf(described, null, [])).toBe('Merge the reducer')
    expect(statusOf(EMPTY, null, [])).toBe('')
  })

  test('puts a stop and its fix first, then an open dialog', () => {
    const waiting = applyUpdate(EMPTY, parseReply(REPLY)!, 1, 1)
    const dialog = { kind: 'permission' as const, text: 'push main to origin', key: 'Bash command=git push' }
    expect(statusOf(waiting, null, [dialog])).toBe('Allow push main to origin?')
    expect(
      statusOf(
        waiting,
        { kind: stopKindOf('authentication_failed', ''), detail: 'authentication_failed', resets: null, at: 1 },
        [dialog],
      ),
    ).toBe('! Signed out: /login')
  })

  test('tells a reached usage limit, with its reset time, from a busy server', () => {
    const limit = "You've hit your weekly limit · resets 7:33pm (America/Los_Angeles)"
    expect(stopKindOf('rate_limit', limit)).toBe('usage-limit')
    expect(statusOf(EMPTY, { kind: 'usage-limit', detail: 'rate_limit', resets: resetTime(limit), at: 1 }, [])).toBe(
      '! Limit: resets 7:33pm',
    )
    expect(stopKindOf('rate_limit', 'API Error: Server is temporarily limiting requests (not your usage limit)')).toBe(
      'api-error',
    )
  })
})

describe('parseInline', () => {
  test('reads bold, italic, strikethrough, code and https links, and leaves unmatched markers as text', () => {
    expect(parseInline('Run `npm **test**`, **not *this***, ~~old~~ and [docs](https://example.com/a).')).toEqual([
      { text: 'Run ' },
      { text: 'npm **test**', code: true },
      { text: ', ' },
      { text: 'not ', bold: true },
      { text: 'this', bold: true, italic: true },
      { text: ', ' },
      { text: 'old', strike: true },
      { text: ' and ' },
      { text: 'docs', link: 'https://example.com/a' },
      { text: '.' },
    ])
    expect(parseInline('a ** b, 2 * 3 * 4, snake_case_name, [x](javascript:alert(1)) and `open')).toEqual([
      { text: 'a ** b, 2 * 3 * 4, snake_case_name, [x](javascript:alert(1)) and `open' },
    ])
  })
})
