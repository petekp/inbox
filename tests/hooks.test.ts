import { expect, mock, test } from 'claude-code/testing'
import type { On, RenderSurface } from 'claude-code'

const LEDGER_REPLY = `GOAL: Add a greeting CLI
DONE: Plan written
NOW: Waiting on two choices
NEW: decide | 1 | Use Node or Python? | Node / Python | Node
NEW: decide | 2 | Name the command greet? | - | yes`

const BAND = {
  component: 'AbovePrompt' as const,
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 16,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 15 },
    view: {},
  },
}

// What the per-turn ledger model answers; a test can make it fail.
let ledgerReply = LEDGER_REPLY

// Prompts the mod sent as the person's own, as the engine's chain received them.
let sent: string[] = []

// Every command the mod ran, such as the herdr call that publishes the sidebar line.
let ran: string[][] = []

// What another plugin's Stop hook answers; a test can make it send Claude back.
let stopBlock: string | undefined

// gh's answers by command; anything else fails, as gh does outside a repo with no PR.
// `hold` delays an answer until it resolves, as a slow network would.
let ghAnswers: {
  match: (argv: readonly string[]) => boolean
  stdout: string
  hold?: () => Promise<void>
  // Makes the call fail with this message.
  fails?: string
}[] = []

function gh(argv: readonly string[]) {
  const hit = ghAnswers.find(a => a.match(argv))

  return {
    exitCode: hit && !hit.fails ? 0 : 1,
    stdout: hit && !hit.fails ? hit.stdout : '',
    stderr: hit ? (hit.fails ?? '') : 'no pull requests found',
    isStdoutTruncated: false,
    isStderrTruncated: false,
  }
}

