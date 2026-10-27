import { afterEach, beforeEach, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { guidanceText, OVERVIEW_SYSTEM, systemText } from '../../hooks/model-text'
import { EMPTY_OVERVIEW } from '../../hooks/overview'
import { NO_HOLDS } from '../../hooks/view'
import { createInbox, stopOf } from '../src/host'
import type { HostDeps } from '../src/host'
import { OMP } from '../src/texts'
import { reportedTokens } from '../../tests/session-script'

type Handler = (event: any, ctx: any) => unknown

const MODEL_ANSWER = ['NEW: decide | 1 | Use Node or Python? | Node / Python | Node'].join('\n')

type Model = { id: string; name: string; provider: string; identity: { family?: string; revision?: string } }
const sonnet: Model = {
  id: 'claude-sonnet-4-5',
  name: 'Claude Sonnet 4.5',
  provider: 'anthropic',
  identity: { family: 'sonnet', revision: '4.5.0' },
}
const retiredSonnet: Model = {
  id: 'claude-3-5-sonnet-20240620',
  name: 'Claude Sonnet 3.5',
  provider: 'anthropic',
  identity: { family: 'sonnet', revision: '3.5.0' },
}
const smol: Model = { id: 'gpt-mini', name: 'GPT Mini', provider: 'openai', identity: {} }

let dir: string
let clock: number
let handlers: Map<string, Handler>
let tools: Map<string, any>
let commands: Map<string, any>
let sent: { text: string; options: unknown }[]
let hidden: { content: string; options: unknown }[]
let timers: { fn: () => void; ms: number }[]
let notices: string[]
let completions: { model: Model; system: string[]; prompt: string }[]
let background: Promise<unknown>[]
let models: Model[]
let smolModel: Model | undefined
let inboxRoleModel: Model | undefined
let reply: string | Error
let overviewReply: string | Error
let overviewHold: Promise<void> | null
let overviewCompletions: { model: Model; system: string[]; prompt: string }[]
let isIdle: boolean
let execResults: Map<string, { code: number; stdout?: string; stderr?: string; killed?: boolean } | Error>
let execCalls: { command: string; args: string[] }[]
let copied: string[]
let agentKind: 'main' | 'sub' | undefined
let hasUI: boolean
let branch: unknown[]
let activeTools: string[]

const pi = () =>
  ({
    on: (name: string, handler: Handler) => handlers.set(name, handler),
    events: { on: (channel: string, handler: Handler) => handlers.set(channel, handler) },
    registerTool: (tool: any) => tools.set(tool.name, tool),
    registerCommand: (name: string, command: any) => commands.set(name, command),
    sendMessage: (message: { content: string }, options: unknown) => {
      hidden.push({ content: message.content, options })
    },
    sendUserMessage: (text: string, options: unknown) => {
      sent.push({ text, options })
    },
    exec: async (command: string, args: string[]) => {
      execCalls.push({ command, args })
      const result = execResults.get(command) ?? { code: 0 }
      if (result instanceof Error) throw result

      return { stdout: '', stderr: '', killed: false, ...result }
    },
    getActiveTools: () => activeTools,
    setActiveTools: async (names: string[]) => {
      activeTools = names
    },
  }) as never

const makeCtx = (id = 's1') =>
  ({
    sessionManager: { getSessionId: () => id, getBranch: () => branch },
    cwd: '/work',
    hasUI,
    isIdle: () => isIdle,
    setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms }),
    models: {
      list: () => models,
      resolve: (spec: string) => (spec === '@smol' ? smolModel : spec === '@inbox' ? inboxRoleModel : undefined),
    },
    modelRegistry: { getApiKey: async () => 'key' },
    ui: { notify: (message: string) => notices.push(message) },
    ...(agentKind ? { agent: { kind: agentKind } } : {}),
  }) as never

const deps = (): HostDeps => ({
  stateDir: () => dir,
  now: () => (clock += 10),
  newId: (() => {
    let n = 0
    return () => `id${++n}`
  })(),
  settleWindowMs: 1000,
  home: '/home/me',
  isNextBuild: false,
  comparePage: '/omp/dist/compare-page.html',
  complete: async (model, context) => {
    const isOverview = context.systemPrompt?.[0] === OVERVIEW_SYSTEM
    const call = {
      model: model as never,
      system: context.systemPrompt ?? [],
      prompt: String((context.messages[0] as { content: unknown }).content),
    }
    ;(isOverview ? overviewCompletions : completions).push(call)
    if (isOverview) await overviewHold
    const answer = isOverview ? overviewReply : reply
    if (answer instanceof Error) throw answer

    return { stopReason: 'stop', content: [{ type: 'text', text: answer }] } as never
  },
  copy: async text => {
    copied.push(text)

    return null
  },
  background: work => {
    background.push(work.catch(() => undefined))
  },
  isUsageLimit: async (_status, message) => /usage limit/i.test(message),
  herdrPane: null,
})

const settle = async () => {
  for (let seen = 0; seen < background.length;) {
    seen = background.length
    await Promise.all(background)
  }
}

const state = (id = 's1') => JSON.parse(readFileSync(join(dir, 'sessions', `${id}.json`), 'utf8'))
const call = (name: string, event: unknown, ctx: unknown = makeCtx()) => handlers.get(name)!(event, ctx)
const record = (args: Record<string, unknown>, ctx: unknown = makeCtx()) =>
  tools.get('record').execute('call', args, undefined, undefined, ctx)
const prompt = (text: string, ctx: unknown = makeCtx()) =>
  call('before_agent_start', { type: 'before_agent_start', prompt: text, systemPrompt: ['base'] }, ctx) as Promise<any>
