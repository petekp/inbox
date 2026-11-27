import { projectBanners } from '../bridge/banner-view'
import { renderVersion } from '../bridge/render-version'
import { projectFolds } from '../bridge/fold-view'
import { changeFolds } from '../tools/fold-rules'
import { closeItem } from '../../core/domain/ledger-close'
import { NO_HOLDS } from '../../core/view/timing'
import { collapseProjection, NO_VIEW_PREFERENCES } from '../bridge/collapse-view'
import { withCollapse } from '../../core/view/collapse'
import { expect, test } from 'bun:test'
import { fixtureSession } from '../tools/fixture-state'
import { sessionView } from '../../core/view/session-view'
import { REMOTE_ACTIONS, remoteRowDigest } from '../../core/remote/remote-commands'
import { rowKeyPlan } from '../../core/view/action-plan'
import { projectRowGroups } from '../bridge/row-view'
import type { RowPress } from '../../core/domain/presses'

const binding = {
  source: 'demo' as const,
  socket: '/fixture/core.sock',
  appHome: '/fixture/app',
  session: 'fixture',
  terminal: 't1',
}

async function projected() {
  const now = Date.now()
  const s = fixtureSession(now)
  const question = s.ledger.items.find(item => item.kind === 'question')!
  question.options = ['Pinch', 'Flick', 'Tap', 'Voice', 'Gaze', 'Automatic']
  question.optionDescriptions = { ...question.optionDescriptions, Voice: 'Say **dismiss**.' }
  const view = sessionView(s, now, 1000)
  const versions = new Map(
    await Promise.all(
      [...s.ledger.items, ...s.ledger.findings, ...s.ledger.closed, ...s.ledger.closedFindings].map(
        async row => [row.id, await remoteRowDigest(s, row.id)] as const,
      ),
    ),
  )
  const allowed = new Map<string, { press: RowPress; disabled: boolean }>()
  return { view, allowed, groups: projectRowGroups(binding, view, versions, allowed), question }
}

test('row transport preserves both shared action plans and their authorized presses', async () => {
  const { view, groups, allowed, question } = await projected()
  const source = view.needsYou.questions.find(row => row.id === question.id)!
  const row = groups.askGroups.flatMap(group => group.rows).find(row => row.id === question.id)!
  for (const all of [false, true]) {
    const plan = rowKeyPlan(source, all)
    const expected = [
      ...plan.options.map(option => option.action.press),
      ...[...plan.keys, ...plan.more]
        .filter(key => key.slot !== 'allOptions')
        .map(key => (key.slot === 'retry' ? key.press : key.action.press)),
    ]
    const buttons = (all ? row.allActions : row.shownActions).filter(button => button.command !== 'options')
    expect(buttons.map(button => allowed.get(button.key)?.press)).toEqual(expected)
  }
  expect(row.shownActions.some(button => button.command === 'options')).toBe(true)
  expect(row.actions.filter(action => action.command !== 'local')).toEqual(
    row.allActions.filter(action => action.command !== 'local'),
  )
  expect(row.allActions.some(button => button.command === 'options')).toBe(false)
  expect(row.contextParts.map(span => span.text).join('')).toBe(question.context!)
  expect(row.earlierParts.map(span => span.text).join('')).toContain(question.earlier!.answer)
  expect(
    row.allOptions.find(option => option.label === 'Voice')?.body.some(span => span.bold && span.text === 'dismiss'),
  ).toBe(true)
})

test('closed history excludes rows still drawn in place and only offers permitted restoration', async () => {
  const { groups, allowed } = await projected()
  for (const group of [...groups.askGroups, ...groups.findingGroups]) {
    const visible = new Set(group.rows.map(row => row.id))
    expect(group.closedAll.every(row => !visible.has(row.id))).toBe(true)
    expect(group.closed.length).toBeLessThanOrEqual(3)
    for (const row of group.closedAll)
      for (const action of row.actions) expect(allowed.get(action.key)?.press).toEqual({ id: row.id, action: 'undo' })
  }
  const closed = groups.askGroups.flatMap(group => group.closedAll)
  expect(closed.find(row => row.id === 'i8')?.actions.map(action => action.label)).toEqual(['Reopen'])
  expect(closed.find(row => row.id === 'i5')?.actions).toEqual([])
  expect(groups.findingGroups.map(group => group.title)).toEqual(['Issues', 'Opportunities'])
})

