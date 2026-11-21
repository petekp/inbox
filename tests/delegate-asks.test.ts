import { describe, expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { namesSubject } from '../core/domain/ask-subject'
import { UNSTARTABLE_CODE } from '../core/domain/gh'
import type { Run } from '../core/domain/gh'
import { delegateSession } from '../core/remote/hc-terminals'
import { herdrTarget } from '../core/remote/herdr'
import { EMPTY } from '../core/domain/ledger'
import { applyUpdate } from '../core/domain/ledger-update'
import { CLAUDE_CODE } from '../core/domain/model-text'
import { parseReply } from '../core/domain/reply-parse'
import type { Update } from '../core/domain/reply-parse'
import { emptySession } from '../core/view/session-files'
import { recorded } from '../core/runtime/session-presses'
import { appliedCatchUp } from '../core/runtime/session-status'
import { applied, endTurn, notePrompt, turnEnded } from '../core/runtime/session-turns'
import { TOOL_FIELDS } from '../core/domain/tool-schemas'
import type { Session } from '../types'

const TERMINAL = herdrTarget({ HC_TERMINAL_ID: 't9', HOME: '/home/person' })

function hcGet(answer: object | string, code = 0): { run: Run; calls: string[] } {
  const calls: string[] = []
  const stdout = typeof answer === 'string' ? answer : JSON.stringify(answer)
  const run: Run = async argv => {
    calls.push(argv.join(' '))
    return argv.slice(1).join(' ') === 'get t9 --json'
      ? { code, stdout, stderr: '' }
      : { code: 1, stdout: '', stderr: '' }
  }

  return { run, calls }
}

function parsed(reply: string): Update {
  const update = parseReply(reply)
  if (!update) throw new Error(`no update in ${reply}`)
  return update
}

describe('namesSubject', () => {
  test('keeps asks from real sessions that name a PR, a file, a command, a quoted name or a thing of their own', () => {
    for (const ask of [
      'Merge #687?',
      'Mark draft PR #3880 ready for review?',
      'Run ./scripts/check.sh on the branch?',
      'Run check.sh on the bundle PR?',
      'Keep drafts through a send in every look?',
      'Approve the asset-delivery proposal?',
      'Can reps react on WhatsApp?',
      'Merge the release branch?',
      'Name the command "greet"?',
      'Open https://example.com/pr/12 in the browser?',
      'Close ENG-412?',
    ])
      expect([ask, namesSubject(ask)]).toEqual([ask, true])
  })

  test('drops asks from real sessions that name nothing the person could tell apart from another ask', () => {
    for (const ask of [
      'Proceed?',
      'Push / Not yet',
      'Go ahead and build the design?',
      'Fix problems 2, 3 and 4 in this branch?',
      'Commit the 5 files, push, and open draft PR?',
      'Push the branch and open a draft PR?',
      'Mark the draft PR ready for review?',
      'Which variant should I build: A, B, or C?',
      'Start now / Later, I’ll say when',
      'Deploy now?',
    ])
      expect([ask, namesSubject(ask)]).toEqual([ask, false])
  })
})

describe('applyUpdate', () => {
  test('adds no question or task for a NEW or TODO line whose ask names no subject, and adds the rest', () => {
    const update = parsed(
      [
        'NEW: decide | 1 | Proceed? | yes / no | yes',
        'NEW: decide | 2 | Use Redis for the session cache? | yes / no | yes',
        'NEW: do | - | Push the branch and open a draft PR? | - | -',
        'TODO: Start now',
        'TODO: Rename greet.mjs',
      ].join('\n'),
    )
    const ledger = applyUpdate({ ...EMPTY, turn: 1 }, update, 1000, 1)

    expect(ledger.items.map(i => i.ask)).toEqual([
      'Use Redis for the session cache?',
      'Ready to start on Rename greet.mjs?',
    ])
  })
})

describe('delegateSession', () => {
  test('reads a terminal with a parent, or a fleet.domain label, as a delegate’s, and a coordinator’s as none', async () => {
    const cases: [object, unknown][] = [
      [{ address: 't9', parent: 't1', labels: { 'fleet.domain': 'inbox', 'fleet.task': 'asks' } }, { parent: 't1' }],
      [{ address: 't9', parent: 't1', labels: {} }, { parent: 't1' }],
      [{ address: 't9', parent: null, labels: { 'fleet.domain': 'inbox' } }, { parent: null }],
      [{ address: 't9', parent: 't1', labels: { 'fleet.domain': 'inbox', 'fleet.role': 'coordinator' } }, null],
      [{ address: 't9', parent: null, labels: { 'fleet.domain': ' ' } }, null],
      [{ address: 't9', labels: {} }, null],
    ]
    for (const [answer, expected] of cases)
      expect([answer, await delegateSession(TERMINAL, hcGet(answer).run)]).toEqual([answer, expected])
  })

  test('reads none outside a Herdr app terminal, when hc fails or answers what it cannot read, and tries the next hc when one does not start', async () => {
    const pane = herdrTarget({ HERDR_PANE_ID: 'p1', HOME: '/home/person' })
    const outside = hcGet({ parent: 't1' })
    expect(await delegateSession(pane, outside.run)).toBeNull()
    expect(await delegateSession(null, outside.run)).toBeNull()
    expect(outside.calls).toEqual([])
    expect(await delegateSession(TERMINAL, hcGet({ parent: 't1' }, 1).run)).toBeNull()
    expect(await delegateSession(TERMINAL, hcGet('not json').run)).toBeNull()

    const tried: string[] = []
    const second: Run = async argv => {
      tried.push(argv[0] ?? '')
      return tried.length === 1
        ? { code: UNSTARTABLE_CODE, stdout: '', stderr: 'not found' }
        : { code: 0, stdout: JSON.stringify({ parent: 't1' }), stderr: '' }
    }
    expect(await delegateSession(TERMINAL, second)).toEqual({ parent: 't1' })
    expect(tried).toHaveLength(2)
  })
})

describe('a delegate session', () => {
  const delegate = { parent: 't1' }

  test('the record tool refuses a question or task, names the terminal that started it, and records a finding', () => {
    const s = emptySession()
    const question = recorded(
      CLAUDE_CODE,
      s,
      'record',
      { kind: 'question', ask: 'Use Redis?', options: ['Yes', 'No'] },
      1,
      TOOL_FIELDS,
      delegate,
    )
    const task = recorded(CLAUDE_CODE, s, 'record', { kind: 'task', ask: 'Sign in to npm' }, 1, TOOL_FIELDS, delegate)
    const unnamed = recorded(CLAUDE_CODE, s, 'record', { kind: 'task', ask: 'Sign in' }, 1, TOOL_FIELDS, {
      parent: null,
    })
    const finding = recorded(
      CLAUDE_CODE,
      s,
      'record',
      {
        kind: 'finding',
        title: 'The cache keys skip the tenant',
        detail: 'Two tenants can read each other.',
        finding_kind: 'issue',
      },
      1,
      TOOL_FIELDS,
      delegate,
    )

    expect(question.result).toMatch(/^Not recorded: .*REPORT\.md.*Herdr terminal t1/)
    expect(task.result).toBe(question.result)
    expect(unnamed.result).toMatch(/^Not recorded: .*the session that started this one/)
    expect([question, task, unnamed].map(r => r.state.ledger.items)).toEqual([[], [], []])
    expect([question, task].map(r => r.personLine)).toEqual([null, null])
    expect(finding.state.ledger.findings.map(f => f.title)).toEqual(['The cache keys skip the tenant'])
  })

  test('a session that is no delegate records the same question', () => {
    const r = recorded(
      CLAUDE_CODE,
      emptySession(),
      'record',
      { kind: 'question', ask: 'Use Redis?', options: ['Yes', 'No'] },
      1,
      TOOL_FIELDS,
      null,
    )

    expect(r.state.ledger.items.map(i => i.ask)).toEqual(['Use Redis?'])
  })

  test('the per-reply update and the catch-up add no question or task, and still close an open one', () => {
    const asked = recorded(
      CLAUDE_CODE,
      emptySession(),
      'record',
      { kind: 'task', ask: 'Sign in to npm' },
      1,
      TOOL_FIELDS,
      null,
    )
    const ended = (s: Session) =>
      turnEnded(endTurn(CLAUDE_CODE, notePrompt(CLAUDE_CODE, s, 'go', false).state, 'Done.', false), 2)
    const answer = parsed('CLOSED: i1 | signed in\nNEW: decide | 1 | Use Redis for the session cache? | yes / no | yes')
    const asks = (s: Session) => [s.ledger.items.map(i => i.ask), s.ledger.closed.map(c => c.id)]

    expect(asks(applied(ended(asked.state), answer, 3, 3, true))).toEqual([[], ['i1']])
    expect(asks(appliedCatchUp(asked.state, asked.state, answer, 3, true))).toEqual([[], ['i1']])
    expect(asks(applied(ended(asked.state), answer, 3, 3, false))).toEqual([
      ['Use Redis for the session cache?'],
      ['i1'],
    ])
  })
})