const endAgent = (text: string, extra: Record<string, unknown> = {}, ctx: unknown = makeCtx()) =>
  call(
    'agent_end',
    { type: 'agent_end', messages: [{ role: 'assistant', content: [{ type: 'text', text }] }], ...extra },
    ctx,
  )

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'inbox-omp-host-'))
  clock = 1_000_000
  handlers = new Map()
  tools = new Map()
  commands = new Map()
  sent = []
  hidden = []
  timers = []
  notices = []
  completions = []
  background = []
  models = [smol, sonnet]
  smolModel = smol
  inboxRoleModel = undefined
  reply = MODEL_ANSWER
  overviewReply = 'UNCHANGED'
  overviewHold = null
  overviewCompletions = []
  isIdle = false
  execResults = new Map()
  execCalls = []
  copied = []
  agentKind = 'main'
  hasUI = true
  branch = []
  activeTools = ['read', 'bash', 'record', 'close']
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

test('a prompt adds the guidance once and counts one turn even when omp runs the handler again', async () => {
  createInbox(pi(), deps())
  const first = await prompt('Add a greeting CLI')
  const again = await prompt('Add a greeting CLI')
  expect(first.systemPrompt).toEqual(['base', guidanceText(OMP)])
  expect(again.systemPrompt).toEqual(['base', guidanceText(OMP)])
  expect(state().presence.turnsStarted).toBe(1)

  const withGuidance = (await call('before_agent_start', {
    prompt: 'next',
    systemPrompt: ['base', guidanceText(OMP)],
  })) as { systemPrompt: string[] }
  expect(withGuidance.systemPrompt).toEqual(['base', guidanceText(OMP)])
})

test('the same prompt text typed again after a turn counts as a new turn', async () => {
  createInbox(pi(), deps())
  await prompt('continue')
  await call('turn_start', { type: 'turn_start' })
  await prompt('continue')
  expect(state().presence.turnsStarted).toBe(2)
})

test('a record call shows in the next prompt as a hidden message', async () => {
  createInbox(pi(), deps())
  await prompt('Add a greeting CLI')
  const answer = await record({ kind: 'task', ask: 'Try the CLI by hand' })
  expect(answer.content[0].text).toBe('Recorded. The user sees it in the /inbox panel.')
  expect(state().ledger.items.map((i: { ask: string }) => i.ask)).toEqual(['Try the CLI by hand'])

  const next = await prompt('How is it going?')
  expect(next.message).toMatchObject({ display: false, attribution: 'agent' })
  expect(next.message.content).toContain('Try the CLI by hand')
})

test('a prompt with nothing to tell the agent returns no message', async () => {
  createInbox(pi(), deps())
  const first = await prompt('hello')
  expect(first.message).toBeUndefined()
})

test('record and close are registered with the shared schemas and stay in the tool list', () => {
  createInbox(pi(), deps())
  expect([...tools.keys()]).toEqual(['record', 'close'])
  expect(tools.get('record')).toMatchObject({ loadMode: 'essential', approval: 'read' })
  expect(tools.get('record').parameters.properties.kind.enum).toEqual(['question', 'task', 'finding'])
})

test('a close call closes the recorded item', async () => {
  createInbox(pi(), deps())
  await record({ kind: 'task', ask: 'Try the CLI by hand' })
  const id = state().ledger.items[0].id
  const answer = await tools
    .get('close')
    .execute('call', { id, reason: 'done by the agent' }, undefined, undefined, makeCtx())
  expect(answer.content[0].text).not.toContain('Not done')
  expect(state().ledger.items).toEqual([])
  expect(state().ledger.closed).toHaveLength(1)
})

test('bash, edit and write runs become turn activity and other tools do not', async () => {
  createInbox(pi(), deps())
  const run = (toolName: string, args: Record<string, unknown>) =>
    call('tool_execution_start', { type: 'tool_execution_start', toolCallId: 'c', toolName, args })
  await run('bash', { command: 'npm test' })
  await run('bash', { command: 'sleep 9', async: true })
  await run('edit', { path: '/work/a.ts' })
  await run('write', { path: '/work/b.ts', content: '' })
  await run('read', { path: '/work/c.ts' })
  expect(state().turn.activity).toEqual([
    'ran: npm test',
    'started in background: sleep 9',
    'edited /work/a.ts',
    'edited /work/b.ts',
  ])
})

test('a bash result notes local URLs it printed and links the PR gh pr create names', async () => {
  createInbox(pi(), deps())
  const result = (command: string, text: string, extra: Record<string, unknown> = {}) =>
    call('tool_result', {
      toolName: 'bash',
      input: { command },
      content: [{ type: 'text', text }],
      isError: false,
      ...extra,
    })
  await result('npm run dev', 'ready at http://localhost:3000/')
  await result('gh pr create --fill', 'https://github.com/acme/app/pull/12\n')
  await result('cat notes.txt', 'https://github.com/acme/app/pull/77\n')
  expect(state().turn.activity).toEqual(['URL in output: http://localhost:3000/'])
  expect(state().ledger.prs).toEqual(['acme/app#12'])
})

test('a turn that ends queues the exchange and the inbox model fills the ledger', async () => {
  createInbox(pi(), deps())
  await prompt('Add a greeting CLI')
  await endAgent('Plan written. Which runtime?')
  await settle()
  expect(state().pending).toEqual([])
  expect(state().presence).toMatchObject({ turnsStarted: 1, turnsApplied: 1, isUpdating: false })
  expect(state().ledger.items.map((i: { ask: string }) => i.ask)).toEqual(['Use Node or Python?'])
  expect(completions).toHaveLength(1)
  expect(completions[0]!.prompt).toContain('Plan written. Which runtime?')
})

test('a reply’s Overview comes from the separate Overview call, after the ledger update', async () => {
  createInbox(pi(), deps())
  overviewReply = 'GOAL: Adding a greeting CLI'
  await prompt('Add a greeting CLI')
  await endAgent('Plan written. Which runtime?')
  await settle()
  expect(state().ledger.overview.goal).toBe('Adding a greeting CLI')
  expect(state().ledger.items.map((i: { ask: string }) => i.ask)).toEqual(['Use Node or Python?'])
  expect(overviewCompletions).toHaveLength(1)
  expect(overviewCompletions[0]!.prompt).toContain('Plan written. Which runtime?')
})

