import { expect, test } from 'bun:test'

import { rowKeyPlan } from '../../core/view/action-plan'
import { CLEAR_FINISHED_ID, prMarkId, prThreadId, RANK_AGAIN_ID } from '../../core/view/pr-rows'
import { rankAgainPlan } from '../../core/view/pr-order'
import { actionLabel, STOPPED_REASON } from '../../core/view/rows'
import type { RowView } from '../../core/view/rows'
import { demoSession } from '../../core/view/demo'
import { closeItem } from '../../core/domain/ledger-close'
import type { Closed } from '../../types'
import { sessionView } from '../../core/view/session-view'
import { goalKeyPlan, statusKeyPlan } from '../../core/view/status-keys'
import { shownTabs } from '../../core/view/tabs'
import { SETTLED_MS } from '../../core/view/timing'
import type { Block, RowBlock } from '../src/blocks'
import { tabBlocks, tabCells } from '../src/draw'
import { readSession } from '../src/files'
import { helpBlocks } from '../src/draw-help'
import { keyMove } from '../src/keys'
import { screenOf } from '../src/screen'
import type { Followed } from '../src/follow'
import { freshUi } from '../../core/view/ui-controller-types'
import { HERDR_LOOK, lookUiOf } from '../src/controller'
import { AGENT, NOW, demoEnvelopeText, demoScreen, finishedScreen, lookPresses, uiOn } from './fixtures'

const plannedLabels = (row: RowView, isAllShown: boolean) => {
  const { options, keys, more, sessionKey } = rowKeyPlan(row, isAllShown, true)
  return [
    ...options.map(o => actionLabel(o.action)),
    ...(sessionKey ? [sessionKey.label] : []),
    ...[...keys, ...more].map(k => (k.slot === 'allOptions' || k.slot === 'retry' ? k.label : actionLabel(k.action))),
  ]
}

const rowsOf = (blocks: Block[]) => blocks.filter((b): b is RowBlock => b.kind === 'row')

test('a selected row draws its buttons in the shared key plan order', () => {
  const screen = demoScreen()
  const { view } = screen
  const rows = [...view.needsYou.questions, ...view.needsYou.tasks, ...view.findings.rows].filter(
    r => r.state.is === 'open',
  )
  expect(rows.length).toBeGreaterThan(5)
  for (const row of rows)
    for (const isAllShown of [false, true]) {
      const ui = uiOn(row.type === 'finding' ? 'findings' : 'needsYou', {
        selected: row.id,
        optionsShown: isAllShown ? [row.id] : [],
      })
      const drawn = rowsOf(tabBlocks(screen, ui)).find(b => b.id === row.id)!
      expect(drawn.buttons.map(b => b.label)).toEqual(plannedLabels(row, isAllShown))
    }
})

test('a row whose message was not sent because the person stopped the session offers Go to session, which focuses its terminal', () => {
  const s = demoSession(NOW, AGENT)
  const question = demoScreen().view.needsYou.questions.find(r => r.state.is === 'open')
  if (!question) throw new Error('the demo has no open question')
  const refused = (reason: string) => {
    const last = { kind: 'talk' as const, action: 'discuss', text: 'Discuss', at: NOW - 1000 }
    const delivery = { state: 'failed' as const, reason }
    const session = { ...s, lastActions: { ...s.lastActions, [question.id]: { ...last, delivery } } }
    const holds = { replies: {}, discarded: {}, shownSince: NOW, listInput: null }
    const screen = { ...demoScreen(), view: sessionView(session, NOW, SETTLED_MS, holds) }
    const drawn = rowsOf(tabBlocks(screen, uiOn('needsYou', { selected: question.id }))).find(b => b.id === question.id)
    if (!drawn) throw new Error('the question was not drawn')
    return drawn
  }

  const stopped = refused(STOPPED_REASON)
  expect(stopped.feedback?.text).toBe(
    'Not sent: you stopped this session. It takes inbox messages again after you write to it.',
  )
  expect(stopped.buttons.find(b => b.label === 'Go to session')?.does).toEqual({ is: 'focusTerminal' })
  expect(refused('a hook refused it').buttons.map(b => b.label)).not.toContain('Go to session')
})