const PANE = {
  plugin: 'inbox',
  surface: 'terminal' as const,
  component: 'Pane' as const,
  requestId: 'inbox',
  props: {
    title: 'Inbox',
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
}

// The apps drawing the session when it starts. A REPL start sets isInteractive instead.
let surfaces: RenderSurface[] = []

function world(on: On, prompts: string[], vars: Record<string, string> = {}) {
  sent = []
  ran = []
  stopBlock = undefined
  ghAnswers = []
  ledgerReply = LEDGER_REPLY
  surfaces = []
  mock.store(on)
  on('session.surfaces', () => ({ value: surfaces }))
  on('session.attach', ($, e) => ({ clientId: e.clientId }))
  on('session.id', () => ({ value: 'session-1' }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('session.root', () => ({ value: '/tmp/project' }))
  // Outside Herdr unless a test passes HERDR_PANE_ID.
  on('env.get', ($, e) => ({ value: vars[e.name] }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__inbox__${e.name}` } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('process.run', async ($, e) => {
    ran.push([...e.argv])
    await ghAnswers.find(a => a.match(e.argv))?.hold?.()
    return { value: gh(e.argv) }
  })
  on('model.complete', ($, e) => {
    prompts.push(e.prompt)

    return {
      value: {
        isAnswered: true,
        text: ledgerReply,
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }
  })
  on('prompt.submit', ($, e) => {
    if (e.origin.kind === 'plugin') sent.push(e.text)

    return { text: e.text, context: e.context }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('classic.StopFailure', () => ({}))
  on('classic.PermissionRequest', () => ({}))
  on('classic.Stop', () => (stopBlock ? { block: stopBlock } : {}))
  on('classic.SessionStart', () => ({}))
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  // The engine asks the person, as for a file outside the project.
  on('tool.check', () => ({ decision: 'ask' as const }))
  // The band with nothing to show falls through to the engine's own, drawn empty here.
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
}

/** The sidebar lines the mod published to Herdr, in order. */
function sidebarLines(): string[] {
  return ran.filter(argv => argv[0] === 'herdr').map(argv => argv.find(a => a.startsWith('inbox='))?.slice(6) ?? '')
}

test('a reply becomes a card and open items, and "1. yes" carries the question', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world(on, prompts)

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Plan ready. 1. Node or Python? 2. Call it greet?',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()

  expect(prompts.length).toBe(1)
  expect(prompts[0]).toContain('<person>\nadd a greeting cli\n</person>')

  // The band counts what waits; the items themselves are in /inbox.
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /2 waiting on you in \/inbox/ })).toBeDefined()
  expect(await band.find({ text: /Use Node or Python\?/ })).toBeUndefined()

  const answered = await $.prompt.submit({ text: '1. node\n2. yes', wait: false, origin: { kind: 'composer' } })
  expect(answered.context?.join('\n')).toContain('1 → "Use Node or Python?"')
  // Claude reads the open items beside a prompt, and again only after they change.
  expect(answered.context?.join('\n')).toContain('Waiting on the user:\n- [i1] (1) "Use Node or Python?"')
  const unchanged = await $.prompt.submit({ text: 'also add a --loud flag', wait: false, origin: { kind: 'composer' } })
  expect(unchanged.context?.join('\n') ?? '').not.toContain('Waiting on the user')

  // Pressing an answer in the pane sends it as the person's message and closes the item.
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'answer-i1-0' })
  expect(sent).toEqual(['Re "Use Node or Python?": Node'])
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()
  // The per-turn update reads the pressed answer as the person's message.
  await $.turn.complete({ answer: 'Using Node.', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect(prompts.at(-1)).toContain('Re "Use Node or Python?": Node\n</person>')
})

test('a question’s handle is the number a typed answer reaches, and the band counts what the tab counts', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [], { HERDR_PANE_ID: 'p1' })
  // A HELP line's command must appear in Claude's reply.
  const reply = async (text: string, turnId: string) => {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text, turnId })
    await $.turn.complete({ answer: 'Run ./load.sh.', durationMs: 5, isAborted: false, turnId, reason: 'answer' })
    await clock.settle()
  }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await reply('add a greeting cli', 't1')
  // The next reply asks two new questions and leaves two tasks; the first reply's questions stay open.
  ledgerReply = [
    'NOW: Waiting on the flags',
    'NEW: decide | 1 | Add a --loud flag? | yes / no | yes',
    'NEW: do | - | Run the load script | - | -',
    'HELP: new 2 | run | ./load.sh | load script',
    'NEW: decide | 2 | Print in color? | yes / no | no',
    'NEW: do | - | Sign in to npm | - | -',
  ].join('\n')
  await reply('add flags too', 't2')

  const pane = await $.ui.mount(PANE)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  const handle = async (id: string) => (await pane.find({ key: `select-${id}` }))?.props.label
  // The latest reply's questions lead, numbered as a typed answer reaches them, and older ones read "?".
  expect(await pane.find({ key: 'explain-i3' })).toBeDefined()
  expect([await handle('i3'), await handle('i5'), await handle('i1'), await handle('i2')]).toEqual([
    '1)',
    '2)',
    '?',
    '?',
  ])
  expect(await band.find({ text: /6 waiting on you/ })).toBeDefined()
  expect(await pane.find({ text: /^ 6$/ })).toBeDefined()

  // "1." answers the row drawn as 1).
  const answered = await $.prompt.submit({ text: '1. yes', wait: false, origin: { kind: 'composer' } })
  expect(answered.context?.join('\n')).toContain('1 → "Add a --loud flag?"')
  // After any message of the person's, a typed number no longer reaches the batch.
  expect(await handle('i3')).toBe('?')

  // A task handed to Claude leaves the band's count and the tab's alike.
  await pane.press({ key: 'select-i4' })
  await pane.press({ key: 'help-i4-0' })
  await clock.settle()
  expect(await band.find({ text: /5 waiting on you/ })).toBeDefined()
  expect(await pane.find({ text: /^ 5$/ })).toBeDefined()

  // The sidebar names the pane's top row, even when the latest reply lists a task first.
  ledgerReply = ['NEW: do | - | Water the plants | - | -', 'NEW: decide | 1 | Ship it? | yes / no | yes'].join('\n')
  await reply('ship it', 't3')
  expect(await handle('i8')).toBe('1)')
  expect(sidebarLines().at(-1)).toBe('8 · Ship it?')
  // With no question in the latest reply, the newest older question leads.
  ledgerReply = 'NEW: do | - | Feed the cat | - | -'
  await reply('one more task', 't4')
  expect(sidebarLines().at(-1)).toBe('9 · Ship it?')
})

test('a task handed to Claude folds and leaves the count until Claude’s reply leaves it open', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])
  ledgerReply =
    'GOAL: Load the data\nNOW: Waiting on the load script\nNEW: do | - | Run the load script | - | -\nHELP: new 1 | run | ./load.sh | load script'

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'load the data', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'load the data', turnId: 't1' })
  await $.turn.complete({ answer: 'Run ./load.sh.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  const pane = await $.ui.mount(PANE)
  expect(await band.find({ text: /1 waiting on you/ })).toBeDefined()

  // Run hands the task to Claude: it folds to what was sent, and waits on no one in the band or the tab.
  await pane.press({ key: 'help-i1-0' })
  await clock.settle()
  expect(sent.at(-1)).toContain('./load.sh')
  expect(await pane.find({ text: /Run load script · just now/ })).toBeDefined()
  expect(await pane.find({ key: 'help-i1-0' })).toBeUndefined()
  expect(await band.find({ text: /waiting on you/ })).toBeUndefined()

  // The turn that answers the send ends with the task still open, so it waits on the person again.
  ledgerReply = 'NOW: The load script needs your password'
  await $.turn.start({ text: 'For "Run the load script", run this', turnId: 't2' })
  await $.turn.complete({ answer: 'It needs sudo.', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect((await pane.find({ key: 'help-i1-0-key' }))?.props.label).toBe('Run load script again')
  expect(await band.find({ text: /1 waiting on you/ })).toBeDefined()
})

test('a question with 7 options shows 4 until [All 7 options], draws its steps after them, and letters only the first 9', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])
  ledgerReply = [
    'NOW: Waiting on a color',
    'NEW: decide | 1 | Which color? | Red / Orange / Yellow / Green / Blue / Indigo / Violet | Green',
    'HELP: new 1 | run | ./a.sh | a script',
    'HELP: new 1 | run | ./b.sh | b script',
    'HELP: new 1 | run | ./c.sh | c script',
  ].join('\n')

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'pick a color', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Run ./a.sh, ./b.sh or ./c.sh first.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  const hotkey = async (key: string) => (await pane.find({ key: `${key}-key` }))?.props.hotkey

  // The first 4 options show, then [All 7 options], then the steps, which take the next letters.
  expect(await pane.find({ key: 'answer-i1-3' })).toBeDefined()
  expect(await pane.find({ key: 'answer-i1-4' })).toBeUndefined()
  expect(await hotkey('answer-i1-4')).toBeUndefined()
  expect((await pane.find({ key: 'all-options-i1' }))?.props.label).toBe('All 7 options')
  expect([await hotkey('answer-i1-3'), await hotkey('help-i1-0'), await hotkey('help-i1-2')]).toEqual(['f', 'g', 'i'])
  // The recommended option is drawn primary, with no suffix.
  expect((await pane.find({ key: 'answer-i1-3-key' }))?.props).toMatchObject({ label: 'Green', variant: 'primary' })

  await pane.press({ key: 'all-options-i1' })
  expect(await pane.find({ key: 'answer-i1-6' })).toBeDefined()
  expect(await pane.find({ key: 'all-options-i1' })).toBeUndefined()
  // 7 options and 3 steps: the last step has no letter, and still draws.
  expect([await hotkey('answer-i1-6'), await hotkey('help-i1-0'), await hotkey('help-i1-1')]).toEqual(['i', 'l', 'm'])
  expect(await hotkey('help-i1-2')).toBeUndefined()
  expect((await pane.find({ key: 'help-i1-2' }))?.props.label).toBe('Run c script')
  await pane.press({ key: 'answer-i1-6' })
  expect(sent).toEqual(['Re "Which color?": Violet'])
})

test('last actions an earlier build saved convert once by the table, and a task handed off then still folds', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])
  ledgerReply =
    'NOW: Waiting on the load script\nNEW: do | - | Run the load script | - | -\nHELP: new 1 | run | ./load.sh | load script'
  const LAST_ACTIONS = { plugin: 'inbox', key: 'lastActions' } as const
  const at = 1_000_000
  // An earlier build's last actions, by button key: one per row of the conversion, and ones that record nothing now.
  const thread = (id: string) => `acme/greet#12 thread ${id}`
  const old: Record<string, Record<string, unknown>> = {
    i1: {
      action: 'help-i1-0',
      text: 'Run load script',
      at,
      isHandoff: true,
      turnsStarted: 1,
      tab: 'needsYou',
      title: 'Run the load script',
      index: 0,
    },
    i2: { action: 'explain-i2', text: 'Explain sent', at },
    i3: { action: 'typed', text: 'Reply', at, isHandoff: true },
    i4: { action: 'step-1', text: 'Seed sent', at },
    i5: { action: 'explain', text: 'Explain sent', at },
    f6: { action: 'address-f6', text: 'Sent to Claude to fix', at },
    f7: { action: 'discuss-f7', text: 'Discuss sent', at },
    [thread('T1')]: { action: 'address-T1', text: 'Address', at, isHandoff: true },
    [thread('T2')]: { action: 'draft-T2', text: 'Draft reply', at },
    [thread('T3')]: { action: 'discuss-T3', text: 'Discuss', at },
    'pr:acme/greet#12': { action: 'resolve-acme/greet#12', text: 'Resolve conflicts', at, isHandoff: false },
    'pr:acme/greet#13': { action: 'address-all-acme/greet#13', text: 'Address all 2 threads', at },
    i8: { action: 'open-i8', text: 'Open', at },
    [`acme/greet#12 check test`]: { action: 'log-acme/greet#12-test', text: 'Open log', at },
    'check:/repo npm test': { action: 'fix-check', text: 'Fix', at },
  }
  const converted = {
    i1: {
      kind: 'handoff',
      action: 'step-0',
      text: 'Run load script',
      at,
      turnsStarted: 1,
      tab: 'needsYou',
      title: 'Run the load script',
      index: 0,
    },
    i2: { kind: 'talk', action: 'explain', text: 'Explain', at },
    i3: { kind: 'handoff', action: 'type', text: 'Reply', at },
    i4: { kind: 'handoff', action: 'step-1', text: 'Seed', at },
    i5: { kind: 'talk', action: 'explain', text: 'Explain', at },
    f6: { kind: 'handoff', action: 'address', text: 'Address', at },
    f7: { kind: 'talk', action: 'discuss', text: 'Discuss', at },
    [thread('T1')]: { kind: 'handoff', action: 'thread-address', text: 'Address', at },
    [thread('T2')]: { kind: 'talk', action: 'thread-draft', text: 'Draft reply', at },
    [thread('T3')]: { kind: 'talk', action: 'thread-discuss', text: 'Discuss', at },
    // Saved as not handing off, so it stays a talk.
    'pr:acme/greet#12': { kind: 'talk', action: 'pr-conflicts', text: 'Resolve conflicts', at },
    'pr:acme/greet#13': { kind: 'handoff', action: 'pr-address-all', text: 'Address all 2 threads', at },
  }
  // While set, the mod's next write of its last actions saves this instead, as an earlier build left them.
  let saving: unknown = null
  // The last actions the mod wrote last.
  let saved: unknown = null
  on('state.set', LAST_ACTIONS, ($, e, next) => {
    const write = saving ? { ...e, value: saving as never } : e
    saved = write.value
    return next(write)
  })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'load the data', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'load the data', turnId: 't1' })
  await $.turn.complete({ answer: 'Run ./load.sh.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  // A reload under the earlier build leaves its last actions; the next reload converts them.
  saving = old
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  saving = null
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(saved).toEqual(converted)
  saved = null
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(saved).toEqual(converted)

  // The task handed off by the old Run still folds, and waits on no one.
  const pane = await $.ui.mount(PANE)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await pane.find({ text: /Run load script · just now/ })).toBeDefined()
  expect(await pane.find({ key: 'help-i1-0' })).toBeUndefined()
  expect(await band.find({ text: /waiting on you/ })).toBeUndefined()
})

test('after 15 idle minutes the band shows where the session stands', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'add a greeting cli', turnId: 't1' })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()

  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /last active/ })).toBeUndefined()

  await clock.advance(16 * 60_000)
  expect(await band.find({ text: /last active 16m ago/ })).toBeDefined()
  expect(await band.find({ text: /Add a greeting CLI/ })).toBeDefined()

  await $.prompt.submit({ text: 'ok back', wait: false, origin: { kind: 'composer' } })
  expect(await band.find({ text: /last active/ })).toBeUndefined()
})

