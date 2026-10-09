import { describe, expect, test } from 'claude-code/testing'

import {
  CLAUDE_CODE,
  EMPTY,
  addFinding,
  answerNote,
  applyUpdate,
  carryText,
  closeByAgent,
  closeFinding,
  closeItem,
  latestBatch,
  parseReply,
  questionNumbers,
  readCommandRow,
  reopenFinding,
  reopenItem,
  resetTime,
  statusLine,
  stopKindOf,
  tasksRunBy,
  upgradeLedger,
} from '../hooks/ledger'
import type { Item } from '../types'

const REPLY = `GOAL: Move annotation queue logic into a tested reducer
DONE: Reducer built on its own branch
DONE: 422 unit tests pass
NOW: Waiting on approval to run input tests
RUNNING: vite dev: http://localhost:5173
NEW: decide | 1 | Rename Send.swift to Herdr? | Yes / No | yes
NEW: decide | 2 | Cut TODOS.md down to open items? | - | -
NEW: do | - | Test pinch zoom on your Mac | - | -`

describe('parseReply', () => {
  test('reads every key of the line format', () => {
    const u = parseReply(REPLY)
    expect(u?.card.goal).toBe('Move annotation queue logic into a tested reducer')
    expect(u?.card.done).toEqual(['Reducer built on its own branch', '422 unit tests pass'])
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

  test('keeps a recommendation only as the answer it names', () => {
    const [stray, named] = parseReply(
      [
        'NEW: decide | - | Refuse check commands in Bash? | Refuse / Keep both paths | Pick one for me',
        'NEW: decide | - | Which port? | Use 3001 / Stop docs site | I would use 3001 for now',
      ].join('\n'),
    )!.added
    expect([stray?.rec, named?.rec]).toEqual([null, 'Use 3001'])
  })

  test('a key written as "-" adds nothing and keeps the card', () => {
    const u = parseReply('GOAL: -\nNOW: -\nDONE: -\nRUNNING: -\nNEW: do | - | - | - | -')!
    expect(u.added).toEqual([])
    expect(u.card).toEqual({ goal: '', done: [], now: '', running: [] })
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
    // A sign-in command needs the person's terminal, so it becomes a copy button.
    expect(u?.added[1]?.helps).toEqual([{ kind: 'terminal', command: 'npm login', name: null }])
    expect(u?.helped).toEqual([
      { id: 'i4', help: { kind: 'link', url: 'https://example.com/tokens', name: 'token page' } },
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
        ask: 'Rename Send.swift to Herdr?',
        label: '1',
        outcome: 'yes, renamed',
        how: 'update',
        at: 2000,
        item: first.items[0],
      },
    ])
    expect(latestBatch(second).map(i => i.id)).toEqual(['i4'])
    expect(second.card?.done).toEqual(first.card?.done)
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
      parseReply('NEW: decide | 2 | Make Papercuts backups use cp -n with a letter suffix? | Yes / No | Yes')!,
      1,
      1,
    )
    const again = applyUpdate(
      first,
      parseReply(
        [
          'NEW: decide | - | Use cp -n and a letter suffix for same-day Papercuts backups? | Yes / No | Yes',
          'NEW: decide | - | Also back up TODOS.md before triage? | Yes / No | -',
        ].join('\n'),
      )!,
      2,
      2,
    )
    expect(again.items.map(i => i.ask)).toEqual([
      'Make Papercuts backups use cp -n with a letter suffix?',
      'Also back up TODOS.md before triage?',
    ])
  })

  test('does not add an item that is already open', () => {
    const first = applyUpdate(EMPTY, parseReply(REPLY)!, 1, 1)
    const again = applyUpdate(first, parseReply('NEW: decide | 1 | rename send.swift to herdr | - | -')!, 2, 2)
    expect(again.items.length).toBe(3)
  })

  const repeats: [string, string, number, number][] = [
    [
      'the id of an item closed during the update as its label',
      'NEW: decide | i1 | Something else entirely? | - | -',
      5000,
      0,
    ],
    ['the ask of an item closed during the update', 'NEW: decide | - | Rename Send.swift to Herdr? | - | -', 5000, 0],
    [
      'a restated ask of an item closed during the update',
      'NEW: decide | - | Should Send.swift be renamed to Herdr? | - | -',
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
    ['the ask of an item closed before the prompt', 'NEW: decide | - | Rename Send.swift to Herdr? | - | -', 6000, 1],
    ['an unrelated question', 'NEW: decide | 9 | Cut TODOS.md down to open items? | - | -', 5000, 1],
  ]
  for (const [name, line, promptAt, added] of repeats)
    test(`a NEW line with ${name} is ${added === 0 ? 'dropped' : 'added'}`, () => {
      const first = applyUpdate(
        { ...EMPTY, turn: 1 },
        parseReply('NEW: decide | 1 | Rename Send.swift to Herdr? | - | -')!,
        1000,
        1,
      )
      const answered = closeItem(first, 'i1', { how: 'answered', outcome: 'yes' }, 5500)
      const next = applyUpdate({ ...answered, turn: 2 }, parseReply(line)!, 7000, 2, promptAt)
      expect(next.items.length).toBe(added)
    })
})

describe('reopening', () => {
  const item = (id: string, options: string[] = []): Item => ({
    id,
    kind: 'question',
    label: null,
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

  test('Claude and the per-turn update close findings with how and outcome', () => {
    const finding = { kind: 'issue' as const, title: 'Hotkeys vanish', detail: 'In ANSI', path: null, at: 1 }
    const open = addFinding(addFinding(EMPTY, finding).ledger, { ...finding, title: 'Tabs unreadable' }).ledger
    const answered = closeByAgent(CLAUDE_CODE, open, 'f1', { answer: 'leave it' }, 5)
    expect(answered.closed).toBe('finding')
    const updated = applyUpdate(answered.ledger, parseReply('CLOSED: f2 | fixed in the theme')!, 6, 1)
    expect(updated.findings).toEqual([])
    expect(updated.closedFindings.map(f => [f.id, f.how, f.outcome, f.closedAt])).toEqual([
      ['f1', 'answered', 'leave it', 5],
      ['f2', 'update', 'fixed in the theme', 6],
    ])
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

    expect(upgraded.items.map(i => i.kind)).toEqual(['question', 'task'])
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
    expect(note).toContain('1 → "Rename Send.swift to Herdr?"')
    expect(note).toContain('2 → "Cut TODOS.md down to open items?"')
  })

  test('maps answers written on one line', () => {
    const note = answerNote({ ...ledger, turn: 2 }, '1. node 2. yes')
    expect(note).toContain('2 → "Cut TODOS.md down to open items?"')
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
        'NEW: decide | - | Rename Send.swift? | Yes / No | -',
        'NEW: do | - | Test pinch zoom | - | -',
        'NEW: decide | - | Cut TODOS.md? | Yes / No | -',
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
    expect(answerNote({ ...batch, turn: 2 }, '3. yes')).toContain('3 → "Cut TODOS.md?"')
  })

  test('numbers only labeled items when any label has a number', () => {
    const labeled = { ...batch, items: batch.items.map(i => (i.id === 'i2' ? { ...i, label: '2' } : i)) }
    expect([...questionNumbers(labeled, 2)]).toEqual([])
    const both = { ...batch, items: batch.items.map(i => (i.id === 'i3' ? { ...i, label: 'D4' } : i)) }
    expect([...questionNumbers(both, 2)]).toEqual([['i3', 4]])
  })

  test('numbers nothing once the batch is a turn old', () => {
    expect(questionNumbers(batch, 3).size).toBe(0)
  })
})

describe('carryText', () => {
  test('is empty for an empty ledger and lists open items otherwise', () => {
    expect(carryText(EMPTY, 'T')).toBe(null)
    const text = carryText(applyUpdate(EMPTY, parseReply(REPLY)!, 1, 1), 'T')
    expect(text).toContain('Goal: Move annotation queue logic')
    expect(text).toContain('(1) "Rename Send.swift to Herdr?"')
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
    expect(statusLine(waiting, null, [])).toBe('3 · Rename Send.swift to Herdr?')
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
