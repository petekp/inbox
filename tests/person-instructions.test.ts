import { expect, test } from 'claude-code/testing'

import { EMPTY } from '../hooks/ledger'
import { buildPrompt, systemText } from '../hooks/ledger-prompt'
import { personInstructionsBlock, DEFAULT_PERSON_INSTRUCTIONS } from '../hooks/person-instructions'
import { CLAUDE_CODE } from '../hooks/model-text'
import { hostStatusSystem, PARTS_STATUS_SYSTEM, STATUS_SYSTEM } from '../hooks/status-prompt'

test('missing and blank instructions use the default, and custom text stays verbatim up to 4,000 characters', () => {
  expect(personInstructionsBlock(null)).toBe(`Person's instructions:\n${DEFAULT_PERSON_INSTRUCTIONS}`)
  expect(personInstructionsBlock('  \n  ')).toBe(`Person's instructions:\n${DEFAULT_PERSON_INSTRUCTIONS}`)
  expect(personInstructionsBlock('  Keep this wording.\n')).toBe("Person's instructions:\n  Keep this wording.\n")
  expect(personInstructionsBlock('x'.repeat(4_001))).toBe(`Person's instructions:\n${'x'.repeat(4_000)}`)
  expect(Array.from(personInstructionsBlock('😀'.repeat(4_001)).split('\n')[1]!).length).toBe(4_000)
})

test('ledger and both Status system texts append exactly one block without changing protocol labels', () => {
  const custom = 'Use short plain sentences.'
  const ledger = systemText(CLAUDE_CODE, custom)
  const status = hostStatusSystem(CLAUDE_CODE, custom)
  const partsStatus = hostStatusSystem({ ...CLAUDE_CODE, splitsPlanIntoSubjects: true }, custom)

  for (const text of [ledger, status, partsStatus]) {
    expect(text.match(/Person's instructions:/g)).toHaveLength(1)
    expect(text).toContain(`Person's instructions:\n${custom}`)
  }
  expect(ledger).toContain('NEW: <kind> | <label> | <ask> | <options> | <rec> | <design>')
  expect(status).toContain('NO CHANGE')
  expect(status).toContain('SET: id or name | status | where it stands')
  expect(partsStatus).toBe(PARTS_STATUS_SYSTEM.replace(DEFAULT_PERSON_INSTRUCTIONS, custom))
  expect(STATUS_SYSTEM).toContain(`Person's instructions:\n${DEFAULT_PERSON_INSTRUCTIONS}`)
})

test('the ledger prompt body leaves protocol fields alone and the system builder adds one instructions block', () => {
  const prompt = buildPrompt(EMPTY, {
    person: 'Go ahead.',
    reply: 'Plan complete.',
    activity: [],
    screen: '',
    trigger: null,
    turn: 1,
    press: null,
    tasks: [],
  })
  const system = systemText(CLAUDE_CODE, 'Use the requested language.')

  expect(prompt).toContain('<reply>\nPlan complete.\n</reply>')
  expect(system.match(/Person's instructions:/g)).toHaveLength(1)
  expect(system).toContain('CLOSED: <id>')
  expect(system).toContain('NEW: <kind>')
})