test('a PR block, its thread row, Rank again and a Done row or Closed line whose message was not sent because the person stopped the session offer Go to session first', () => {
  const s = demoSession(NOW, AGENT)
  const pr = demoScreen()
    .view.prs.drawn.map(d => d.pr)
    .find(p => p.threads.some(t => t.isWaiting))
  const thread = pr?.threads.find(t => t.isWaiting)
  const done = s.ledger.closed.find(d => d.how === 'done')
  if (!pr || !thread || !done) throw new Error('the demo has no waiting thread or Done')
  const refused = (action: string, text: string) => ({
    kind: 'handoff' as const,
    action,
    text,
    at: NOW - 1000,
    delivery: { state: 'failed' as const, reason: STOPPED_REASON },
  })
  const lastActions = {
    ...s.lastActions,
    [prMarkId(pr.ref)]: refused('pr-address-all', 'Address all'),
    [prThreadId(pr, thread)]: refused('thread-address', 'Address'),
  }
  const refusedDone = { ...done, doneNotification: { id: 'n1', error: STOPPED_REASON } }
  const closed = s.ledger.closed.map(d => (d === done ? refusedDone : d))
  const session = { ...s, lastActions, ledger: { ...s.ledger, closed } }
  const holds = { replies: {}, discarded: {}, shownSince: NOW, listInput: null }
  const screen = { ...demoScreen(), view: sessionView(session, NOW, SETTLED_MS, holds) }
  const firstLabels = (b: Block | undefined) =>
    (b?.kind === 'pr' || b?.kind === 'row' ? b.buttons : []).map(x => x.label)

  const prs = tabBlocks(screen, uiOn('prs', { selected: prThreadId(pr, thread) }))
  expect(firstLabels(prs.find(b => b.kind === 'pr' && b.id === prMarkId(pr.ref))).slice(0, 2)).toEqual([
    'Go to session',
    'Try again',
  ])
  expect(firstLabels(prs.find(b => b.id === prThreadId(pr, thread))).slice(0, 2)).toEqual([
    'Go to session',
    'Try again',
  ])

  const folds = tabBlocks(screen, uiOn('needsYou')).flatMap(b =>
    b.kind === 'fold' && 'closedFold' in b.change ? [b.change.closedFold] : [],
  )
  const asks = tabBlocks(screen, uiOn('needsYou', { unfolded: folds, closedAll: folds }))
  const line = asks.find(b => b.id === `closed ${done.id}`)
  expect(line?.kind === 'row' && line.buttons.map(b => [b.label, b.does])).toEqual([
    ['Go to session', { is: 'focusTerminal' }],
    ['Undo', { is: 'press', press: { id: done.id, action: 'undo' }, effects: [], kind: null }],
  ])

  const task = s.ledger.items.find(i => i.kind === 'task')
  if (!task) throw new Error('the demo has no open task')
  const closing = closeItem(s.ledger, task.id, { how: 'done', outcome: 'done' }, NOW - 1000)
  const refusedTask = (d: Closed) =>
    d.id === task.id ? { ...d, doneNotification: { id: 'n2', error: STOPPED_REASON } } : d
  const inPlace = { ...s, ledger: { ...closing, closed: closing.closed.map(refusedTask) } }
  const placeHolds = { ...holds, shownSince: NOW - 5000 }
  const placeScreen = {
    ...demoScreen(),
    view: sessionView(inPlace, NOW, SETTLED_MS, placeHolds),
    shownSince: NOW - 5000,
  }
  const settled = tabBlocks(placeScreen, uiOn('needsYou')).find(b => b.id === task.id)
  expect(firstLabels(settled)).toEqual(['Go to session', 'Undo'])

  const rankAgain = { [RANK_AGAIN_ID]: refused('pr-rank-again', 'Rank again') }
  const plan = rankAgainPlan([], { lastActions: rankAgain, turns: screen.view.turns, now: NOW }, true)
  expect(plan.sessionKey?.label).toBe('Go to session')
})

test('only the selected row shows buttons, and with no row picked the first waiting row opens', () => {
  const screen = demoScreen()
  const rows = rowsOf(tabBlocks(screen, lookUiOf(freshUi(HERDR_LOOK), screen.view)))
  const opened = rows.filter(r => r.isSelected)
  expect(opened.map(r => r.id)).toEqual([rows.find(r => r.isSelectable)!.id])
  expect(rows.filter(r => !r.isSelected && r.depth === 0).every(r => r.buttons.length === 0)).toBe(true)
})

test('a selected question draws why it came up under its title, and a collapsed one draws none', () => {
  const screen = demoScreen()
  const question = screen.view.needsYou.questions.find(r => r.contextLine)!
  const selected = rowsOf(tabBlocks(screen, uiOn('needsYou', { selected: question.id }))).find(
    b => b.id === question.id,
  )!
  const first = question.holdsUpLine ? 1 : 0
  expect(selected.body[first]).toMatchObject({ text: question.contextLine!, tone: 'muted' })
  const other = screen.view.needsYou.questions.find(r => r.id !== question.id && r.state.is === 'open')!
  const collapsed = rowsOf(tabBlocks(screen, uiOn('needsYou', { selected: other.id }))).find(b => b.id === question.id)!
  expect(collapsed.body.some(l => l.text === question.contextLine)).toBe(false)
})

