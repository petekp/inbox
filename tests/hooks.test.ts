import { expect, mock, test } from 'claude-code/testing'
import type { Engine, Mounted } from 'claude-code/testing'
import type { On, PaneOpenArgs, PromptOrigin, RenderSurface } from 'claude-code'

import type { FoldProps } from '../hooks/fold-client'
import type { LinksProps } from '../hooks/links-client'
import type { RowProps } from '../hooks/row-client'
import { TAB_HEIGHT, tabLines, type TabsProps } from '../hooks/tabs-client'
import type { Item } from '../types'
import { demoView } from '../hooks/demo'
import { OVERVIEW_SYSTEM } from '../hooks/model-text'
import { checkActions, prBlockActions, prCheckId, prThreadId, threadActions, threadSentIn } from '../hooks/pr-tab'
import { failingChecks, waitingThreads } from '../hooks/prs'
import {
  PERMISSION_FALLBACK_DELAY_MS,
  PRESS_GUARD_MS,
  QUEUED_AFTER_MS,
  SETTLED_MS,
  inboxView,
  perTurnStatus,
  overviewPage,
  rowKeyPlan,
  RUNNING_FRAME_MS,
  RUNNING_FRAMES,
  runningMark,
} from '../hooks/view'

const LEDGER_REPLY = `NEW: decide | 1 | Use Node or Python? | Node / Python | Node
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

let ledgerReply = LEDGER_REPLY
let overviewReply: string | null = 'UNCHANGED'
let overviewPrompts: string[] = []
let overviewHold: Promise<void> | null = null
let sessionId = 'session-1'

let sent: string[] = []

let ran: string[][] = []

let submitAnswer:
  'enter' | 'hold' | { drop: string; beforeDrop?: () => Promise<void> } | { rewrite: string; hold?: boolean } = 'enter'
let held: { text: string; origin: PromptOrigin; release: () => void }[] = []
let inFlight: Promise<unknown>[] = []
let promptRows = 0

let toolVerdict: 'allow' | 'ask' = 'allow'
let stepAnswers: { answer: string; callsTool?: true }[] = []
let transcriptRows: { role: 'user' | 'assistant'; text: string; toolUses: never[] }[] = []

let dialogAnswer: Record<string, unknown> = { result: 'ok', text: 'ok' }
let otherToolAnswer: Record<string, unknown> = { result: 'ok', text: 'ok' }

let isGhMissing = false

let ghAnswers: {
  match: (argv: readonly string[]) => boolean
  stdout: string
  hold?: () => Promise<void>
  fails?: string
}[] = []

function gh(argv: readonly string[]) {
  const hit = ghAnswers.find(a => a.match(argv))
  if (!hit && argv[0] === 'open')
    return { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

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

let surfaces: RenderSurface[] = []

let files: string[] = []

let copied: string[] = []
let toasts: string[] = []

let theme = ''

let beforeAct: (() => Promise<unknown>) | undefined

let stored = new Map<string, string>()
let storeRefusal: string | undefined
let storeHold: (() => Promise<void>) | undefined
let storeSetHold: ((key: string, value: unknown) => Promise<void>) | undefined
let storeSetRefusal: string | undefined
let toolRefusal: string | undefined
let commandRefusal: string | undefined
let panesOpened: string[] = []
let paneOpens: PaneOpenArgs[] = []
let paneState: { isShown: boolean; isFocused: boolean } | null = null

async function runBeforeAct() {
  const act = beforeAct
  beforeAct = undefined
  await act?.()
}

async function storePrompt($: Engine, prompt: { text: string; origin: PromptOrigin }) {
  const row = {
    message: { type: 'user' as const, role: 'user' as const, content: [{ type: 'text' as const, text: prompt.text }] },
    door: 'prompt' as const,
    origin: prompt.origin,
    uuid: `prompt-row-${++promptRows}`,
  }
  await $.session.append(row)
}

async function storeHeld($: Engine, prompt: (typeof held)[number]) {
  await storePrompt($, prompt)
  prompt.release()
}

async function arrive($: Engine) {
  const prompts = held
  held = []
  for (const p of prompts) await storeHeld($, p)
  await Promise.all(inFlight)
  inFlight = []
}

async function arriveFirst($: Engine) {
  await storeHeld($, held.shift()!)
}

async function holdUntilStored(prompt: { text: string; origin: PromptOrigin }) {
  await new Promise<void>(release => held.push({ ...prompt, release }))
}

async function runStep($: Engine, index: number) {
  const stream = $.turn.step({ turnId: 't1', index, model: 'm', messageCount: 3 })
  for await (const _chunk of stream) void _chunk
  await stream.result
}

function world($: Engine, on: On, prompts: string[], vars: Record<string, string> = {}) {
  sent = []
  submitAnswer = 'enter'
  held = []
  inFlight = []
  ran = []
  toolVerdict = 'allow'
  stepAnswers = []
  transcriptRows = []
  dialogAnswer = { result: 'ok', text: 'ok' }
  otherToolAnswer = { result: 'ok', text: 'ok' }
  ghAnswers = []
  isGhMissing = false
  ledgerReply = LEDGER_REPLY
  overviewReply = 'UNCHANGED'
  overviewPrompts = []
  overviewHold = null
  sessionId = 'session-1'
  surfaces = []
  files = []
  copied = []
  toasts = []
  theme = ''
  beforeAct = undefined
  stored = new Map()
  storeRefusal = undefined
  storeHold = undefined
  storeSetHold = undefined
  storeSetRefusal = undefined
  toolRefusal = undefined
  commandRefusal = undefined
  panesOpened = []
  paneOpens = []
  paneState = null
  on('store.get', async ($, e) => {
    if (e.key.startsWith('s:')) await storeHold?.()
    if (storeRefusal && e.key.startsWith('s:')) return { deny: storeRefusal }
    const json = stored.get(e.key)
    return { value: json === undefined ? undefined : JSON.parse(json) }
  })
  on('store.set', async ($, e) => {
    await storeSetHold?.(e.key, e.value)
    if (storeSetRefusal && e.key.startsWith('s:')) return { deny: storeSetRefusal }
    stored.set(e.key, JSON.stringify(e.value))
    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    stored.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...stored.keys()] }))
  on('config.list', () => ({
    value: theme
      ? [
          {
            key: 'theme',
            label: 'Theme',
            kind: 'choice' as const,
            value: theme,
            provider: { plugin: 'engine', tier: 'core' as const },
            isLocked: false,
          },
        ]
      : [],
  }))
  on('session.surfaces', () => ({ value: surfaces }))
  on('session.attach', ($, e) => ({ clientId: e.clientId }))
  on('session.id', () => ({ value: sessionId }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('session.root', () => ({ value: '/tmp/project' }))
  on('env.get', ($, e) => ({ value: vars[e.name] }))
  on('command.register', ($, e) => (commandRefusal ? { deny: commandRefusal } : { value: { command: e.name } }))
  on('tool.register', ($, e) => (toolRefusal ? { deny: toolRefusal } : { value: { tool: `mcp__inbox__${e.name}` } }))
  on('ui.open', ($, e) => {
    panesOpened.push(e.id)
    paneOpens.push(e)
    return { value: { isPlaced: true as const } }
  })
  on('ui.panes', () => ({
    value: paneState ? [{ id: 'inbox', title: 'Inbox', ...paneState, isPlaced: paneState.isShown }] : [],
  }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.copy', ($, e) => {
    copied.push(e.text)
    return { value: { isCopied: true as const } }
  })
  on('fs.exists', ($, e) => ({ value: files.some(f => e.path.endsWith(f)) }))
  on('fs.read', ($, e) => {
    if (!e.path.endsWith('/.claude-plugin/plugin.json')) throw new Error(`ENOENT: ${e.path}`)
    return { value: JSON.stringify({ name: 'inbox', version: '1.2.3' }) }
  })
  on('fs.stat', () => ({ value: { kind: 'file' as const, size: 1, mtimeMs: 1, isLink: false } }))
  on('process.run', async ($, e) => {
    ran.push([...e.argv])
    if (isGhMissing && e.argv[0] === 'gh') throw new Error('spawn gh ENOENT')
    await ghAnswers.find(a => a.match(e.argv))?.hold?.()
    return { value: gh(e.argv) }
  })
  on('model.complete', async ($, e) => {
    const isOverview =
      (e.systemBlocks ?? []).some(block => block.text === OVERVIEW_SYSTEM) || e.system === OVERVIEW_SYSTEM
    if (isOverview) overviewPrompts.push(e.prompt)
    else prompts.push(e.prompt)
    if (isOverview) await overviewHold
    if (isOverview && overviewReply === null) return { deny: 'the Overview call failed' }

    return {
      value: {
        isAnswered: true,
        text: isOverview ? overviewReply! : ledgerReply,
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }
  })
  on('prompt.submit', async (_$, e) => {
    if (e.origin.kind !== 'plugin') return { text: e.text, context: e.context }
    sent.push(e.text)
    if (typeof submitAnswer === 'object') {
      if ('drop' in submitAnswer) {
        await submitAnswer.beforeDrop?.()
        return { drop: submitAnswer.drop }
      }
      const rewritten = { text: submitAnswer.rewrite, origin: e.origin }
      if (submitAnswer.hold) await holdUntilStored(rewritten)
      else await storePrompt($, rewritten)
      return { text: rewritten.text, context: e.context }
    }
    if (submitAnswer === 'hold') await holdUntilStored({ text: e.text, origin: e.origin })
    else await storePrompt($, { text: e.text, origin: e.origin })

    return { text: e.text, context: e.context }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('classic.StopFailure', () => ({}))
  on('classic.PermissionRequest', () => ({}))
  on('tool.check', () => ({ decision: toolVerdict }))
  on('turn.step', async function* (_$, e) {
    const { answer, callsTool } = stepAnswers[e.index] ?? { answer: '' }
    const isLast = !callsTool

    return {
      turnId: e.turnId,
      index: e.index,
      answer,
      toolUses: isLast ? [] : [{ id: `call-${e.index}`, name: 'Bash', input: {} }],
      stopReason: isLast ? ('end_turn' as const) : ('tool_use' as const),
      usage: null,
    }
  })
  on('session.messages', () => ({ value: transcriptRows }))
  on('classic.SessionStart', ($, e) => {
    sessionId = e.session_id
    return {}
  })
  on('tool.call', (_$, e) => {
    if (e.tool !== 'AskUserQuestion') return otherToolAnswer as never
    return dialogAnswer as never
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
  on('ui.press', async ($, e, next) => {
    await runBeforeAct()
    return next(e)
  })
  on('ui.input', async ($, e, next) => {
    if (e.kind === 'submit') await runBeforeAct()
    return next(e)
  })
}

async function replyField(pane: Pick<Mounted, 'findAll'>, id: string) {
  return (await pane.findAll({ type: 'Input' })).find(e => e.key?.startsWith(`type-${id}-`))
}

async function replyKey(pane: Pick<Mounted, 'findAll'>, id: string) {
  const key = (await replyField(pane, id))?.key
  if (!key) throw new Error(`no reply field on ${id}`)
  return key
}

function sidebarLines(): string[] {
  return ran.filter(argv => argv[0] === 'herdr').map(argv => argv.find(a => a.startsWith('inbox='))?.slice(6) ?? '')
}

test('a reply becomes open items, and "1. yes" carries the question', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)

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

  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /Needs you 2/ })).toBeDefined()
  expect(await band.find({ text: /Use Node or Python\?|Name the command greet\?/ })).toBeUndefined()

  const answered = await $.prompt.submit({ text: '1. node\n2. yes', wait: false, origin: { kind: 'composer' } })
  expect(answered.context?.join('\n')).toContain('1 → "Use Node or Python?"')
  expect(answered.context?.join('\n')).toContain(
    'Waiting on the user:\n- (1) "Use Node or Python?"; options: Node / Python; recommended: Node (close id: i1)',
  )
  const unchanged = await $.prompt.submit({ text: 'also add a --loud flag', wait: false, origin: { kind: 'composer' } })
  expect(unchanged.context?.join('\n') ?? '').not.toContain('Waiting on the user')

  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'answer-i1-0' })
  expect(sent).toEqual(['Re "Use Node or Python?": Node'])
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()
  await $.turn.complete({ answer: 'Using Node.', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect(prompts.at(-1)).toContain('Re "Use Node or Python?": Node\n</person>')
})

test('a question the desktop app’s box shows reaches the update, even when the turn ends with no text', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)

  await $.session.start({ cwd: '/tmp/project', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'file this finding', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'file this finding', turnId: 't1' })
  await $.tool.call({
    tool: 'mcp__ccd_turn__wrap_up',
    recap: 'No issue tracker is connected.',
    ask: 'Which tracker should I file it in?',
    actions: [{ label: 'Retry GitHub' }, { label: 'Use another tracker' }],
  } as never)
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()

  expect(prompts.length).toBe(1)
  expect(prompts[0]).toContain(
    '<reply>\nNo issue tracker is connected.\n\nWhich tracker should I file it in?\nOptions: Retry GitHub / Use another tracker\n</reply>',
  )
})

test('a dialog reaches the model with its questions, whether answered or dismissed, and a dismissed one’s copy, added by the update or recorded by Claude, shows its option descriptions', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)
  const ask = (...questions: { question: string; options: { label: string; description?: string }[] }[]) =>
    $.tool.call({ tool: 'AskUserQuestion', questions } as never)
  const turn = async (turnId: string, dialog: () => Promise<unknown>, ending: 'answer' | 'aborted' = 'answer') => {
    await $.prompt.submit({ text: 'go on', wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text: 'go on', turnId })
    await dialog()
    const answer = ending === 'answer' ? 'Done.' : ''
    await $.turn.complete({ answer, durationMs: 5, isAborted: ending === 'aborted', turnId, reason: ending })
    await clock.settle()
  }
  const push = { question: 'Push the fix now?', options: [{ label: 'Push now (Recommended)' }, { label: 'Wait' }] }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  dialogAnswer = { result: {}, text: 'User has answered: Push now' }
  await turn('t1', () => ask(push))
  expect(prompts.at(-1)).toContain('Push the fix now?')
  expect(prompts.at(-1)).toContain('User has answered: Push now')

  dialogAnswer = {
    isError: true,
    result: 'User declined to answer questions',
    text: 'User declined to answer questions',
  }
  await turn('t2', () => ask(push), 'aborted')
  expect(prompts.length).toBe(2)
  expect(prompts.at(-1)).toContain('Push the fix now?')
  expect(prompts.at(-1)).toContain('the user dismissed it without answering')
  expect(prompts.at(-1)).not.toContain('User declined')

  dialogAnswer = { result: {}, text: 'Both answered' }
  await turn('t3', () => ask(push, { question: 'Which branch?', options: [{ label: 'main' }, { label: 'next' }] }))
  expect(prompts.at(-1)).toContain('Which branch?')

  const itemAsking = (ask: string) =>
    (JSON.parse(stored.get('s:session-1')!) as { ledger: { items: Item[] } }).ledger.items.find(i => i.ask === ask)
  dialogAnswer = {
    isError: true,
    result: 'User declined to answer questions',
    text: 'User declined to answer questions',
  }
  ledgerReply = 'NEW: decide | - | Deploy to staging? | Deploy / Hold | -'
  const deploy = {
    question: 'Deploy to staging now?',
    options: [
      { label: 'Deploy', description: 'Runs the staging pipeline' },
      { label: 'Hold', description: 'Waits for the review' },
    ],
  }
  await turn('t4', () => ask(deploy), 'aborted')
  expect(prompts.at(-1)).not.toContain('Runs the staging pipeline')
  const deployItem = itemAsking('Deploy to staging?')
  expect(deployItem?.optionDescriptions).toEqual({ Deploy: 'Runs the staging pipeline', Hold: 'Waits for the review' })
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: `select-${deployItem?.id}` })
  await clock.settle()
  const texts = (await pane.findAll({ type: 'Text' })).map(t => t.text ?? '')
  expect(texts).toContain('Deploy: Runs the staging pipeline')
  expect(texts).toContain('Hold: Waits for the review')

  ledgerReply = 'NEW: decide | - | Clear stored data? | Yes / No | -'
  const yesNo = (yes: string, no: string) => [
    { label: 'Yes', description: yes },
    { label: 'No', description: no },
  ]
  await turn(
    't5',
    () =>
      ask(
        { question: 'Delete the cache?', options: yesNo('Removes cached builds', 'Keeps them') },
        { question: 'Rebuild the index?', options: yesNo('Takes ten minutes', 'Uses the old index') },
      ),
    'aborted',
  )
  expect(itemAsking('Clear stored data?')?.optionDescriptions).toBeUndefined()

  ledgerReply = 'NONE'
  const port = {
    question: 'Which port should the server use?',
    options: [
      { label: '3000', description: 'The default the docs use' },
      { label: '8080', description: 'Free on the staging box' },
    ],
  }
  await turn(
    't6',
    async () => {
      await ask(port)
      await $.tool.call({
        tool: 'mcp__inbox__record',
        kind: 'question',
        ask: 'Which port should the server use?',
        options: ['3000', '8080'],
      } as never)
    },
    'aborted',
  )
  expect(itemAsking('Which port should the server use?')?.optionDescriptions).toEqual({
    3000: 'The default the docs use',
    8080: 'Free on the staging box',
  })
})

test('a question’s handle is the number a typed answer reaches, and the band counts what the tab counts', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], { HERDR_PANE_ID: 'p1' })
  const reply = async (text: string, turnId: string) => {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text, turnId })
    await $.turn.complete({ answer: 'Run ./load.sh.', durationMs: 5, isAborted: false, turnId, reason: 'answer' })
    await clock.settle()
  }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await reply('add a greeting cli', 't1')
  ledgerReply = [
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
  expect(await pane.find({ key: 'explain-i3-key' })).toBeDefined()
  expect([await handle('i3'), await handle('i5'), await handle('i1'), await handle('i2')]).toEqual([
    '1)',
    '2)',
    '•',
    '•',
  ])
  expect(await band.find({ text: /Needs you 6/ })).toBeDefined()
  expect(await pane.find({ text: /^ 6$/ })).toBeDefined()

  const answered = await $.prompt.submit({ text: '1. yes', wait: false, origin: { kind: 'composer' } })
  expect(answered.context?.join('\n')).toContain('1 → "Add a --loud flag?"')
  expect(await handle('i3')).toBe('•')

  await pane.press({ key: 'select-i4' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'help-i4-0' })
  await clock.settle()
  expect(await band.find({ text: /Needs you 5/ })).toBeDefined()
  expect(await pane.find({ text: /^ 5$/ })).toBeDefined()

  ledgerReply = ['NEW: do | - | Water the plants | - | -', 'NEW: decide | 1 | Ship it? | yes / no | yes'].join('\n')
  await reply('ship it', 't3')
  expect(await handle('i8')).toBe('1)')
  expect(sidebarLines().at(-1)).toBe('8 · Ship it?')
  ledgerReply = 'NEW: do | - | Feed the cat | - | -'
  await reply('one more task', 't4')
  expect(sidebarLines().at(-1)).toBe('9 · Ship it?')
})

test('Done on a task Claude just left tells Claude once Undo ends, and a task from an earlier reply or one already read stays silent', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const reply = async (text: string, answer: string, turnId: string) => {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text, turnId })
    await $.turn.complete({ answer, durationMs: 5, isAborted: false, turnId, reason: 'answer' })
    await clock.settle()
  }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  ledgerReply = 'NEW: do | - | Water the plants | - | -'
  await reply('plan the day', 'Water the plants when you can.', 't1')
  ledgerReply = ['NEW: do | - | Sign in to npm | - | -', 'NEW: do | - | Approve the deploy | - | -'].join('\n')
  await reply('publish it', 'Sign in to npm and approve the deploy, then I publish.', 't2')
  const pane = await $.ui.mount(PANE)
  const done = async (id: string) => {
    await pane.press({ key: `select-${id}` })
    await clock.advance(PRESS_GUARD_MS)
    await pane.press({ key: `done-${id}` })
    await clock.settle()
  }

  await done('i2')
  await clock.advance(SETTLED_MS / 2)
  await done('i3')
  await clock.advance(SETTLED_MS / 2)
  expect(sent).toEqual([])
  expect(await pane.find({ key: 'undo-i3' })).toBeDefined()
  await clock.advance(SETTLED_MS / 2)
  expect(sent).toEqual(['Done:\n- Sign in to npm\n- Approve the deploy'])

  await reply('thanks', 'Published.', 't3')
  await done('i1')
  await clock.advance(SETTLED_MS)
  expect(sent).toHaveLength(1)

  ledgerReply = 'NEW: do | - | Rotate the key | - | -'
  await reply('next', 'Rotate the key, then I redeploy.', 't4')
  await done('i4')
  await $.prompt.submit({ text: 'done, go ahead', wait: false, origin: { kind: 'composer' } })
  await clock.advance(SETTLED_MS)
  expect(sent).toHaveLength(1)
})

test('a Done message that waits for its prompt to run reads Queued instead of Not confirmed', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  ledgerReply = 'NEW: do | - | Sign in to npm | - | -'
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'publish it', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'publish it', turnId: 't1' })
  await $.turn.complete({
    answer: 'Sign in to npm, then I publish.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'select-i1' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'done-i1' })
  await clock.settle()

  submitAnswer = 'hold'
  await clock.advance(SETTLED_MS)
  await clock.advance(QUEUED_AFTER_MS)
  expect(await pane.find({ text: /Not\s+confirmed/ })).toBeUndefined()
  await pane.press({ key: 'fold-task' })
  expect(await pane.find({ text: /Queued/ })).toBeDefined()
  await arrive($)
})

const doneWakeAfterRewrite = async ($: Engine, on: On, isMatched: boolean) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  ledgerReply = ['NEW: decide | 1 | Ship it? | yes / no | yes', 'NEW: do | - | Sign in to npm | - | -'].join('\n')
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'publish it', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'publish it', turnId: 't1' })
  await $.turn.complete({
    answer: 'Ship it? And sign in to npm first.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  if (isMatched) {
    submitAnswer = 'hold'
    inFlight.push(pane.press({ key: 'explain-i1-key' }))
    await clock.settle()
  }
  await pane.press({ key: 'select-i2' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'done-i2' })
  await clock.settle()
  submitAnswer = { rewrite: isMatched ? held[0]!.text : 'Rewritten by another plugin' }
  await clock.advance(SETTLED_MS)
  await clock.advance(QUEUED_AFTER_MS)
  await clock.settle()
  await pane.press({ key: 'fold-task' })
  return pane
}

test('a Done message another plugin rewrote reads as delivered once Claude runs it, not Queued', async ($, on) => {
  const pane = await doneWakeAfterRewrite($, on, false)
  expect(await pane.find({ text: /Queued/ })).toBeUndefined()
  expect(await pane.find({ text: /Not\s+confirmed/ })).toBeUndefined()
})

test('a Done message another plugin rewrote to text a pending press also sent reads Not confirmed, not Queued', async ($, on) => {
  const pane = await doneWakeAfterRewrite($, on, true)
  expect(await pane.find({ text: /Not\s+confirmed/ })).toBeDefined()
  await arrive($)
})

test('Working… shows from the main agent’s turn.start to its turn.complete, not for a subagent’s turn, a Done message waits for an interrupted turn to end, and a reload clears it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let session: Parameters<typeof overviewPage>[0] | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, ($, e, next) => {
    session = e.value as never
    return next(e)
  })
  const now = async () => overviewPage(session!, 1_000_000).lead.find(l => l.id === 'status')?.text ?? null

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  ledgerReply = 'NEW: do | - | Sign in to npm | - | -'
  await $.prompt.submit({ text: 'publish it', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'publish it', turnId: 't1' })
  expect(await now()).toBe('Working…')
  await $.turn.complete({ answer: 'Sign in to npm.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(await now()).toBe(null)

  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'select-i1' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'done-i1' })
  await $.turn.start({ text: 'Look around the repo', turnId: 's1', agentId: 'a1' })
  await clock.settle()
  expect(await now()).toBe(null)
  await $.turn.start({ text: '', turnId: 't2' })
  await clock.advance(SETTLED_MS)
  expect(await now()).toBe('Working…')
  expect(sent).toEqual([])

  await $.turn.complete({ answer: '', durationMs: 5, isAborted: true, turnId: 't2', reason: 'aborted' })
  await clock.settle()
  expect(await now()).toBe(null)
  expect(sent).toEqual(['Done: Sign in to npm'])

  await $.turn.start({ text: '', turnId: 't3' })
  expect(await now()).toBe('Working…')
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(await now()).toBe(null)
})

for (const switchAt of [null, 'before-submit', 'during-submit'] as const)
  test(`a refused Done batch stays recoverable after resume, with session switch during send: ${switchAt}`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    ledgerReply = ['NEW: do | - | Sign in to npm | - | -', 'NEW: do | - | Approve the deploy | - | -'].join('\n')
    await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
    await $.prompt.submit({ text: 'publish it', wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text: 'publish it', turnId: 't1' })
    await $.turn.complete({
      answer: 'Sign in and approve the deploy.',
      durationMs: 5,
      isAborted: false,
      turnId: 't1',
      reason: 'answer',
    })
    await clock.settle()
    const pane = await $.ui.mount(PANE)
    for (const id of ['i1', 'i2']) {
      await pane.press({ key: `select-${id}` })
      await clock.advance(PRESS_GUARD_MS)
      await pane.press({ key: `done-${id}` })
      await clock.settle()
    }
    const switchSession = async () => {
      await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
      await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
    }
    if (switchAt === 'before-submit')
      storeSetHold = async (_key, value) => {
        const saved = value as { ledger?: { closed: { doneNotification?: unknown }[] } }
        if (!saved.ledger?.closed.some(c => c.doneNotification)) return
        storeSetHold = undefined
        await switchSession()
      }
    submitAnswer = {
      drop: 'Notifications refused',
      beforeDrop: async () => {
        if (switchAt === 'during-submit') await switchSession()
      },
    }
    await clock.advance(SETTLED_MS)
    expect(sent).toHaveLength(switchAt === 'before-submit' ? 0 : 1)
    if (switchAt) {
      expect(await pane.find({ text: /Not sent:/ })).toBeUndefined()
      await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
      await $.classic.SessionStart({ source: 'resume', session_id: 'session-1' })
      await clock.settle()
    }
    await pane.press({ key: 'fold-task' })
    expect({ refusalVisible: !!(await pane.find({ text: /Not sent:/ })) }).toEqual({ refusalVisible: true })
    expect({ firstUndoVisible: !!(await pane.find({ key: 'undo-i1' })) }).toEqual({ firstUndoVisible: true })
    expect({ secondUndoVisible: !!(await pane.find({ key: 'undo-i2' })) }).toEqual({ secondUndoVisible: true })
    await clock.advance(SETTLED_MS * 2)
    expect(sent).toHaveLength(switchAt === 'before-submit' ? 0 : 1)
    await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
    await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
    await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
    await $.classic.SessionStart({ source: 'resume', session_id: 'session-1' })
    await clock.settle()
    await clock.advance(SETTLED_MS * 2)
    expect(sent).toHaveLength(switchAt === 'before-submit' ? 0 : 1)
    await pane.press({ key: 'fold-task' })
    expect({ refusalVisible: !!(await pane.find({ text: /Not sent:/ })) }).toEqual({ refusalVisible: true })
    await pane.press({ key: 'undo-i1' })
    await clock.settle()
    expect({ restoredTask: !!(await pane.find({ key: 'done-i1' })) }).toEqual({ restoredTask: true })
  })

test('a task handed to Claude folds and leaves the count until Claude’s reply leaves it open, whatever it opens or copies meanwhile', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  ledgerReply = [
    'NEW: do | - | Run the load script | - | -',
    'HELP: new 1 | run | ./load.sh | load script',
    'HELP: new 1 | run | npm login | -',
    'HELP: new 1 | open | notes/load.md | -',
    'NEW: do | - | Add the API key | - | -',
    'HELP: new 2 | copy | API_KEY=x | env line',
    'HELP: new 2 | open | .env.local | -',
  ].join('\n')
  const answer = 'Run ./load.sh after npm login; see notes/load.md. Put API_KEY=x in .env.local.'
  theme = 'dark'

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'load the data', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'load the data', turnId: 't1' })
  await $.turn.complete({ answer, durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  const pane = await $.ui.mount(PANE)
  expect(await band.find({ text: /Needs you 2/ })).toBeDefined()

  await pane.press({ key: 'help-i1-0' })
  await clock.settle()
  expect(sent.at(-1)).toContain('./load.sh')
  expect(await pane.find({ text: /Run load script/ })).toBeDefined()
  expect(await pane.find({ key: 'help-i1-1' })).toBeUndefined()
  expect(await band.find({ text: /Needs you 1/ })).toBeDefined()
  expect(await pane.find({ key: 'help-i2-0' })).toBeDefined()

  await pane.press({ key: 'title-i1' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'help-i1-1' })
  await clock.settle()
  expect(copied).toEqual(['npm login'])
  expect(await pane.find({ text: '✓ Copied npm login. Run it in a terminal, or type ! and paste.' })).toBeDefined()
  await pane.press({ key: 'help-i1-2' })
  await clock.settle()
  const red = (await pane.find({ type: 'Text', text: 'Could not open load.md: it no longer exists' }))?.props.color
  expect(red).toBeDefined()
  expect(toasts).toEqual([])
  expect(await band.find({ text: /Needs you 1/ })).toBeDefined()
  await clock.advance(SETTLED_MS)
  expect(await pane.find({ text: 'Could not open load.md: it no longer exists' })).toBeDefined()

  files = ['/tmp/project/.env.local']
  await pane.press({ key: 'select-i2' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'help-i2-0' })
  await clock.settle()
  expect(copied.at(-1)).toBe('API_KEY=x')
  expect(ran.at(-1)).toEqual(['open', '/tmp/project/.env.local'])
  expect(
    (await pane.find({ type: 'Text', text: '✓ Copied env line\u2007·\u2002Opened .env.local' }))?.props.color,
  ).not.toBe(red)
  expect((await pane.find({ type: 'Text', text: /Could not open load\.md/ }))?.props.color).toBe(red)
  expect((await pane.find({ key: 'help-i2-0-key' }))?.props.label).toBe('Copy env line and open .env.local')
  await clock.advance(SETTLED_MS)
  expect(await pane.find({ text: /Opened \.env\.local/ })).toBeUndefined()
  await pane.press({ key: 'title-i1' })

  ledgerReply = 'NONE'
  await $.turn.start({ text: 'For "Run the load script", run this', turnId: 't2' })
  await $.turn.complete({ answer: 'It needs sudo.', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect((await pane.find({ key: 'help-i1-0-key' }))?.props.label).toBe('Run load script again')
  expect(await band.find({ text: /Needs you 2/ })).toBeDefined()
})

test('a question with 7 options shows 4 until [All 7 options], draws its steps after them, and letters only the first 9', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  ledgerReply = [
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

  expect(await pane.find({ key: 'answer-i1-3' })).toBeDefined()
  expect(await pane.find({ key: 'answer-i1-4' })).toBeUndefined()
  expect(await hotkey('answer-i1-4')).toBeUndefined()
  expect((await pane.find({ key: 'all-options-i1' }))?.props.label).toBe('All 7 options')
  expect([
    await hotkey('answer-i1-3'),
    await hotkey('answer-i1-2'),
    await hotkey('help-i1-0'),
    await hotkey('help-i1-2'),
  ]).toEqual(['a', 'f', 'g', 'i'])
  expect(await pane.find({ key: 'answer-i1-3', text: ': Green (recommended)' })).toBeDefined()

  await pane.press({ key: 'all-options-i1' })
  expect(await pane.find({ key: 'answer-i1-6' })).toBeDefined()
  expect(await pane.find({ key: 'all-options-i1' })).toBeUndefined()
  expect([await hotkey('answer-i1-6'), await hotkey('help-i1-0'), await hotkey('help-i1-1')]).toEqual(['i', 'l', 'm'])
  expect(await hotkey('help-i1-2')).toBeUndefined()
  expect((await pane.find({ key: 'help-i1-2' }))?.props.label).toBe('Run c script')
  await pane.press({ key: 'answer-i1-6' })
  expect(sent).toEqual(['Re "Which color?": Violet'])
})

test('last actions an earlier build saved convert once by the table, and a task handed off then still folds', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  ledgerReply = 'NEW: do | - | Run the load script | - | -\nHELP: new 1 | run | ./load.sh | load script'
  const at = 1_000_000
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
    f9: {
      kind: 'handoff',
      action: 'address',
      text: 'Address',
      at,
      turnsStarted: 1,
      tab: 'findings',
      title: 'x',
      index: 0,
    },
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
    i1: { kind: 'handoff', action: 'step-0', text: 'Run load script', at, turnsStarted: 1 },
    i2: { kind: 'talk', action: 'explain', text: 'Explain', at },
    i3: { kind: 'handoff', action: 'type', text: 'Reply', at },
    i4: { kind: 'handoff', action: 'step-1', text: 'Seed', at },
    i5: { kind: 'talk', action: 'explain', text: 'Explain', at },
    f6: { kind: 'handoff', action: 'address', text: 'Address', at },
    f7: { kind: 'talk', action: 'discuss', text: 'Discuss', at },
    f9: { kind: 'handoff', action: 'address', text: 'Address', at, turnsStarted: 1 },
    [thread('T1')]: { kind: 'handoff', action: 'thread-address', text: 'Address', at },
    [thread('T2')]: { kind: 'talk', action: 'thread-draft', text: 'Draft reply', at },
    [thread('T3')]: { kind: 'talk', action: 'thread-discuss', text: 'Discuss', at },
    'pr:acme/greet#12': { kind: 'talk', action: 'pr-conflicts', text: 'Resolve conflicts', at },
    'pr:acme/greet#13': { kind: 'handoff', action: 'pr-address-all', text: 'Address all 2 threads', at },
  }
  let saving: unknown = null
  let saved: unknown = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, ($, e, next) => {
    const write = saving ? { ...e, value: { ...e.value, lastActions: saving as never } } : e
    saved = write.value.lastActions
    return next(write)
  })
  let savingUnfolded: unknown = null
  let savedUnfolded: unknown = null
  on('state.set', { plugin: 'inbox', key: 'unfolded' } as const, ($, e, next) => {
    const write = savingUnfolded ? { ...e, value: savingUnfolded as never } : e
    savedUnfolded = write.value
    return next(write)
  })
  const oldCursor = { id: 'i1', index: 0 }
  let savingOpen: { selection: unknown } | null = null
  const savedOpen: { selection?: unknown } = {}
  on('state.set', { plugin: 'inbox', key: 'selection' } as const, ($, e, next) => {
    const write = savingOpen ? { ...e, value: savingOpen.selection as never } : e
    savedOpen.selection = write.value
    return next(write)
  })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'load the data', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'load the data', turnId: 't1' })
  await $.turn.complete({ answer: 'Run ./load.sh.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'README is stale',
    detail: 'Old name.',
  })
  await $.tool.call({ tool: 'mcp__inbox__close', id: 'f2', reason: 'fixed' } as never)
  saving = old
  savingUnfolded = ['finding', 'do']
  savingOpen = {
    selection: { needsYou: oldCursor, findings: { id: null, index: 0 }, prs: { id: null, index: 0 } },
  }
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  saving = null
  savingUnfolded = null
  savingOpen = null
  const openConverted = {
    selection: {
      needsYou: { ...oldCursor, openedAt: 0 },
      findings: { id: null, index: 0, openedAt: 0 },
      prs: { id: null, index: 0, openedAt: 0 },
    },
  }
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(saved).toEqual(converted)
  expect(savedUnfolded).toEqual(['issue', 'opportunity', 'task'])
  expect(savedOpen).toEqual(openConverted)
  saved = null
  savedUnfolded = null
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(saved).toEqual(converted)
  expect(savedUnfolded).toEqual(['issue', 'opportunity', 'task'])
  expect(savedOpen).toEqual(openConverted)

  const pane = await $.ui.mount(PANE)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await pane.find({ text: /Run load script/ })).toBeDefined()
  expect(await band.find({ text: /Needs you/ })).toBeUndefined()
  await clock.advance(SETTLED_MS)
  await pane.press({ key: 'tab-findings' })
  expect((await pane.find({ key: 'fold-issue' }))?.props.label).toBe('▾ 1 closed')
})

test('the guidance reaches Claude in the close tool’s description and nowhere else', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('tool.describe', ($, e) => ({ description: e.description }))
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const provider = { plugin: 'inbox', tier: 'user' } as const
  const close = await $.tool.describe({ tool: 'mcp__inbox__close', description: 'Close an item.', provider })
  const record = await $.tool.describe({ tool: 'mcp__inbox__record', description: 'Record an item.', provider })
  expect(close.description).toContain('Close an item.')
  expect(close.description).toContain('# Inbox')
  expect(record.description).toBe('Record an item.')
})

test('the band is [Open inbox] and the counts, the same while working and after 15 idle minutes', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const band = (props: Partial<typeof BAND.props> = {}) =>
    $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND, props: { ...BAND.props, ...props } })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'add a greeting cli', turnId: 't1' })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'README is stale',
    detail: 'It names the old command.',
  })

  const standing = await band()
  expect(await standing.find({ key: 'open-inbox' })).toBeDefined()
  expect(await standing.find({ text: /^Needs you 2\u2007·\u2002Findings 1$/ })).toBeDefined()
  expect(await standing.find({ text: /Use Node or Python|Add a greeting CLI|Waiting on two choices/ })).toBeUndefined()

  const working = await band({ isWorking: true })
  expect(await working.find({ text: /^Needs you 2\u2007·\u2002Findings 1$/ })).toBeDefined()

  await clock.advance(16 * 60_000)
  expect(await standing.find({ text: /^Needs you 2\u2007·\u2002Findings 1$/ })).toBeDefined()
  expect(await standing.find({ text: /Plan written|last active/ })).toBeUndefined()

  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'select-i2' })
  await pane.press({ key: 'tab-findings' })
  panesOpened = []
  await standing.press({ key: 'open-inbox' })
  expect(panesOpened).toEqual(['inbox'])
  expect(await pane.find({ key: 'explain-i1-key' })).toBeDefined()
  expect(await pane.find({ key: 'explain-i2-key' })).toBeUndefined()
})

test('the band keeps what the mods after the inbox draw there, with its counts and with its stop line', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Text({ children: ['Heads up'] }))
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'inbox', surface, ...BAND })
    expect(await band.find({ text: /^Needs you 2$/ })).toBeDefined()
    expect(await band.find({ text: 'Heads up' })).toBeDefined()
    await band.unmount()
  }

  await $.classic.StopFailure({ error: 'server_error' } as never)
  await clock.settle()
  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'inbox', surface, ...BAND })
    expect(await band.find({ key: 'resume' })).toBeDefined()
    expect(await band.find({ text: 'Heads up' })).toBeDefined()
    await band.unmount()
  }
})

const replyWithOverview = async ($: Engine, on: On, overview: string | null, ledgerAnswer = LEDGER_REPLY) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  overviewReply = overview
  ledgerReply = ledgerAnswer
  let session: { ledger: { overview: { headline: string } | null; items: { ask: string }[] } } | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, ($, e, next) => {
    session = e.value as never
    return next(e)
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Plan ready. Node or Python?',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()

  return session!.ledger
}

test('a reply’s Overview comes from the separate Overview call, after the ledger update', async ($, on) => {
  const ledger = await replyWithOverview($, on, 'HEADLINE: Adding a greeting CLI\nSTATUS: Planning.')

  expect(ledger.overview?.headline).toBe('Adding a greeting CLI')
  expect(ledger.items.map(i => i.ask)).toEqual(['Use Node or Python?', 'Name the command greet?'])
  expect(overviewPrompts).toHaveLength(1)
})

test('a failed Overview call leaves the ledger update applied and no Overview', async ($, on) => {
  const ledger = await replyWithOverview($, on, null)

  expect(ledger.overview).toBeNull()
  expect(ledger.items.map(i => i.ask)).toEqual(['Use Node or Python?', 'Name the command greet?'])
})

test('an Overview answer of UNCHANGED leaves the last Overview as it was', async ($, on) => {
  const ledger = await replyWithOverview($, on, 'UNCHANGED')

  expect(ledger.overview).toBeNull()
})

test('a ledger update shows before its Overview call returns', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let session: { ledger: { overview: { headline: string } | null; items: { id: string }[] } } | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, ($, e, next) => {
    session = e.value as never
    return next(e)
  })
  const reply = async (text: string, turnId: string) => {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text, turnId })
    await $.turn.complete({ answer: 'Noted.', durationMs: 5, isAborted: false, turnId, reason: 'answer' })
    await clock.settle()
  }
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  ledgerReply = 'NEW: decide | 1 | Use Node or Python? | Node / Python | Node'
  await reply('add a greeting cli', 't1')

  let release: () => void = () => undefined
  overviewHold = new Promise<void>(resolve => (release = resolve))
  overviewReply = 'HEADLINE: Scaffolding the command'
  ledgerReply = 'CLOSED: i1 | Node chosen'
  await reply('use node', 't2')

  expect(session!.ledger.items).toEqual([])
  expect(session!.ledger.overview).toBeNull()
  expect(overviewPrompts.at(-1)).not.toContain('Use Node or Python?')
  release()
  await clock.settle()
  expect(session!.ledger.overview?.headline).toBe('Scaffolding the command')
})

test('a ledger call that gives no usable answer runs no Overview call', async ($, on) => {
  const ledger = await replyWithOverview($, on, 'HEADLINE: Adding a greeting CLI', 'not a ledger')

  expect(overviewPrompts).toEqual([])
  expect(ledger.overview).toBeNull()
})

test('the next ledger update does not wait for an earlier Overview call, and Overview calls run one at a time', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let session: { ledger: { overview: { headline: string } | null; items: { ask: string }[] } } | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, ($, e, next) => {
    session = e.value as never
    return next(e)
  })
  const reply = async (text: string, turnId: string) => {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text, turnId })
    await $.turn.complete({ answer: 'Noted.', durationMs: 5, isAborted: false, turnId, reason: 'answer' })
    await clock.settle()
  }
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  let release: () => void = () => undefined
  overviewHold = new Promise<void>(resolve => (release = resolve))
  overviewReply = 'HEADLINE: Scaffolding the command'
  ledgerReply = 'NEW: do | - | Water the plants | - | -'
  await reply('add a greeting cli', 't1')
  ledgerReply = 'NEW: do | - | Feed the cat | - | -'
  await reply('and a name', 't2')

  expect(session!.ledger.items.map(i => i.ask)).toEqual(['Water the plants', 'Feed the cat'])
  expect(overviewPrompts).toHaveLength(1)
  release()
  await clock.settle()
  expect(overviewPrompts).toHaveLength(2)
  expect(overviewPrompts[1]).toContain('HEADLINE: Scaffolding the command')
})

test('resumed into a conversation it cannot fork yet, it catches up from the transcript before any reply', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)
  on('session.turns', () => ({ value: 3 }))
  on('model.fork', () => ({ value: { isAnswered: false as const, reason: 'nothing-to-fork' as const } }))
  const said = (role: 'user' | 'assistant', text: string) => ({ role, text, toolUses: [] as never[] })
  transcriptRows = [
    said('user', 'Add a greeting CLI. Node or Python?'),
    said('user', 'inbox: what waits on the user, as of your last reply. Anything not listed here is closed.'),
    said('assistant', 'The plan is written. 1. Node or Python? 2. Name the command greet?'),
  ]

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const conversation = prompts.at(-1)?.match(/<conversation>\n([\s\S]*?)\n<\/conversation>/)?.[1]
  expect(conversation).toBe(
    'Person: Add a greeting CLI. Node or Python?\nAgent: The plan is written. 1. Node or Python? 2. Name the command greet?',
  )
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
  expect(await pane.find({ text: /update failed/ })).toBeUndefined()
})

test('a catch-up writes its Overview with a separate call over the transcript', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  overviewReply = 'HEADLINE: Adding a greeting CLI\nSTATUS: The plan is written.'
  let session: { ledger: { overview: { headline: string; status: string } | null } } | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, ($, e, next) => {
    session = e.value as never
    return next(e)
  })
  on('session.turns', () => ({ value: 3 }))
  on('model.fork', () => ({
    value: {
      isAnswered: true,
      text: 'NONE',
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))
  const said = (role: 'user' | 'assistant', text: string) => ({ role, text, toolUses: [] as never[] })
  transcriptRows = [said('user', 'Add a greeting CLI.'), said('assistant', 'The plan is written. Command named greet.')]

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()

  expect(session!.ledger.overview).toMatchObject({ headline: 'Adding a greeting CLI', status: 'The plan is written.' })
  expect(overviewPrompts.at(-1)).toContain('<conversation>\nPerson: Add a greeting CLI.')
})

test('after a failed update, the next reply catches up over the whole conversation', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('model.fork', () => ({
    value: {
      isAnswered: true,
      text: 'CLOSED: i1 | Node\nFIXED: f3 | fixed\nNEW: do | - | Review the welcome copy | - | -',
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'README is stale',
    detail: 'It names the old command.',
  })

  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
  expect(await pane.find({ text: 'now' })).toBeDefined()
  expect(await pane.find({ key: 'explain-i2-key' })).toBeUndefined()
  await pane.press({ key: 'next' })
  expect(await pane.find({ key: 'explain-i2-key' })).toBeDefined()
  await pane.press({ key: 'previous' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'explain-i1-key' })
  expect(sent.at(-1)).toContain('"Use Node or Python?"\nOptions: Node / Python')
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()

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
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()
  expect(await pane.find({ text: /^Use Node or Python\?$/ })).toBeDefined()
  expect(await pane.find({ text: /^Node$/ })).toBeDefined()
  expect(await pane.find({ text: /Name the command greet\?/ })).toBeDefined()
  expect(await pane.find({ text: /Review the welcome copy/ })).toBeDefined()
  expect(await pane.find({ text: /update failed/ })).toBeUndefined()
  await pane.press({ key: 'tab-findings' })
  expect(await pane.find({ key: 'row-f3' })).toBeUndefined()
  expect(await pane.find({ key: 'settled-f3' })).toBeDefined()
  expect(await pane.find({ key: 'undo-f3' })).toBeUndefined()
})

test('a reload that cuts off the end-of-turn hook catches up on load, and a subagent’s turn leaves nothing to catch up', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let forks = 0
  on('model.fork', () => {
    forks++
    return {
      value: {
        isAnswered: true,
        text: 'NEW: decide | - | Push the branch to origin? | yes / no | yes',
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }
  })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'add a greeting cli', turnId: 't1' })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const updates = forks
  await $.turn.start({ text: 'Look around the repo', turnId: 's1', agentId: 'a1' })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(forks).toBe(updates)

  await $.turn.start({ text: '', turnId: 't2' })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()

  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Push the branch to origin\?/ })).toBeDefined()
})

test('the pane footer shows the version from the plugin manifest', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  paneState = { isShown: true, isFocused: true }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: '' } as never)
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: 'v1.2.3' })).toBeDefined()
})

test('the pane footer marks a build that follows the next branch', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  files = ['/.next-build']
  paneState = { isShown: true, isFocused: true }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: '' } as never)
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: 'v1.2.3 · next' })).toBeDefined()
})

test('a finding Claude records while the pane shows an empty tab brings the pane to it, and Fix hands it to Claude, settles its row as the choice made, and moves it to the Closed fold even when Claude’s reply leaves it open', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  paneState = { isShown: true, isFocused: true }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: '' } as never)
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /^Nothing needed$/ })).toBeDefined()
  const r = await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'Retry loop never backs off',
    detail: 'The fetch retry spins with no delay and can hammer the API.',
    path: 'src/api.ts',
  })
  expect(r.result).toBe('Recorded. The user sees it in the Findings tab of the /inbox pane.')
  await clock.settle()
  expect(await pane.find({ text: /Retry loop never backs off/ })).toBeDefined()

  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /Findings 1/ })).toBeDefined()

  await pane.press({ key: 'address-f1' })
  expect(sent.at(-1)).toContain('Please address this finding you recorded:\nIssue: Retry loop never backs off')
  await clock.settle()
  expect(await pane.find({ key: 'settled-f1' })).toBeDefined()
  expect(await pane.find({ text: /^Fix$/ })).toBeDefined()
  expect(await pane.find({ key: 'undo-f1' })).toBeDefined()
  expect(await band.find({ text: /Findings 1/ })).toBeUndefined()
  await clock.advance(9000)
  expect(await pane.find({ key: 'settled-f1' })).toBeUndefined()
  expect(await pane.find({ text: /1 closed/ })).toBeDefined()

  await $.turn.start({ text: sent.at(-1) ?? '', turnId: 't1' })
  await $.turn.complete({ answer: 'Added a backoff.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(await band.find({ text: /Findings 1/ })).toBeUndefined()
  await pane.press({ key: 'tab-findings' })
  await clock.settle()
  expect(await pane.find({ key: 'address-f1-key' })).toBeUndefined()
  expect(await pane.find({ text: /1 closed/ })).toBeDefined()

  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'opportunity',
    title: 'Cache the API token',
    detail: 'Each call fetches a new token.',
  })
  await clock.settle()
  expect(await pane.find({ text: /Cache the API token/ })).toBeDefined()
})

test('a question Claude records waits in the pane with its recommendation, a repeat is not added, one the person dismissed is not recorded again, and one they answered with List the choices can be asked again with choices', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  paneState = { isShown: true, isFocused: true }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: '' } as never)
  const pane = await $.ui.mount(PANE)
  const question = {
    tool: 'mcp__inbox__record',
    kind: 'question',
    ask: 'Which cache should the API use?',
    options: ['Redis', 'In-memory'],
    rec: 'Redis',
  } as const
  const r = await $.tool.call(question)
  expect(r.result).toBe('Recorded. The user sees it in the /inbox pane.')
  await clock.settle()
  expect(await pane.find({ text: /Which cache should the API use\?/ })).toBeDefined()
  expect((await $.tool.call({ ...question, ask: 'Which cache should the API use?' })).result).toBe(
    'Already open, so this record updated it.',
  )
  expect((await $.tool.call({ ...question, ask: 'Which cache should it use?', rec: 'Memcached' })).result).toBe(
    'Not recorded: rec must be one of the options.',
  )

  const task = await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'task',
    ask: 'Sign in to the registry',
    steps: ['npm login', 'Then tell me when it is done.'],
  })
  expect(task.result).toBe(
    'Recorded. The user sees it in the /inbox pane. Some steps were not a command, a file path or a link, so they are left out.',
  )

  await $.tool.call({ tool: 'mcp__inbox__close', id: 'i1', answer: 'Redis' })
  expect((await $.tool.call(question)).result).toBe(
    'Not recorded: the user answered it (Redis). Ask it again only if they bring it up.',
  )

  const placement = { tool: 'mcp__inbox__record', kind: 'question', ask: 'Where should the job run?' } as const
  await $.tool.call({ ...placement, options: ['List the choices'] })
  await $.tool.call({ tool: 'mcp__inbox__close', id: 'i3', answer: 'List the choices' })
  expect((await $.tool.call({ ...placement, options: ['Nightly', 'Hourly'], rec: 'Nightly' })).result).toBe(
    'Recorded. The user sees it in the /inbox pane.',
  )
})

test('/inbox opens on the tab that has rows when the tab it would show is empty', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  paneState = { isShown: false, isFocused: false }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'No lint script',
    detail: 'Only tests run.',
  })
  await clock.settle()
  paneState = { isShown: true, isFocused: true }
  await $.command.run({ command: 'inbox', args: '' } as never)
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ key: 'address-f1' })).toBeDefined()
})

test('findings that arrive one by one after the pane moves to them keep the first one open', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  paneState = { isShown: true, isFocused: true }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: '' } as never)
  const pane = await $.ui.mount(PANE)
  for (const title of ['Retry loop never backs off', 'Token cached forever', 'No lint script']) {
    await $.tool.call({
      tool: 'mcp__inbox__record',
      kind: 'finding',
      finding_kind: 'issue',
      title,
      detail: 'Found while reading.',
    })
    await clock.settle()
  }
  expect(await pane.find({ key: 'address-f1' })).toBeDefined()
  expect(await pane.find({ key: 'address-f3' })).toBeUndefined()
})

test('t opens a field for the person’s own words: a question’s words go to Claude, which closes it once they answer it, and a reply hands a finding to Claude', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
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
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'README is stale',
    detail: 'It names the old command.',
  })

  const pane = await $.ui.mount(PANE)
  expect(await replyField(pane, 'i1')).toBeUndefined()
  await pane.press({ key: 'typekey-i1' })
  await pane.input({ key: await replyKey(pane, 'i1'), text: ' ' })
  await clock.settle()
  expect(await replyField(pane, 'i1')).toBeDefined()
  await pane.press({ key: 'send-i1' })
  await clock.settle()
  expect(await replyField(pane, 'i1')).toBeDefined()
  await pane.input({ key: await replyKey(pane, 'i1'), text: 'Deno, actually', kind: 'change' })
  await pane.press({ key: 'cancel-i1' })
  expect(await replyField(pane, 'i1')).toBeUndefined()
  expect(sent).toEqual([])
  await pane.press({ key: 'select-i2' })
  await pane.press({ key: 'select-i1' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'typekey-i1' })
  expect((await replyField(pane, 'i1'))?.props.value).toBe('Deno, actually')
  await pane.press({ key: 'send-i1' })
  expect(sent.at(-1)).toBe('Re "Use Node or Python?": Deno, actually')
  expect((await pane.find({ key: 'row-i1' }))?.text).toMatch(/^✓Use Node or Python\?\s·\sReplied/)
  await $.tool.call({ tool: 'mcp__inbox__close', id: 'i1', answer: 'Deno' } as never)
  await clock.settle()
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()

  await pane.press({ key: 'tab-findings' })
  await pane.press({ key: 'typekey-f3' })
  await pane.input({ key: await replyKey(pane, 'f3'), text: 'Fix it after the CLI ships.' })
  expect(sent.at(-1)).toBe(
    'About this finding you recorded:\nIssue: README is stale\nIt names the old command.\n\nFix it after the CLI ships.',
  )
  await clock.settle()
  expect(await pane.find({ text: /Replied/ })).toBeDefined()
  await clock.advance(9000)
  expect(await pane.find({ text: /README is stale/ })).toBeDefined()
})

test('Escape in a reply field closes the field and keeps the pane and the draft', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('ui.focus', () => ({}))
  paneState = { isShown: true, isFocused: false }

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

  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'typekey-i1' })
  await pane.input({ key: await replyKey(pane, 'i1'), text: 'Deno, actually', kind: 'change' })
  await clock.settle()
  expect(paneOpens.at(-1)?.closeOnEscape).toBeUndefined()

  await pane.redraw({ ...PANE.props, isFocused: false })
  await clock.settle()
  expect(await replyField(pane, 'i1')).toBeUndefined()
  expect(await pane.find({ key: 'row-i1' })).toBeDefined()
  expect(paneOpens.at(-1)).toMatchObject({ id: 'inbox', closeOnEscape: true })
  expect(paneOpens.at(-1)?.focus).toBeUndefined()

  await pane.redraw({ ...PANE.props, isFocused: true })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'typekey-i1' })
  expect((await replyField(pane, 'i1'))?.props.value).toBe('Deno, actually')
  expect(sent).toEqual([])
})

test('a reply field that opens without the keys says to click it, until it has them', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  paneState = { isShown: true, isFocused: false }

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

  const pane = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: false } })
  await pane.press({ key: 'typekey-i1' })
  await clock.settle()
  expect(await replyField(pane, 'i1')).toBeDefined()
  expect(await pane.find({ text: 'Click the field to type' })).toBeDefined()

  await pane.redraw({ ...PANE.props, isFocused: true })
  await clock.settle()
  expect(await replyField(pane, 'i1')).toBeDefined()
  expect(await pane.find({ text: 'Click the field to type' })).toBeUndefined()
})

test('a press on a question Claude closed since the draw sends nothing and says so', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
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
  const close = (id: string) => () => $.tool.call({ tool: 'mcp__inbox__close', id, reason: 'settled in chat' } as never)
  const pane = await $.ui.mount(PANE)
  const stale = /^This changed before your press\. Nothing was sent\.$/

  beforeAct = close('i1')
  await pane.press({ key: 'answer-i1-0' })
  expect(sent).toEqual([])
  expect(await pane.find({ text: stale })).toBeDefined()
  await clock.advance(9000)
  expect(await pane.find({ text: stale })).toBeUndefined()
})

test('a question Claude closes while the person types an answer stays in place with its field and words, out of the count, until its answer sends and it folds into Closed', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
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
  const pane = await $.ui.mount(PANE)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  await pane.press({ key: 'select-i2' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'typekey-i2' })
  await pane.input({ key: await replyKey(pane, 'i2'), text: 'Call it hello', kind: 'change' })
  await $.tool.call({ tool: 'mcp__inbox__close', id: 'i2', reason: 'settled in chat' } as never)
  await clock.settle()
  await clock.advance(9000)

  expect(await replyField(pane, 'i2')).toBeDefined()
  expect((await pane.find({ key: 'row-i2' }))?.text).toMatch(/Closed\sby\sClaude:\ssettled\sin\schat/)
  expect(await pane.find({ key: 'discard-i2' })).toBeDefined()
  expect(await pane.find({ key: 'cancel-i2' })).toBeUndefined()
  expect(await band.find({ text: /Needs you 1/ })).toBeDefined()
  expect(await pane.find({ text: /closed/ })).toBeUndefined()

  await pane.press({ key: 'send-i2' })
  await clock.settle()
  expect(sent.at(-1)).toBe('Re "Name the command greet?": Call it hello')
  expect(await replyField(pane, 'i2')).toBeUndefined()
  expect(await pane.find({ key: 'settled-i2' })).toBeDefined()
  expect(await pane.find({ text: /^Replied$/ })).toBeDefined()
  await clock.advance(9000)
  expect(await pane.find({ key: 'row-i2' })).toBeUndefined()
  expect(await pane.find({ key: 'settled-i2' })).toBeUndefined()
  expect(await pane.find({ text: /1 closed/ })).toBeDefined()
})

test('a held row stays in place, and its reply still sends, after more items close than the Closed list keeps', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('ui.focus', () => ({}))
  const reply = async (text: string, turnId: string) => {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text, turnId })
    await $.turn.complete({ answer: 'Noted.', durationMs: 5, isAborted: false, turnId, reason: 'answer' })
    await clock.settle()
  }
  const tasks = [
    'Water the plants',
    'Feed the cat',
    'Rotate the signing key',
    'Approve the deploy',
    'Pin the Node version',
    'Update the README',
    'Tag the release',
    'Clear the build cache',
    'Rename the branch',
    'Archive old logs',
    'Book the venue',
    'Order more paper',
    'Renew the domain',
  ]
  const others = tasks.map((_, n) => `i${n + 3}`)

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
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'select-i2' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'typekey-i2' })
  await pane.input({ key: await replyKey(pane, 'i2'), text: 'Call it hello', kind: 'change' })
  await $.tool.call({
    tool: 'mcp__inbox__close',
    id: 'i2',
    reason: 'settled in chat, since the team already picked the name for the command in this morning’s standup',
  } as never)
  await clock.settle()
  ledgerReply = tasks.map(t => `NEW: do | - | ${t} | - | -`).join('\n')
  await reply('keep going', 't2')
  expect(await pane.find({ text: /Renew the domain/ })).toBeDefined()
  ledgerReply = others.map(id => `CLOSED: ${id} | done`).join('\n')
  await reply('all done', 't3')
  await clock.advance(9000)

  expect(await pane.find({ text: /Renew the domain/ })).toBeUndefined()
  expect(await replyField(pane, 'i2')).toBeDefined()
  expect((await pane.find({ key: 'row-i2' }))?.text).toMatch(/Closed\sby\sClaude:\ssettled\sin\schat/)
  expect((await pane.find({ key: 'row-i2' }))?.text).toContain('Claude: settled in chat, since the team')

  await pane.press({ key: 'send-i2' })
  await clock.settle()
  expect(sent.at(-1)).toBe('Re "Name the command greet?": Call it hello')
  expect(await pane.find({ key: 'settled-i2' })).toBeDefined()
})

test('Discard ends a held row’s reply and folds it into Closed at once, and a row the person dismisses with a draft settles with Undo instead of holding', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
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
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'typekey-i1' })
  await pane.input({ key: await replyKey(pane, 'i1'), text: 'Deno, actually', kind: 'change' })
  await pane.press({ key: 'cancel-i1' })
  await pane.press({ key: 'select-i2' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'typekey-i2' })
  await pane.input({ key: await replyKey(pane, 'i2'), text: 'Call it hello', kind: 'change' })
  await pane.press({ key: 'cancel-i2' })
  await $.tool.call({ tool: 'mcp__inbox__close', id: 'i2', reason: 'settled in chat' } as never)
  await clock.settle()
  await clock.advance(1000)

  expect(await replyField(pane, 'i2')).toBeUndefined()
  expect((await pane.find({ key: 'row-i2' }))?.text).toMatch(/Closed\sby\sClaude:\ssettled\sin\schat/)
  await pane.press({ key: 'discard-i2' })
  await clock.settle()
  expect(await pane.find({ key: 'row-i2' })).toBeUndefined()
  expect(await pane.find({ key: 'settled-i2' })).toBeUndefined()
  expect(await pane.find({ text: /settled\sin\schat/ })).toBeUndefined()
  expect(await pane.find({ text: /1 closed/ })).toBeDefined()
  expect(sent).toEqual([])

  await pane.press({ key: 'select-i1' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'dismiss-i1' })
  await clock.settle()
  expect(await pane.find({ key: 'undo-i1' })).toBeDefined()
  await clock.advance(9000)
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()
  expect(await pane.find({ key: 'settled-i1' })).toBeUndefined()
  expect(await pane.find({ text: /2 closed/ })).toBeDefined()
})

test('a press whose submit stays pending through a turn reads Queued instead of Not confirmed until the message runs', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('ui.focus', () => ({}))

  await $.session.start({ cwd: '/tmp/project', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Plan ready. 1. Node or Python? 2. Call it greet?',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  const pane = await $.ui.mount(PANE)

  submitAnswer = 'hold'
  inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.advance(QUEUED_AFTER_MS)
  expect(await pane.find({ text: /Not\s+confirmed/ })).toBeUndefined()
  expect(await pane.find({ text: /Queued:\sExplain$/ })).toBeDefined()

  await arrive($)
  await clock.settle()
  expect(await pane.find({ text: /Queued/ })).toBeUndefined()
  expect(await pane.find({ text: /Not\s+confirmed/ })).toBeUndefined()
})

test('a press during a turn reads Queued until its prompt enters, and one that will not enter is undone with Not sent and [Try again]', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)
  on('ui.focus', () => ({}))
  let drafts: unknown = null
  on('state.set', { plugin: 'inbox', key: 'drafts' } as const, ($, e, next) => {
    drafts = e.value
    return next(e)
  })

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
  const pane = await $.ui.mount(PANE)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })

  submitAnswer = 'hold'
  inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.settle()
  expect(await pane.find({ text: /Queued/ })).toBeUndefined()
  await clock.advance(QUEUED_AFTER_MS)
  expect(await pane.find({ text: /^Queued:\sExplain$/ })).toBeDefined()
  await pane.press({ key: 'select-i2' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'typekey-i2' })
  inFlight.push(pane.input({ key: await replyKey(pane, 'i2'), text: 'yes' }))
  await clock.settle()
  await clock.advance(QUEUED_AFTER_MS)
  expect(await pane.find({ text: /Queued:\sReply/ })).toBeDefined()
  await arrive($)
  await clock.settle()
  await pane.press({ key: 'select-i1' })
  expect(await pane.find({ text: /^Explaining…$/ })).toBeDefined()
  expect(await pane.find({ text: /Queued/ })).toBeUndefined()

  submitAnswer = { drop: 'a hook refused it' }
  await pane.press({ key: 'select-i1' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'typekey-i1' })
  await pane.input({ key: await replyKey(pane, 'i1'), text: 'Deno, actually' })
  await clock.settle()
  expect(sent.at(-1)).toBe('Re "Use Node or Python?": Deno, actually')
  expect(await pane.find({ key: 'row-i1' })).toBeDefined()
  expect(drafts).toEqual({ i1: { text: 'Deno, actually', since: expect.any(Number) } })
  await pane.press({ key: 'answer-i1-0' })
  await clock.settle()
  expect(sent.at(-1)).toBe('Re "Use Node or Python?": Node')
  expect(await pane.find({ key: 'row-i1' })).toBeDefined()
  expect(await pane.find({ text: 'Not sent: a hook refused it' })).toBeDefined()
  expect(await band.find({ text: /Needs you 1/ })).toBeDefined()
  expect((await pane.find({ key: 'answer-i1-0-key' }))?.props.label).toBe('Node (recommended)')

  submitAnswer = 'enter'
  const next = await $.prompt.submit({ text: 'carry on', wait: false, origin: { kind: 'composer' } })
  expect(next.context?.join('\n') ?? '').not.toMatch(/→ (Node|Deno)/)
  await $.turn.complete({ answer: 'Carrying on.', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect(prompts.at(-1)).toContain('carry on\n</person>')
  expect(prompts.at(-1)).not.toContain('Re "Use Node or Python?"')

  await pane.press({ key: 'retry-i1' })
  await clock.settle()
  expect(sent.at(-1)).toBe('Re "Use Node or Python?": Node')
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()
})

test('an older identical Claude prompt leaves the newer press unconfirmed until its prompt enters', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])

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
  const pane = await $.ui.mount(PANE)
  submitAnswer = 'hold'
  inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.advance(PRESS_GUARD_MS)
  inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.settle()
  expect(held).toHaveLength(2)
  expect(held[0]?.text).toBe(held[1]?.text)

  await arriveFirst($)
  await clock.settle()
  expect(await pane.find({ text: /Not\s+confirmed:\s+Explain/ })).toBeDefined()
  expect(await pane.find({ text: /✓\sExplained/ })).toBeUndefined()

  await arriveFirst($)
  await clock.settle()
  expect(await pane.find({ text: /Explaining…/ })).toBeDefined()
  expect(await pane.find({ text: /Not confirmed/ })).toBeUndefined()
})

test('a press resent after the app quit with its first delivery lost reads as delivered once Claude gets it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const explain =
    'Remind me what this question you asked me is about: why it came up, what each choice would do, and which you would pick. Keep it under 80 words of plain language, not counting a diagram: no jargon, and name each thing by what it does. Call each choice by its name as listed. When a small ASCII diagram would show it faster than words, such as steps in order or a before-and-after, put one in a code block in your reply. Don\'t act on it yet.\n"Use Node or Python?"\nOptions: Node / Python'
  stored.set(
    's:session-1',
    JSON.stringify({
      ...SAVED_SESSION,
      lastActions: {
        i1: {
          kind: 'talk',
          action: 'explain',
          text: 'Explain',
          at: 900_000,
          delivery: { state: 'unconfirmed', message: explain, id: 'lost' },
        },
      },
      sent: [
        {
          text: explain,
          press: { id: 'i1', action: 'explain' },
          at: 900_000,
          row: 'i1',
          pressedAt: 900_000,
          deliveryId: 'lost',
          phase: 'attempting',
        },
      ],
    }),
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Not\s+confirmed:\s+Explain/ })).toBeDefined()

  await pane.press({ key: 'explain-i1-key' })
  await clock.settle()
  expect(sent.at(-1)).toBe(explain)
  await clock.advance(QUEUED_AFTER_MS)
  expect(await pane.find({ text: /Explaining…/ })).toBeDefined()
  expect(await pane.find({ text: /Not confirmed|Queued/ })).toBeUndefined()
})

test('a refused newer Claude send replaces ambiguity with Not sent after the older prompt enters', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])

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
  const pane = await $.ui.mount(PANE)
  submitAnswer = 'hold'
  inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.advance(PRESS_GUARD_MS)
  submitAnswer = { drop: 'a hook refused it', beforeDrop: () => arriveFirst($) }
  await pane.press({ key: 'explain-i1-key' })
  await clock.settle()

  expect(await pane.find({ text: /Not\s+sent:\s+a hook refused it/ })).toBeDefined()
  expect(await pane.find({ text: /Not\s+confirmed/ })).toBeUndefined()
})

test('a uniquely rewritten Claude prompt is confirmed when its row enters before submit returns', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])

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
  const pane = await $.ui.mount(PANE)
  submitAnswer = { rewrite: 'Rewritten prompt' }
  await pane.press({ key: 'explain-i1-key' })
  await clock.settle()

  expect(await pane.find({ text: /Explaining…/ })).toBeDefined()
  expect(await pane.find({ text: /Not\s+confirmed/ })).toBeUndefined()
})

test('two Claude sends rewritten to the same text are each confirmed by their own row when they run in turn', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])

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
  const pane = await $.ui.mount(PANE)
  submitAnswer = { rewrite: 'Same rewritten prompt', hold: true }
  inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.advance(PRESS_GUARD_MS)
  submitAnswer = { rewrite: 'Same rewritten prompt', hold: true }
  inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.settle()

  await arriveFirst($)
  await clock.settle()
  expect(await pane.find({ text: /Not\s+confirmed/ })).toBeUndefined()
  await arrive($)
  await clock.settle()
  expect(await pane.find({ text: /Explaining…/ })).toBeDefined()
  expect(await pane.find({ text: /Not\s+confirmed/ })).toBeUndefined()
})

test('an older Claude send with no saved receipt cannot acknowledge a new identical press after reload', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let clearSent = false
  on('state.set', { plugin: 'inbox', key: 'session' } as const, ($, e, next) => {
    if (!clearSent) return next(e)
    clearSent = false
    return next({ ...e, value: { ...e.value, sent: [] } })
  })

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
  const pane = await $.ui.mount(PANE)
  submitAnswer = 'hold'
  inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.settle()
  clearSent = true
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.advance(PRESS_GUARD_MS)
  inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.settle()
  expect(held).toHaveLength(2)

  await arriveFirst($)
  await clock.settle()
  expect(await pane.find({ text: /Not\s+confirmed:\s+Explain/ })).toBeDefined()
  expect(await pane.find({ text: /✓\sExplained/ })).toBeUndefined()

  await arriveFirst($)
  await clock.settle()
  expect(await pane.find({ text: /Not\s+confirmed:\s+Explain/ })).toBeDefined()
})

test('Claude closes an item or finding that no longer applies, by the id it reads beside the prompt', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])

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
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'README is stale',
    detail: 'It names the old command.',
  })
  const told = await $.prompt.submit({ text: 'where are we?', wait: false, origin: { kind: 'composer' } })
  expect(told.context?.join('\n')).toContain('- (2) "Name the command greet?" (close id: i2)')
  expect(told.context?.join('\n')).toContain('- issue: README is stale (close id: f3)')

  const close = (input: Record<string, string>) => $.tool.call({ tool: 'mcp__inbox__close', ...input } as never)
  const pane = await $.ui.mount(PANE)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })

  await pane.press({ key: 'tab-findings' })
  await pane.press({ key: 'discuss-f3' })
  await clock.settle()
  expect(sent.at(-1)).toContain("Let's talk through this finding you recorded")
  expect(await pane.find({ text: /Discussing…/ })).toBeDefined()
  expect((await pane.find({ key: 'discuss-f3-key' }))?.props.label).toBe('Discuss')
  expect(await band.find({ text: /Findings 1/ })).toBeDefined()
  await pane.press({ key: 'tab-needsYou' })
  submitAnswer = 'hold'
  inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.settle()
  await clock.advance(QUEUED_AFTER_MS)
  expect(await pane.find({ text: /^Queued:\sExplain$/ })).toBeDefined()
  expect((await close({ id: 'i1', answer: 'Deno' })).result).toBe(
    'Closed. The user sees it in the /inbox pane with its outcome. Name it by what it says, never by its id.',
  )
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()
  expect(await pane.find({ key: 'settled-i1' })).toBeDefined()
  expect(await pane.find({ text: /^Deno$/ })).toBeDefined()
  expect((await close({ id: 'i2', reason: 'no longer applies' })).result).toBe(
    'Closed. The user sees it in the /inbox pane with its outcome. Name it by what it says, never by its id.',
  )
  expect((await close({ id: 'f3', reason: 'fixed' })).result).toBe(
    'Closed the finding. Name it by what it says, never by its id.',
  )
  expect((await close({ id: 'i9', reason: 'done' })).result).toContain(
    'Not closed: no open item or finding has the id i9.',
  )
  expect((await close({ id: 'i1', reason: 'again' })).result).toBe('Already closed: the user answered it (Deno).')
  expect((await close({ id: 'i2', answer: 'yes' })).result).toBe('Already closed: you closed it earlier.')
  expect((await close({ id: 'f3', reason: 'fixed again' })).result).toBe('Already closed: you closed it earlier.')

  await clock.advance(9000)
  expect(await pane.find({ key: 'settled-i1' })).toBeUndefined()
  expect(await pane.find({ text: /^Deno$/ })).toBeUndefined()
  await pane.press({ key: 'fold-question' })
  expect(await pane.find({ text: /^Deno$/ })).toBeDefined()
  expect(await pane.find({ text: /^Closed by Claude: no longer applies$/ })).toBeDefined()

  await pane.press({ key: 'tab-findings' })
  expect(await pane.find({ key: 'row-f3' })).toBeUndefined()
  expect(await pane.find({ text: 'No open issues' })).toBeDefined()
  expect(await pane.find({ text: 'No open opportunities' })).toBeDefined()
  expect((await pane.find({ key: 'fold-issue' }))?.props.label).toBe('▸ 1 closed')
  await pane.press({ key: 'fold-issue' })
  expect(await pane.find({ text: /^README is stale$/ })).toBeDefined()
  expect(await pane.find({ text: /^Closed by Claude: fixed$/ })).toBeDefined()
  await arrive($)
})

test('Dismiss settles a question in place with Undo, which brings it back open and selected, and a second close reaches Claude too', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const start = () => $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const prompt = async (text: string) =>
    (await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })).context?.join('\n') ?? ''
  const closedLine = '- "Use Node or Python?" → dismissed by the user.'

  await start()
  await prompt('add a greeting cli')
  await $.turn.complete({
    answer: 'Plan ready. 1. Node or Python? 2. Call it greet?',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  const pane = await $.ui.mount(PANE)

  await pane.press({ key: 'dismiss-i1' })
  expect(await pane.find({ key: 'settled-i1' })).toBeDefined()
  expect(await pane.find({ text: /^Dismissed$/ })).toBeDefined()
  expect(await pane.find({ key: 'explain-i2-key' })).toBeDefined()
  expect((await pane.find({ key: 'dismiss-i2' }))?.props.dimColor).toBe(true)
  expect(await prompt('carry on')).toContain(closedLine)
  await start()
  await clock.settle()
  expect(await pane.find({ key: 'settled-i1' })).toBeDefined()
  await pane.press({ key: 'select-i2' })
  await pane.press({ key: 'undo-i1' })
  expect(await pane.find({ key: 'settled-i1' })).toBeUndefined()
  expect(await pane.find({ key: 'answer-i1-0' })).toBeDefined()
  expect(await pane.find({ key: 'answer-i1-1' })).toBeDefined()
  await clock.advance(100)
  expect((await pane.find({ key: 'dismiss-i1' }))?.props.dimColor).toBe(true)
  await pane.press({ key: 'dismiss-i1' })
  expect(await pane.find({ key: 'settled-i1' })).toBeUndefined()
  await pane.press({ key: 'dismiss-i1-key' })
  expect(await pane.find({ key: 'settled-i1' })).toBeDefined()
  expect(await prompt('and now?')).toContain(closedLine)
  await pane.press({ key: 'undo-i1' })
  await clock.advance(500)
  expect((await pane.find({ key: 'dismiss-i1' }))?.props.dimColor).toBeUndefined()
  await pane.press({ key: 'dismiss-i1' })
  expect(await pane.find({ key: 'settled-i1' })).toBeDefined()
  await clock.advance(SETTLED_MS)
  expect(await pane.find({ key: 'settled-i1' })).toBeUndefined()
  expect((await pane.find({ key: 'fold-question' }))?.props.label).toBe('▸ 1 closed')
  expect(await pane.find({ key: 'explain-i2-key' })).toBeDefined()
})

test('once the person answers or closes the last waiting row, a row from a later reply opens', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const reply = async (text: string, turnId: string) => {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text, turnId })
    await $.turn.complete({ answer: 'Noted.', durationMs: 5, isAborted: false, turnId, reason: 'answer' })
    await clock.settle()
  }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  ledgerReply = 'NEW: decide | 1 | Use Node or Python? | Node / Python | Node'
  await reply('add a greeting cli', 't1')
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'answer-i1-0' })
  await clock.advance(SETTLED_MS)

  ledgerReply = 'CLOSED: i1 | Node chosen\nNEW: decide | 1 | Name the command greet? | Yes / No | Yes'
  await reply('use node', 't2')
  expect(await pane.find({ key: 'answer-i2-0' })).toBeDefined()

  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'dismiss-i2' })
  await clock.advance(SETTLED_MS)
  ledgerReply = 'NEW: do | - | Run npm install | - | -'
  await reply('carry on', 't3')
  expect(await pane.find({ key: 'done-i3' })).toBeDefined()
})

test('a PR linked in a reply shows in the PRs tab, a task naming it opens it, its buttons send its conflicts and thread and say so, and its failing check waits on the person', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  ledgerReply = 'NEW: do | - | Mark #12 ready for review | - | -'
  let hasReply = false
  let isResolved = false
  let onFetched: (() => void) | undefined
  let isFetching = false
  on('state.set', { plugin: 'inbox', key: 'session' } as const, async ($, e, next) => {
    const r = await next(e)
    const wasFetching = isFetching
    isFetching = e.value.prViews.isFetching
    if (wasFetching && !isFetching) onFetched?.()
    return r
  })
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
                      isResolved,
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
  theme = 'dark'

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
  expect((await pane.find({ key: 'help-i1-0-key' }))?.props.label).toBe('Open PR #12')
  let opened = () => {}
  ghAnswers.push({ match: argv => argv[0] === 'open', stdout: '', hold: () => new Promise(r => (opened = r)) })
  const pressing = pane.press({ key: 'help-i1-0' })
  await clock.settle()
  expect(ran.at(-1)).toEqual(['open', 'https://github.com/acme/greet/pull/12'])
  expect(await pane.find({ text: 'Opening PR #12…' })).toBeDefined()
  opened()
  await pressing
  await clock.settle()
  expect(await pane.find({ text: '✓ Opened PR #12' })).toBeDefined()
  ghAnswers.pop()

  await pane.press({ key: 'tab-prs' })
  await clock.settle()
  expect(await pane.find({ text: /Add a greeting CLI/ })).toBeDefined()
  for (const line of ['Blocked', /^\u2007·\sconflicts with main$/])
    expect(await pane.find({ text: line })).toBeDefined()
  expect(await pane.find({ key: 'merge-acme/greet#12' })).toBeUndefined()

  await pane.press({ key: 'resolve-acme/greet#12' })
  expect(sent.at(-1)).toContain('PR #12 (https://github.com/acme/greet/pull/12) conflicts with main.')
  await clock.settle()
  expect(await pane.find({ text: /✓ Asked to resolve conflicts\u2007·/ })).toBeDefined()
  expect((await pane.find({ key: 'resolve-acme/greet#12' }))?.props.label).toBe('Resolve conflicts again')

  const muted = (await pane.find({ type: 'Text', text: /conflicts with main$/ }))?.props.color
  expect(await pane.find({ text: '✓ Opened PR #12' })).toBeUndefined()
  await pane.press({ key: 'open-acme/greet#12' })
  await clock.settle()
  expect(await pane.find({ text: '✓ Opened PR #12' })).toBeDefined()
  ghAnswers.push({ match: argv => argv[0] === 'open', stdout: '', fails: 'no browser' })
  await pane.press({ key: 'open-acme/greet#12' })
  await clock.settle()
  const failed = (await pane.find({ type: 'Text', text: 'Could not open PR #12: no browser' }))?.props.color
  expect(failed).toBeDefined()
  expect(failed).not.toBe(muted)
  ghAnswers.pop()

  await pane.press({ key: 'next' })
  await clock.settle()
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'fix-acme/greet#12-test-key' })
  expect(sent.at(-1)).toContain('The test check failed on PR #12')
  await clock.settle()
  expect(await pane.find({ key: 'fix-acme/greet#12-test-key' })).toBeUndefined()
  await pane.press({ key: 'title-acme/greet#12 check test' })
  await clock.advance(PRESS_GUARD_MS)
  expect((await pane.find({ key: 'fix-acme/greet#12-test-key' }))?.props.label).toMatch(/Fix again$/)
  await pane.press({ key: 'log-acme/greet#12-test-key' })
  await clock.settle()
  expect(ran.at(-1)).toEqual(['open', 'https://github.com/acme/greet/actions/runs/7/job/1'])
  expect(await pane.find({ text: '✓ Opened the log' })).toBeDefined()

  await pane.press({ key: 'previous' })
  await pane.press({ key: 'discuss-T1-key' })
  expect(sent.at(-1)).toContain("Let's talk through this review comment on PR #12")
  await clock.settle()
  expect(await pane.find({ text: /Discussing…/ })).toBeDefined()
  expect((await pane.find({ key: 'discuss-T1' }))?.props.label).toMatch(/\bDiscuss$/)
  submitAnswer = { drop: 'a hook refused it' }
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'address-T1' })
  expect(sent.at(-1)).toContain('Address this review comment on PR #12')
  expect(sent.at(-1)).toContain('bin/greet:4, from @sam:\n> Quote the name.')
  await clock.settle()
  expect(await pane.find({ text: 'Not sent: a hook refused it' })).toBeDefined()
  expect((await pane.find({ key: 'address-T1-key' }))?.props.label).toBe('Address')
  submitAnswer = 'hold'
  inFlight.push(pane.press({ key: 'retry-T1' }))
  await clock.settle()
  await clock.advance(QUEUED_AFTER_MS)
  expect(await pane.find({ text: /^\u2007·\sQueued:\sAddress$/ })).toBeDefined()
  expect(await pane.find({ key: 'address-T1-key' })).toBeUndefined()
  await pane.press({ key: 'title-acme/greet#12 thread T1' })
  await clock.advance(PRESS_GUARD_MS)
  inFlight.push(pane.press({ key: 'address-T1-key' }))
  await clock.settle()
  await arriveFirst($)
  await clock.settle()
  expect(await pane.find({ text: /Not\s+confirmed:\s+Address/ })).toBeDefined()
  expect((await pane.find({ key: 'address-T1-key' }))?.props.label).toBe('Address again')
  expect((await pane.find({ key: 'select-acme/greet#12 thread T1' }))?.props.label).toBe('◦')
  expect(await pane.find({ text: /✓\sAddress/ })).toBeUndefined()
  await arrive($)
  await clock.settle()
  expect(await pane.find({ text: /^\u2007·\sAddressed$/ })).toBeDefined()

  expect(await pane.find({ key: 'address-T1-key' })).toBeDefined()
  await clock.advance(PRESS_GUARD_MS)
  expect((await pane.find({ key: 'address-T1-key' }))?.props.label).toBe('Address again')
  await pane.press({ key: 'open-T1' })
  await clock.settle()
  expect(ran.at(-1)).toEqual(['open', 'https://github.com/acme/greet/pull/12#r1'])
  expect(await pane.find({ text: '✓ Opened the comment' })).toBeDefined()
  expect(await pane.find({ text: /^ 1$/ })).toBeDefined()
  hasReply = true
  await pane.press({ key: 'tab-findings' })
  await pane.press({ key: 'tab-prs' })
  await clock.settle()
  expect(await pane.find({ text: /Still unquoted/ })).toBeDefined()

  const sends = sent.length
  beforeAct = async () => {
    isResolved = true
    const fetched = new Promise<void>(resolve => (onFetched = resolve))
    await $.command.run({ command: 'inbox', args: '' } as never)
    await fetched
  }
  await pane.press({ key: 'address-T1-key' })
  expect(sent.length).toBe(sends)
  expect(await pane.find({ text: /^This changed before your press\. Nothing was sent\.$/ })).toBeDefined()
})

test('opening the PRs tab while another PR fetch runs still finds the branch’s PR', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
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

test('the PRs tab shows a linked PR only when the viewer wrote it and a fetch found it open, and keeps it once it merges, while a task naming a teammate’s PR keeps its Open PR step', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  ledgerReply = 'NEW: do | - | Review #20 | - | -'
  const states: Record<string, string> = { '12': 'OPEN', '20': 'OPEN', '9': 'MERGED' }
  const titles: Record<string, string> = { '12': 'Mine open', '20': 'Teammate open', '9': 'Mine merged' }
  const authors: Record<string, string> = { '12': 'me', '20': 'sam', '9': 'me' }
  for (const number of Object.keys(states))
    ghAnswers.push(
      {
        match: argv => argv.includes('view') && argv.includes(number),
        get stdout() {
          return JSON.stringify({
            number: Number(number),
            title: titles[number],
            url: `https://github.com/acme/greet/pull/${number}`,
            isDraft: false,
            state: states[number],
            baseRefName: 'main',
            mergeable: 'MERGEABLE',
            reviewDecision: 'APPROVED',
            statusCheckRollup: [],
          })
        },
      },
      {
        match: argv => argv.includes('graphql') && argv.includes(`number=${number}`),
        stdout: JSON.stringify({
          data: {
            viewer: { login: 'me' },
            repository: { pullRequest: { author: { login: authors[number] }, reviewThreads: { nodes: [] } } },
          },
        }),
      },
    )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'what changed?', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer:
      'Opened https://github.com/acme/greet/pull/12. Sam has https://github.com/acme/greet/pull/20 open, and https://github.com/acme/greet/pull/9 merged last week.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  expect((await pane.find({ key: 'help-i1-0-key' }))?.props.label).toBe('Open PR #20')
  await pane.press({ key: 'tab-prs' })
  await clock.settle()

  expect(await pane.find({ text: /Mine open/ })).toBeDefined()
  expect(await pane.find({ text: /Teammate open/ })).toBeUndefined()
  expect(await pane.find({ text: /Mine merged/ })).toBeUndefined()

  states['12'] = 'MERGED'
  await pane.press({ key: 'tab-needsYou' })
  await pane.press({ key: 'tab-prs' })
  await clock.settle()

  expect(await pane.find({ text: /Mine open/ })).toBeDefined()
  expect(await pane.find({ text: /Merged/ })).toBeDefined()
  await pane.press({ key: 'tab-needsYou' })
  expect((await pane.find({ key: 'help-i1-0-key' }))?.props.label).toBe('Open PR #20')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the ${surface} PRs tab says gh is missing until gh starts again`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    const notice = /could not find gh/
    isGhMissing = true

    await $.session.start({ cwd: '/tmp/project', surface, isInteractive: true })
    const pane = await $.ui.mount({ ...PANE, surface })
    const show = async (id: string) => {
      if (surface === 'terminal') return pane.press({ key: `tab-${id}` })
      const { tabs, gap } = (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
      const x = tabs
        .slice(
          0,
          tabs.findIndex(t => t.id === id),
        )
        .reduce((sum, t) => sum + t.width + gap, 0)

      return pane.pointer({ type: 'down', x, y: 1, button: 'left', in: 'tabs' })
    }
    await show('prs')
    await clock.settle()
    expect(await pane.find({ text: notice })).toBeDefined()

    isGhMissing = false
    await show('needsYou')
    await clock.settle()
    await show('prs')
    await clock.settle()
    expect(await pane.find({ text: /No PRs/ })).toBeDefined()
    expect(await pane.find({ text: notice })).toBeUndefined()
  })
}

test('a PR’s Dismiss settles its block with Undo, which brings it back, a ready PR’s Merge asks Claude unless it stopped being ready, and a fetch keeps a Dismiss made while it ran, and the branch PR when its lookup fails', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let decision = 'APPROVED'
  const view = (number: number, title: string) =>
    JSON.stringify({
      number,
      title,
      url: `https://github.com/acme/greet/pull/${number}`,
      isDraft: false,
      state: 'OPEN',
      baseRefName: 'main',
      mergeable: 'MERGEABLE',
      reviewDecision: decision,
      statusCheckRollup: [],
    })
  const noThreads = JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } })
  let onFetched: (() => void) | undefined
  let isFetching = false
  on('state.set', { plugin: 'inbox', key: 'session' } as const, async ($, e, next) => {
    const r = await next(e)
    const wasFetching = isFetching
    isFetching = e.value.prViews.isFetching
    if (wasFetching && !isFetching) onFetched?.()
    return r
  })
  let isSlow = false
  let branchFails: string | undefined
  let branchHold = false
  let releaseBranch = () => {}
  ghAnswers.push(
    {
      match: argv => argv.includes('view') && argv.includes('12'),
      get stdout() {
        return view(12, 'Linked work')
      },
      hold: () => (isSlow ? clock.sleep(5000) : Promise.resolve()),
    },
    {
      match: argv => argv.includes('view') && !argv.includes('12'),
      stdout: view(13, 'Branch work'),
      get fails() {
        return branchFails
      },
      hold: () => (branchHold ? new Promise<void>(r => (releaseBranch = r)) : Promise.resolve()),
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
  const linked = () => (JSON.parse(stored.get('s:session-1') ?? '{}') as { ledger?: { prs: string[] } }).ledger?.prs

  await pane.press({ key: 'dismiss-pr-acme/greet#12' })
  expect(await pane.find({ key: 'settled-pr:acme/greet#12' })).toBeDefined()
  expect(await pane.find({ key: 'open-acme/greet#12' })).toBeUndefined()
  expect(linked()).toEqual([])
  await pane.press({ key: 'undo-pr:acme/greet#12' })
  expect(await pane.find({ key: 'settled-pr:acme/greet#12' })).toBeUndefined()
  expect(await pane.find({ key: 'open-acme/greet#12' })).toBeDefined()
  expect(linked()).toEqual(['acme/greet#12'])
  await clock.advance(3000)

  expect(await pane.find({ key: 'merge-acme/greet#12' })).toBeDefined()
  await pane.press({ key: 'merge-acme/greet#12' })
  expect(sent.at(-1)).toContain('Merge PR #12 (https://github.com/acme/greet/pull/12) into main.')
  await clock.settle()
  expect(await pane.find({ text: /✓ Asked to merge\u2007·/ })).toBeDefined()
  expect((await pane.find({ key: 'merge-acme/greet#12' }))?.props.label).toBe('Merge again')
  const merges = sent.length
  await clock.advance(PRESS_GUARD_MS)
  beforeAct = async () => {
    decision = 'CHANGES_REQUESTED'
    const fetched = new Promise<void>(resolve => (onFetched = resolve))
    await $.command.run({ command: 'inbox', args: '' } as never)
    await fetched
  }
  await pane.press({ key: 'merge-acme/greet#12' })
  expect(sent.length).toBe(merges)
  expect(await pane.find({ text: /^This changed before your press\. Nothing was sent\.$/ })).toBeDefined()
  decision = 'APPROVED'

  branchFails = 'HTTP 502'
  isSlow = true
  await pane.press({ key: 'tab-needsYou' })
  await pane.press({ key: 'tab-prs' })
  await pane.press({ key: 'dismiss-pr-acme/greet#12' })
  isSlow = false
  await clock.advance(2500)
  expect(await pane.find({ key: 'settled-pr:acme/greet#12' })).toBeDefined()
  await clock.advance(2600)
  expect(await pane.find({ key: 'settled-pr:acme/greet#12' })).toBeDefined()
  await clock.advance(SETTLED_MS)

  expect(await pane.find({ text: /Linked work/ })).toBeUndefined()
  expect(await pane.find({ text: /Branch work/ })).toBeDefined()

  expect(await pane.find({ text: 'Last refresh failed: HTTP 502' })).toBeDefined()
  expect((await pane.find({ key: 'refresh-acme/greet#13' }))?.props.label).toBe('Refresh PRs')
  branchFails = undefined
  branchHold = true
  const lookups = () => ran.filter(argv => argv[0] === 'gh' && argv.includes('view')).length
  const before = lookups()
  const refreshing = pane.press({ key: 'refresh-acme/greet#13' })
  await clock.settle()
  expect(await pane.find({ text: 'Last refresh failed: HTTP 502' })).toBeDefined()
  expect(await pane.find({ text: 'Refreshing PRs…' })).toBeDefined()
  expect(await pane.find({ key: 'refresh-acme/greet#13' })).toBeDefined()
  branchHold = false
  releaseBranch()
  await refreshing
  await clock.settle()
  expect(lookups()).toBe(before + 1)
  expect(await pane.find({ text: '✓ Refreshed PRs' })).toBeDefined()
  expect(await pane.find({ text: /Last refresh failed/ })).toBeUndefined()
  expect(await pane.find({ key: 'refresh-acme/greet#13' })).toBeUndefined()
  expect(await pane.find({ text: /Branch work/ })).toBeDefined()
})

