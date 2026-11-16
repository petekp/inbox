import { mock, expect, test } from 'claude-code/testing'

import { w, world } from './hooks-world'

test('the mod reads XDG instructions on each inbox model call from a temporary config path', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const configHome = '/tmp/inbox-person-instructions-test'
  const path = `${configHome}/inbox/instructions.md`
  world($, on, [], { HOME: '/tmp/inbox-person-home', XDG_CONFIG_HOME: configHome })
  w.written[path] = 'Use compact sentences.'
  w.ledgerReply = 'NONE'
  w.statusReply = 'NO CHANGE'

  const reply = async (text: string, turnId: string) => {
    await $.prompt.submit({ text: 'Continue', wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text: 'Continue', turnId })
    await $.turn.complete({ answer: text, durationMs: 5, isAborted: false, turnId, reason: 'answer' })
    await clock.settle()
  }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await reply('Done.', 't1')
  expect(w.modelSystems).toHaveLength(2)
  expect(w.modelSystems.every(system => system.includes("Person's instructions:\nUse compact sentences."))).toBe(true)

  w.written[path] = 'Use one sentence.'
  await reply('Still done.', 't2')
  expect(w.modelSystems).toHaveLength(4)
  expect(w.modelSystems[2]).toContain("Person's instructions:\nUse one sentence.")
  expect(w.modelSystems[3]).toContain("Person's instructions:\nUse one sentence.")
})
