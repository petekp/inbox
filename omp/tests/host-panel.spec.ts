import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { isSubjectSeen, LOOK_MIN_MS } from '../../hooks/status-children'
import { EMPTY_SESSION_STATUS } from '../../hooks/status-limits'
import { NO_HOLDS } from '../../hooks/timing'
import { createInbox } from '../src/host'
import { call, deps, endWorld, makeCtx, pi, prompt, record, settle, startWorld, state, w } from './host-harness'

beforeEach(startWorld)
afterEach(endWorld)

test('the screen carries the view, the model and the gh state', async () => {
  const inbox = createInbox(pi(), deps())
  await record({ kind: 'task', ask: 'Try the CLI by hand' })
  const screen = await inbox.screen(makeCtx())
  expect(screen.view.needsYou.count).toBe(1)
  expect(screen.modelName).toBe('Claude Sonnet 4.5')
  expect(screen.isGhMissing).toBe(false)
  expect(screen.isFetchingPrs).toBe(false)
})

test('opening the panel finds gh missing when no gh starts', async () => {
  const inbox = createInbox(pi(), deps())
  for (const gh of ['gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh']) w.execResults.set(gh, new Error('spawn failed'))
  await record({ kind: 'task', ask: 'Try the CLI by hand' })
  await inbox.openPanel(makeCtx(), w.clock)
  await settle()
  expect((await inbox.screen(makeCtx())).isGhMissing).toBe(true)
})

test('opening the panel does not find gh missing when every gh run times out', async () => {
  const inbox = createInbox(pi(), deps())
  for (const gh of ['gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh'])
    w.execResults.set(gh, { code: -1, killed: true })
  await record({ kind: 'task', ask: 'Try the CLI by hand' })
  await inbox.openPanel(makeCtx(), w.clock)
  await settle()
  expect((await inbox.screen(makeCtx())).isGhMissing).toBe(false)
})

test('opening the panel finds gh signed out, and a later fetch that gh answers without asking clears it', async () => {
  const inbox = createInbox(pi(), deps())
  w.execResults.set('gh', { code: 4, stderr: 'To get started with GitHub CLI, please run:  gh auth login' })
  await record({ kind: 'task', ask: 'Try the CLI by hand' })
  await inbox.openPanel(makeCtx(), w.clock)
  await settle()
  const signedOut = await inbox.screen(makeCtx())
  expect(signedOut.isGhMissing).toBe(false)
  expect(signedOut.view.prs.isGhSignedOut).toBe(true)

  w.execResults.set('gh', { code: 1, stderr: 'no pull requests found for branch "main"' })
  w.clock += 130_000
  inbox.fetchPrsWhenDue(makeCtx(), true)
  await settle()
  expect((await inbox.screen(makeCtx())).view.prs.isGhSignedOut).toBe(false)
})

test('opening the panel finds gh and fetches PRs again only after the refresh interval, which the hidden PRs tab does not reach at 2 minutes', async () => {
  const inbox = createInbox(pi(), deps())
  await record({ kind: 'task', ask: 'Try the CLI by hand' })
  const ghCalls = (sub: string) => w.execCalls.filter(c => c.args[0] === sub).length
  await inbox.openPanel(makeCtx(), w.clock)
  await settle()
  expect(ghCalls('--version')).toBe(1)
  expect(ghCalls('pr')).toBe(1)
  expect((await inbox.screen(makeCtx())).isGhMissing).toBe(false)

  inbox.fetchPrsWhenDue(makeCtx(), true)
  await settle()
  expect(ghCalls('pr')).toBe(1)

  w.clock += 130_000
  inbox.fetchPrsWhenDue(makeCtx(), false)
  await settle()
  expect(ghCalls('pr')).toBe(1)

  inbox.fetchPrsWhenDue(makeCtx(), true)
  await settle()
  expect(ghCalls('pr')).toBe(2)
  expect(ghCalls('--version')).toBe(1)
})

