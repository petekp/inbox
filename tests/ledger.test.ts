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
  listResults,
  stampPressTurn,
  parseReply,
  reopenFinding,
  reopenItem,
  tasksRunBy,
  upgradeLedger,
} from '../hooks/ledger'
import { readCommandRow, resetTime, statusLine, stopKindOf } from '../hooks/claude'
import { parseInline } from '../hooks/inline'
import { applyPress } from '../hooks/presses'
import { agentTools, recordClose, recordItem } from '../hooks/tools'
import type { Item } from '../types'

const REPLY = `GOAL: Move annotation queue logic into a tested reducer
DONE: Reducer built on its own branch
DONE: 422 unit tests pass
NOW: Waiting on approval to run input tests
RUNNING: vite dev: http://localhost:5173
NEW: decide | 1 | Rename greet.mjs to hello.mjs? | Yes / No | yes
NEW: decide | 2 | Cut CHANGELOG.md down to this release? | - | -
NEW: do | - | Test pinch zoom on your Mac | - | -`

describe('parseReply', () => {
  test('reads every key of the line format', () => {
    const u = parseReply(REPLY)
    expect(u?.card.goal).toBe('Move annotation queue logic into a tested reducer')
    expect(u?.done).toEqual(['Reducer built on its own branch', '422 unit tests pass'])
    expect(u?.card.running).toEqual(['vite dev: http://localhost:5173'])
    expect(u?.added.map(a => [a.kind, a.label, a.rec])).toEqual([
      ['question', '1', 'Yes'],
      ['question', '2', null],
      ['task', null, null],
    ])
    expect(u?.added[0]?.options).toEqual(['Yes', 'No'])
  })

  test('an answer written after "|" instead of " / " stays an answer, not the recommendation', () => {
    const [item] = parseReply(
      'NEW: decide | - | Which port? | Use another port / Stop docs site | Pick one for me | -',
    )!.added
    expect(item?.options).toEqual(['Use another port', 'Stop docs site', 'Pick one for me'])
    expect(item?.rec).toBe(null)
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

  test('a key written as "-" adds nothing and keeps the card', () => {
    const u = parseReply('GOAL: -\nNOW: -\nDONE: -\nRUNNING: -\nNEW: do | - | - | - | -')!
    expect(u.added).toEqual([])
    expect(u.card).toEqual({ goal: '', now: '', running: [] })
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
        'GOAL: Ship the greeting CLI',
        'DONE: Arg parser fixed',
        'NEW: do | - | Merge PR #41 | - | -',
        'Wait: that is not a new item. Corrected answer:',
        'GOAL: Ship the greeting CLI',
        'DONE: Arg parser fixed',
        'NOW: Release build running',
      ].join('\n'),
    )
    expect(u?.done).toEqual(['Arg parser fixed'])
    expect(u?.added).toEqual([])
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
      parseReply('GOAL: same\nNOW: renamed\nCLOSED: i1 | yes, renamed\nNEW: decide | - | Push the branch? | - | yes')!,
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
    expect(second.milestones.filter(m => m.source === 'done')).toEqual(first.milestones)
    expect(second.milestones.at(-1)).toMatchObject({ source: 'answered', ref: 'i1', detail: 'yes, renamed' })
  })

  test('closes items left unanswered for more than 12 prompts as expired', () => {
    const first = applyUpdate({ ...EMPTY, turn: 1 }, parseReply(REPLY)!, 1, 1)
    const later = applyUpdate({ ...first, turn: 14 }, parseReply('NOW: still going')!, 2, 14)
    expect(later.items.length).toBe(0)
    expect(later.closed.map(d => [d.id, d.outcome])).toEqual([
      ['i1', 'expired, unanswered'],
      ['i2', 'expired, unanswered'],
      ['i3', 'expired, unanswered'],
    ])
    expect(applyUpdate({ ...first, turn: 13 }, parseReply('NOW: still going')!, 2, 13).items.length).toBe(3)
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
    const later = applyUpdate({ ...both, turn: 14 }, parseReply('NOW: still going')!, 2000, 14)
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
    expect(addFinding(dismissed, { ...finding, title: 'Hotkeys disappear in ANSI mode' }).isAdded).toBe(false)
    expect(addFinding(dismissed, { ...finding, title: 'Tabs unreadable' }).isAdded).toBe(true)
    for (const closing of [
      { how: 'expired' as const, outcome: 'list full' },
      { how: 'update' as const, outcome: 'fixed in the theme' },
    ]) {
      const r = addFinding(closeFinding(open, 'f1', closing, 5), finding)
      expect([r.isAdded, r.dismissed]).toEqual([true, null])
    }
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
  const ctx = { now: 9, turnsStarted: 1, extraSteps: [] }
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
    const ledger = applyUpdate(asked(), parseReply('GOAL: g\nCLOSED: i2 | the person put it off for later')!, 8, 2)
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

describe('milestones', () => {
  const update = (ledger: typeof EMPTY, reply: string, now: number, isCatchUp = false) =>
    applyUpdate(ledger, parseReply(reply)!, now, ledger.turn, now, isCatchUp)
  const asked = update(
    { ...EMPTY, turn: 1 },
    'GOAL: Rename the greeting script\nNEW: decide | 1 | Rename greet.mjs to hello.mjs? | Yes / No | yes',
    1,
  )

  test('an old card.done seeds milestones with no time, and the card keeps it', () => {
    const saved = { ...EMPTY, card: { goal: 'g', done: ['A done', 'B done'], now: '', running: [] } }
    const upgraded = upgradeLedger(saved)

    expect(upgraded.milestones.map(m => [m.text, m.source, m.at])).toEqual([
      ['A done', 'done', null],
      ['B done', 'done', null],
    ])
    expect(upgraded.card?.done).toEqual(['A done', 'B done'])
  })

  test('a result an older build wrote only to the card is added to a saved list, once', () => {
    const saved = update(asked, 'DONE: Reducer built', 5)
    const olderBuild = { ...saved, card: { ...saved.card!, done: ['Reducer built', 'Tests added'] } }
    const upgraded = upgradeLedger(olderBuild)

    expect(upgraded.milestones.map(m => [m.text, m.at])).toEqual([
      ['Tests added', null],
      ['Reducer built', 5],
    ])
    expect(upgradeLedger(upgraded).milestones).toEqual(upgraded.milestones)
  })

  test('card.done is the newest four results, oldest first', () => {
    const ledger = ['One', 'Two', 'Three', 'Four', 'Five'].reduce(
      (l, text, n) => update(l, `DONE: ${text}`, n + 1),
      asked,
    )

    expect(ledger.card?.done).toEqual(['Two', 'Three', 'Four', 'Five'])
    expect(ledger.milestones.filter(m => m.source === 'done')).toHaveLength(5)
  })

  test('an update keeps the newest three DONE lines, and a catch-up the newest six', () => {
    const reply = [1, 2, 3, 4, 5, 6, 7].map(n => `DONE: Result number ${n}`).join('\n')

    expect(update(asked, reply, 5).milestones.map(m => m.text)).toEqual([
      'Result number 5',
      'Result number 6',
      'Result number 7',
    ])
    expect(update(asked, reply, 5, true).milestones.map(m => m.text)).toEqual([
      'Result number 2',
      'Result number 3',
      'Result number 4',
      'Result number 5',
      'Result number 6',
      'Result number 7',
    ])
  })

  test('an answer adds a milestone and reopening the question removes it', () => {
    const answered = closeItem(asked, 'i1', { how: 'answered', outcome: 'Yes, rename it' }, 5)
    expect(answered.milestones.map(m => [m.source, m.ref, m.detail])).toEqual([['answered', 'i1', 'Yes, rename it']])

    expect(reopenItem(answered, 'i1').milestones).toEqual([])
  })

  test('a bare yes, a put-off and a Proceed question add no milestone', () => {
    expect(closeItem(asked, 'i1', { how: 'answered', outcome: 'Yes' }, 5).milestones).toEqual([])
    expect(closeItem(asked, 'i1', { how: 'answered', outcome: 'Not yet' }, 5).milestones).toEqual([])
    const todo = update({ ...EMPTY, turn: 1 }, 'GOAL: g\nTODO: Write the migration', 2)
    expect(closeItem(todo, 'i1', { how: 'answered', outcome: 'Proceed' }, 5).milestones).toEqual([])
  })

  test('asking for the choices adds no milestone, and the answer to the re-asked question adds one', () => {
    const listed = closeItem(asked, 'i1', { how: 'answered', outcome: 'List the choices' }, 5)
    expect(listed.milestones).toEqual([])

    const again = update(
      listed,
      'GOAL: g\nNEW: decide | - | Rename greet.mjs to hello.mjs? | Yes, rename / No, keep | -',
      6,
    )
    const answered = closeItem(again, 'i2', { how: 'answered', outcome: 'Yes, rename' }, 7)
    expect(answered.milestones.map(m => [m.source, m.ref, m.detail])).toEqual([['answered', 'i2', 'Yes, rename']])
  })

  test('a CLOSED line with the answer adds one, and a done: line adds none', () => {
    const answered = update(asked, 'GOAL: g\nCLOSED: i1 | Yes, rename it', 5)
    expect(answered.milestones.map(m => [m.source, m.ref])).toEqual([['answered', 'i1']])

    const done = update(asked, 'GOAL: g\nCLOSED: i1 | done: renamed it', 5)
    expect(done.milestones).toEqual([])
  })

  test('a fixed finding adds a milestone, and reopening the finding removes it', () => {
    const recorded = addFinding(asked, {
      kind: 'issue',
      title: 'Greeting script ignores flags',
      detail: '',
      path: null,
      at: 2,
    }).ledger
    const fixed = update(recorded, 'GOAL: g\nFIXED: f2 | Parsed the flags', 5)
    expect(fixed.milestones.map(m => [m.source, m.text, m.detail, m.ref])).toEqual([
      ['fixed', 'Greeting script ignores flags', 'Parsed the flags', 'f2'],
    ])

    expect(reopenFinding(fixed, 'f2').milestones).toEqual([])
  })

  test('a finding that no longer applies adds no milestone', () => {
    const recorded = addFinding(asked, {
      kind: 'issue',
      title: 'Greeting script ignores flags',
      detail: '',
      path: null,
      at: 2,
    }).ledger

    expect(update(recorded, 'GOAL: g\nFIXED: f2 | no longer applies: script removed', 5).milestones).toEqual([])
  })

  test('a result worded the same apart from case and punctuation is not added twice', () => {
    const once = update(asked, 'DONE: Fixed login redirect bug', 2)
    const twice = update(once, 'DONE: fixed login redirect bug!', 3)

    expect(twice.milestones.map(m => m.text)).toEqual(['Fixed login redirect bug'])
  })

  test('two different results that share most of their words both stay', () => {
    const ledger = update(asked, 'DONE: Fixed login redirect bug\nDONE: Fixed signup redirect bug', 2)

    expect(ledger.milestones.map(m => m.text)).toEqual(['Fixed login redirect bug', 'Fixed signup redirect bug'])
  })

  test('the lines of one update get later times, and a catch-up gives its lines no time', () => {
    const live = update(asked, 'DONE: First result\nDONE: Second result', 10)
    const caught = update(asked, 'DONE: First result\nDONE: Second result', 10, true)
    const [first, second] = live.milestones

    expect(second!.at!).toBeGreaterThan(first!.at!)
    expect(caught.milestones.map(m => m.at)).toEqual([null, null])
  })

  test('past 200 milestones the oldest goes, and one with no time goes before a timed one', () => {
    const untimed = Array.from({ length: 5 }, (_, n) => `Old result ${n}`)
    const seeded = upgradeLedger({ ...EMPTY, card: { goal: 'g', done: untimed, now: '', running: [] } })
    const full = Array.from({ length: 195 }, (_, n) => `Result ${n}`).reduce(
      (l, text, n) => update(l, `DONE: ${text}`, 100 + n),
      seeded,
    )
    expect(full.milestones).toHaveLength(200)

    const over = update(full, 'DONE: The newest result', 1000)
    expect(over.milestones).toHaveLength(200)
    expect(over.milestones.map(m => m.text)).not.toContain('Old result 0')
    expect(over.milestones.map(m => m.text)).toContain('Old result 1')
    expect(over.milestones.map(m => m.text)).toContain('Result 0')
    expect(over.milestones.at(-1)?.text).toBe('The newest result')
  })
})

describe('listResults', () => {
  const asked = applyUpdate(
    { ...EMPTY, turn: 3 },
    parseReply('GOAL: g\nNEW: decide | 1 | Which license should the CLI use? | MIT / Apache-2.0 | MIT')!,
    1,
    3,
  )
  const withFinding = addFinding(asked, {
    kind: 'issue',
    title: 'README has no install steps',
    detail: '',
    path: null,
    at: 1,
  }).ledger
  const update = (ledger: typeof EMPTY, reply: string, now: number) =>
    applyUpdate(ledger, parseReply(reply)!, now, ledger.turn, now)

  test('a DONE line about the work behind an answer merges into the answer', () => {
    const ledger = update(withFinding, 'GOAL: g\nCLOSED: i1 | MIT\nDONE: Added MIT license and package entry', 5)

    expect(listResults(ledger.milestones).map(r => [r.source, r.merged])).toEqual([
      ['answered', ['Added MIT license and package entry']],
    ])
  })

  test('DONE lines about a fix merge into the fixed result, and an unrelated one stays', () => {
    const ledger = update(
      withFinding,
      'GOAL: g\nFIXED: f2 | Added Install section\nDONE: Wrote the README install steps\nDONE: Added install steps to README\nDONE: Bumped the lockfile',
      5,
    )

    expect(listResults(ledger.milestones).map(r => [r.source, r.text, r.merged])).toEqual([
      ['done', 'Bumped the lockfile', []],
      ['fixed', 'README has no install steps', ['Wrote the README install steps', 'Added install steps to README']],
    ])
  })

  test('a button-press answer merges with the DONE line of the turn that follows it', () => {
    const r = applyPress(
      asked,
      undefined,
      { action: 'answer', id: 'i1', option: 'MIT' },
      {
        now: 5,
        turnsStarted: 3,
        extraSteps: [],
      },
    )
    if ('stale' in r) throw new Error('stale')
    expect(r.ledger.milestones[0]?.turn).toBeUndefined()
    const arrived = { ...stampPressTurn(r.ledger, 'i1', 4), turn: 4 }
    const ledger = update(arrived, 'GOAL: g\nDONE: Added MIT license file', 6)

    expect(listResults(ledger.milestones).map(r => [r.source, r.merged])).toEqual([
      ['answered', ['Added MIT license file']],
    ])
  })

  test('a button-press answer whose message has not arrived merges with nothing', () => {
    const r = applyPress(
      asked,
      undefined,
      { action: 'answer', id: 'i1', option: 'MIT' },
      {
        now: 5,
        turnsStarted: 3,
        extraSteps: [],
      },
    )
    if ('stale' in r) throw new Error('stale')
    const ledger = update({ ...r.ledger, turn: 4 }, 'GOAL: g\nDONE: Added MIT license file', 6)

    expect(listResults(ledger.milestones).map(r => r.source)).toEqual(['done', 'answered'])
  })

  test('a done line that shares only a generic verb with a fix stays apart', () => {
    const fixed = update(
      withFinding,
      'GOAL: g\nFIXED: f2 | Added an Install section to the README with the npm command',
      5,
    )
    const both = update(fixed, 'GOAL: g\nDONE: Added install tests for the CLI', 6)
    expect(listResults(both.milestones).map(r => r.source)).toEqual(['done', 'fixed'])
  })

  test('results of different turns, results with no turn and results with other numbers never merge', () => {
    const answered = closeItem(asked, 'i1', { how: 'answered', outcome: 'MIT' }, 5)
    const later = update({ ...answered, turn: 4 }, 'GOAL: g\nDONE: Added MIT license file', 6)
    expect(listResults(later.milestones).map(r => r.source)).toEqual(['done', 'answered'])

    const untimed = { ...answered, milestones: answered.milestones.map(({ turn: _turn, ...m }) => m) }
    const same = update(untimed, 'GOAL: g\nDONE: Added MIT license file', 6)
    expect(listResults(same.milestones).map(r => r.source)).toEqual(['done', 'answered'])

    const numbered = applyUpdate(
      { ...EMPTY, turn: 3 },
      parseReply('GOAL: g\nNEW: decide | - | Which port for server 8080? | 8080 / 9090 | 8080')!,
      1,
      3,
    )
    const port = update(
      closeItem(numbered, 'i1', { how: 'answered', outcome: '8080' }, 5),
      'GOAL: g\nDONE: Opened port 9090 for server',
      6,
    )
    expect(listResults(port.milestones).map(r => r.source)).toEqual(['done', 'answered'])
  })

  test('a catch-up result has no turn and stays apart', () => {
    const answered = closeItem(asked, 'i1', { how: 'answered', outcome: 'MIT' }, 5)
    const caught = applyUpdate(answered, parseReply('GOAL: g\nDONE: Added MIT license file')!, 6, 3, 6, true)

    expect(listResults(caught.milestones).map(r => r.source)).toEqual(['done', 'answered'])
  })
})

describe('milestones at the cap', () => {
  const full = (isTimed: boolean) => ({
    ...EMPTY,
    turn: 1,
    milestones: Array.from({ length: 200 }, (_, n) => ({
      id: `m${n + 1}`,
      source: 'done' as const,
      text: `Result ${n}`,
      detail: null,
      ref: null,
      at: isTimed ? 100 + n : null,
    })),
  })

  test('a catch-up on a full list keeps its six results and drops the oldest by place', () => {
    const lines = [1, 2, 3, 4, 5, 6].map(n => `DONE: Caught up ${n}`).join('\n')
    const caught = applyUpdate(full(true), parseReply(`GOAL: g\n${lines}`)!, 1000, 1, 1000, true)

    expect(caught.milestones).toHaveLength(200)
    expect(caught.milestones.slice(-6).map(m => m.text)).toEqual([1, 2, 3, 4, 5, 6].map(n => `Caught up ${n}`))
    expect(caught.milestones[0]?.text).toBe('Result 6')
  })

  test('a seeded result with no time goes before timed ones', () => {
    const upgraded = upgradeLedger({
      ...full(true),
      card: { goal: 'g', done: ['Seeded result'], now: '', running: [] },
    })

    expect(upgraded.milestones).toHaveLength(200)
    expect(upgraded.milestones.map(m => m.text)).not.toContain('Seeded result')
    expect(upgraded.milestones[0]?.text).toBe('Result 0')
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
    const ex = { person: 'go', trigger: null, activity, reply, turn: 1, press: null, screen: '' }
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
    expect(text).toContain('Goal: Move annotation queue logic')
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
        'GOAL: Publish\nNOW: Waiting on sign-in\nNEW: do | - | Sign in to npm | - | -\nHELP: new 1 | run | npm login | sign-in\nNEW: do | - | Publish the package | - | -\nHELP: new 2 | run | npm publish | publish',
        reply,
      )!,
      1,
      1,
    )
    expect(tasksRunBy(ledger, '  npm   login ').map(i => i.ask)).toEqual(['Sign in to npm'])
    expect(tasksRunBy(ledger, 'npm login --scope=@me')).toEqual([])
  })
})

describe('statusLine', () => {
  test('names the first waiting item after the count, and says where the work stands when nothing waits', () => {
    const waiting = applyUpdate(EMPTY, parseReply(REPLY)!, 1, 1)
    expect(statusLine(waiting, null, [])).toBe('3 · Rename greet.mjs to hello.mjs?')
    const settled = applyUpdate(
      waiting,
      parseReply('GOAL: g\nNOW: Reducer merged\nCLOSED: i1 | yes\nCLOSED: i2 | no\nCLOSED: i3 | done')!,
      2,
      2,
    )
    expect(statusLine(settled, null, [])).toBe('Reducer merged')
    expect(statusLine(EMPTY, null, [])).toBe('')
  })

  test('puts a stop and its fix first, then an open dialog', () => {
    const waiting = applyUpdate(EMPTY, parseReply(REPLY)!, 1, 1)
    const dialog = { kind: 'permission' as const, text: 'push main to origin', key: 'Bash command=git push' }
    expect(statusLine(waiting, null, [dialog])).toBe('Allow push main to origin?')
    expect(
      statusLine(
        waiting,
        { kind: stopKindOf('authentication_failed', ''), detail: 'authentication_failed', resets: null, at: 1 },
        [dialog],
      ),
    ).toBe('! Signed out: /login')
  })

  test('tells a reached usage limit, with its reset time, from a busy server', () => {
    const limit = "You've hit your weekly limit · resets 7:33pm (America/Los_Angeles)"
    expect(stopKindOf('rate_limit', limit)).toBe('usage-limit')
    expect(statusLine(EMPTY, { kind: 'usage-limit', detail: 'rate_limit', resets: resetTime(limit), at: 1 }, [])).toBe(
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