test('tool calls during a turn leave the saved session alone, and the turn’s update saves it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let saves = 0
  storeSetHold = async key => {
    if (key === 's:session-1') saves++
  }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'add a greeting cli', turnId: 't1' })
  await clock.settle()
  const savesAtStart = saves
  for (const command of ['ls', 'cat package.json', 'npm test'])
    await $.tool.call({ tool: 'Bash', command, description: command } as never)
  await clock.settle()
  expect(saves).toBe(savesAtStart)

  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(saves).toBeGreaterThan(savesAtStart)
  expect(JSON.parse(stored.get('s:session-1')!).presence.turnsApplied).toBe(1)
})

const PUSH = { command: 'git push', description: 'Push main to origin' }
const PUSH_ROW = 'Allow push main to origin?'

function permissionCalls($: Engine) {
  let id = 0
  const fresh = () => `use-${++id}`
  return {
    fresh,
    ask(use: string | null) {
      toolVerdict = 'ask'
      return $.tool.check({ tool: 'Bash', input: PUSH, ...(use === null ? {} : { tool_use_id: use }) } as never)
    },
    run(use: string) {
      toolVerdict = 'allow'
      return $.tool.call({ tool: 'Bash', ...PUSH, tool_use_id: use } as never)
    },
    toolRow(use: string, isRunning: boolean) {
      return $.ui.mount({
        plugin: 'inbox',
        surface: 'terminal',
        component: 'ToolUse',
        props: { tool_use_id: use, tool: 'Bash', input: PUSH, isRunning, isErrored: false, isInterrupted: false },
      } as never)
    },
    groupRow(calls: { use: string; isRunning: boolean }[]) {
      return $.ui.mount({
        plugin: 'inbox',
        surface: 'terminal',
        component: 'ToolGroup',
        props: {
          isActive: true,
          isExpanded: false,
          calls: calls.map(c => ({
            tool_use_id: c.use,
            tool: 'Bash',
            input: PUSH,
            isRunning: c.isRunning,
            isErrored: false,
            isInterrupted: false,
          })),
        },
      } as never)
    },
  }
}