test('resumed into a conversation it cannot fork yet, it catches up from the transcript before any reply', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world(on, prompts)
  // A resumed session: earlier turns, but no request from this process to fork.
  on('session.turns', () => ({ value: 3 }))
  on('model.fork', () => ({ value: { isAnswered: false as const, reason: 'nothing-to-fork' as const } }))
  const said = (role: 'user' | 'assistant', text: string) => ({ role, text, toolUses: [] })
  on('session.messages', () => ({
    value: [
      said('user', 'Add a greeting CLI. Node or Python?'),
      said('user', 'inbox: what waits on the user, as of your last reply. Anything not listed here is closed.'),
      said('assistant', 'The plan is written. 1. Node or Python? 2. Name the command greet?'),
    ],
  }))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const conversation = prompts.at(-1)?.match(/<conversation>\n([\s\S]*?)\n<\/conversation>/)?.[1]
  // The mod's own context rows are not part of the conversation it summarizes.
  expect(conversation).toBe(
    'Person: Add a greeting CLI. Node or Python?\nAgent: The plan is written. 1. Node or Python? 2. Name the command greet?',
  )
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /Add a greeting CLI/ })).toBeDefined()
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
  expect(await pane.find({ text: /update failed/ })).toBeUndefined()
})

test('after a failed update, the next reply catches up over the whole conversation', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])
  on('model.fork', () => ({
    value: {
      isAnswered: true,
      text: 'GOAL: Ship the onboarding flow\nNOW: Waiting on copy review\nCLOSED: i1 | Node\nCLOSED: f3 | fixed\nNEW: do | - | Review the welcome copy | - | -',
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  // Findings and items share one id counter, so after i1 and i2 this finding is f3.
  await $.tool.call({
    tool: 'mcp__inbox__record_finding',
    kind: 'issue',
    title: 'README is stale',
    detail: 'It names the old command.',
  })

  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
  // An open item says how long it has waited.
  expect(await pane.find({ text: / · just now/ })).toBeDefined()
  // Only the selected item shows its actions; Next moves the selection.
  expect(await pane.find({ key: 'explain-i2' })).toBeUndefined()
  await pane.press({ key: 'next' })
  expect(await pane.find({ key: 'explain-i2' })).toBeDefined()
  await pane.press({ key: 'previous' })
  // Explain asks Claude about the item and leaves it open.
  await pane.press({ key: 'explain-i1' })
  expect(sent.at(-1)).toContain('"Use Node or Python?"\nOptions: Node / Python')
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()

  // This turn's update fails, so the next reply re-reads the whole conversation.
  ledgerReply = 'not a ledger'
  await $.turn.complete({ answer: 'Using Node.', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect(await pane.find({ text: /update failed/ })).toBeDefined()
  await $.turn.complete({
    answer: 'Fixed the README too.',
    durationMs: 5,
    isAborted: false,
    turnId: 't3',
    reason: 'answer',
  })
  await clock.settle()
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /Ship the onboarding flow/ })).toBeDefined()
  // It closes what the conversation handled, keeps what still waits, and adds what is new.
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()
  // The question shows under the open ones, with its outcome under it.
  expect(await pane.find({ text: /^Use Node or Python\?$/ })).toBeDefined()
  expect(await pane.find({ text: /^Node$/ })).toBeDefined()
  expect(await pane.find({ text: /Name the command greet\?/ })).toBeDefined()
  expect(await pane.find({ text: /Review the welcome copy/ })).toBeDefined()
  expect(await pane.find({ text: /update failed/ })).toBeUndefined()
  await pane.press({ key: 'tab-findings' })
  expect(await pane.find({ text: /README is stale/ })).toBeUndefined()
})

test('a reload that cuts off the end-of-turn hook catches up on load', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])
  on('model.fork', () => ({
    value: {
      isAnswered: true,
      text: 'GOAL: Add a greeting CLI\nNOW: Waiting on the push\nNEW: decide | - | Push the branch to origin? | yes / no | yes',
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'add a greeting cli', turnId: 't1' })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  // A turn with no prompt, as a task notification starts, ends in a reload that runs
  // no turn.complete hook, as when the turn edited the mod.
  await $.turn.start({ text: '', turnId: 't2' })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()

  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Push the branch to origin\?/ })).toBeDefined()
})