test('a selected question with described answers draws its Holds up line, context, earlier answer and answers on one tree, with the last answer ending it', () => {
  const screen = demoScreen()
  const question = screen.view.needsYou.questions.find(r => r.id === 'd11')!
  const selected = rowsOf(tabBlocks(screen, uiOn('needsYou', { selected: question.id }))).find(
    b => b.id === question.id,
  )!
  const texts = selected.body.map(l => l.optionId ?? l.text)
  const pinch = selected.buttons.find(b => b.label.startsWith('Pinch'))!
  expect(texts[0]).toBe(question.holdsUpLine ?? question.contextLine ?? undefined)
  const earlier = texts.indexOf(
    'You answered Flick 3 days ago, in glasses-app, to “Which gesture should clear a glance?”',
  )
  expect([earlier > 0, earlier < texts.indexOf(pinch.id)]).toEqual([true, true])
  expect(pinch.isOption).toBe(true)
  const note = selected.body[texts.indexOf(pinch.id) + 1]!
  expect(note.tone).toBe('muted')
  expect(note.text).toContain('Recommended: a flick fires by accident while walking')
  const trees = selected.body.filter(l => l.tree !== undefined).map(l => l.tree)
  expect(trees.at(-1)).toBe('last')
  expect(trees.slice(0, -1).every(t => t === 'tee' || t === 'trunk')).toBe(true)
})

test('the tabs follow the shared tab plan, with their counts', () => {
  const cells = tabCells(demoScreen(), 'needsYou')
  expect(cells.map(c => c.label)).toEqual(shownTabs().map(t => t.label))
  expect(cells.filter(c => c.isSelected).map(c => c.id)).toEqual(['needsYou'])
})

test('a group’s Closed fold shows its lines only while open', () => {
  const screen = demoScreen()
  const shut = tabBlocks(screen, uiOn('needsYou'))
  const fold = shut.find(b => b.kind === 'fold')
  if (fold?.kind !== 'fold' || !('closedFold' in fold.change)) throw new Error('no Closed fold')
  expect(rowsOf(shut).some(r => r.depth === 1)).toBe(false)
  const open = tabBlocks(screen, uiOn('needsYou', { unfolded: [fold.change.closedFold] }))
  expect(rowsOf(open).filter(r => r.depth === 1).length).toBeGreaterThan(0)
})

test('the Status page draws the goal’s and each row’s buttons in their plans’ order', () => {
  const screen = demoScreen()
  const page = screen.view.statusPage
  const blocks = tabBlocks(screen, uiOn('overview'))
  const heading = blocks.find(b => b.kind === 'heading' && b.id === 'goal heading')
  expect(heading?.kind === 'heading' && heading.buttons.map(b => b.label)).toEqual(goalKeyPlan(page).map(k => k.label))
  for (const row of page.rows.filter(r => r.kind === 'subject')) {
    const drawn = blocks.find(b => b.kind === 'status' && b.id === row.id)
    expect(drawn?.kind === 'status' && drawn.buttons.map(b => b.label)).toEqual(statusKeyPlan(row).map(k => k.label))
  }
})

test('the Status page draws the goal’s milestones on a path: a seen done one as its fold, the line from each to the next and beside its work, dashed into the next one, and Later above the ones that wait', () => {
  const screen = demoScreen()
  const blocks = tabBlocks(screen, uiOn('overview'))
  const drawn = screen.view.statusPage.goal!.milestones.map(m => blocks.find(b => b.id === m.id)!)
  expect(drawn.map(b => b.kind)).toEqual(['fold', 'status', 'status', 'status', 'status'])
  expect(drawn.map(b => ('path' in b ? b.path : null))).toEqual([
    { is: 'milestone', above: null, below: 'continues' },
    { is: 'milestone', above: 'continues', below: 'continues' },
    { is: 'milestone', above: 'continues', below: 'to-next' },
    { is: 'milestone', above: 'to-next', below: null },
    { is: 'milestone', above: null, below: null },
  ])
  expect(blocks.find(b => b.id === 's1')).toMatchObject({ path: { is: 'work', line: 'to-next' } })
  expect(blocks.findIndex(b => b.id === 'goal later')).toBe(blocks.findIndex(b => b.id === 'm5') - 1)
})