test('extended host actions stay disabled until the publisher advertises them', async () => {
  const { view, groups, allowed } = await projected()
  const legacy = groups.askGroups
    .flatMap(group => group.rows)
    .find(row => row.allActions.some(action => action.label === 'Compare'))!
  expect(legacy.allActions.find(action => action.label === 'Compare')?.disabled).toBe(true)
  const updated = projectRowGroups(binding, view, new Map(), allowed, REMOTE_ACTIONS)
  const current = updated.askGroups.flatMap(group => group.rows).find(row => row.id === legacy.id)!
  expect(current.allActions.find(action => action.label === 'Compare')?.disabled).toBe(false)
})

test('a viewer keeps its own collapse until newer row information arrives', () => {
  const now = 1_000_000
  const host = withCollapse(fixtureSession(now), 'i12', true, now)
  const first = collapseProjection(host, NO_VIEW_PREFERENCES, now)
  expect(first.collapsed).toEqual([])
  const preferences = { folds: [], collapsed: ['i11'], collapses: [{ id: 'i11', value: first.offer('i11') }] }
  const kept = collapseProjection(host, preferences, now + 10)
  expect(kept.collapsed).toEqual(['i11'])
  expect(kept.collapses).toEqual(preferences.collapses)
  expect(Object.keys(host.collapsed)).toEqual(['i12'])
  const updated = {
    ...host,
    ledger: {
      ...host.ledger,
      items: host.ledger.items.map(item => (item.id === 'i11' ? { ...item, reportedAt: now + 20 } : item)),
    },
  }
  const opened = collapseProjection(updated, preferences, now + 30)
  expect(opened.collapsed).toEqual([])
  expect(opened.collapses).toEqual([])
  expect(opened.collapseInput).toEqual({ ids: preferences.collapsed, entries: preferences.collapses })
  expect(Object.keys(host.collapsed)).toEqual(['i12'])
})

test('a newly blocked child opens its folded Status parent', () => {
  const now = 1_000_000
  const host = fixtureSession(now)
  const child = host.ledger.overview!.children.find(
    child => child.subjectId && child.endedAt === null && child.delegateState !== 'blocked',
  )!
  const parent = child.subjectId!
  const first = collapseProjection(host, NO_VIEW_PREFERENCES, now)
  const preferences = { folds: [], collapsed: [parent], collapses: [{ id: parent, value: first.offer(parent) }] }
  expect(collapseProjection(host, preferences, now + 10).collapsed).toEqual([parent])
  const updated = {
    ...host,
    ledger: {
      ...host.ledger,
      overview: {
        ...host.ledger.overview!,
        children: host.ledger.overview!.children.map(row =>
          row.id === child.id ? { ...row, delegateState: 'blocked' as const } : row,
        ),
      },
    },
  }
  expect(collapseProjection(updated, preferences, now + 20).collapsed).toEqual([])
  expect(host.collapsed[parent]).toBeUndefined()
})