test('a failed Overview call leaves the ledger update applied with no Overview', async () => {
  createInbox(pi(), deps())
  overviewReply = new Error('overloaded')
  await prompt('Add a greeting CLI')
  await endAgent('Plan written. Which runtime?')
  await settle()
  expect(state().pending).toEqual([])
  expect(state().ledger.overview).toBeNull()
  expect(state().ledger.items.map((i: { ask: string }) => i.ask)).toEqual(['Use Node or Python?'])
})

test('a ledger update shows before its Overview call returns', async () => {
  createInbox(pi(), deps())
  reply = 'NEW: decide | 1 | Use Node or Python? | Node / Python | Node'
  overviewReply = new Error('no Overview yet')
  await prompt('Add a greeting CLI')
  await endAgent('Plan written. Which runtime?')
  await settle()
  let release: () => void = () => undefined
  overviewHold = new Promise<void>(resolve => (release = resolve))
  overviewReply = 'GOAL: Scaffolding the command'
  reply = 'CLOSED: i1 | Node chosen'
  await prompt('Use Node')
  await endAgent('Scaffolded the command with Node.')
  for (let waited = 0; overviewCompletions.length < 2 && waited < 200; waited += 1)
    await new Promise(resolve => setTimeout(resolve, 10))
  expect(overviewCompletions).toHaveLength(2)
  expect(state().ledger.items).toEqual([])
  expect(state().ledger.overview).toBeNull()
  release()
  await settle()
  expect(state().ledger.overview.goal).toBe('Scaffolding the command')
})

test('a ledger call that fails runs no Overview call', async () => {
  createInbox(pi(), deps())
  reply = new Error('overloaded')
  overviewReply = 'GOAL: Adding a greeting CLI'
  await prompt('Add a greeting CLI')
  await endAgent('Plan written. Which runtime?')
  await settle()
  expect(overviewCompletions).toEqual([])
  expect(state().ledger.overview).toBeNull()
})

test('the next ledger update does not wait for an earlier Overview call, and Overview calls run one at a time', async () => {
  createInbox(pi(), deps())
  let release: () => void = () => undefined
  overviewHold = new Promise<void>(resolve => (release = resolve))
  overviewReply = 'GOAL: Scaffolding the command'
  reply = 'NEW: do | - | Water the plants | - | -'
  await prompt('Add a greeting CLI')
  await endAgent('Plan written.')
  for (let waited = 0; overviewCompletions.length < 1 && waited < 200; waited += 1)
    await new Promise(resolve => setTimeout(resolve, 10))
  reply = 'NEW: do | - | Feed the cat | - | -'
  await prompt('And a name')
  await endAgent('Named it.')
  for (let waited = 0; completions.length < 2 && waited < 200; waited += 1)
    await new Promise(resolve => setTimeout(resolve, 10))
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(state().ledger.items.map((i: { ask: string }) => i.ask)).toEqual(['Water the plants', 'Feed the cat'])
  expect(overviewCompletions).toHaveLength(1)
  release()
  await settle()
  for (let waited = 0; overviewCompletions.length < 2 && waited < 200; waited += 1)
    await new Promise(resolve => setTimeout(resolve, 10))
  expect(overviewCompletions).toHaveLength(2)
  expect(overviewCompletions[1]!.prompt).toContain('<goal>\nScaffolding the command\n</goal>')
})

test('a settle that will continue does not end the turn', async () => {
  createInbox(pi(), deps())
  await prompt('Add a greeting CLI')
  await endAgent('Retrying', { willContinue: true })
  await settle()
  expect(state().pending).toEqual([])
  expect(state().turn.person).toBe('Add a greeting CLI')
  expect(completions).toEqual([])
})

test('a turn with no reply text queues nothing', async () => {
  createInbox(pi(), deps())
  await prompt('hello')
  await call('agent_end', { type: 'agent_end', messages: [{ role: 'assistant', content: [{ type: 'toolCall' }] }] })
  await settle()
  expect(completions).toEqual([])
  expect(state().turn.person).toBeNull()
})

test('a turn the person ended by dismissing an ask dialog reaches the inbox model with the dismissed question', async () => {
  createInbox(pi(), deps())
  await prompt('Pick a license')
  const input = { questions: [{ question: 'MIT or Apache?', options: [{ label: 'MIT' }, { label: 'Apache' }] }] }
  const cancelled = [{ type: 'text', text: 'Ask tool was cancelled by the user' }]
  await call('tool_result', { toolName: 'ask', input, content: cancelled, isError: true })
  await call('agent_end', {
    type: 'agent_end',
    messages: [
      { role: 'assistant', content: [{ type: 'toolCall' }], stopReason: 'toolUse' },
      { role: 'toolResult', toolName: 'ask', content: cancelled, isError: true },
      { role: 'assistant', content: [], stopReason: 'aborted' },
    ],
  })
  await settle()
  expect(completions).toHaveLength(1)
  expect(completions[0]!.prompt).toContain(
    '"MIT or Apache?" (options: MIT / Apache); the user dismissed it without answering',
  )
})

test('a failing inbox model marks the update failed, and the next turn retries the exchange', async () => {
  createInbox(pi(), deps())
  reply = new Error('offline')
  await prompt('hello')
  await endAgent('Done.')
  await settle()
  expect(state().presence.ledgerState).toBe('failed')
  expect(state().pending).toMatchObject([{ failed: true }])
  expect(completions).toHaveLength(1)

  reply = MODEL_ANSWER
  await prompt('again')
  await endAgent('Done again.')
  await settle()
  expect(state().presence.ledgerState).toBe('current')
  expect(state().pending).toEqual([])
})