test('a met goal draws a ✓ in the success tone beside its Goal met label, its lines at the text column, and its milestones folded into a line that names them with the chevron after, which opens to the milestones, and its field at the text column', () => {
  const s = demoSession(NOW, AGENT)
  const o = s.ledger.overview!
  const met = {
    ...o,
    goal: { ...o.goal!, metAt: NOW },
    milestones: o.milestones.map(m => ({ ...m, status: 'done' as const })),
    subjects: o.subjects.map(x => ({ ...x, status: 'done' as const, closedAt: NOW - 1 })),
    children: [],
    lastLookAt: NOW,
  }
  const holds = { replies: {}, discarded: {}, shownSince: NOW, listInput: null }
  const view = sessionView({ ...s, ledger: { ...s.ledger, overview: met } }, NOW, SETTLED_MS, holds)
  const screen = { ...demoScreen(), view }
  const fold = view.statusPage.goal!.milestonesFold!
  const shut = tabBlocks(screen, uiOn('overview'))
  const open = tabBlocks(screen, uiOn('overview', { statusUnfolded: [fold.id] }))
  const milestoneIds = view.statusPage.goal!.milestones.map(m => m.id)

  expect(shut.find(b => b.id === 'goal heading')).toMatchObject({
    text: 'Goal met',
    mark: { text: '✓', tone: 'success' },
  })
  expect(shut.find(b => b.id === 'goal text')).toMatchObject({ isAtEdge: false })
  expect(shut.find(b => b.id === fold.id)).toMatchObject({
    kind: 'fold',
    text: fold.text,
    isOpen: false,
  })
  expect(shut.some(b => milestoneIds.includes(b.id))).toBe(false)
  expect(open.find(b => b.id === fold.id)).toMatchObject({ isOpen: true })
  expect(open.filter(b => milestoneIds.includes(b.id)).map(b => b.id)).toEqual(milestoneIds)
  expect(shut.find(b => b.id === 'head')).toMatchObject({ kind: 'rule', isTitle: true })
  expect(tabBlocks(screen, uiOn('overview', { typing: 'goal' })).find(b => b.id === 'goal field')).toMatchObject({
    isAtEdge: false,
  })
})

test('the Status page joins each parent to the rows under it: work beside the path’s line by an arm, other work by the milestone’s connector down to an elbow at its last row with nothing past it, and a subject’s children by its own connector', () => {
  const screen = demoScreen()
  const blocks = tabBlocks(screen, uiOn('overview'))
  const treeOf = (id: string) => {
    const b = blocks.find(b => b.id === id)
    return b && 'tree' in b ? b.tree : undefined
  }
  expect(screen.view.statusPage.goal!.milestones.map(m => treeOf(m.id))).toEqual([
    undefined,
    undefined,
    undefined,
    [{ depth: 0, is: 'down' }],
    [{ depth: 0, is: 'down' }],
  ])
  expect(['s1', 'c1', 'c4', 's3', 's3-ask', 's2', 'c5'].map(treeOf)).toEqual([
    [
      { depth: 0, is: 'arm' },
      { depth: 1, is: 'down' },
    ],
    [{ depth: 1, is: 'mid' }],
    [{ depth: 1, is: 'last' }],
    [
      { depth: 0, is: 'last' },
      { depth: 1, is: 'down' },
    ],
    [{ depth: 1, is: 'last' }],
    [{ depth: 0, is: 'down' }],
    [{ depth: 0, is: 'last' }],
  ])
  const page = screen.view.statusPage
  const milestones = page.goal!.milestones.map(m => (m.rows.some(r => r.id === 's1') ? { ...m, line: null } : m))
  const ended = { ...screen, view: { ...screen.view, statusPage: { ...page, goal: { ...page.goal!, milestones } } } }
  const endedBlocks = tabBlocks(ended, uiOn('overview'))
  const endedTreeOf = (id: string) => {
    const b = endedBlocks.find(b => b.id === id)
    return b && 'tree' in b ? b.tree : undefined
  }
  expect(['s1', 'c1', 'c4'].map(endedTreeOf)).toEqual([
    [
      { depth: 0, is: 'last' },
      { depth: 1, is: 'down' },
    ],
    [{ depth: 1, is: 'mid' }],
    [{ depth: 1, is: 'last' }],
  ])
})