test('the panel being open is told to the agent beside the prompt', async () => {
  const inbox = createInbox(pi(), deps())
  await prompt('hello')
  await record({ kind: 'task', ask: 'Try the CLI by hand' })
  await inbox.openPanel(makeCtx(), w.clock)
  await settle()
  const open = await prompt('next')
  inbox.closePanel(makeCtx())
  await call('turn_start', { type: 'turn_start' })
  const closed = await prompt('after')
  expect(open.message.content).toContain('/inbox panel open')
  expect(closed.message.content).toContain('/inbox panel is closed')
})

test('the /inbox command reports the counts, and /inbox demo reports the demo counts', async () => {
  createInbox(pi(), deps())
  await record({ kind: 'task', ask: 'Try the CLI by hand' })
  await w.commands.get('inbox').handler('', makeCtx())
  await w.commands.get('inbox').handler('demo', makeCtx())
  expect(w.notices[0]).toBe('Asks 1, Finds 0')
  expect(w.notices[1]).not.toBe(w.notices[0])
})

const theme = {
  isLight: false,
  bold: (s: string) => s,
  inverse: (s: string) => s,
  underline: (s: string) => s,
  fg: (_color: string, s: string) => s,
}

function tuiCtx() {
  const widgets: { key: string; content: unknown; options: unknown }[] = []
  const components: any[] = []
  const renders = { count: 0 }
  const base = makeCtx() as any
  const ctx = {
    ...base,
    mode: 'tui',
    setInterval: () => 0,
    clearTimer: () => {},
    ui: {
      ...base.ui,
      setWidget: (key: string, content: unknown, options: unknown) => widgets.push({ key, content, options }),
      custom: (factory: any) =>
        new Promise(resolve => {
          const tui = { requestRender: () => renders.count++, terminal: { rows: 40 } }
          Promise.resolve(factory(tui, theme, {}, resolve)).then(component => components.push(component))
        }),
    },
  }

  return { ctx, widgets, components, renders }
}

const tick = () => new Promise(resolve => setTimeout(resolve, 5))
const until = async (isReady: () => boolean) => {
  for (let n = 0; n < 400 && !isReady(); n++) await tick()
}

test('the band shows above the editor and redraws with the counts after a change', async () => {
  createInbox(pi(), deps())
  const { ctx, widgets, renders } = tuiCtx()
  await call('session_start', { type: 'session_start' }, ctx)
  expect(widgets).toHaveLength(1)
  expect(widgets[0]).toMatchObject({ key: 'inbox-band', options: { placement: 'aboveEditor' } })
  const band = (widgets[0]!.content as any)({ requestRender: () => renders.count++ }, theme)
  await until(() => band.render(80).join('').includes('Nothing needed'))
  expect(band.render(80).join('')).toContain('Nothing needed')
  const before = renders.count
  await record({ kind: 'task', ask: 'Try the CLI by hand' }, ctx)
  await until(() => renders.count > before)
  expect(renders.count).toBeGreaterThan(before)
  expect(band.render(80).join('')).toContain('Asks')
  expect(band.render(80).join('')).toContain('/inbox to open')
})

test('the band is not drawn without a terminal UI', async () => {
  createInbox(pi(), deps())
  const { ctx, widgets } = tuiCtx()
  await call('session_start', { type: 'session_start' }, { ...ctx, mode: 'print' })
  expect(widgets).toHaveLength(0)
})