test('a finding Claude records while the pane shows an empty tab brings the pane to it, and Address sends it back', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])
  on('ui.panes', () => ({ value: [{ id: 'inbox', title: 'Inbox', isShown: true, isFocused: true, isPlaced: true }] }))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: '' } as never)
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /^Nothing needs you\.$/ })).toBeDefined()
  const r = await $.tool.call({
    tool: 'mcp__inbox__record_finding',
    kind: 'issue',
    title: 'Retry loop never backs off',
    detail: 'The fetch retry spins with no delay and can hammer the API.',
    path: 'src/api.ts',
  })
  expect(r.result).toBe('Recorded as f1. The user sees it in the Findings tab of the /inbox pane.')
  await clock.settle()
  expect(await pane.find({ text: /Retry loop never backs off/ })).toBeDefined()

  await pane.press({ key: 'address-f1' })
  expect(sent.at(-1)).toContain('Please address this finding you recorded:\nIssue: Retry loop never backs off')
  // It stays in place with what was sent for a few seconds, then leaves.
  await clock.settle()
  expect(await pane.find({ text: /^Address$/ })).toBeDefined()
  await clock.advance(9000)
  expect(await pane.find({ text: /Retry loop never backs off/ })).toBeUndefined()
})

test('t opens a field for the person’s own words: an answer closes its question, a reply sends a finding back', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])
  on('ui.focus', () => ({}))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Plan ready. 1. Node or Python? 2. Call it greet?',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  await $.tool.call({
    tool: 'mcp__inbox__record_finding',
    kind: 'issue',
    title: 'README is stale',
    detail: 'It names the old command.',
  })

  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ key: 'type-i1' })).toBeUndefined()
  await pane.press({ key: 'typekey-i1' })
  await pane.input({ key: 'type-i1', text: 'Deno, actually' })
  expect(sent.at(-1)).toBe('Re "Use Node or Python?": Deno, actually')
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()

  await pane.press({ key: 'tab-findings' })
  await pane.press({ key: 'typekey-f3' })
  await pane.input({ key: 'type-f3', text: 'Fix it after the CLI ships.' })
  expect(sent.at(-1)).toBe(
    'About this finding you recorded:\nIssue: README is stale\nIt names the old command.\n\nFix it after the CLI ships.',
  )
  await clock.settle()
  expect(await pane.find({ text: /^Reply$/ })).toBeDefined()
  await clock.advance(9000)
  expect(await pane.find({ text: /README is stale/ })).toBeUndefined()
})