test('where classic.PermissionRequest is skipped, an ask shows its row only if the call is still waiting after the delay', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], { HERDR_PANE_ID: 'p1' })
  const calls = permissionCalls($)

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await calls.ask('u1')
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS - 1)
  expect(sidebarLines().at(-1)).toBe('')
  await clock.advance(1)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe(PUSH_ROW)
  await calls.run('u1')
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('')

  const lines = sidebarLines().length
  await calls.ask('u2')
  await clock.advance(500)
  await calls.run('u2')
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS)
  await clock.settle()
  expect(sidebarLines().slice(lines)).toEqual([])

  await calls.ask('u3')
  await clock.advance(2000)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe(PUSH_ROW)
  await calls.run('u3')
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('')
})

test('a query without a tool_use_id never arms the permission row', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], { HERDR_PANE_ID: 'p1' })
  const calls = permissionCalls($)

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const lines = sidebarLines().length
  await calls.ask(null)
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS * 2)
  await clock.settle()
  expect(sidebarLines().slice(lines)).toEqual([])
})

test('once classic.PermissionRequest has run, an ask draws no row of its own', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], { HERDR_PANE_ID: 'p1' })
  const calls = permissionCalls($)

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: PUSH } as never)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe(PUSH_ROW)
  await calls.run('u0')
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('')

  const lines = sidebarLines().length
  await calls.ask('u1')
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS * 2)
  await clock.settle()
  expect(sidebarLines().slice(lines)).toEqual([])
})