test('the inbox model is the newest Sonnet model the providers offer, with the inbox system prompt', async () => {
  models = [smol, retiredSonnet, sonnet]
  createInbox(pi(), deps())
  await prompt('hello')
  await endAgent('Done.')
  await settle()
  expect(completions[0]!.model).toBe(sonnet)
  expect(completions[0]!.system).toEqual([systemText(OMP)])
})

test('the @inbox role wins over a Sonnet model, and the panel names it', async () => {
  models = [smol, sonnet]
  inboxRoleModel = smol
  const inbox = createInbox(pi(), deps())
  await prompt('hello')
  await endAgent('Done.')
  await settle()
  expect(completions[0]!.model).toBe(smol)
  expect((await inbox.screen(makeCtx())).modelName).toBe('GPT Mini')
})

test('an @inbox role that names no usable model falls through to the newest Sonnet, and the panel names that one', async () => {
  models = [smol, sonnet]
  inboxRoleModel = undefined
  const inbox = createInbox(pi(), deps())
  await prompt('hello')
  await endAgent('Done.')
  await settle()
  expect(completions[0]!.model).toBe(sonnet)
  expect((await inbox.screen(makeCtx())).modelName).toBe(sonnet.name ?? sonnet.id)
})

test('the inbox model falls back to the smol role and the panel names it', async () => {
  models = [smol]
  const inbox = createInbox(pi(), deps())
  await prompt('hello')
  await endAgent('Done.')
  await settle()
  expect(completions[0]!.model).toBe(smol)
  expect((await inbox.screen(makeCtx())).modelName).toBe('GPT Mini')
})

test('with no usable model the update fails and the panel shows no model', async () => {
  models = []
  smolModel = undefined
  const inbox = createInbox(pi(), deps())
  await prompt('hello')
  await endAgent('Done.')
  await settle()
  expect(completions).toEqual([])
  expect(state().presence.ledgerState).toBe('failed')
  expect((await inbox.screen(makeCtx())).modelName).toBeNull()
})

test('a session with no UI leaves no state and takes record and close out of its tools', async () => {
  hasUI = false
  createInbox(pi(), deps())
  await call('session_start', { type: 'session_start' })
  expect(activeTools).toEqual(['read', 'bash'])
  const result = await prompt('hello')
  await call('tool_execution_start', { toolName: 'bash', args: { command: 'ls' } })
  await endAgent('Done.')
  const recorded = await record({ kind: 'task', ask: 'Try it' })
  await settle()
  expect(result).toBeUndefined()
  expect(completions).toEqual([])
  expect(recorded.content[0].text).toBe('The inbox is not shown in this session.')
  expect(() => state()).toThrow()
})

test('a subagent leaves no state and takes record and close out of its tools', async () => {
  agentKind = 'sub'
  createInbox(pi(), deps())
  await call('session_start', { type: 'session_start' })
  expect(activeTools).toEqual(['read', 'bash'])
  await prompt('hello')
  await endAgent('Done.')
  await settle()
  expect(completions).toEqual([])
  expect(() => state()).toThrow()
})

test('an omp that gives no agent kind still watches a main session and skips one with no UI', async () => {
  agentKind = undefined
  createInbox(pi(), deps())
  await call('session_start', { type: 'session_start' })
  expect(activeTools).toEqual(['read', 'bash', 'record', 'close'])
  await prompt('hello')
  expect(() => state()).not.toThrow()
  hasUI = false
  await call('session_start', { type: 'session_start' }, makeCtx('quiet'))
  expect(activeTools).toEqual(['read', 'bash'])
  await prompt('hello', makeCtx('quiet'))
  expect(() => state('quiet')).toThrow()
})

test('a watched session keeps record and close in its tools', async () => {
  createInbox(pi(), deps())
  await call('session_start', { type: 'session_start' })
  expect(activeTools).toEqual(['read', 'bash', 'record', 'close'])
})

test('the guidance names the tools as omp registers them', () => {
  expect(guidanceText(OMP)).toContain('with record,')
  expect(guidanceText(OMP)).toContain('Close with close:')
  expect(guidanceText(OMP)).not.toContain('mcp__')
})

test('an activity note or an ask result still settles when the session file cannot be written', async () => {
  createInbox(pi(), deps())
  await prompt('hello')
  writeFileSync(join(dir, 'sessions', 's1.json'), '{not json')
  expect(await call('tool_execution_start', { toolName: 'bash', args: { command: 'ls' } })).toBeUndefined()
  expect(await call('tool_result', { toolName: 'ask', input: {}, content: [], isError: false })).toBeUndefined()
})

test('an ask dialog becomes turn activity with the answer', async () => {
  createInbox(pi(), deps())
  await prompt('hello')
  const input = { questions: [{ question: 'Node or Python?', options: [{ label: 'Node' }, { label: 'Python' }] }] }
  await call('tool_result', {
    toolName: 'ask',
    input,
    content: [{ type: 'text', text: 'User selected: Node' }],
    isError: false,
  })
  expect(state().turn.activity).toEqual([
    'asked the user in a dialog: "Node or Python?" (options: Node / Python); answer: User selected: Node',
  ])
})

async function withQuestion() {
  const inbox = createInbox(pi(), deps())
  await prompt('Add a greeting CLI')
  await endAgent('Plan written. Which runtime?')
  await settle()
  const [item] = state().ledger.items
  return { inbox, id: item.id as string }
}

test('an answer press sends one follow-up while a turn runs, and the arriving prompt matches it', async () => {
  const { inbox, id } = await withQuestion()
  const outcome = await inbox.press(makeCtx(), { action: 'answer', id, option: 'Node' }, NO_HOLDS)
  expect(outcome).toEqual({
    copy: null,
    error: null,
    note: null,
    isUnconfirmed: false,
    isRowFailed: false,
    wakesForDone: false,
  })
  expect(sent).toEqual([{ text: 'Re "Use Node or Python?": Node', options: { deliverAs: 'followUp' } }])
  expect(state().sent.map((x: { phase: string }) => x.phase)).toEqual(['accepted'])

  await prompt(sent[0]!.text)
  expect(state().sent).toEqual([])
  expect(state().turn.press).toMatchObject({ id, action: 'answer' })
  const screen = await inbox.screen(makeCtx())
  expect(screen.view.lastActions[id]?.delivery?.state).toBe('arrived')
})