test('Claude closes an item or finding that no longer applies, by the id it reads beside the prompt', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Plan ready. 1. Node or Python? 2. Call it greet?',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  await $.tool.call({
    tool: 'mcp__inbox__record_finding',
    kind: 'issue',
    title: 'README is stale',
    detail: 'It names the old command.',
  })
  const told = await $.prompt.submit({ text: 'where are we?', wait: false, origin: { kind: 'composer' } })
  expect(told.context?.join('\n')).toContain('- [i2] (2) "Name the command greet?"')
  expect(told.context?.join('\n')).toContain('- [f3] issue: README is stale')

  const close = (input: Record<string, string>) => $.tool.call({ tool: 'mcp__inbox__close', ...input } as never)
  const pane = await $.ui.mount(PANE)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  // The user answered i1 in their own message: it closes with their answer, shown in place.
  expect((await close({ id: 'i1', answer: 'Deno' })).result).toBe(
    'Closed i1. The user sees it in the /inbox pane with its outcome.',
  )
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()
  expect(await pane.find({ key: 'settled-i1' })).toBeDefined()
  expect(await band.find({ text: /✓ Use Node or Python\? → Deno/ })).toBeDefined()
  expect((await close({ id: 'i2', reason: 'no longer applies' })).result).toBe(
    'Closed i2. The user sees it in the /inbox pane with its outcome.',
  )
  expect((await close({ id: 'f3', reason: 'fixed' })).result).toBe('Closed finding f3.')
  expect((await close({ id: 'i9', reason: 'done' })).result).toContain(
    'Not closed: no open item or finding has the id i9.',
  )

  // After a few seconds the rows leave for the group's closed items, which start folded.
  await clock.advance(9000)
  expect(await pane.find({ key: 'settled-i1' })).toBeUndefined()
  expect(await band.find({ text: /✓/ })).toBeUndefined()
  expect(await pane.find({ text: /^Deno$/ })).toBeUndefined()
  await pane.press({ key: 'fold-question' })
  expect(await pane.find({ text: /^Deno$/ })).toBeDefined()
  expect(await pane.find({ text: /^Closed by Claude: no longer applies$/ })).toBeDefined()
})