test('a tool row or group that reports the call running ends the wait and clears the row; one that does not leaves it alone', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], { HERDR_PANE_ID: 'p1' })
  const calls = permissionCalls($)

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await calls.ask('u1')
  await calls.toolRow('u1', false)
  await calls.groupRow([{ use: 'u1', isRunning: false }])
  await calls.toolRow('other', true)
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS + 1)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe(PUSH_ROW)
  await calls.toolRow('u1', false)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe(PUSH_ROW)
  await calls.toolRow('u1', true)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('')

  const lines = sidebarLines().length
  await calls.ask('u2')
  await clock.advance(500)
  await calls.toolRow('u2', true)
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS * 4)
  await clock.settle()
  expect(sidebarLines().slice(lines)).toEqual([])

  await calls.ask('u3')
  await clock.advance(500)
  await calls.groupRow([
    { use: 'x', isRunning: false },
    { use: 'u3', isRunning: true },
  ])
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS * 4)
  await clock.settle()
  expect(sidebarLines().slice(lines)).toEqual([])

  await calls.ask('u4')
  await clock.advance(PERMISSION_FALLBACK_DELAY_MS + 1)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe(PUSH_ROW)
  await calls.groupRow([{ use: 'u4', isRunning: true }])
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('')
})

test('a stop and an open permission prompt lead the sidebar line until they clear', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], { HERDR_PANE_ID: 'p1' })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.classic.PermissionRequest({
    tool_name: 'Bash',
    tool_input: { command: 'git push', description: 'Push main to origin' },
  } as never)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('Allow push main to origin?')
  await $.tool.call({ tool: 'Bash', command: 'git push', description: 'Push main to origin' } as never)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('')

  await $.classic.StopFailure({ error: 'authentication_failed' } as never)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('! Signed out: /login')
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /Run \/login, then send a message to resume\./ })).toBeDefined()
  expect(await band.find({ key: 'open-inbox' })).toBeDefined()
  expect(await band.find({ text: 'Nothing needed' })).toBeDefined()
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ key: 'resume' })).toBeUndefined()
  expect(await band.find({ key: 'resume' })).toBeUndefined()
  await $.turn.start({ text: 'logged in, go on', turnId: 't2' })
  await clock.settle()
  expect(await band.find({ text: /Stopped/ })).toBeUndefined()
  expect(sidebarLines().at(-1)).toBe('')

  await $.classic.StopFailure({ error: 'server_error' } as never)
  await clock.settle()
  expect(await pane.find({ text: /API error \(server_error\)\./ })).toBeDefined()
  expect(await band.find({ key: 'resume' })).toBeDefined()
  await pane.press({ key: 'resume' })
  await clock.settle()
  expect(sent.at(-1)).toBe('Continue')
  expect((await band.find({ key: 'resume' }))?.props.label).toBe('Resuming…')
  expect((await pane.find({ key: 'resume' }))?.props.label).toBe('Resuming…')
  await band.press({ key: 'resume' })
  await pane.press({ key: 'resume' })
  await clock.settle()
  expect(sent.filter(text => text === 'Continue')).toHaveLength(1)
  await $.turn.start({ text: 'Continue', turnId: 't3' })
  await clock.settle()
  expect(await pane.find({ text: /Stopped/ })).toBeUndefined()
})