test('/inbox hides the band while the panel shows, draws the session, presses, and brings the band back', async () => {
  createInbox(pi(), deps())
  const { ctx, widgets, components } = tuiCtx()
  await record({ kind: 'task', ask: 'Try the CLI by hand' }, ctx)
  const opened = w.commands.get('inbox').handler('', ctx)
  await until(() => components.length > 0)
  expect(widgets.at(-1)).toMatchObject({ key: 'inbox-band', content: undefined })
  const panel = components[0]
  await until(() => panel.render(80).join('\n').includes('Try the CLI by hand'))
  expect(panel.render(80).join('\n')).toContain('Try the CLI by hand')
  panel.handleInput('d')
  await until(() => state().ledger.closed.length > 0)
  expect(state().ledger.closed.map((c: { ask: string }) => c.ask)).toEqual(['Try the CLI by hand'])
  panel.handleInput('\x1b')
  await opened
  panel.dispose()
  expect(widgets.at(-1)!.content).toBeInstanceOf(Function)
})

test('/inbox demo draws the shared demo data and sends nothing', async () => {
  createInbox(pi(), deps())
  const { ctx, components } = tuiCtx()
  const opened = w.commands.get('inbox').handler('demo', ctx)
  await until(() => components.length > 0)
  await tick()
  const panel = components[0]
  expect(panel.render(100).join('\n')).toContain('Buttons here send nothing.')
  panel.handleInput('enter')
  await tick()
  expect(w.sent).toEqual([])
  panel.handleInput('\x1b')
  await opened
  panel.dispose()
})

test('in a Herdr app terminal, /inbox opens the Herdr panel beside the terminal and no omp panel, and opens its own panel when Herdr refuses the split', async () => {
  const appHome = join(w.dir, 'app')
  mkdirSync(join(appHome, 'mods/inbox'), { recursive: true })
  writeFileSync(join(appHome, 'mods/inbox/main.js'), '')
  const ls = { spaces: [{ machine: null, tabs: [{ terminals: [{ terminal: 't1', pane: 'p1' }] }] }] }
  let split = { code: 0, stdout: '{"pane":"p9"}' }
  const api = pi() as { exec: (command: string, args: string[]) => Promise<unknown> }
  api.exec = async (command, args) => {
    w.execCalls.push({ command, args })
    if (command !== 'herdr-app') return { code: 0, stdout: '', stderr: '', killed: false }
    const gone = { code: 1, stdout: '{"error":"no such pane"}' }
    const answer = args[0] === 'ls' ? { code: 0, stdout: JSON.stringify(ls) } : args[1] === 'pane.focus' ? gone : split
    return { stderr: '', killed: false, ...answer }
  }
  createInbox(api as never, {
    ...deps(),
    herdrTarget: { kind: 'terminal', terminal: 't1', appHome, hc: ['hc'], herdrApp: ['herdr-app'] },
  })
  const { ctx, components } = tuiCtx()

  await w.commands.get('inbox').handler('', ctx)
  expect(w.execCalls.slice(-2)).toEqual([
    { command: 'herdr-app', args: ['do', 'pane.split', '{"direction":"right","pane":"p1","mod":"inbox"}'] },
    { command: 'hc', args: ['label', 't1', 'inbox.panel=p9'] },
  ])
  expect(w.notices).toEqual(['Opened the inbox in Herdr, to the right of this terminal.'])
  expect(components).toHaveLength(0)

  split = { code: 1, stdout: '{"error":"unknown mod inbox"}' }
  const opened = w.commands.get('inbox').handler('', ctx)
  await until(() => components.length > 0)
  await until(() => components[0].render(80).join('\n').includes('Nothing needed'))
  expect(w.notices.at(-1)).toBe('Opened the inbox here, since Herdr did not split the pane: unknown mod inbox.')
  components[0].handleInput('\x1b')
  await opened
  components[0].dispose()
})