test('a settled task exposes its shared Undo action through the client transport', async () => {
  const now = Date.now()
  const before = fixtureSession(now)
  const task = before.ledger.items.find(item => item.kind === 'task')!
  const state = { ...before, ledger: closeItem(before.ledger, task.id, { how: 'done', outcome: 'done' }, now) }
  const view = sessionView(state, now, 5120, { ...NO_HOLDS, shownSince: now - 1 })
  const allowed = new Map<string, { press: RowPress; disabled: boolean }>()
  const groups = projectRowGroups(
    binding,
    view,
    new Map([[task.id, await remoteRowDigest(state, task.id)]]),
    allowed,
    REMOTE_ACTIONS,
    now,
  )
  const row = groups.askGroups.flatMap(group => group.rows).find(row => row.id === task.id)!
  expect(row.state).toBe('settled')
  expect(row.latestUndo).toBe(true)
  expect(row.shownActions.map(action => action.label)).toEqual(['Undo'])
  expect(row.allActions[0]!.command).toBe('undo')
  const second = before.ledger.items.filter(item => item.kind === 'task')[1]!
  const later = { ...state, ledger: closeItem(state.ledger, second.id, { how: 'done', outcome: 'done' }, now + 1) }
  const latest = projectRowGroups(
    binding,
    sessionView(later, now + 1, 5120, { ...NO_HOLDS, shownSince: now - 1 }),
    new Map(),
    new Map(),
    REMOTE_ACTIONS,
    now + 1,
  )
  expect(
    latest.askGroups
      .flatMap(group => group.rows)
      .filter(row => row.latestUndo)
      .map(row => row.id),
  ).toEqual([second.id])
  expect(allowed.get(row.shownActions[0]!.key)).toMatchObject({
    press: { action: 'undo', id: task.id },
    disabled: false,
  })
})

test('Fold all keeps other tabs and uses the captured collapse records', () => {
  const now = Date.now()
  const state = fixtureSession(now)
  const original = structuredClone(state)
  const first = collapseProjection(state, NO_VIEW_PREFERENCES, now)
  const kept = { id: 'f23', value: first.offer('f23') }
  const preferences = { folds: ['issue'], collapsed: ['f23'], collapses: [kept] }
  const capture = collapseProjection(state, preferences, now)
  const view = sessionView(capture.state, now, 5120)
  const plan = projectFolds(view, capture.offer).find(plan => plan.tab === 'asks')!
  const place = {
    id: 'session',
    name: 'Fixture',
    tab: 'asks',
    asksExpanded: 'i11',
    findsExpanded: '',
    prsExpanded: '',
    asksTop: 0,
    findsTop: 0,
    statusTop: 0,
    prsTop: 0,
    reply: '',
    options: [],
    earlier: ['issue'],
    ...preferences,
  }
  const closed = changeFolds(['first', 'session', plan, place, 'toggle'])
  expect(closed.folds).toContain('issue')
  expect(closed.collapsed).toContain('i11')
  expect(closed.collapsed).toContain('i14')
  expect(closed.collapses.find(entry => entry.id === 'i11')?.value).toBe(capture.offer('i11'))
  expect(closed.collapses.find(entry => entry.id === 'f23')).toEqual(kept)
  const next = collapseProjection(state, closed, now + 1)
  const nextPlan = projectFolds(sessionView(next.state, now + 1, 5120), next.offer).find(plan => plan.tab === 'asks')!
  const opened = changeFolds([
    'second',
    'session',
    nextPlan,
    { ...place, folds: closed.folds, collapsed: closed.collapsed, collapses: closed.collapses },
    'toggle',
  ])
  expect(opened.collapsed).toEqual(['f23'])
  expect(opened.collapses).toEqual([kept])
  expect(opened.folds).toEqual(expect.arrayContaining(['issue', 'questions', 'tasks']))
  expect(state).toEqual(original)
  expect(place.collapsed).toEqual(['f23'])
})