test('a PR linked in a reply shows in the PRs tab, a task naming it opens it, its buttons send its conflicts and thread and say so, and its failing check waits on the person', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])
  ledgerReply = 'NOW: Waiting on review\nNEW: do | - | Mark #12 ready for review | - | -'
  // Whether the reviewer has answered since the thread was sent to Claude.
  let hasReply = false
  ghAnswers.push(
    {
      match: argv => argv.includes('view') && argv.includes('12'),
      get stdout() {
        return JSON.stringify({
          number: 12,
          title: 'Add a greeting CLI',
          url: 'https://github.com/acme/greet/pull/12',
          isDraft: false,
          state: 'OPEN',
          baseRefName: 'main',
          mergeable: 'CONFLICTING',
          reviewDecision: 'REVIEW_REQUIRED',
          statusCheckRollup: [
            {
              __typename: 'CheckRun',
              name: 'test',
              status: 'COMPLETED',
              conclusion: 'FAILURE',
              detailsUrl: 'https://github.com/acme/greet/actions/runs/7/job/1',
            },
          ],
        })
      },
    },
    {
      match: argv => argv.includes('graphql'),
      get stdout() {
        return JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                reviewThreads: {
                  nodes: [
                    {
                      id: 'T1',
                      isResolved: false,
                      isOutdated: false,
                      path: 'bin/greet',
                      line: 4,
                      originalLine: 4,
                      comments: {
                        totalCount: hasReply ? 2 : 1,
                        nodes: [
                          {
                            author: { login: 'sam' },
                            body: 'Quote the name.',
                            url: 'https://github.com/acme/greet/pull/12#r1',
                          },
                        ],
                      },
                      last: {
                        nodes: [
                          hasReply
                            ? {
                                author: { login: 'sam' },
                                body: 'Still unquoted.',
                                url: '',
                                createdAt: '2026-10-08T00:00:00Z',
                              }
                            : { author: { login: 'sam' }, body: 'Quote the name.', url: '' },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          },
        })
      },
    },
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'open the PR', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Opened https://github.com/acme/greet/pull/12.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()

  const pane = await $.ui.mount(PANE)
  // The task names the PR only by number, and still links to it.
  expect((await pane.find({ key: 'help-i1-0-key' }))?.props.label).toBe('Open PR #12')
  await pane.press({ key: 'help-i1-0' })
  expect(ran.at(-1)).toEqual(['open', 'https://github.com/acme/greet/pull/12'])

  await pane.press({ key: 'tab-prs' })
  await clock.settle()
  expect(await pane.find({ text: /Add a greeting CLI/ })).toBeDefined()
  expect(
    await pane.find({ text: /Blocked: conflicts with main, 1 failing check, 1 thread waiting on you, needs approval/ }),
  ).toBeDefined()

  // A press that sends says so where it was pressed, and the button then reads "again".
  await pane.press({ key: 'resolve-acme/greet#12' })
  expect(sent.at(-1)).toContain('PR #12 (https://github.com/acme/greet/pull/12) conflicts with main.')
  await clock.settle()
  expect(await pane.find({ text: /✓ Resolve conflicts ·/ })).toBeDefined()
  expect((await pane.find({ key: 'resolve-acme/greet#12' }))?.props.label).toBe('Resolve conflicts again')

  // The failing check comes first. It offers its log and no Fix, so it waits on the person until it passes.
  expect(await pane.find({ key: 'fix-acme/greet#12-test-key' })).toBeUndefined()
  await pane.press({ key: 'log-acme/greet#12-test-key' })
  expect(ran.at(-1)).toEqual(['open', 'https://github.com/acme/greet/actions/runs/7/job/1'])

  // A thread's keys say so too, pressed by hotkey or by click.
  await pane.press({ key: 'next' })
  await pane.press({ key: 'discuss-T1-key' })
  expect(sent.at(-1)).toContain("Let's talk through this review comment on PR #12")
  await clock.settle()
  expect(await pane.find({ text: /✓ Discuss ·/ })).toBeDefined()
  expect((await pane.find({ key: 'discuss-T1' }))?.props.label).toMatch(/Discuss again$/)
  await pane.press({ key: 'address-T1' })
  expect(sent.at(-1)).toContain('Address this review comment on PR #12')
  expect(sent.at(-1)).toContain('bin/greet:4, from @sam:\nQuote the name.')
  await clock.settle()
  expect(await pane.find({ text: /Address · just now/ })).toBeDefined()

  // Sent to Claude, the thread folds to its first line, with its keys behind Details, until the reviewer answers.
  const details = 'fold-details-acme/greet#12 thread T1'
  expect(await pane.find({ key: 'address-T1-key' })).toBeUndefined()
  await pane.press({ key: `${details}-key` })
  expect((await pane.find({ key: 'address-T1-key' }))?.props.label).toBe('Address again')
  hasReply = true
  await pane.press({ key: 'tab-findings' })
  await pane.press({ key: 'tab-prs' })
  await clock.settle()
  expect(await pane.find({ text: /Still unquoted/ })).toBeDefined()
  expect(await pane.find({ key: details })).toBeUndefined()
  // The failing check holds the band's PR alert, as nothing hands it to Claude.
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /PR #12 CI failing/ })).toBeDefined()
})

test('opening the PRs tab while another PR fetch runs still finds the branch’s PR', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])
  const view = (number: number, title: string) =>
    JSON.stringify({
      number,
      title,
      url: `https://github.com/acme/greet/pull/${number}`,
      isDraft: false,
      state: 'OPEN',
      baseRefName: 'main',
      mergeable: 'MERGEABLE',
      reviewDecision: 'APPROVED',
      statusCheckRollup: [],
    })
  const noThreads = JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } })
  let isSlow = true
  ghAnswers.push(
    // The linked PR's first fetch is still running when the tab opens.
    {
      match: argv => argv.includes('view') && argv.includes('12'),
      stdout: view(12, 'Linked work'),
      hold: () => (isSlow ? ((isSlow = false), clock.sleep(5000)) : Promise.resolve()),
    },
    { match: argv => argv.includes('view') && !argv.includes('12'), stdout: view(13, 'Branch work') },
    { match: argv => argv.includes('graphql'), stdout: noThreads },
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'open the PR', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Opened https://github.com/acme/greet/pull/12.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-prs' })
  await clock.advance(5000)

  expect(await pane.find({ text: /Linked work/ })).toBeDefined()
  expect(await pane.find({ text: /Branch work/ })).toBeDefined()
})