test('a delayed Resume refusal belongs only to the stop and conversation that sent it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })

  const holdResume = async (reason: string) => {
    let entered!: () => void
    let release!: () => void
    const inSubmit = new Promise<void>(resolve => (entered = resolve))
    const held = new Promise<void>(resolve => (release = resolve))
    submitAnswer = {
      drop: reason,
      beforeDrop: async () => {
        entered()
        await held
      },
    }
    await band.press({ key: 'resume' })
    await inSubmit
    return release
  }

  await $.classic.StopFailure({ error: 'server_error' } as never)
  const releaseFirst = await holdResume('first refusal')
  await $.classic.StopFailure({ error: 'server_error' } as never)
  releaseFirst()
  await clock.settle()
  expect(await band.find({ text: /first refusal/ })).toBeUndefined()

  const releaseSecond = await holdResume('old session refusal')
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  await $.classic.StopFailure({ error: 'server_error' } as never)
  releaseSecond()
  await clock.settle()
  expect(await band.find({ text: /old session refusal/ })).toBeUndefined()
  expect(await band.find({ key: 'resume' })).toBeDefined()
})

test('a reply a step ends on before another step starts reaches the per-turn call, and the last answer is not counted twice', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)
  stepAnswers = [
    { answer: 'Fixed the parser. Should I also rename the helper?' },
    { answer: 'Linted. The parser is fixed.' },
  ]

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'fix the parser', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'fix the parser', turnId: 't1' })
  await runStep($, 0)
  await runStep($, 1)
  await $.turn.complete({
    answer: 'Linted. The parser is fixed.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  expect(prompts.at(-1)).toContain('Should I also rename the helper?')
  expect(prompts.at(-1)?.match(/Linted\. The parser is fixed\./g)).toHaveLength(1)
})

