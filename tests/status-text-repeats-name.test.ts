import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { after, page } from './status-helpers'

const START = ['NEW: working | CSV import | bad rows skipped', 'NEW: queued | Error copy | not started'].join('\n')
const GOAL = 'GOAL: Import ready to demo | done Parsing works; working Errors explained'

test('a milestone and a subject draw no text that repeats their own name, ignoring case and closing punctuation', () => {
  const started = after(after(null, START, 10), GOAL, 20)
  const o = after(started, 'DONE: m1 | parsing works.\nSET: s1 | working | CSV Import!', 40)
  const p = page(o, 50)
  const subject = [...p.rows, ...(p.goal?.milestones.flatMap(m => m.rows) ?? [])].find(
    r => r.kind === 'subject' && r.name === 'CSV import',
  )

  expect(p.goal?.milestones.find(m => m.id === 'm1')).toMatchObject({ name: 'Parsing works', text: null })
  expect(subject).toMatchObject({ text: null })
})
