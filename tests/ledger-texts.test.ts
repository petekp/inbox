import { describe, expect, test } from 'claude-code/testing'

import { CLAUDE_CODE, MAX_TOOL_DESCRIPTION, guidedCloseDescription } from '../hooks/model-text'
import { answerNote, carryText, questionNumbers } from '../hooks/inbox-text'
import { buildPrompt } from '../hooks/ledger-prompt'
import { EMPTY } from '../hooks/ledger'
import { applyUpdate } from '../hooks/ledger-update'
import { parseReply, tasksRunBy } from '../hooks/reply-parse'
import { readCommandRow, resetTime, stopKindOf } from '../hooks/claude'
import { herdrTokens } from '../hooks/herdr'
import { parseInline } from '../hooks/inline'
import { EMPTY_SESSION_STATUS } from '../hooks/status-limits'
import { emptySession, sessionView } from '../hooks/session'
import { agentTools } from '../hooks/tools'
import type { Dialog, Ledger, Stop } from '../types'
import { REPLY } from './ledger-helpers'

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

  test('names the first waiting item after the count, and what the session is focused on when nothing waits', () => {
    const waiting = applyUpdate(EMPTY, parseReply(REPLY)!, 1, 1)
    expect(statusOf(waiting, null, [])).toBe('3 · Rename greet.mjs to hello.mjs?')
    const settled = applyUpdate(waiting, parseReply('CLOSED: i1 | yes\nCLOSED: i2 | no\nCLOSED: i3 | done')!, 2, 2)
    expect(statusOf(settled, null, [])).toBe('')
    const head = { title: 'Reducer merge', description: 'Merging the reducer into the store' }
    const described = { ...settled, overview: { ...EMPTY_SESSION_STATUS, head } }
    expect(statusOf(described, null, [])).toBe('Merging the reducer into the store')
    const titled = { ...settled, overview: { ...EMPTY_SESSION_STATUS, head: { ...head, description: '' } } }
    expect(statusOf(titled, null, [])).toBe('Reducer merge')
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