test('a follow-up that starts inside a running turn matches its press once', async () => {
  const { inbox, id } = await withQuestion()
  await inbox.press(makeCtx(), { action: 'answer', id, option: 'Node' }, NO_HOLDS)
  const started = { type: 'message_start', message: { role: 'user', content: [{ type: 'text', text: sent[0]!.text }] } }
  await call('message_start', started)
  expect(state().sent).toEqual([])
  expect(state().presence.turnsStarted).toBe(2)
  expect(state().turn.press).toMatchObject({ id, action: 'answer' })
  expect((await inbox.screen(makeCtx())).view.lastActions[id]?.delivery?.state).toBe('arrived')

  await call('message_start', started)
  expect(state().presence.turnsStarted).toBe(2)
})

test('a user message that no press sent is left to before_agent_start', async () => {
  createInbox(pi(), deps())
  await prompt('hello')
  await call('message_start', { type: 'message_start', message: { role: 'user', content: 'hello' } })
  await call('message_start', { type: 'message_start', message: { role: 'assistant', content: [] } })
  expect(state().presence.turnsStarted).toBe(1)
})

test('a press while the agent is idle sends the message with no delivery option', async () => {
  const { inbox, id } = await withQuestion()
  isIdle = true
  await inbox.press(makeCtx(), { action: 'answer', id, option: 'Node' }, NO_HOLDS)
  expect(sent[0]!.options).toBeUndefined()
})

test('a press for a row that is gone reports it stale and sends nothing', async () => {
  const { inbox } = await withQuestion()
  const outcome = await inbox.press(makeCtx(), { action: 'answer', id: 'nope', option: 'Node' }, NO_HOLDS)
  expect(outcome.note).toBe('stale')
  expect(sent).toEqual([])
})

test('Done schedules the wake and the wake tells the agent after the settle window', async () => {
  const inbox = createInbox(pi(), deps())
  await prompt('hello')
  await record({ kind: 'task', ask: 'Try the CLI by hand' })
  await endAgent('Done.')
  await settle()
  const id = state().ledger.items[0].id
  const outcome = await inbox.press(makeCtx(), { action: 'done', id }, NO_HOLDS)
  expect(outcome.wakesForDone).toBe(true)
  expect(timers).toHaveLength(1)
  expect(timers[0]!.ms).toBeGreaterThan(1000)
  expect(sent).toEqual([])

  clock += 5000
  timers[0]!.fn()
  await settle()
  expect(sent).toHaveLength(1)
  expect(sent[0]!.text).toContain('Try the CLI by hand')
  expect(state().sent.map((x: { phase: string }) => x.phase)).toEqual(['accepted'])
})

async function withSteps() {
  const inbox = createInbox(pi(), deps())
  await record({ kind: 'task', ask: 'Run it and read the page', steps: ['npm start', 'https://example.com/x'] })
  const screen = await inbox.screen(makeCtx())
  const row = screen.view.needsYou.tasks[0]!
  const stepPress = (index: number) => ({
    action: 'step' as const,
    id: row.id,
    step: index,
    label: row.steps[index]!.label,
  })
  return { inbox, stepPress }
}

test('Working… shows from agent_start to the run’s end, and a Done message waits for Esc to end the run', async () => {
  const inbox = createInbox(pi(), deps())
  const now = async () => ((await inbox.screen(makeCtx())).view.overviewPage.live === 'Working…' ? 'Working…' : null)
  await prompt('hello')
  await record({ kind: 'task', ask: 'Try the CLI by hand' })
  await endAgent('Done.')
  await settle()
  await inbox.press(makeCtx(), { action: 'done', id: state().ledger.items[0].id }, NO_HOLDS)
  await call('agent_start', { type: 'agent_start' })
  expect(await now()).toBe('Working…')

  clock += 5000
  timers[0]!.fn()
  await settle()
  expect(sent).toEqual([])
  await endAgent('', { willContinue: true })
  expect(await now()).toBe('Working…')

  await endAgent('', { messages: [{ role: 'assistant', content: [], stopReason: 'aborted' }] })
  await settle()
  expect(await now()).toBeNull()
  expect(sent).toHaveLength(1)
  expect(sent[0]!.text).toContain('Try the CLI by hand')
})

test('a copy step hands the command to the clipboard and reports the copy', async () => {
  const { inbox, stepPress } = await withSteps()
  const outcome = await inbox.press(makeCtx(), stepPress(0), NO_HOLDS)
  expect(copied).toEqual(['npm start'])
  expect(outcome.copy).toMatchObject({ text: 'npm start' })
  expect(outcome.error).toBeNull()
})

test('an open step for a link runs open on it', async () => {
  const { inbox, stepPress } = await withSteps()
  const outcome = await inbox.press(makeCtx(), stepPress(1), NO_HOLDS)
  expect(execCalls).toEqual([{ command: 'open', args: ['https://example.com/x'] }])
  expect(outcome.error).toBeNull()
})

test('an open that fails leaves the reason on the row', async () => {
  const { inbox, stepPress } = await withSteps()
  execResults.set('open', { code: 1, stderr: 'no browser' })
  await inbox.press(makeCtx(), stepPress(1), NO_HOLDS)
  const screen = await inbox.screen(makeCtx())
  const last = screen.view.lastActions[screen.view.needsYou.tasks[0]!.id]
  expect(JSON.stringify(last?.result)).toContain('no browser')
})

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
  for (const gh of ['gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh']) execResults.set(gh, new Error('spawn failed'))
  await record({ kind: 'task', ask: 'Try the CLI by hand' })
  await inbox.openPanel(makeCtx(), clock)
  await settle()
  expect((await inbox.screen(makeCtx())).isGhMissing).toBe(true)
})

