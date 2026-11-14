import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { TabsProps } from '../hooks/tabs-client'
import { w, world } from './hooks-world'
import { PANE } from './hooks-helpers'

const mountPane = ($: Engine, surface: 'terminal' | 'desktop') => $.ui.mount({ ...PANE, surface })

const SPARE = '/tmp/claude/spares/spare-1'
const PROJECT = '/tmp/greet'

async function openPrsTab($: Engine, surface: 'terminal' | 'desktop') {
  const pane = await mountPane($, surface)
  w.paneState = { isShown: true, isFocused: true }
  await showPrs(pane, surface)

  return pane
}

async function showPrs(pane: Awaited<ReturnType<typeof mountPane>>, surface: 'terminal' | 'desktop') {
  if (surface === 'terminal') return pane.press({ key: 'tab-prs' })
  const { tabs, gap } = (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
  const x = tabs
    .slice(
      0,
      tabs.findIndex(t => t.id === 'prs'),
    )
    .reduce((sum, t) => sum + t.width + gap, 0)

  return pane.pointer({ type: 'down', x, y: 1, button: 'left', in: 'tabs' })
}

const savedPlace = () => JSON.parse(w.stored.get('s:session-1') ?? '{}').place
const ghRunsIn = (cwd: string) => w.ranIn.filter(r => r.argv[0] === 'gh' && r.argv[1] === 'pr' && r.cwd === cwd)

async function startInSpare($: Engine, clock: ReturnType<typeof mock.clock>) {
  w.root = SPARE
  w.folders = [SPARE, PROJECT]
  w.branches = { [PROJECT]: 'main' }
  await $.session.start({ cwd: SPARE, surface: 'desktop', isInteractive: true })
  await clock.settle()
}

async function moveToProject($: Engine, clock: ReturnType<typeof mock.clock>) {
  w.root = PROJECT
  await $.classic.SessionStart({ source: 'startup', session_id: 'session-1' })
  w.folders = [PROJECT]
  await clock.settle()
}

test('a desktop session the Claude app moves out of its spare folder fetches its PRs again in the project, with no press', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await startInSpare($, clock)
  const pane = await openPrsTab($, 'desktop')
  await clock.settle()
  w.ranIn = []

  await moveToProject($, clock)

  expect(ghRunsIn(PROJECT).length).toBeGreaterThan(0)
  expect(w.ranIn.filter(r => r.cwd === SPARE)).toEqual([])
  expect(await pane.find({ text: /could not find gh/ })).toBeUndefined()
  expect(await pane.find({ text: /No PRs/ })).toBeDefined()
})

test('a session whose folder is gone starts no command in it, and the PRs tab does not say gh is missing', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await startInSpare($, clock)
  w.folders = [PROJECT]
  w.ranIn = []

  const pane = await openPrsTab($, 'desktop')
  await clock.settle()
  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Hello.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()

  expect(ghRunsIn('/').length).toBeGreaterThan(0)
  expect(w.ranIn.filter(r => r.cwd === SPARE)).toEqual([])
  expect(await pane.find({ text: /could not find gh/ })).toBeUndefined()
})

test('a session moved out of its spare folder saves the project as its folder, with the project’s branch', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await startInSpare($, clock)
  expect(savedPlace()).toEqual({ folder: SPARE, branch: null })

  await moveToProject($, clock)
  expect(savedPlace()).toEqual({ folder: PROJECT, branch: 'main' })

  w.branches = { [PROJECT]: 'feature' }
  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Hello.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(savedPlace()).toEqual({ folder: PROJECT, branch: 'feature' })
})

test('a session loaded with a saved folder that is gone saves the folder it runs in', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.branches = { '/tmp/project': 'main' }
  w.stored.set('s:session-1', JSON.stringify({ place: { folder: SPARE, branch: null } }))

  await $.session.start({ cwd: '/tmp/project', surface: 'desktop', isInteractive: true })
  await clock.settle()

  expect(savedPlace()).toEqual({ folder: '/tmp/project', branch: 'main' })
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`a ${surface} session whose folder never changes runs every gh and git command in it and keeps its saved folder`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    w.branches = { '/tmp/project': 'main' }
    await $.session.start({ cwd: '/tmp/project', surface, isInteractive: true })
    await clock.settle()
    await $.classic.SessionStart({ source: 'startup', session_id: 'session-1' })
    await clock.settle()
    expect(w.ranIn.filter(r => r.argv[0] === 'gh')).toEqual([])

    await openPrsTab($, surface)
    await clock.settle()
    await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
    await $.turn.complete({ answer: 'Hello.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
    await clock.settle()

    const projectRuns = w.ranIn.filter(r => (r.argv[0] === 'gh' && r.argv[1] !== '--version') || r.argv[0] === 'git')
    expect(projectRuns.length).toBeGreaterThan(0)
    expect(projectRuns.filter(r => r.cwd !== '/tmp/project')).toEqual([])
    expect(savedPlace()).toEqual({ folder: '/tmp/project', branch: 'main' })
  })
}
