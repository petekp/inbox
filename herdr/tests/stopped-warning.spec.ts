import { expect, test } from 'bun:test'

import { STOPPED_WARNING } from '../../core/view/feedback'
import { rankedStatusOf } from '../../core/view/pr-order'
import { prMarkId, RANK_AGAIN_ID } from '../../core/view/pr-rows'
import { STOPPED_REASON } from '../../core/view/rows'
import { demoSession } from '../../core/view/demo'
import { sessionView } from '../../core/view/session-view'
import { SETTLED_MS } from '../../core/view/timing'
import type { Session } from '../../types'
import type { Block, RowBlock } from '../src/blocks'
import { tabBlocks } from '../src/draw'
import { readSession } from '../src/files'
import { AGENT, NOW, demoEnvelopeText, demoScreen, uiOn } from './fixtures'

const HOLDS = { replies: {}, discarded: {}, shownSince: NOW, listInput: null }
const screenOf = (session: Session, isSendHeld: boolean) => ({
  ...demoScreen(),
  view: sessionView(session, NOW, SETTLED_MS, HOLDS),
  isSendHeld,
})
const rowIn = (blocks: Block[], id: string): RowBlock => {
  const row = blocks.find((b): b is RowBlock => b.kind === 'row' && b.id === id)
  if (!row) throw new Error(`row ${id} was not drawn`)
  return row
}
const warningsOf = (row: RowBlock) => row.body.filter(l => l.text === STOPPED_WARNING)

test('a Herdr file says Claude Code holds the inbox messages only when the host says so', () => {
  const held = readSession(demoEnvelopeText({ isSendHeld: true }))
  const older = readSession(demoEnvelopeText())
  if (held.is !== 'read' || older.is !== 'read') throw new Error('the demo file did not read')

  expect([held.isSendHeld, older.isSendHeld]).toEqual([true, false])
})

test('while Claude Code holds the inbox messages, an open question warns in red before its answers and a finding as its last line, and neither warns without the hold or once it reads the refusal', () => {
  const s = demoSession(NOW, AGENT)
  const { view } = demoScreen()
  const question = view.needsYou.questions.find(
    r => r.state.is === 'open' && r.actions.some(a => a.press.action === 'answer'),
  )
  const finding = view.findings.rows.find(r => r.state.is === 'open')
  if (!question || !finding) throw new Error('the demo has no open question with answers or open finding')
  const drawn = (session: Session, isSendHeld: boolean, id: string, tab: 'needsYou' | 'findings') =>
    rowIn(tabBlocks(screenOf(session, isSendHeld), uiOn(tab, { selected: id })), id)

  const asked = drawn(s, true, question.id, 'needsYou')
  const at = asked.body.findIndex(l => l.text === STOPPED_WARNING)
  expect(asked.body[at]?.tone).toBe('error')
  expect(asked.body.findIndex(l => l.optionId !== undefined)).toBe(at + 1)

  const found = drawn(s, true, finding.id, 'findings')
  expect(found.body.at(-1)).toMatchObject({ text: STOPPED_WARNING, tone: 'error' })

  expect(warningsOf(drawn(s, false, question.id, 'needsYou'))).toEqual([])
  const last = { kind: 'talk' as const, action: 'discuss', text: 'Discuss', at: NOW - 1000 }
  const refused = { ...last, delivery: { state: 'failed' as const, reason: STOPPED_REASON } }
  const refusedSession = { ...s, lastActions: { ...s.lastActions, [question.id]: refused } }
  expect(warningsOf(drawn(refusedSession, true, question.id, 'needsYou'))).toEqual([])
})

test('while Claude Code holds the inbox messages, a PR block with a button that sends warns above its buttons, and so does the order line with Rank again', () => {
  const s = demoSession(NOW, AGENT)
  const pr = demoScreen()
    .view.prs.drawn.map(d => d.pr)
    .find(p => p.threads.some(t => t.isWaiting))
  if (!pr) throw new Error('the demo has no PR with a waiting thread')
  const changed = { ...rankedStatusOf(pr), threads: [] }
  const prOrder = {
    refs: [pr.ref],
    label: null,
    why: null,
    statuses: { [pr.ref]: changed },
    dismissed: [],
    by: AGENT,
    at: NOW - 1000,
  }
  const ordered = { ...s, ledger: { ...s.ledger, prOrder } }
  const blocksOf = (isSendHeld: boolean) => tabBlocks(screenOf(ordered, isSendHeld), uiOn('prs'))
  const warningOf = (blocks: Block[], id: string) => {
    const b = blocks.find(x => x.id === id)
    return b?.kind === 'pr' ? b.warning : b?.kind === 'line' ? (b.warning ?? null) : 'not drawn'
  }

  expect([warningOf(blocksOf(true), prMarkId(pr.ref)), warningOf(blocksOf(true), RANK_AGAIN_ID)]).toEqual([
    STOPPED_WARNING,
    STOPPED_WARNING,
  ])
  expect([warningOf(blocksOf(false), prMarkId(pr.ref)), warningOf(blocksOf(false), RANK_AGAIN_ID)]).toEqual([
    null,
    null,
  ])
})
