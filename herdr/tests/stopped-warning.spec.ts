import './gpui-stand-in'
import { expect, test } from 'bun:test'

import { STOPPED_WARNING } from '../../core/view/feedback'
import { rankedStatusOf } from '../../core/view/pr-order'
import { prMarkId, prThreadId, RANK_AGAIN_ID } from '../../core/view/pr-rows'
import { STOPPED_REASON } from '../../core/view/rows'
import { demoSession } from '../../core/view/demo'
import { sessionView } from '../../core/view/session-view'
import { SETTLED_MS } from '../../core/view/timing'
import type { Session } from '../../types'
import type { Block, RowBlock } from '../src/blocks'
import { tabBlocks } from '../src/draw'
import { readSession } from '../src/files'
import { AGENT, NOW, demoEnvelopeText, demoScreen, uiOn } from './fixtures'
import type { LookUi } from '../src/draw'

const { framesOf } = await import('./frames')

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

test('a Herdr file says Claude Code holds the inbox messages only when the host says so', () => {
  const held = readSession(demoEnvelopeText({ isSendHeld: true }))
  const older = readSession(demoEnvelopeText())
  if (held.is !== 'read' || older.is !== 'read') throw new Error('the demo file did not read')

  expect([held.isSendHeld, older.isSendHeld]).toEqual([true, false])
})

test('while Claude Code holds the inbox messages, an open question and an open finding warn, a closed one does not, and none warns without the hold or once it reads the refusal', () => {
  const s = demoSession(NOW, AGENT)
  const { view } = demoScreen()
  const question = view.needsYou.questions.find(
    r => r.state.is === 'open' && r.actions.some(a => a.press.action === 'answer'),
  )
  const finding = view.findings.rows.find(r => r.state.is === 'open')
  if (!question || !finding) throw new Error('the demo has no open question with answers or open finding')
  const drawn = (session: Session, isSendHeld: boolean, id: string, tab: 'needsYou' | 'findings') =>
    rowIn(tabBlocks(screenOf(session, isSendHeld), uiOn(tab, { selected: id })), id)

  expect(drawn(s, true, question.id, 'needsYou').warning).toBe(STOPPED_WARNING)
  expect(drawn(s, true, finding.id, 'findings').warning).toBe(STOPPED_WARNING)
  const closed = rowIn(tabBlocks(screenOf(s, true), uiOn('needsYou', { selected: null })), question.id)
  expect(closed.warning).toBeUndefined()

  expect(drawn(s, false, question.id, 'needsYou').warning).toBeUndefined()
  const last = { kind: 'talk' as const, action: 'discuss', text: 'Discuss', at: NOW - 1000 }
  const refused = { ...last, delivery: { state: 'failed' as const, reason: STOPPED_REASON } }
  const refusedSession = { ...s, lastActions: { ...s.lastActions, [question.id]: refused } }
  expect(drawn(refusedSession, true, question.id, 'needsYou').warning).toBeUndefined()
})

test('while Claude Code holds the inbox messages, a PR block with a button that sends warns, and so do its open thread and the order line with Rank again', () => {
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

  const threadIds = new Set(pr.threads.map(t => prThreadId(pr, t)))
  const threadId = tabBlocks(screenOf(s, true), uiOn('prs')).find(
    b => b.kind === 'row' && b.isSelectable && threadIds.has(b.id),
  )?.id
  if (!threadId) throw new Error('the demo PR has no thread the person can open')
  const threadOf = (isSendHeld: boolean, selected: string | null) =>
    rowIn(tabBlocks(screenOf(s, isSendHeld), uiOn('prs', { selected })), threadId).warning
  expect([threadOf(true, threadId), threadOf(true, null), threadOf(false, threadId)]).toEqual([
    STOPPED_WARNING,
    undefined,
    undefined,
  ])
})

test('the stopped warning comes and goes on an open question, finding and thread, a PR block and Rank again with no jump, cutting no text and showing only once its box is nearly open', () => {
  const s = demoSession(NOW, AGENT)
  const { view } = demoScreen()
  const question = view.needsYou.questions.find(
    r => r.state.is === 'open' && r.actions.some(a => a.press.action === 'answer'),
  )
  const finding = view.findings.rows.find(r => r.state.is === 'open')
  const pr = view.prs.drawn.map(d => d.pr).find(p => p.threads.some(t => t.isWaiting))
  if (!question || !finding || !pr) throw new Error('the demo has no open question, open finding or PR with a thread')
  const prOrder = {
    refs: [pr.ref],
    label: null,
    why: null,
    statuses: { [pr.ref]: { ...rankedStatusOf(pr), threads: [] } },
    dismissed: [],
    by: AGENT,
    at: NOW - 1000,
  }
  const ordered = { ...s, ledger: { ...s.ledger, prOrder } }
  const threadIds = new Set(pr.threads.map(t => prThreadId(pr, t)))
  const threadId = tabBlocks(screenOf(s, true), uiOn('prs')).find(
    b => b.kind === 'row' && b.isSelectable && threadIds.has(b.id),
  )?.id
  if (!threadId) throw new Error('the demo PR has no thread the person can open')
  const forms: [string, Session, LookUi][] = [
    ['question', s, uiOn('needsYou', { selected: question.id })],
    ['finding', s, uiOn('findings', { selected: finding.id })],
    ['PR block and Rank again', ordered, uiOn('prs')],
    ['thread', s, uiOn('prs', { selected: threadId })],
  ]
  const isShownEarly = (x: { text: string | null; opacity: number; share: number }) =>
    x.text === STOPPED_WARNING && x.opacity > 0 && x.share < 0.9

  for (const [form, session, ui] of forms)
    for (const isShown of [true, false]) {
      const frames = framesOf(
        [
          [0, tabBlocks(screenOf(session, !isShown), ui)],
          [100, tabBlocks(screenOf(session, isShown), ui)],
        ],
        1000,
      )
      const after = <T extends { at: number }>(xs: T[]) => xs.filter(x => x.at >= 0)
      expect({
        form,
        isShown,
        jumps: after(frames.jumps),
        cuts: after(frames.cuts),
        early: after(frames.shown).filter(isShownEarly),
      }).toEqual({ form, isShown, jumps: [], cuts: [], early: [] })
    }
})