test('a PR fetch keeps a Dismiss made while it ran, and the branch PR when its lookup fails', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])
  const view = (number: number, title: string) =>
    JSON.stringify({
      number,
      title,
      url: `https://github.com/acme/greet/pull/${number}`,
      isDraft: false,
      state: 'OPEN',
      baseRefName: 'main',
      mergeable: 'MERGEABLE',
      reviewDecision: 'APPROVED',
      statusCheckRollup: [],
    })
  const noThreads = JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } })
  let isSlow = false
  let branchFails: string | undefined
  ghAnswers.push(
    {
      match: argv => argv.includes('view') && argv.includes('12'),
      stdout: view(12, 'Linked work'),
      hold: () => (isSlow ? clock.sleep(5000) : Promise.resolve()),
    },
    {
      match: argv => argv.includes('view') && !argv.includes('12'),
      stdout: view(13, 'Branch work'),
      get fails() {
        return branchFails
      },
    },
    { match: argv => argv.includes('graphql'), stdout: noThreads },
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'open the PR', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Opened https://github.com/acme/greet/pull/12.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-prs' })
  await clock.settle()
  expect(await pane.find({ text: /Linked work/ })).toBeDefined()
  expect(await pane.find({ text: /Branch work/ })).toBeDefined()

  // Showing the tab again looks up the branch's PR, which fails, and holds on the linked PR.
  branchFails = 'HTTP 502'
  isSlow = true
  await pane.press({ key: 'tab-needsYou' })
  await pane.press({ key: 'tab-prs' })
  await pane.press({ key: 'dismiss-pr-acme/greet#12' })
  isSlow = false
  await clock.advance(5000)

  expect(await pane.find({ text: /Linked work/ })).toBeUndefined()
  expect(await pane.find({ text: /Branch work/ })).toBeDefined()
})

test('a stop and an open permission prompt lead the sidebar line until they clear', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [], { HERDR_PANE_ID: 'p1' })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.classic.PermissionRequest({
    tool_name: 'Bash',
    tool_input: { command: 'git push', description: 'Push main to origin' },
  } as never)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('Allow push main to origin?')
  // The prompt closes when its own call returns.
  await $.tool.call({ tool: 'Bash', command: 'git push', description: 'Push main to origin' } as never)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('')

  await $.classic.StopFailure({ error: 'authentication_failed' } as never)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('! Signed out: /login')
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /Run \/login, then send a message to resume\./ })).toBeDefined()
  // The next turn means the session runs again.
  await $.turn.start({ text: 'logged in, go on', turnId: 't2' })
  await clock.settle()
  expect(await band.find({ text: /Stopped/ })).toBeUndefined()
  expect(sidebarLines().at(-1)).toBe('')
})