test('narration before a tool call is not a reply sent back', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)
  stepAnswers = [{ answer: 'Let me run the tests first.', callsTool: true }, { answer: 'All tests pass.' }]

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'fix the parser', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'fix the parser', turnId: 't1' })
  await runStep($, 0)
  await runStep($, 1)
  await $.turn.complete({
    answer: 'All tests pass.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  expect(prompts.at(-1)).not.toContain('Let me run the tests first.')
})

test('a turn an API error ended shows its stop from the error text in the transcript, and a StopFailure hook that ran keeps its own', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  const said = (text: string) => [{ role: 'assistant' as const, text, toolUses: [] as never[] }]
  const fail = (turnId: string) =>
    $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId, reason: 'error' })

  transcriptRows = said("You've hit your limit · resets 7:33pm (America/Los_Angeles)")
  await $.turn.start({ text: 'go', turnId: 't1' })
  await fail('t1')
  await clock.settle()
  expect(await band.find({ text: /Resume after 7:33pm\./ })).toBeDefined()

  transcriptRows = said('Please run /login · API Error: 401 Invalid API key')
  await $.turn.start({ text: 'go', turnId: 't2' })
  await fail('t2')
  await clock.settle()
  expect(await band.find({ text: /Run \/login, then send a message to resume\./ })).toBeDefined()

  transcriptRows = said('There was an issue with the selected model.')
  await $.turn.start({ text: 'go', turnId: 't3' })
  await fail('t3')
  await clock.settle()
  expect(await band.find({ key: 'resume' })).toBeDefined()

  transcriptRows = said('API Error: Server is temporarily limiting requests (not your usage limit)')
  await $.turn.start({ text: 'go', turnId: 't3b' })
  await fail('t3b')
  await clock.settle()
  expect(await band.find({ text: /the API is limiting requests/ })).toBeDefined()

  transcriptRows = said('Please run /login · API Error: 401 Invalid API key')
  await $.turn.start({ text: 'go', turnId: 't4' })
  await $.classic.StopFailure({ error: 'server_error' } as never)
  await fail('t4')
  await clock.settle()
  expect(await band.find({ text: /API error \(server_error\)/ })).toBeDefined()
})

test('/inbox demo shows sample entries in every tab, presses change only its copy, and [Hide demo] goes back', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const demo = demoView(1_000_000, 'Claude')
  const literal = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const branchRef = demo.prViews.branchRef!
  const linkedRef = demo.ledger.prs.find(ref => ref !== branchRef)!
  const [repo, linkedNumber] = linkedRef.split('#') as [string, string]
  const view = (number: number, title: string) =>
    JSON.stringify({
      number,
      title,
      url: `https://github.com/${repo}/pull/${number}`,
      isDraft: false,
      state: 'OPEN',
      baseRefName: 'main',
      mergeable: 'MERGEABLE',
      reviewDecision: 'APPROVED',
      statusCheckRollup: [],
    })
  ghAnswers.push(
    {
      match: argv => argv.includes('view') && argv.includes(linkedNumber),
      stdout: view(Number(linkedNumber), 'Real linked work'),
    },
    { match: argv => argv.includes('view') && !argv.includes(linkedNumber), stdout: view(40, 'Real branch work') },
    {
      match: argv => argv.includes('graphql'),
      stdout: JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } }),
    },
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: `Plan ready. Opened https://github.com/${repo}/pull/${linkedNumber}.`,
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  const saved = stored.get('s:session-1')
  expect(saved).toContain('Use Node or Python?')
  expect(saved).toContain(linkedRef)
  const ranBeforeDemo = ran.length

  expect((await $.command.run({ command: 'inbox', args: 'demo' } as never)).text).toContain('Showing sample entries')
  const pane = await $.ui.mount(PANE)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await pane.find({ text: 'Sample entries. Buttons here send nothing.' })).toBeDefined()
  expect(await pane.find({ text: /Use Node or Python/ })).toBeUndefined()
  expect(await band.find({ text: /^Demo: Needs you 7/ })).toBeDefined()
  for (const view of [pane, band]) expect(await view.find({ key: 'hide-demo' })).toBeDefined()

  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'answer-d11-0' })
  await clock.settle()
  expect(sent).toEqual([])
  expect(await pane.find({ key: 'answer-d11-0' })).toBeUndefined()
  expect(await pane.find({ text: demo.ledger.items.find(i => i.id === 'd11')!.options[0] })).toBeDefined()

  await pane.press({ key: 'title-d17' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'explain-d17-key' })
  await clock.advance(SETTLED_MS)
  expect(await pane.find({ text: /✓\sExplain/ })).toBeDefined()

  await pane.press({ key: 'typekey-d17' })
  await pane.input({ key: await replyKey(pane, 'd17'), text: 'Done in both.' })
  await clock.settle()
  expect(await band.find({ text: /Needs you 6/ })).toBeDefined()

  await pane.press({ key: 'title-d14' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'done-d14' })
  await clock.settle()
  expect(await pane.find({ key: 'done-d14' })).toBeUndefined()
  expect(await pane.find({ key: 'settled-d14' })).toBeDefined()
  const doneTask = literal(demo.ledger.items.find(i => i.id === 'd14')!.ask)
  expect(await pane.find({ text: doneTask })).toBeDefined()
  expect(await band.find({ text: /Needs you 5/ })).toBeDefined()
  await pane.press({ key: 'undo-d14' })
  expect(await pane.find({ key: 'done-d14' })).toBeDefined()
  expect(await band.find({ text: /Needs you 6/ })).toBeDefined()
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'done-d14' })
  await clock.advance(SETTLED_MS)
  expect(await pane.find({ text: doneTask })).toBeUndefined()
  expect(sent).toEqual([])

  await pane.press({ key: 'tab-findings' })
  expect(await pane.find({ text: literal(demo.ledger.findings[0]!.title) })).toBeDefined()
  await pane.press({ key: 'tab-prs' })
  expect(await pane.find({ text: literal(demo.prViews.views[branchRef]!.title) })).toBeDefined()
  await pane.press({ key: `open-${branchRef}` })
  expect(await pane.find({ text: /✓ Opened/ })).toBeDefined()
  await pane.press({ key: `dismiss-pr-${linkedRef}` })
  expect(await pane.find({ key: `settled-pr:${linkedRef}` })).toBeDefined()
  await clock.advance(SETTLED_MS)
  expect(await pane.find({ text: literal(demo.prViews.views[linkedRef]!.title) })).toBeUndefined()
  expect(stored.get('s:session-1')).toBe(saved)
  expect(ran.slice(ranBeforeDemo).filter(argv => argv[0] === 'gh' || argv[0] === 'open')).toEqual([])

  await pane.press({ key: 'hide-demo' })
  await clock.settle()
  expect(await pane.find({ text: /Real linked work/ })).toBeDefined()
  expect(await pane.find({ text: /Real branch work/ })).toBeDefined()

  await pane.press({ key: 'tab-needsYou' })
  expect(await pane.find({ text: /Use Node or Python/ })).toBeDefined()
  expect(await pane.find({ key: 'explain-i1-key' })).toBeDefined()
  expect(await pane.find({ text: /Sample entries\./ })).toBeUndefined()
  expect(await band.find({ text: /Needs you 2/ })).toBeDefined()
  const savedAfter = stored.get('s:session-1')!
  expect(savedAfter).toContain('Real branch work')
  expect(savedAfter).not.toContain(demo.ledger.items[0]!.ask)
})

test('/inbox demo recording shows the sample entries without the notices that mark them as samples', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const demo = demoView(1_000_000, 'Claude')
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })

  expect((await $.command.run({ command: 'inbox', args: 'demo recording' } as never)).text).toContain('for a recording')
  const pane = await $.ui.mount(PANE)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await pane.find({ text: demo.ledger.items.find(i => i.id === 'd11')!.options[0] })).toBeDefined()
  expect(await pane.find({ text: /Sample entries\./ })).toBeUndefined()
  expect(await band.find({ text: /^Needs you 7/ })).toBeDefined()
  for (const view of [pane, band]) expect(await view.find({ key: 'hide-demo' })).toBeUndefined()

  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'answer-d11-0' })
  await clock.settle()
  expect(sent).toEqual([])
  expect(await pane.find({ key: 'answer-d11-0' })).toBeUndefined()

  expect((await $.command.run({ command: 'inbox', args: 'demo' } as never)).text).toBe('Opened the inbox.')
  expect((await $.command.run({ command: 'inbox', args: 'demo' } as never)).text).toContain('Run /inbox demo again')
  expect(await pane.find({ text: /Sample entries\./ })).toBeDefined()
  expect(await band.find({ text: /^Demo: Needs you 7/ })).toBeDefined()
})

test('/clear and /resume switch the inbox to the other conversation, and each keeps its saved items', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const turn = async (text: string) => {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: text, reason: 'answer' })
    await clock.settle()
  }

  stored.set('p:/tmp/project', JSON.stringify(SAVED_SESSION))
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await turn('add a greeting cli')
  expect(stored.has('p:/tmp/project')).toBe(false)
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'answer-i1-0' })
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  ledgerReply = 'NEW: decide | 1 | Pin the Node version? | Yes / No | Yes'
  await turn('fix the build')
  expect(await pane.find({ text: /Pin the Node version\?/ })).toBeDefined()
  expect(await pane.find({ text: /✓/ })).toBeUndefined()
  expect((await pane.find({ key: 'answer-i1-0' }))?.props.label).not.toMatch(/again/)
  await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
  await $.classic.SessionStart({ source: 'resume', session_id: 'session-1' })
  await clock.settle()

  expect(await pane.find({ text: /Name the command greet\?/ })).toBeDefined()
  expect(await pane.find({ text: /Pin the Node version\?/ })).toBeUndefined()

  await $.session.end({ reason: 'resume', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'resume', session_id: 'session-2' })
  await clock.settle()
  expect(await pane.find({ text: /Pin the Node version\?/ })).toBeDefined()
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeUndefined()
})

test('where classic.SessionStart is skipped, the first prompt after /clear, /resume and /branch loads that conversation and carries its open questions', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const turn = async (text: string, reply: string, headline: string) => {
    ledgerReply = reply
    overviewReply = `HEADLINE: ${headline}\nSTATUS: Waiting on an answer.`
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: text, reason: 'answer' })
    await clock.settle()
  }
  const contextOf = async (id: string, reason: 'clear' | 'resume', text: string) => {
    await $.session.end({ reason, sessionId, resume: { id: sessionId } })
    sessionId = id
    const prompt = await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    return (prompt.context ?? []).join('\n')
  }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await turn('add caching', 'NEW: decide | 1 | Pick a cache? | Redis / Memory | Memory', 'Adding caching')

  const cleared = await contextOf('session-2', 'clear', 'start over')
  expect(cleared).not.toContain('Pick a cache?')
  expect(cleared).not.toContain('Adding caching')

  await turn('fix the build', 'NEW: decide | 1 | Pin Node? | Yes / No | Yes', 'Fixing the build')
  const branched = await contextOf('session-3', 'resume', 'try another way')
  expect(branched).toContain('Pin Node?')
  expect(branched).toContain('Working on: Fixing the build')
  expect(branched).toContain('Status: Waiting on an answer.')

  const resumed = await contextOf('session-1', 'resume', 'where were we?')
  expect(resumed).toContain('Pick a cache?')
  expect(resumed).toContain('Working on: Adding caching')
  expect(resumed).not.toContain('Fixing the build')
  expect(resumed).not.toContain('Pin Node?')
  const again = (await $.prompt.submit({ text: 'and now?', wait: false, origin: { kind: 'composer' } })).context ?? []
  expect(again.join('\n')).not.toContain('Pick a cache?')
  expect(again.join('\n')).not.toContain('Working on:')
})