test('a look starts when the panel shows the Status and ends on another tab or when the panel closes, counts once it lasted five seconds, and each new tab saves the showing the panel started', async () => {
  const inbox = createInbox(pi(), deps())
  await prompt('hello')
  const saved = state()
  const overview = { ...EMPTY_SESSION_STATUS, head: { title: 'Ship it', description: 'Shipping the first version' } }
  writeFileSync(join(w.dir, 'sessions', 's1.json'), JSON.stringify({ ...saved, ledger: { ...saved.ledger, overview } }))
  await inbox.openPanel(makeCtx(), w.clock)
  inbox.showTab(makeCtx(), 'overview', { ...NO_HOLDS, shownSince: 1234 })
  await settle()
  expect(state().ledger.overview.look).not.toBeNull()
  expect(state().shownSince).toBe(1234)

  inbox.showTab(makeCtx(), 'needsYou', { ...NO_HOLDS, shownSince: 5678 })
  await settle()
  expect(state().ledger.overview.look).toBeNull()
  expect(state().ledger.overview.lastLookAt).toBeNull()
  expect(state().shownSince).toBe(5678)

  inbox.showTab(makeCtx(), 'overview', NO_HOLDS)
  await settle()
  w.clock += LOOK_MIN_MS
  inbox.showTab(makeCtx(), 'needsYou', NO_HOLDS)
  await settle()
  expect(state().ledger.overview.lastLookAt).not.toBeNull()

  inbox.showTab(makeCtx(), 'overview', NO_HOLDS)
  await settle()
  inbox.closePanel(makeCtx())
  await settle()
  expect(state().ledger.overview.look).toBeNull()
})

test('a look counts as seen only the Status subjects the panel reported on screen, on another tab and when the panel closes', async () => {
  const inbox = createInbox(pi(), deps())
  await prompt('hello')
  const saved = state()
  const subject = (id: string) => ({
    id,
    name: id,
    status: 'working',
    text: '',
    was: null,
    merged: null,
    createdAt: 1,
    changedAt: 1,
    closedAt: null,
    into: null,
  })
  const overview = { ...EMPTY_SESSION_STATUS, subjects: ['s1', 's2', 's3'].map(subject), nextId: 4 }
  writeFileSync(join(w.dir, 'sessions', 's1.json'), JSON.stringify({ ...saved, ledger: { ...saved.ledger, overview } }))
  await inbox.openPanel(makeCtx(), w.clock)
  const look = async (shown: string[], end: () => void) => {
    inbox.showTab(makeCtx(), 'overview', NO_HOLDS)
    await settle()
    inbox.showRows(makeCtx(), shown)
    w.clock += LOOK_MIN_MS
    end()
    await settle()
    const o = state().ledger.overview
    return o.subjects
      .filter((x: { id: string; changedAt: number }) => isSubjectSeen(o, x))
      .map((x: { id: string }) => x.id)
  }

  expect(await look(['s1'], () => inbox.showTab(makeCtx(), 'needsYou', NO_HOLDS))).toEqual(['s1'])
  expect(await look(['s2'], () => inbox.closePanel(makeCtx()))).toEqual(['s1', 's2'])
})

test('every row the agent closes while the panel shows its tab keeps its closed record through more closes than the Closed list keeps, until the panel closes', async () => {
  const inbox = createInbox(pi(), deps())
  for (let n = 0; n < 14; n++) await record({ kind: 'task', ask: `Task ${n}` })
  const ids = state().ledger.items.map((i: { id: string }) => i.id)
  const openedAt = w.clock
  await inbox.openPanel(makeCtx(), openedAt)
  for (const id of ids)
    await w.tools.get('close').execute('call', { id, reason: 'done' }, undefined, undefined, makeCtx())

  expect(state().ledger.closed.map((c: { id: string }) => c.id)).toEqual(ids)
  const shown = await inbox.screen(makeCtx(), { replies: {}, discarded: {}, shownSince: openedAt, listInput: null })
  expect(shown.view.needsYou.tasks.filter(r => r.state.is === 'settled').map(r => r.id)).toEqual(ids)

  inbox.closePanel(makeCtx())
  await settle()
  await record({ kind: 'task', ask: 'One more' })
  expect(state().ledger.closed.map((c: { id: string }) => c.id)).toEqual(ids.slice(2))
})
