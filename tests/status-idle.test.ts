import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { withChild } from '../hooks/status-children'
import { statusPrompt } from '../hooks/status-prompt'
import type { SessionStatus } from '../types'
import { after, askItem, MIN, page, shape } from './status-helpers'

const DAY = 24 * 60 * MIN
const EXCHANGE = {
  person: 'Go on',
  trigger: null,
  activity: [],
  reply: 'Done.',
  turn: 3,
  press: null,
  screen: '',
  tasks: [],
}
const WORK = [
  'NEW: working | Offline sync | queue built',
  'NEW: working | Sign-in fix | waits on a test login',
  'NEW: working | Docs page | half written',
  'NEW: queued | Dark mode | not started',
  'NEW: working | CSV import | parser works',
].join('\n')

const ASKS = new Set(['i1'])

function stalled(): SessionStatus {
  const withDelegate = withChild(
    after(null, WORK, 0),
    { ref: 't1', kind: 'subagent', name: 'docs writer', startedAt: 20, endedAt: null, lastActivityAt: 20 },
    20,
  )
  const docsLinked = after(withDelegate, 'LINK: c1 | s3', 30)
  const importMoved = after(docsLinked, 'SET: s5 | working | parser and preview work', 3 * DAY - 2 * 60 * MIN)

  return after(importMoved, 'LINK: i1 | s2', 3 * DAY - 60 * MIN, ASKS)
}

test('the call reads, as idle, only the working subjects with no change for a day that no ask or running child holds', () => {
  const prompt = statusPrompt({ last: stalled(), asks: [askItem('i1')], tasks: [], now: 3 * DAY }, EXCHANGE)

  expect(prompt).toContain('<idle>\ns1 | Offline sync | 3d\n</idle>')
})

test('the call reads no idle block while every working subject changed within a day', () => {
  const prompt = statusPrompt({ last: stalled(), asks: [askItem('i1')], tasks: [], now: 2 * 60 * MIN }, EXCHANGE)

  expect(prompt).not.toContain('<idle>')
})

test('an idle subject set working again with the same words shows working, not idle', () => {
  const resumed = after(stalled(), 'SET: s1 | working | queue built', 3 * DAY, ASKS)
  const sync = (o: SessionStatus) => shape(page(o, 3 * DAY + MIN).rows).find(r => r.includes('Offline sync'))

  expect(sync(stalled())).toContain('idle 3d')
  expect(sync(resumed)).not.toContain('idle')
  expect(after(stalled(), 'SET: s5 | working | parser and preview work', 3 * DAY, ASKS).subjects[4]?.changedAt).toBe(
    3 * DAY - 2 * 60 * MIN,
  )
})