test('a ledger update held during clear cannot write its old question into the new conversation', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  ledgerReply = 'NEW: decide | 1 | Old question? | Yes / No | Yes'
  let entered!: () => void
  let release!: () => void
  const inWrite = new Promise<void>(resolve => (entered = resolve))
  const held = new Promise<void>(resolve => (release = resolve))
  let didHold = false
  on('state.set', { plugin: 'inbox', key: 'session' } as const, async ($, e, next) => {
    if (!didHold && e.value.ledger.items.some(i => i.ask === 'Old question?')) {
      didHold = true
      entered()
      await held
    }
    return next(e)
  })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'old request', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Old reply.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await inWrite
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Old question/ })).toBeUndefined()
  release()
  await clock.settle()
  expect(await pane.find({ text: /Old question/ })).toBeUndefined()
  expect(stored.has('s:session-2')).toBe(false)
})

const SAVED_SESSION = {
  savedAt: 900_000,
  ledger: {
    items: [
      {
        id: 'i1',
        kind: 'question',
        label: '1',
        ask: 'Use Node or Python?',
        options: ['Node', 'Python'],
        rec: 'Node',
        helps: [],
        turn: 1,
        at: 900_000,
      },
    ],
    closed: [],
    findings: [],
    closedFindings: [],
    prs: [],
    nextId: 2,
    turn: 1,
    batchTurn: 1,
  },
}

test('a failed first save keeps the prior saved session intact', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const prior = JSON.stringify(SAVED_SESSION)
  stored.set('s:session-1', prior)
  storeSetRefusal = 'store unavailable'
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'new request', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'New reply.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(stored.get('s:session-1')).toBe(prior)
})

test('a session saved mid-turn by a process that ended loads with no turn running, and its Done message goes', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let session: Parameters<typeof overviewPage>[0] | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, ($, e, next) => {
    session = e.value as never
    return next(e)
  })
  const task = {
    ...SAVED_SESSION.ledger.items[0]!,
    kind: 'task',
    label: null,
    ask: 'Sign in to npm',
    options: [],
    rec: null,
  }
  stored.set(
    's:session-1',
    JSON.stringify({
      ...SAVED_SESSION,
      ledger: { ...SAVED_SESSION.ledger, items: [task] },
      presence: { isTurnRunning: true },
    }),
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(overviewPage(session!, 1_000_000).lead.find(l => l.id === 'status')?.text ?? null).toBeNull()
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'select-i1' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'done-i1' })
  await clock.advance(SETTLED_MS)
  expect(sent).toEqual(['Done: Sign in to npm'])
})

test('resuming a session waits for its in-flight save before loading it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'old request', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Old reply.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()

  let entered!: () => void
  let release!: () => void
  const inSet = new Promise<void>(resolve => (entered = resolve))
  const held = new Promise<void>(resolve => (release = resolve))
  storeSetHold = async key => {
    if (key !== 's:session-1') return
    storeSetHold = undefined
    entered()
    await held
  }
  const adding = $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'New finding',
    detail: 'New detail.',
  })
  await inSet
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
  let loaded = false
  const loading = $.classic.SessionStart({ source: 'resume', session_id: 'session-1' }).then(() => {
    loaded = true
  })
  await clock.settle()
  expect(loaded).toBe(false)
  release()
  await Promise.all([loading, adding])
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-findings' })
  expect(await pane.find({ text: /New finding/ })).toBeDefined()
})

test('session pruning uses saved time and retains records whose age cannot be read', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  stored.set('s:unknown', JSON.stringify({ savedAt: 'unknown', ledger: SAVED_SESSION.ledger }))
  for (let n = 3; n <= 40; n++) stored.set(`s:prior-${n}`, JSON.stringify({ savedAt: n, ledger: SAVED_SESSION.ledger }))
  stored.set('s:prior-1', JSON.stringify({ savedAt: 1, ledger: SAVED_SESSION.ledger }))
  stored.set('s:prior-2', JSON.stringify({ savedAt: 2, ledger: SAVED_SESSION.ledger }))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'new request', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'New reply.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(stored.has('s:prior-1')).toBe(false)
  expect(stored.has('s:prior-2')).toBe(false)
  expect(stored.has('s:prior-3')).toBe(true)
  expect(stored.has('s:unknown')).toBe(true)
  expect(stored.has('s:session-1')).toBe(true)
})

test('a ledger write committed before clear still saves to its original session', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let entered!: () => void
  let release!: () => void
  const afterWrite = new Promise<void>(resolve => (entered = resolve))
  const held = new Promise<void>(resolve => (release = resolve))
  on('state.set', { plugin: 'inbox', key: 'session' } as const, async ($, e, next) => {
    const result = await next(e)
    if (e.value.ledger.findings.some((f: { title: string }) => f.title === 'Late finding')) {
      entered()
      await held
    }
    return result
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'old request', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Old reply.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const adding = $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'Late finding',
    detail: 'Late detail.',
  })
  await afterWrite
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  release()
  await adding
  await clock.settle()
  expect(
    JSON.parse(stored.get('s:session-1') ?? '{}').ledger.findings.map((f: { title: string }) => f.title),
  ).toContain('Late finding')
})

test('the latest committed ledger wins when an older write completes afterward', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let entered!: () => void
  let release!: () => void
  const afterWrite = new Promise<void>(resolve => (entered = resolve))
  const held = new Promise<void>(resolve => (release = resolve))
  on('state.set', { plugin: 'inbox', key: 'session' } as const, async ($, e, next) => {
    const result = await next(e)
    const titles = e.value.ledger.findings.map((f: { title: string }) => f.title)
    if (titles.includes('First finding') && !titles.includes('Second finding')) {
      entered()
      await held
    }
    return result
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const first = $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'First finding',
    detail: 'First.',
  })
  await afterWrite
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'Second finding',
    detail: 'Second.',
  })
  release()
  await first
  await clock.settle()
  expect(JSON.parse(stored.get('s:session-1') ?? '{}').ledger.findings.map((f: { title: string }) => f.title)).toEqual([
    'First finding',
    'Second finding',
  ])
})

test('a delayed saved-session read cannot replace a newer conversation', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const savedFor = (ask: string) => ({
    ...SAVED_SESSION,
    ledger: { ...SAVED_SESSION.ledger, items: [{ ...SAVED_SESSION.ledger.items[0]!, ask }] },
  })
  stored.set('s:session-2', JSON.stringify(savedFor('Second session question?')))
  stored.set('s:session-3', JSON.stringify(savedFor('Third session question?')))
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  let entered!: () => void
  let release!: () => void
  const inRead = new Promise<void>(resolve => (entered = resolve))
  const held = new Promise<void>(resolve => (release = resolve))
  let heldOnce = false
  storeHold = async () => {
    if (!heldOnce) {
      heldOnce = true
      entered()
      await held
    }
  }
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  const loadingOld = $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  await inRead
  await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
  await $.classic.SessionStart({ source: 'resume', session_id: 'session-3' })
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Third session question/ })).toBeDefined()
  release()
  await loadingOld
  await clock.settle()
  expect(await pane.find({ text: /Third session question/ })).toBeDefined()
  expect(await pane.find({ text: /Second session question/ })).toBeUndefined()
})

test('a delayed saved-session application cannot poison the next load', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const savedFor = (ask: string) => ({
    ...SAVED_SESSION,
    ledger: { ...SAVED_SESSION.ledger, items: [{ ...SAVED_SESSION.ledger.items[0]!, ask }] },
  })
  stored.set('s:session-2', JSON.stringify(savedFor('Second session question?')))
  stored.set('s:session-3', JSON.stringify(savedFor('Third session question?')))
  let entered!: () => void
  let release!: () => void
  const afterWrite = new Promise<void>(resolve => (entered = resolve))
  const held = new Promise<void>(resolve => (release = resolve))
  let holdNext = false
  on('state.set', { plugin: 'inbox', key: 'unreadable' } as const, async ($, e, next) => {
    const result = await next(e)
    if (holdNext) {
      holdNext = false
      entered()
      await held
    }
    return result
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  holdNext = true
  const loadingOld = $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  await afterWrite
  await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
  const loadingNew = $.classic.SessionStart({ source: 'resume', session_id: 'session-3' })
  release()
  await Promise.all([loadingOld, loadingNew])
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Third session question/ })).toBeDefined()
  expect(await pane.find({ text: /Second session question/ })).toBeUndefined()
})

test('tools the engine refuses turn the status line red on every tab, and the mod still loads the conversation', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  theme = 'dark'
  toolRefusal = 'blocked by managed settings'
  stored.set('s:session-1', JSON.stringify(SAVED_SESSION))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  const refused = "Claude cannot record or close items here: your organization's settings block the inbox's tools."
  const red = (await pane.find({ type: 'Text', text: refused }))?.props.color
  expect(red).toBeDefined()
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
  await pane.press({ key: 'tab-findings' })
  expect((await pane.find({ type: 'Text', text: refused }))?.props.color).toBe(red)
})

test('a saved session the store cannot read shows as unreadable, not empty, until [Try again] reads it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const pane = await $.ui.mount(PANE)
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()

  storeRefusal = 'the store is busy'
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(await pane.find({ text: /Could not read the inbox/ })).toBeUndefined()
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()

  storeRefusal = undefined
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  await clock.settle()
  expect(await pane.find({ text: /Nothing needed/ })).toBeDefined()
  storeRefusal = 'the store is busy'
  await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
  await $.classic.SessionStart({ source: 'resume', session_id: 'session-1' })
  await clock.settle()
  expect(await pane.find({ text: 'Could not read the inbox.' })).toBeDefined()
  expect(await pane.find({ text: /Nothing needed/ })).toBeUndefined()

  let readDone = () => {}
  storeHold = () => new Promise<void>(r => (readDone = r))
  await pane.press({ key: 'read-again' })
  await clock.settle()
  expect(await pane.find({ text: 'Reading the inbox…' })).toBeDefined()
  expect(await pane.find({ key: 'read-again' })).toBeDefined()
  await pane.press({ key: 'read-again' })
  storeHold = undefined
  readDone()
  await clock.settle()
  expect(await pane.find({ text: 'Could not read the inbox.' })).toBeDefined()

  ledgerReply = 'NONE'
  await $.prompt.submit({ text: 'keep going', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'README is stale',
    detail: 'Old.',
  })
  await clock.settle()
  expect(stored.get('s:session-1')).toContain('Use Node or Python?')

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(await pane.find({ text: 'Could not read the inbox.' })).toBeDefined()
  await $.prompt.submit({ text: 'and the tests', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't3', reason: 'answer' })
  await clock.settle()
  expect(stored.get('s:session-1')).toContain('Use Node or Python?')

  storeRefusal = undefined
  await pane.press({ key: 'read-again' })
  await clock.settle()
  expect(await pane.find({ text: /Could not read the inbox/ })).toBeUndefined()
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
  expect(stored.get('s:session-1')).toContain('Use Node or Python?')
})

for (const origin of [{ kind: 'sdk' }, { kind: 'plugin', name: 'test-plugin' }] satisfies PromptOrigin[]) {
  test(`a headless run stays inactive when ${origin.kind} invokes the inbox command`, async ($, on) => {
    const prompts: string[] = []
    mock.clock(on, { now: 1 })
    world($, on, prompts)

    await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
    await $.command.run({
      command: 'inbox',
      args: 'demo',
      origin,
      presentation: { isFullscreen: false, columns: 80 },
    })
    await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'sdk' } })
    await $.turn.complete({ answer: 'hello', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })

    expect(panesOpened).toEqual([])
    expect(stored.size).toBe(0)
    expect(prompts).toEqual([])
  })
}

test('the first inbox command loads saved rows before desktop attaches', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  stored.set('s:session-1', JSON.stringify(SAVED_SESSION))

  await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
  await $.command.run({
    command: 'inbox',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  await clock.settle()
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
})

for (const activatingEvent of ['start', 'attach'] as const) {
  test(`an inbox command waits for the saved rows loading during desktop ${activatingEvent}`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    stored.set('s:session-1', JSON.stringify(SAVED_SESSION))
    let release = () => {}
    const reading = new Promise<void>(r => (release = r))
    let didRead = () => {}
    const readStarted = new Promise<void>(r => (didRead = r))
    storeHold = () => {
      didRead()
      return reading
    }

    if (activatingEvent === 'attach')
      await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
    else surfaces = ['desktop']
    const activation =
      activatingEvent === 'start'
        ? $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
        : $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
    await readStarted
    const command = $.command.run({ command: 'inbox', args: '' } as never)
    const attach = $.session.attach({ surface: 'desktop', clientId: 'desktop:other' })
    await clock.settle()
    expect(panesOpened).toEqual([])
    release()
    await Promise.all([activation, command, attach])
    const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
    expect(
      (await $.prompt.submit({ text: 'continue', wait: false, origin: { kind: 'composer' } })).context?.join('\n'),
    ).toContain('Use Node or Python?')
  })
}

test('a refused inbox command registration leaves normal desktop startup and saved rows available', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  commandRefusal = 'blocked by managed settings'
  surfaces = ['desktop']
  stored.set('s:session-1', JSON.stringify(SAVED_SESSION))

  expect(await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })).toEqual({
    cwd: '/tmp/project',
  })
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'desktop', ...BAND })
  expect(await band.find({ text: /Needs you 1/ })).toBeDefined()
  expect(
    (await $.prompt.submit({ text: 'continue', wait: false, origin: { kind: 'composer' } })).context?.join('\n'),
  ).toContain('Use Node or Python?')
})

for (const isAttachedFirst of [true, false]) {
  test(`the desktop app turns the mod on when it attaches ${isAttachedFirst ? 'before' : 'after'} the start`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const prompts: string[] = []
    world($, on, prompts)
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
    expect(await band.find({ text: /Needs you 2/ })).toBeDefined()
  })
}

test('the desktop task keeps help before Done and puts Try again first when its send fails', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  ledgerReply = ['NEW: do | - | Run the load script | - | -', 'HELP: new 1 | run | ./load.sh | load script'].join('\n')
  surfaces = ['desktop']
  await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
  await $.prompt.submit({ text: 'load the data', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Run ./load.sh.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 69 } })
  const actions = async () =>
    (await pane.findAll({ type: 'Button' })).filter(b => /^(retry|help|done)-i1/.test(b.key ?? '')).map(b => b.key)
  expect(await actions()).toEqual(['help-i1-0', 'done-i1'])
  submitAnswer = { drop: 'blocked' }
  await pane.press({ key: 'help-i1-0' })
  await clock.settle()
  expect(await actions()).toEqual(['retry-i1', 'help-i1-0', 'done-i1'])
  expect(await pane.find({ text: /Not sent/ })).toBeDefined()
})

test('the desktop pane draws each action as one button and the tabs as one click region, with no keys and no close button of its own', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  surfaces = ['desktop']
  await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Node or Python?', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  await clock.advance(3 * 60_000)

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 36 } })
  const buttons = await pane.findAll({ type: 'Button' })
  expect(buttons.filter(b => b.props.hotkey !== undefined || String(b.props.label).startsWith(': '))).toEqual([])
  expect(buttons.map(b => b.key ?? '').filter(k => /-key$|^tab-key-|^next$|^previous$|^key-list$/.test(k))).toEqual([])
  expect(buttons.map(b => b.key ?? '').filter(k => k.startsWith('tab-'))).toEqual([])
  const recommended = await pane.find({ key: 'answer-i1-0' })
  expect([recommended?.props.label, recommended?.props.variant]).toEqual(['Node (recommended)', 'primary'])
  expect((await pane.find({ key: 'select-i2' }))?.type).toBe('Client')
  expect(await pane.find({ key: 'title-i2' })).toBeUndefined()
  expect(((await pane.find({ key: 'select-i2' }))?.props.props as RowProps).side).toBe('3m')
  await pane.redraw({ ...PANE.props, bodyColumns: 26 })
  const narrowed = await pane.find({ key: 'answer-i1-0' })
  expect([narrowed?.props.label, narrowed?.props.variant]).toEqual(['Node', 'primary'])
  await pane.redraw({ ...PANE.props, bodyColumns: 69 })

  await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'select-i2' })
  await clock.settle()
  expect(await pane.find({ key: 'select-i2' })).toBeUndefined()
  await clock.advance(PRESS_GUARD_MS)
  const links = (await pane.find({ key: 'links-i2' }))?.props.props as LinksProps
  const explainAt = links.links
    .slice(
      0,
      links.links.findIndex(l => l.key === 'explain-i2'),
    )
    .reduce((x, l) => x + l.width + links.gap, 0)
  await pane.pointer({ type: 'down', x: explainAt, y: 0, button: 'left', in: 'links-i2' })
  await clock.settle()
  expect(sent).toHaveLength(1)
  expect(await pane.find({ text: /Explaining…/ })).toBeDefined()

  const tabBar = async () => (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
  const { tabs, gap } = await tabBar()
  expect(tabs.map(t => t.id)).toEqual(['overview', 'needsYou', 'findings', 'prs'])
  const findingsEnd = tabs[0]!.width + gap + tabs[1]!.width + gap + tabs[2]!.width
  await pane.pointer({ type: 'down', x: findingsEnd - 1, y: 1.1, button: 'left', in: 'tabs' })
  await clock.settle()
  expect((await tabBar()).shown).toBe('findings')
  await pane.pointer({ type: 'down', x: tabs[0]!.width, y: 1, button: 'left', in: 'tabs' })
  await clock.settle()
  expect((await tabBar()).shown).toBe('findings')

  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'README is stale',
    detail: 'Old.',
  })
  await $.tool.call({ tool: 'mcp__inbox__close', id: 'f3', reason: 'fixed' } as never)
  await clock.advance(9000)
  const fold = async () => (await pane.find({ key: 'fold-issue' }))?.props.props as FoldProps
  const closedItem = { text: /^Closed by Claude: fixed$/ } as const
  expect((await pane.find({ key: 'fold-issue' }))?.type).toBe('Client')
  expect(await pane.find(closedItem)).toBeUndefined()
  await pane.pointer({ type: 'down', x: 30, y: 0, button: 'left', in: 'fold-issue' })
  await clock.settle()
  expect((await fold()).isUnfolded).toBe(true)
  expect(await pane.find(closedItem)).toBeDefined()
  await pane.post({ isUnfolded: true }, { in: 'fold-issue' })
  await clock.settle()
  expect((await fold()).isUnfolded).toBe(true)
  expect(await pane.find(closedItem)).toBeDefined()

  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'Retry loop never backs off',
    detail: 'Hot.',
  })
  await clock.settle()
  expect(await pane.find({ text: 'Hot.' })).toBeDefined()

  expect(await pane.find({ key: 'close-pane' })).toBeUndefined()
})

test('a tool call after a hot reload, before the load converts the ledger, still applies', async ($, on) => {
  mock.clock(on, { now: 1 })
  world($, on, [])
  let strip = false
  on('state.set', { plugin: 'inbox', key: 'session' } as const, ($, e, next) => {
    if (!strip) return next(e)
    const { closedFindings, ...old } = e.value.ledger as unknown as Record<string, unknown>
    return next({ ...e, value: { ...e.value, ledger: old as never } })
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'README is stale',
    detail: 'Old.',
  })
  strip = true
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'Second',
    detail: 'Two.',
  })
  strip = false
  const r = await $.tool.call({ tool: 'mcp__inbox__close', id: 'f1', reason: 'fixed' } as never)
  expect(r.result).toBe('Closed the finding. Name it by what it says, never by its id.')
})