test('each case of the followed terminal draws its own message, and a read session draws the inbox', () => {
  const read = readSession(demoEnvelopeText())
  const cases: [Followed, Parameters<typeof screenOf>[1]][] = [
    [{ is: 'no-terminal' }, null],
    [{ is: 'no-inbox', terminal: 't1', program: 'zsh' }, null],
    [{ is: 'ended', terminal: 't1' }, null],
    [{ is: 'session', terminal: 't1', sessionId: 's1' }, null],
    [{ is: 'session', terminal: 't1', sessionId: 's1' }, { is: 'missing' }],
    [
      { is: 'session', terminal: 't1', sessionId: 's1' },
      { is: 'newer', format: 2 },
    ],
    [
      { is: 'session', terminal: 't1', sessionId: 's1' },
      { is: 'refused', reason: 'no agent' },
    ],
  ]
  const titles = cases.map(([f, r]) => {
    const s = screenOf(f, r, uiOn('needsYou'), lookPresses(r))
    return s.is === 'message' ? s.message.title : null
  })
  expect(titles.every(t => t !== null)).toBe(true)
  expect(new Set(titles).size).toBe(cases.length)
  expect(
    screenOf({ is: 'session', terminal: 't1', sessionId: 's1' }, read, uiOn('needsYou'), lookPresses(read)).is,
  ).toBe('inbox')
})

test('the PRs tab draws Clear merged and closed above the first PR, m presses it from any row, and it does not draw for the branch’s own PR alone', () => {
  const tabs = [{ id: 'prs' as const, label: 'PRs', badge: null, isSelected: true }]
  const blocks = tabBlocks(finishedScreen({ 'acme/visor#29': 'MERGED', 'acme/visor#33': 'CLOSED' }), uiOn('prs'))
  const at = blocks.findIndex(b => b.id === CLEAR_FINISHED_ID)
  const line = blocks[at]
  if (line?.kind !== 'line') throw new Error('no Clear merged and closed line')
  expect(at).toBeLessThan(blocks.findIndex(b => b.kind === 'pr'))
  expect(line.buttons.map(b => [b.label, b.hotkey, b.does])).toEqual([
    [
      'Clear merged and closed',
      'm',
      { is: 'press', press: { action: 'pr-clear-finished' }, effects: [], kind: 'mark' },
    ],
  ])
  const thread = blocks.find(b => b.kind === 'row' && b.isSelectable)
  if (thread?.kind !== 'row') throw new Error('no thread row')
  const onThread = tabBlocks(
    finishedScreen({ 'acme/visor#29': 'MERGED', 'acme/visor#33': 'CLOSED' }),
    uiOn('prs', { selected: thread.id }),
  )
  expect(onThread.some(b => b.kind === 'row' && b.id === thread.id && b.isSelected)).toBe(true)
  expect(keyMove('m', tabs, onThread, null)).toEqual({ is: 'press', button: line.buttons[0]! })
  const branchOnly = tabBlocks(finishedScreen({ 'acme/visor#31': 'MERGED' }), uiOn('prs'))
  expect(branchOnly.some(b => b.id === CLEAR_FINISHED_ID)).toBe(false)
})

test('an ask hangs under the work it holds up, on its tree, with its mark, words in its tone and View', () => {
  const asks = tabBlocks(demoScreen(), uiOn('overview')).flatMap(b => (b.kind === 'status' && b.nameTone ? [b] : []))

  expect(asks.length).toBeGreaterThan(0)
  for (const ask of asks) {
    const isQuestion = ask.mark?.text === '?'
    expect(isQuestion || ask.mark?.text === '□').toBe(true)
    expect(ask.mark?.tone).toBe(ask.nameTone)
    expect(ask.buttons.map(b => b.label)).toEqual([isQuestion ? 'View question' : 'View task'])
    expect(ask.tree).toHaveLength(1)
  }
})

test('Help names the build the host published, with the next-build mark, and names none for a file without one', () => {
  const followed: Followed = { is: 'session', terminal: 't1', sessionId: 's1' }
  const helpVersionOf = (overrides: Record<string, unknown>) => {
    const read = readSession(demoEnvelopeText(overrides))
    const screen = screenOf(followed, read, uiOn('needsYou'), lookPresses(read))

    return screen.is === 'inbox' ? screen.helpVersion : 'no inbox'
  }
  expect(helpVersionOf({ version: '1.2.3' })).toBe('Inbox v1.2.3')
  expect(helpVersionOf({ version: '1.2.3', isNextBuild: true })).toBe('Inbox v1.2.3 · next')
  expect(helpVersionOf({})).toBeNull()
  expect(helpBlocks('Inbox v1.2.3')[0]).toMatchObject({ kind: 'heading', text: 'Keys', aside: 'Inbox v1.2.3' })
  expect(helpBlocks(null)[0]).not.toHaveProperty('aside')
})