test('opening the panel finds gh and fetches PRs again only after the refresh interval', async () => {
  const inbox = createInbox(pi(), deps())
  await record({ kind: 'task', ask: 'Try the CLI by hand' })
  const ghCalls = (sub: string) => execCalls.filter(c => c.args[0] === sub).length
  await inbox.openPanel(makeCtx(), clock)
  await settle()
  expect(ghCalls('--version')).toBe(1)
  expect(ghCalls('pr')).toBe(1)
  expect((await inbox.screen(makeCtx())).isGhMissing).toBe(false)

  inbox.fetchPrsWhenDue(makeCtx())
  await settle()
  expect(ghCalls('pr')).toBe(1)

  clock += 130_000
  inbox.fetchPrsWhenDue(makeCtx())
  await settle()
  expect(ghCalls('pr')).toBe(2)
  expect(ghCalls('--version')).toBe(1)
})

test('the panel being open is told to the agent beside the prompt', async () => {
  const inbox = createInbox(pi(), deps())
  await prompt('hello')
  await record({ kind: 'task', ask: 'Try the CLI by hand' })
  await inbox.openPanel(makeCtx(), clock)
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
  await commands.get('inbox').handler('', makeCtx())
  await commands.get('inbox').handler('demo', makeCtx())
  expect(notices[0]).toBe('Asks 1, Finds 0')
  expect(notices[1]).not.toBe(notices[0])
})

test('state from a crashed process that left an update or a turn running is cleared when the session starts', async () => {
  createInbox(pi(), deps())
  await prompt('hello')
  await endAgent('Done.')
  await settle()
  const file = join(dir, 'sessions', 's1.json')
  const saved = state()
  const { writeFileSync } = await import('node:fs')
  writeFileSync(
    file,
    JSON.stringify({ ...saved, presence: { ...saved.presence, isUpdating: true, isTurnRunning: true } }),
  )

  handlers = new Map()
  createInbox(pi(), deps())
  await call('session_start', { type: 'session_start' })
  await settle()
  expect(state().presence).toMatchObject({ isUpdating: false, isTurnRunning: false })
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
  const opened = commands.get('inbox').handler('', ctx)
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
  const opened = commands.get('inbox').handler('demo', ctx)
  await until(() => components.length > 0)
  await tick()
  const panel = components[0]
  expect(panel.render(100).join('\n')).toContain('Buttons here send nothing.')
  panel.handleInput('enter')
  await tick()
  expect(sent).toEqual([])
  panel.handleInput('\x1b')
  await opened
  panel.dispose()
})

const endOnError = (fields: Record<string, unknown>) =>
  call('agent_end', {
    type: 'agent_end',
    messages: [{ role: 'assistant', content: [], stopReason: 'error', ...fields }],
  })

test('a turn that ends on an error saves why it stopped, and the next turn clears it', async () => {
  const inbox = createInbox(pi(), deps())
  await prompt('Add a greeting CLI')
  await endOnError({ errorStatus: 401, errorMessage: 'invalid x-api-key' })
  await settle()
  expect((await inbox.screen(makeCtx())).stop).toMatchObject({ kind: 'sign-in', detail: '401' })
  await call('turn_start', { type: 'turn_start' })
  expect(state().stop).toBeNull()
})

const herdrReports = () =>
  execCalls
    .filter(c => c.command === 'herdr')
    .map(c => ({ target: c.args.slice(0, 5).join(' '), tokens: reportedTokens(c.args) }))

test('in a Herdr pane, each change reports the tab counts, a stop replaces them until it clears, and shutdown clears every token', async () => {
  createInbox(pi(), { ...deps(), herdrPane: 'p1' })
  const cleared = {
    inbox: null,
    'inbox-stop': null,
    'inbox-needs-you': null,
    'inbox-findings': null,
    'inbox-prs': null,
  }
  await call('session_start', { type: 'session_start' })
  await settle()
  expect(herdrReports().at(-1)).toEqual({ target: 'pane report-metadata p1 --source inbox', tokens: cleared })

  await record({ kind: 'question', ask: 'Ship it?', options: ['yes', 'no'] })
  await record({ kind: 'finding', title: 'The retry loop never ends', detail: 'It retries forever on a 401.' })
  await settle()
  expect(herdrReports().at(-1)?.tokens).toEqual({
    ...cleared,
    inbox: 'Ship it?',
    'inbox-needs-you': '1',
    'inbox-findings': '1',
  })

  await endOnError({ errorStatus: 401, errorMessage: 'invalid x-api-key' })
  await settle()
  expect(herdrReports().at(-1)?.tokens).toEqual({
    ...cleared,
    inbox: '! Signed out: /login',
    'inbox-stop': '! Signed out: /login',
  })
  await call('turn_start', { type: 'turn_start' })
  await settle()
  expect(herdrReports().at(-1)?.tokens).toMatchObject({
    'inbox-stop': null,
    'inbox-needs-you': '1',
    'inbox-findings': '1',
  })

  const reports = herdrReports().length
  await record({ kind: 'task', ask: 'Sign in again' }, makeCtx('other'))
  await settle()
  expect(herdrReports()).toHaveLength(reports)

  await call('session_shutdown', { type: 'session_shutdown' })
  expect(herdrReports().at(-1)?.tokens).toEqual(cleared)
})