for (const oversized of ['count', 'bytes']) {
  test(`Fold all refuses oversized ${oversized} without changing saved preferences`, () => {
    const rows = Array.from({ length: oversized === 'count' ? 257 : 64 }, (_, index) => `i${index + 1}`)
    const value = JSON.stringify({
      at: 1000,
      ...(oversized === 'bytes' ? { untimedUrl: 'https://example.test/' + 'x'.repeat(2048) } : {}),
    })
    const plan = {
      tab: 'asks',
      closed: [],
      statusFolds: [],
      parents: [],
      rows,
      records: rows.map(id => ({ id, value })),
    }
    const place = {
      id: 'session',
      name: 'Fixture',
      tab: 'asks',
      asksExpanded: '',
      findsExpanded: '',
      prsExpanded: '',
      asksTop: 0,
      findsTop: 0,
      statusTop: 0,
      prsTop: 0,
      reply: '',
      options: [],
      earlier: [],
      folds: ['issue'],
      collapsed: [],
      collapses: [],
    }
    const result = changeFolds(['s', 'session', plan, place, 'close'])
    expect(result.error).not.toBe('')
    expect(result.folds).toEqual(place.folds)
    expect(result.collapsed).toEqual(place.collapsed)
    expect(result.collapses).toEqual(place.collapses)
  })
}

test('render revisions ignore collapse capture time but include visible content', () => {
  const before = { title: 'Work', actions: [{ label: 'Fold', collapse: JSON.stringify({ at: 1 }) }] }
  const recaptured = { ...before, actions: [{ label: 'Fold', collapse: JSON.stringify({ at: 2 }) }] }
  expect(renderVersion(recaptured)).toBe(renderVersion(before))
  expect(renderVersion({ ...before, title: 'New work' })).not.toBe(renderVersion(before))
})

test('stop banners offer Resume only with the advertised capability and expose pending or failed delivery', async () => {
  const state = fixtureSession(1000)
  state.stop = { kind: 'api-error', detail: 'overloaded', resets: null, at: 999 }
  state.presence.isTurnRunning = false
  const allowed = new Map()
  const hidden = await projectBanners(state, null, binding, [], new Map(), allowed)
  expect(hidden[0]?.key).toBe('')
  expect(allowed.size).toBe(0)
  const ready = await projectBanners(state, null, binding, ['resume'], new Map(), allowed)
  expect(ready[0]).toMatchObject({ title: 'Stopped', label: 'Resume', disabled: false })
  expect(allowed.get(ready[0]!.key).press).toEqual({ action: 'resume', id: 'session' })
  state.lastActions.session = {
    kind: 'handoff',
    action: 'resume',
    text: 'Resume',
    at: 1000,
    turnsStarted: state.presence.turnsStarted,
    delivery: { state: 'queued', message: 'Continue' },
  }
  const waiting = await projectBanners(state, null, binding, ['resume'], new Map(), new Map())
  expect(waiting[0]).toMatchObject({ label: 'Resuming…', disabled: true })
  state.lastActions.session.delivery = { state: 'failed', reason: 'Host refused delivery' }
  const failed = await projectBanners(state, null, binding, ['resume'], new Map(), new Map())
  expect(failed[0]?.disabled).toBe(false)
  expect(failed[0]?.body).toContain('Host refused delivery')
  state.stop.kind = 'sign-in'
  const signIn = await projectBanners(state, null, binding, ['resume'], new Map(), new Map())
  expect(signIn[0]?.key).toBe('')
  expect(signIn[0]?.body).toContain('/login')
})

test('tasks with result options project result buttons in shared order without Done', async () => {
  const now = Date.now()
  const state = fixtureSession(now)
  const task = state.ledger.items.find(item => item.kind === 'task')!
  task.options = ['Hola', 'Hello']
  const view = sessionView(state, now, 1000)
  const allowed = new Map<string, { press: RowPress; disabled: boolean }>()
  const groups = projectRowGroups(binding, view, new Map([[task.id, await remoteRowDigest(state, task.id)]]), allowed)
  const row = groups.askGroups.flatMap(group => group.rows).find(r => r.id === task.id)!
  expect(row.options).toEqual([])
  const labels = row.shownActions.map(action => action.label)
  expect(labels.indexOf('Hola')).toBeGreaterThanOrEqual(0)
  expect(labels.indexOf('Hello')).toBe(labels.indexOf('Hola') + 1)
  expect(labels.indexOf('Reply')).toBe(labels.indexOf('Hello') + 1)
  expect(labels).not.toContain('Done')
})