test('a reply another Stop hook sends Claude back from reaches the per-turn call, and the inbox sends back none itself', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world(on, prompts)

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'fix the parser', wait: false, origin: { kind: 'composer' } })
  // A test run with a pipe runs as Claude wrote it.
  const piped = await $.tool.call({
    tool: 'Bash',
    command: 'npm test 2>&1 | tail -5',
    description: 'Run tests',
  } as never)
  expect(piped.deny).toBeUndefined()
  // A reply that claims the tests pass ends the turn.
  const claimed = await $.classic.Stop({
    stop_hook_active: false,
    last_assistant_message: 'Fixed the parser. All tests pass.',
  } as never)
  expect(claimed.block).toBeUndefined()

  stopBlock = 'Run the linter before you stop.'
  const blocked = await $.classic.Stop({
    stop_hook_active: false,
    last_assistant_message: 'Fixed the parser. Should I also rename the helper?',
  } as never)
  expect(blocked.block).toBe('Run the linter before you stop.')
  stopBlock = undefined
  await $.turn.complete({
    answer: 'Linted. The parser is fixed.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  // The reply Claude was sent back from reaches the update, though it is not the final answer.
  expect(prompts.at(-1)).toContain('Should I also rename the helper?')
  expect(prompts.at(-1)).not.toContain('All tests pass.')
})

test('/inbox demo shows sample entries in every tab, sends nothing, and goes back', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world(on, [])
  on('ui.toast', () => ({ value: undefined }))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  expect((await $.command.run({ command: 'inbox', args: 'demo' } as never)).text).toContain('Showing sample entries')
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Show the Keys list in a footer/ })).toBeDefined()
  // The first question is the first row, so its answers show.
  await pane.press({ key: 'answer-d11-0' })
  expect(sent).toEqual([])
  await pane.press({ key: 'tab-findings' })
  expect(await pane.find({ text: /Catch-up could read only the turns/ })).toBeDefined()
  await pane.press({ key: 'tab-prs' })
  expect(await pane.find({ text: /Switch tabs with 1, 2 and 3/ })).toBeDefined()
  // The sample PRs are not looked up, and their buttons open nothing.
  await pane.press({ key: 'open-petekp/inbox#31' })
  expect(ran.filter(argv => argv[0] === 'gh' || argv[0] === 'open')).toEqual([])

  await $.command.run({ command: 'inbox', args: 'demo' } as never)
  expect(await pane.find({ text: /Switch tabs with 1, 2 and 3/ })).toBeUndefined()
})

test('/clear and /resume switch the inbox to the other conversation, and each keeps its saved items', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world(on, [])
  const turn = async (text: string) => {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: text, reason: 'answer' })
    await clock.settle()
  }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await turn('add a greeting cli')
  // /clear goes on under a new id, without a session.start. As in the engine,
  // $.session.id() still names the first conversation; the event names the new one.
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  ledgerReply = 'GOAL: Fix the build\nNOW: Waiting\nNEW: decide | 1 | Pin the Node version? | - | yes'
  await turn('fix the build')
  // /resume returns to the first conversation.
  await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
  await $.classic.SessionStart({ source: 'resume', session_id: 'session-1' })
  await clock.settle()

  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
  expect(await pane.find({ text: /Pin the Node version\?/ })).toBeUndefined()

  // The second conversation's items were saved under its own id.
  await $.session.end({ reason: 'resume', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'resume', session_id: 'session-2' })
  await clock.settle()
  expect(await pane.find({ text: /Pin the Node version\?/ })).toBeDefined()
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeUndefined()
})

test('a headless run does nothing', async ($, on) => {
  const prompts: string[] = []
  mock.clock(on, { now: 1 })
  world(on, prompts)

  await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'sdk' } })
  await $.turn.complete({ answer: 'hello', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })

  expect(prompts.length).toBe(0)
})

for (const isAttachedFirst of [true, false]) {
  test(`the desktop app turns the mod on when it attaches ${isAttachedFirst ? 'before' : 'after'} the start`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const prompts: string[] = []
    world(on, prompts)
    if (isAttachedFirst) surfaces = ['desktop']

    await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
    if (!isAttachedFirst) await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
    await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'sdk' } })
    await $.turn.complete({
      answer: 'Node or Python?',
      durationMs: 5,
      isAborted: false,
      turnId: 't1',
      reason: 'answer',
    })
    await clock.settle()

    expect(prompts.length).toBe(1)
    const band = await $.ui.mount({ plugin: 'inbox', surface: 'desktop', ...BAND })
    expect(await band.find({ text: /2 waiting on you in \/inbox/ })).toBeDefined()
  })
}
