import { describe, expect, test } from 'claude-code/testing'

import { EMPTY } from '../hooks/ledger'
import { applyUpdate } from '../hooks/ledger-update'
import { parseReply } from '../hooks/reply-parse'
import { REPLY } from './ledger-helpers'

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