test('a stop is a usage limit, a sign-in or an API error, from the failed message', async () => {
  const isUsageLimit = deps().isUsageLimit
  const kindOf = async (fields: Record<string, unknown>) =>
    stopOf({ role: 'assistant', content: [], stopReason: 'error', ...fields }, isUsageLimit, 5)
  expect(await kindOf({ errorStatus: 429, errorMessage: 'You have hit your usage limit' })).toMatchObject({
    kind: 'usage-limit',
  })
  expect(await kindOf({ errorStatus: 403, errorMessage: 'forbidden' })).toMatchObject({ kind: 'sign-in' })
  expect(await kindOf({ errorStatus: 529, errorMessage: 'Overloaded' })).toMatchObject({
    kind: 'api-error',
    detail: 'overloaded',
  })
  expect(await kindOf({ errorMessage: 'socket hang up\nat fetch' })).toMatchObject({
    kind: 'api-error',
    detail: 'socket hang up',
  })
  expect(await stopOf({ role: 'assistant', content: [], stopReason: 'aborted' }, isUsageLimit, 5)).toBeNull()
})

test('Resume sends Continue to the agent', () => {
  const inbox = createInbox(pi(), deps())
  isIdle = true
  expect(inbox.resume(makeCtx())).toBeNull()
  expect(sent).toEqual([{ text: 'Continue', options: undefined }])
})

const message = (message: Record<string, unknown>) => ({ type: 'message', message })

const earlierBranch = () => [
  message({ role: 'user', content: 'Before the clear' }),
  { type: 'reset_boundary' },
  message({ role: 'developer', content: 'Injected by omp' }),
  message({ role: 'user', content: [{ type: 'text', text: 'Add a greeting CLI. Node or Python?' }] }),
  message({ role: 'custom', customType: 'inbox', display: false, content: 'inbox: nothing waits on the user' }),
  message({
    role: 'assistant',
    content: [
      { type: 'text', text: 'I will check the repo.' },
      { type: 'toolCall', id: 'c1', name: 'bash', arguments: { command: 'ls' } },
      { type: 'toolCall', id: 'c2', name: 'record', arguments: { kind: 'task', ask: 'Try it' } },
      { type: 'toolCall', id: 'c3', name: 'ask', arguments: { questions: [{ question: 'Which runtime?' }] } },
    ],
  }),
  message({ role: 'toolResult', toolCallId: 'c3', content: [{ type: 'text', text: 'Node' }], isError: false }),
  message({ role: 'assistant', content: [{ type: 'text', text: 'The plan is written.' }] }),
]

test('a resumed session with earlier turns is marked behind and catches up over its branch', async () => {
  branch = earlierBranch()
  createInbox(pi(), deps())
  await call('session_start', { type: 'session_start' })
  await settle()

  expect(completions).toHaveLength(1)
  const conversation = completions[0]!.prompt.match(/<conversation>\n([\s\S]*?)\n<\/conversation>/)?.[1]
  expect(conversation).toBe(
    [
      'Person: Add a greeting CLI. Node or Python?',
      'Agent: I will check the repo.',
      'Agent ran: ls',
      'Agent asked the user in a dialog: "Which runtime?"; answer: Node',
      'Agent: The plan is written.',
    ].join('\n'),
  )
  expect(state().presence.ledgerState).toBe('current')
  expect(state().ledger.items.map((i: { ask: string }) => i.ask)).toEqual(['Use Node or Python?'])

  await call('session_switch', { type: 'session_switch', reason: 'resume' })
  await settle()
  expect(completions).toHaveLength(1)
})

test('a new session with no earlier turns, and a session that has no UI, start without a catch-up', async () => {
  createInbox(pi(), deps())
  await call('session_start', { type: 'session_start' })
  await settle()
  expect(completions).toEqual([])

  branch = earlierBranch()
  hasUI = false
  await call('session_start', { type: 'session_start' }, makeCtx('s2'))
  await settle()
  expect(completions).toEqual([])
})

const forkOf = (parent: string) => ({
  type: 'session_switch',
  reason: 'fork',
  previousSessionFile: `/sessions/2026-10-20T05-01-10-123Z_${parent}.jsonl`,
})

test('a forked session takes its parent’s ledger and does not catch up, and catches up when the parent has none', async () => {
  createInbox(pi(), deps())
  await record({ kind: 'task', ask: 'Try the CLI by hand' }, makeCtx('parent'))
  await call('session_start', { type: 'session_start' }, makeCtx('parent'))
  await settle()
  const parentItems = state('parent').ledger.items

  branch = earlierBranch()
  await call('session_switch', forkOf('parent'), makeCtx('child'))
  await settle()
  expect(completions).toEqual([])
  expect(state('child').ledger.items).toEqual(parentItems)
  expect(state('child').presence.ledgerState).toBe('current')

  await call('session_switch', forkOf('missing'), makeCtx('orphan'))
  await settle()
  expect(completions).toHaveLength(1)
  expect(state('orphan').ledger.items.map((i: { ask: string }) => i.ask)).toEqual(['Use Node or Python?'])
})

test('a branch into a new session takes the parent’s ledger, and a branch in the same session copies nothing', async () => {
  createInbox(pi(), deps())
  await record({ kind: 'task', ask: 'Try the CLI by hand' }, makeCtx('parent'))
  await call('session_start', { type: 'session_start' }, makeCtx('parent'))
  await settle()

  branch = earlierBranch()
  const { previousSessionFile } = forkOf('parent')
  await call('session_branch', { type: 'session_branch', reason: 'btw', previousSessionFile }, makeCtx('child'))
  await settle()
  expect(completions).toEqual([])
  expect(state('child').ledger.items).toEqual(state('parent').ledger.items)

  await call('session_branch', { type: 'session_branch', reason: 'branch', previousSessionFile }, makeCtx('parent'))
  await settle()
  expect(completions).toEqual([])
  expect(state('parent').ledger.items.map((i: { ask: string }) => i.ask)).toEqual(['Try the CLI by hand'])
})

test('a resume keeps its own ledger even when the event names another session file', async () => {
  createInbox(pi(), deps())
  await record({ kind: 'task', ask: 'Try the CLI by hand' }, makeCtx('parent'))
  await call('session_switch', { ...forkOf('parent'), reason: 'resume' }, makeCtx('other'))
  await settle()
  expect(state('other').ledger.items).toEqual([])
})