const inOrder = (drawn: string[], plan: string[]) => {
  let at = 0
  for (const label of plan) {
    at = drawn.indexOf(label, at)
    if (at === -1) return false
    at++
  }
  return true
}

test('no two buttons on a row share a hotkey, for every row kind in the demo', async () => {
  const { ledger, lastActions, notes, turns, prViews } = demoView(1_000_000, 'Claude')
  const view = inboxView({
    ledger,
    lastActions,
    notes,
    turns,
    extraSteps: {},
    settleWindowMs: SETTLED_MS,
    status: perTurnStatus({ isUpdating: false, isFailed: false, retries: true }),
    replies: {},
    discarded: {},
    now: 1_000_000,
  })
  const itemRows = [...view.needsYou.questions, ...view.needsYou.tasks, ...view.findings.rows].map(row => {
    const { keys, more } = rowKeyPlan(row, true)
    return {
      id: row.id,
      type: row.type,
      hotkeys: [...keys, ...more].flatMap(k => ('hotkey' in k && k.hotkey !== undefined ? [k.hotkey] : [])),
    }
  })
  const isSent = threadSentIn(lastActions)
  const presses = { lastActions, turns, now: 1_000_000 }
  const prRows = Object.values(prViews.views).flatMap(pr => [
    { id: `PR #${pr.number}`, actions: prBlockActions(pr, isSent, prViews.branchRef, presses) },
    ...waitingThreads(pr).map(t => ({ id: prThreadId(pr, t), actions: threadActions(pr, t, presses) })),
    ...failingChecks(pr).map(c => ({ id: prCheckId(pr, c), actions: checkActions(pr, c, presses) })),
  ])
  const rows = [
    ...itemRows,
    ...prRows.map(r => ({ id: r.id, hotkeys: r.actions.flatMap(a => (a.hotkey ? [a.hotkey] : [])) })),
  ]
  expect(new Set(itemRows.map(r => r.type))).toEqual(new Set(['question', 'task', 'finding']))
  expect(prRows.length).toBeGreaterThan(1)
  for (const row of rows) expect(row.hotkeys, row.id).toEqual([...new Set(row.hotkeys)])
})

test('every row in the demo, on every tab, draws its plan’s buttons in the plan’s order in the terminal and desktop looks', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: 'demo' } as never)

  const { ledger, lastActions, notes, turns, prViews } = demoView(1_000_000, 'Claude')
  const view = inboxView({
    ledger,
    lastActions,
    notes,
    turns,
    extraSteps: {},
    settleWindowMs: SETTLED_MS,
    status: perTurnStatus({ isUpdating: false, isFailed: false, retries: true }),
    now: 1_000_000,
    replies: {},
    discarded: {},
  })
  const TITLE_START = 20
  const expectedLabels = (row: (typeof view.findings.rows)[number]) => {
    const { keys, more } = rowKeyPlan(row, true)
    return [...keys, ...more].flatMap(k => {
      if (k.slot === 'retry') return ['Try again']
      if (k.slot === 'allOptions') return []
      return [k.action.label]
    })
  }
  const tabs = [
    {
      id: 'needsYou',
      rows: [...view.needsYou.questions, ...view.needsYou.tasks].filter(r => r.state.is !== 'settled'),
    },
    { id: 'findings', rows: view.findings.rows.filter(r => r.state.is !== 'settled') },
  ] as const
  expect(tabs.map(t => t.rows.length > 0)).toEqual([true, true])

  for (const look of ['terminal', 'desktop'] as const) {
    const pane =
      look === 'terminal'
        ? await $.ui.mount(PANE)
        : await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 120 } })
    const drawn = async () => {
      const links = (await pane.findAll({ type: 'Client' })).flatMap(
        c => (c.props.props as Partial<LinksProps>).links ?? [],
      )
      const clean = (label: string) =>
        label
          .replace(/^\p{L}: /u, '')
          .replace(/^[^\p{L}\p{N}]+/u, '')
          .replace(/ \(recommended\)$/, '')
          .trim()
      const buttons = (await pane.findAll({ type: 'Button' }))
        .filter(b => !(b.key ?? '').endsWith('-key'))
        .map(b => ({ key: b.key ?? '', label: clean(b.text) }))
      const controls = [...buttons.map(b => b.label), ...links.map(l => clean(l.label))]
      const texts = (await pane.findAll({ type: 'Text' })).map(t => t.text ?? '')
      return { buttons, controls, texts }
    }
    for (const tab of tabs) {
      if (look === 'terminal') {
        if (await pane.find({ key: `tab-${tab.id}` })) await pane.press({ key: `tab-${tab.id}` })
      } else {
        const { tabs: bar, gap } = (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
        const x = bar
          .slice(
            0,
            bar.findIndex(t => t.id === tab.id),
          )
          .reduce((sum, t) => sum + t.width + gap, 0)
        await pane.pointer({ type: 'down', x, y: 1, button: 'left', in: 'tabs' })
      }
      await clock.settle()
      for (const row of tab.rows) {
        await clock.advance(PRESS_GUARD_MS)
        if (look === 'terminal' && (await pane.find({ key: `select-${row.id}` }))) {
          await pane.press({ key: `select-${row.id}` })
        } else if (look === 'terminal' && (await pane.find({ key: `title-${row.id}` }))) {
          await pane.press({ key: `title-${row.id}` })
        } else if (look === 'desktop' && (await pane.find({ key: `select-${row.id}` }))) {
          await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: `select-${row.id}` })
        }
        if (await pane.find({ key: `all-options-${row.id}` })) await pane.press({ key: `all-options-${row.id}` })
        await clock.settle()
        const { controls, texts } = await drawn()
        const isTitleDrawn = [...controls, ...texts].some(t =>
          t.includes(row.state.is === 'open' ? row.title : row.title.slice(0, TITLE_START)),
        )
        expect(isTitleDrawn, `${look} ${tab.id} row ${row.id} draws its title`).toBe(true)
        if (row.state.is !== 'open') continue
        expect(inOrder(controls, expectedLabels(row)), `${look} ${tab.id} row ${row.id}: ${controls.join(', ')}`).toBe(
          true,
        )
      }
    }
    if (look === 'terminal') await pane.press({ key: 'tab-prs' })
    else {
      const { tabs: bar, gap } = (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
      const x = bar
        .slice(
          0,
          bar.findIndex(t => t.id === 'prs'),
        )
        .reduce((sum, t) => sum + t.width + gap, 0)
      await pane.pointer({ type: 'down', x, y: 1, button: 'left', in: 'tabs' })
    }
    await clock.settle()
    const prs = Object.values(prViews.views)
    const isSent = threadSentIn(lastActions)
    const presses = { lastActions, turns, now: 1_000_000 }
    for (const pr of prs) {
      const labels = prBlockActions(pr, isSent, prViews.branchRef, presses).map(a => a.label)
      const { buttons } = await drawn()
      expect(
        buttons.filter(b => b.key.endsWith(`-${pr.ref}`)).map(b => b.label),
        `${look} PR #${pr.number}`,
      ).toEqual(labels)
    }
    const prRows = prs.flatMap(pr => [
      ...waitingThreads(pr).map(t => ({ id: prThreadId(pr, t), labels: threadActions(pr, t, presses) })),
      ...failingChecks(pr).map(c => ({ id: prCheckId(pr, c), labels: checkActions(pr, c, presses) })),
    ])
    let checked = 0
    for (const row of prRows) {
      await clock.advance(PRESS_GUARD_MS)
      if (!(await pane.find({ key: `select-${row.id}` }))) continue
      if (look === 'terminal') await pane.press({ key: `select-${row.id}` })
      else await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: `select-${row.id}` })
      await clock.settle()
      const { controls } = await drawn()
      const labels = [...row.labels.filter(a => !a.isFollowUp), ...row.labels.filter(a => a.isFollowUp)].map(
        a => a.label,
      )
      expect(inOrder(controls, labels), `${look} ${row.id}: ${controls.join(', ')}`).toBe(true)
      checked++
    }
    expect(checked, `${look} PR rows checked`).toBeGreaterThan(1)
  }
})

test('a forked conversation keeps the parent’s findings and closed records, and dismissing the question that replaced a finding brings the finding back', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'Retry loop never backs off',
    detail: 'The fetch retry spins with no delay.',
  })
  ledgerReply = 'ASKED: f1 | new 1\nNEW: decide | 1 | Add a backoff to the retry loop? | Yes / No | Yes'
  await $.prompt.submit({ text: 'fix the retries', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Add a backoff?', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Add a backoff to the retry loop\?/ })).toBeDefined()
  await pane.press({ key: 'tab-findings' })
  expect((await pane.find({ key: 'settled-f1' }))?.text).toContain('Now a question in Needs you')
  await pane.press({ key: 'tab-needsYou' })
  const contextOf = async () =>
    ((await $.prompt.submit({ text: 'where are we?', wait: false, origin: { kind: 'composer' } })).context ?? []).join(
      '\n',
    )
  expect(await contextOf()).not.toContain('(close id: f1)')

  await $.session.end({ reason: 'resume', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'fork', session_id: 'session-2' })
  await clock.settle()
  expect(await contextOf()).toContain('(close id: i2)')
  expect(await contextOf()).not.toContain('(close id: f1)')
  await pane.press({ key: 'dismiss-i2' })
  await clock.settle()
  await clock.advance(SETTLED_MS)
  expect(await contextOf()).toContain('- issue: Retry loop never backs off (close id: f1)')
})

test('a stream’s mark on the Overview moves each frame, and any other working item’s only while a turn runs', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  paneState = { isShown: true, isFocused: true }
  overviewReply = [
    'KIND: coordinator',
    'HEADLINE: Adding a greeting CLI',
    'STATUS: Writing the parser.',
    'QUEUE: working | Write the help text',
    'QUEUE: queued | Add a --loud flag',
    'STREAM: working | Parser: reads the new format',
  ].join('\n')

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-key-overview' })
  await clock.settle()
  const markOf = async (key: string) =>
    [...((await pane.find({ key }))?.text ?? '')].filter(c => RUNNING_FRAMES.some(f => f === c)).join('')
  const frames = async () => {
    const stream: string[] = []
    const queue: string[] = []
    const moving: string[] = []
    for (let n = 0; n < RUNNING_FRAMES.length; n++) {
      stream.push(await markOf('overview-workstreams-0'))
      queue.push(await markOf('overview-queue-0'))
      moving.push(runningMark(clock.now()))
      await clock.advance(RUNNING_FRAME_MS)
    }
    expect(new Set(moving).size).toBeGreaterThan(1)

    return { stream, queue, moving, still: moving.map(() => '●') }
  }

  const idle = await frames()
  expect(idle.stream).toEqual(idle.moving)
  expect(idle.queue).toEqual(idle.still)

  await $.turn.start({ text: 'go on', turnId: 't2' })
  await clock.settle()
  const running = await frames()
  expect(running.stream).toEqual(running.moving)
  expect(running.queue).toEqual(running.moving)

  await $.turn.complete({ answer: 'Parser written.', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  const ended = await frames()
  expect(ended.stream).toEqual(ended.moving)
  expect(ended.queue).toEqual(ended.still)
})

test('the Overview page shows the headline, the status and the queue in place of rows, leaves the row keys idle, and a row tab shows its rows again', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  paneState = { isShown: true, isFocused: true }
  overviewReply =
    'HEADLINE: Adding a greeting CLI\nSTATUS: Waiting on two choices.\nQUEUE: waits-on-you | Pick a runtime\nQUEUE: done | Plan written'

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ key: 'answer-i1-0' })).toBeDefined()

  const lookOf = () => {
    const saved = [...stored].find(([k]) => k.startsWith('s:'))
    return saved && JSON.parse(saved[1]).ledger.overview.look
  }
  expect(lookOf()).toBeNull()
  await pane.press({ key: 'tab-key-overview' })
  await clock.settle()
  expect(lookOf()).not.toBeNull()
  expect((await pane.find({ key: 'overview-headline' }))?.text).toBe('Adding a greeting CLI')
  expect((await pane.find({ key: 'overview-status' }))?.text).toBe('Waiting on two choices.')
  expect(await pane.find({ text: /^Plan written$/ })).toBeDefined()
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeUndefined()
  const rowKeys = async () =>
    (await pane.findAll({ type: 'Button' }))
      .map(b => b.key ?? '')
      .filter(k => k.endsWith('-key') && !k.startsWith('tab-'))
  expect(await rowKeys()).toEqual(['no-row-d-key', 'no-row-x-key'])
  await pane.press({ key: 'next' })
  await pane.press({ key: 'no-row-d-key' })
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'No lint script',
    detail: 'Only tests run.',
  })
  await clock.settle()
  expect(await pane.find({ key: 'overview-headline' })).toBeDefined()
  expect(await rowKeys()).toEqual(['no-row-d-key', 'no-row-x-key'])

  await pane.press({ key: 'tab-key-needsYou' })
  await clock.settle()
  expect(lookOf()).toBeNull()
  expect(await pane.find({ key: 'overview-headline' })).toBeUndefined()
  expect(await pane.find({ key: 'answer-i1-0' })).toBeDefined()
  await pane.press({ key: 'tab-findings' })
  expect(await pane.find({ key: 'address-f3' })).toBeDefined()
})

test('Claude Code task calls build the agent task list the Overview call reads', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'fix the parser', wait: false, origin: { kind: 'composer' } })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Read the parser', description: 'Read it' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Fix the parser', description: 'Fix it' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await clock.settle()
  const saved = [...stored].find(([k]) => k.startsWith('s:'))
  expect(saved && JSON.parse(saved[1]).hostTasks).toEqual([
    { id: '1', text: 'Read the parser', status: 'done' },
    { id: '2', text: 'Fix the parser', status: 'pending' },
  ])

  otherToolAnswer = { isError: true, result: 'Task not found', text: 'Task #7 not found' }
  await $.tool.call({ tool: 'TaskCreate', subject: 'A task that failed', description: 'No' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'completed' })
  await clock.settle()
  const after = [...stored].find(([k]) => k.startsWith('s:'))
  expect(after && JSON.parse(after[1]).hostTasks).toHaveLength(2)
  expect(after && JSON.parse(after[1]).hostTasks[1].status).toBe('pending')
})

test('the Overview page says what it is for before the session has any work', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world($, on, [])

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const terminal = await $.ui.mount(PANE)
  await terminal.press({ key: 'tab-key-overview' })
  expect(await terminal.find({ text: /It fills in once the work starts/ })).toBeDefined()
  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desktop.find({ text: /It fills in once the work starts/ })).toBeDefined()
})

test('at 34 desktop columns the tabs drop their counts and frame only the shown tab, and the Overview page draws there', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  overviewReply =
    'HEADLINE: Adding a greeting CLI\nSTATUS: Waiting on two choices.\nQUEUE: waits-on-you | Pick a runtime\nQUEUE: done | Plan written'
  surfaces = ['desktop']

  await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'No lint script',
    detail: 'Only tests run.',
  })
  await clock.settle()
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 34 } })
  const tabBar = async () => (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
  expect((await tabBar()).tabs.map(t => [t.id, t.count])).toEqual([
    ['overview', 0],
    ['needsYou', 0],
    ['findings', 0],
    ['prs', 0],
  ])
  expect((await tabBar()).isEachFramed).toBe(false)
  await pane.redraw({ ...PANE.props, bodyColumns: 69 })
  expect((await tabBar()).isEachFramed).toBe(true)

  const { tabs, gap } = await tabBar()
  await pane.pointer({ type: 'down', x: tabs[1]!.width + gap, y: 1, button: 'left', in: 'tabs' })
  await clock.settle()
  expect((await tabBar()).shown).toBe('needsYou')
  await pane.pointer({ type: 'down', x: 0, y: 1, button: 'left', in: 'tabs' })
  await clock.settle()
  expect((await tabBar()).shown).toBe('overview')
  expect((await pane.find({ key: 'overview-headline' }))?.text).toBe('Adding a greeting CLI')
  expect(await pane.find({ text: /^Plan written$/ })).toBeDefined()
  expect(await pane.find({ key: 'select-f3' })).toBeUndefined()
})

test('a PR that arrives while the Needs you tab is empty moves the pane to the PRs tab', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  paneState = { isShown: true, isFocused: true }
  ledgerReply = 'NONE'
  let release = () => {}
  let onFetched = () => {}
  let isFetching = false
  on('state.set', { plugin: 'inbox', key: 'session' } as const, async ($, e, next) => {
    const r = await next(e)
    const wasFetching = isFetching
    isFetching = e.value.prViews.isFetching
    if (wasFetching && !isFetching) onFetched()
    return r
  })
  ghAnswers.push(
    {
      match: argv => argv.includes('view') && argv.includes('12'),
      stdout: JSON.stringify({
        number: 12,
        title: 'Add a greeting CLI',
        url: 'https://github.com/acme/greet/pull/12',
        isDraft: false,
        state: 'OPEN',
        baseRefName: 'main',
        mergeable: 'MERGEABLE',
        reviewDecision: 'REVIEW_REQUIRED',
        statusCheckRollup: [],
      }),
      hold: () => new Promise(r => (release = r)),
    },
    {
      match: argv => argv.includes('graphql'),
      stdout: JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } }),
    },
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: '' } as never)
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: 'Nothing needed' })).toBeDefined()
  await $.prompt.submit({ text: 'open the PR', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Opened https://github.com/acme/greet/pull/12.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  expect(isFetching).toBe(true)
  expect(await pane.find({ text: 'Nothing needed' })).toBeDefined()

  const fetched = new Promise<void>(r => (onFetched = r))
  release()
  await fetched
  await clock.settle()
  expect(await pane.find({ text: 'Nothing needed' })).toBeUndefined()
  expect(await pane.find({ text: /Add a greeting CLI/ })).toBeDefined()
})

test('the desktop tabs that do not fit one line wrap, each line within the pane, and a tab on the second line takes its click', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  surfaces = ['desktop']
  await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 26 } })
  const tabBar = async () => await pane.find({ key: 'tabs' })
  const { tabs, gap, columns } = (await tabBar())?.props.props as TabsProps
  const lines = tabLines(tabs, gap, columns)
  expect(lines.length).toBeGreaterThan(1)
  for (const line of lines)
    expect(line.reduce((sum, t) => sum + t.width, gap * (line.length - 1))).toBeLessThanOrEqual(columns)
  expect((await tabBar())?.props.height).toBe(TAB_HEIGHT * lines.length)
  const last = lines.at(-1)![0]!
  await pane.pointer({ type: 'down', x: 1, y: TAB_HEIGHT * (lines.length - 1) + 1, button: 'left', in: 'tabs' })
  await clock.settle()
  expect(((await tabBar())?.props.props as TabsProps).shown).toBe(last.id)
})