test('a failed catch-up is tried again at the next agent end, before the exchange', async () => {
  branch = earlierBranch()
  createInbox(pi(), deps())
  reply = new Error('offline')
  await call('session_start', { type: 'session_start' })
  await settle()
  expect(state().presence.ledgerState).toBe('failed')

  reply = MODEL_ANSWER
  await prompt('Node')
  await endAgent('Using Node.')
  await settle()
  expect(completions).toHaveLength(2)
  expect(completions[1]!.prompt).toContain('<conversation>')
  expect(state().presence.ledgerState).toBe('current')
  expect(state().pending).toEqual([])
})

test('a subagent runs as a child from its started frame to its end, its progress moves its activity, and a new session start ends one left running', async () => {
  createInbox(pi(), deps())
  type Saved = { name: string; endedAt: number | null; lastActivityAt: number }
  const children = (): Saved[] => state().ledger.overview.children
  const running = () => children().map(c => [c.name, c.endedAt === null])
  await call('session_start', { type: 'session_start' })
  await call('task:subagent:lifecycle', { id: 'Scout', agent: 'task', description: 'Map the repo', status: 'started' })
  expect(running()).toEqual([['Map the repo', true]])
  const startedActivity = children()[0]!.lastActivityAt
  clock += 60_000
  await call('task:subagent:progress', { progress: { id: 'Scout' } })
  expect(children()[0]!.lastActivityAt).toBeGreaterThan(startedActivity + 60_000 - 1)
  await call('task:subagent:lifecycle', { id: 'Scout', agent: 'task', status: 'completed' })
  expect(running()).toEqual([['Map the repo', false]])

  await call('task:subagent:lifecycle', { id: 'Reader', agent: 'task', status: 'started' })
  await call('session_start', { type: 'session_start' })
  expect(running()).toEqual([
    ['Map the repo', false],
    ['task', false],
  ])
})

test('a Herdr delegate runs as a child from the bash call that starts it until a wait on it returns, or Herdr shows it no longer working at the turn’s end', async () => {
  createInbox(pi(), deps())
  const delegates = () =>
    state().ledger.overview.children.map((c: { name: string; endedAt: number | null }) => [c.name, c.endedAt === null])
  const bash = (command: string) => call('tool_execution_start', { toolName: 'bash', args: { command } })
  await prompt('Hand it off')
  await bash('herdr agent start fixer --cmd omp')
  await bash('herdr agent start reviewer --cmd omp && herdr agent start helper --cmd omp')
  expect(delegates()).toEqual([
    ['fixer', true],
    ['reviewer', true],
    ['helper', true],
  ])
  await call('tool_result', { toolName: 'bash', input: { command: 'herdr agent wait fixer' }, content: [] })
  expect(delegates()[0]).toEqual(['fixer', false])
  clock += 60_000
  await bash('herdr agent prompt scout "look around"')
  clock += 5_000
  const agents = [
    { name: 'reviewer', agent_status: 'idle' },
    { name: 'helper', agent_status: 'working' },
    { name: 'scout', agent_status: 'idle' },
  ]
  execResults.set('herdr', { code: 0, stdout: JSON.stringify({ id: 'q', result: { type: 'agent_list', agents } }) })
  await endAgent('Done.')
  expect(execCalls.filter(c => c.command === 'herdr').map(c => c.args)).toEqual([['agent', 'list']])
  expect(delegates()).toEqual([
    ['fixer', false],
    ['reviewer', false],
    ['helper', true],
    ['scout', true],
  ])
})

test('a look starts when the panel shows the Overview and ends on another tab or when the panel closes', async () => {
  const inbox = createInbox(pi(), deps())
  await prompt('hello')
  const saved = state()
  const overview = { ...EMPTY_OVERVIEW, goal: 'Ship it' }
  writeFileSync(join(dir, 'sessions', 's1.json'), JSON.stringify({ ...saved, ledger: { ...saved.ledger, overview } }))
  await inbox.openPanel(makeCtx(), clock)
  inbox.showTab(makeCtx(), 'overview')
  await settle()
  expect(state().ledger.overview.look).not.toBeNull()

  inbox.showTab(makeCtx(), 'needsYou')
  await settle()
  expect(state().ledger.overview.look).toBeNull()
  expect(state().ledger.overview.lastLookAt).not.toBeNull()

  inbox.showTab(makeCtx(), 'overview')
  await settle()
  inbox.closePanel(makeCtx())
  await settle()
  expect(state().ledger.overview.look).toBeNull()
})

test('the agent task list at a reply is the latest todo entry on the branch, including a /todo edit and a deleted list', async () => {
  createInbox(pi(), deps())
  const todo = (op: string, tasks: { content: string; status: string }[]) => ({
    type: 'message',
    message: {
      role: 'toolResult',
      toolName: 'todo',
      isError: false,
      details: { op, phases: [{ name: 'Fix', tasks }] },
    },
  })
  branch = [
    todo('add', [
      { content: 'Read the parser', status: 'completed' },
      { content: 'Fix it', status: 'in_progress' },
    ]),
  ]
  await prompt('hello')
  await endAgent('Working.')
  await settle()
  expect(state().hostTasks).toEqual([
    { id: '1', text: 'Read the parser', status: 'done' },
    { id: '2', text: 'Fix it', status: 'in-progress' },
  ])

  branch.push({
    type: 'custom',
    customType: 'user_todo_edit',
    data: { phases: [{ name: 'Fix', tasks: [{ content: 'Fix it', status: 'pending' }] }] },
  })
  await prompt('again')
  await endAgent('Still working.')
  await settle()
  expect(state().hostTasks).toEqual([{ id: '1', text: 'Fix it', status: 'pending' }])

  branch = []
  await prompt('and again')
  await endAgent('Done.')
  await settle()
  expect(state().hostTasks).toEqual([])
})
