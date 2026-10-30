import type { Engine, MockClock } from 'claude-code/testing'
import type { On, PaneOpenArgs, PromptOrigin, RenderSurface } from 'claude-code'
import { GH_TIMEOUT_MS } from '../hooks/gh'
import { STATUS_SYSTEM } from '../hooks/model-text'

export const LEDGER_REPLY = `NEW: decide | 1 | Use Node or Python? | Node / Python | Node
NEW: decide | 2 | Name the command greet? | - | yes`

class World {
  ledgerReply = LEDGER_REPLY
  statusReply: string | null | string[] = 'UNCHANGED'
  statusPrompts: string[] = []
  statusHold: Promise<void> | null = null
  sessionId = 'session-1'

  sent: string[] = []

  ran: string[][] = []

  submitAnswer:
    'enter' | 'hold' | { drop: string; beforeDrop?: () => Promise<void> } | { rewrite: string; hold?: boolean } =
    'enter'
  held: { text: string; origin: PromptOrigin; release: () => void }[] = []
  inFlight: Promise<unknown>[] = []
  promptRows = 0

  toolVerdict: 'allow' | 'ask' = 'allow'
  stepAnswers: { answer: string; callsTool?: true }[] = []
  transcriptRows: { role: 'user' | 'assistant'; text: string; toolUses: never[] }[] = []

  dialogAnswer: Record<string, unknown> = { result: 'ok', text: 'ok' }
  otherToolAnswer: Record<string, unknown> = { result: 'ok', text: 'ok' }
  spawnedAgentId = 'a1'
  listedAgents: { id: string; status: string }[] = []

  isGhMissing = false
  slowGhClock: MockClock | null = null

  ghAnswers: {
    match: (argv: readonly string[]) => boolean
    stdout: string
    hold?: () => Promise<void>
    fails?: string
    exitCode?: number
  }[] = []

  surfaces: RenderSurface[] = []

  files: string[] = []

  copied: string[] = []
  toasts: string[] = []

  theme = ''

  beforeAct: (() => Promise<unknown>) | undefined

  stored = new Map<string, string>()
  storeRefusal: string | undefined
  storeHold: (() => Promise<void>) | undefined
  storeSetHold: ((key: string, value: unknown) => Promise<void>) | undefined
  storeSetRefusal: string | undefined
  storeSetLockHeld = 0
  logged: string[] = []
  toolRefusal: string | undefined
  commandRefusal: string | undefined
  panesOpened: string[] = []
  paneOpens: PaneOpenArgs[] = []
  paneState: { isShown: boolean; isFocused: boolean } | null = null
}

export const w = new World()

function gh(argv: readonly string[]) {
  const hit = w.ghAnswers.find(a => a.match(argv))
  if (!hit && argv[0] === 'open')
    return { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

  return {
    exitCode: hit?.exitCode ?? (hit && !hit.fails ? 0 : 1),
    stdout: hit && !hit.fails ? hit.stdout : '',
    stderr: hit ? (hit.fails ?? '') : 'no pull requests found',
    isStdoutTruncated: false,
    isStderrTruncated: false,
  }
}

async function runBeforeAct() {
  const act = w.beforeAct
  w.beforeAct = undefined
  await act?.()
}

async function storePrompt($: Engine, prompt: { text: string; origin: PromptOrigin }) {
  const row = {
    message: { type: 'user' as const, role: 'user' as const, content: [{ type: 'text' as const, text: prompt.text }] },
    door: 'prompt' as const,
    origin: prompt.origin,
    uuid: `prompt-row-${++w.promptRows}`,
  }
  await $.session.append(row)
}

async function storeHeld($: Engine, prompt: (typeof w.held)[number]) {
  await storePrompt($, prompt)
  prompt.release()
}

export async function arrive($: Engine) {
  const prompts = w.held
  w.held = []
  for (const p of prompts) await storeHeld($, p)
  await Promise.all(w.inFlight)
  w.inFlight = []
}

export async function arriveFirst($: Engine) {
  await storeHeld($, w.held.shift()!)
}

async function holdUntilStored(prompt: { text: string; origin: PromptOrigin }) {
  await new Promise<void>(release => w.held.push({ ...prompt, release }))
}

export function world($: Engine, on: On, prompts: string[], vars: Record<string, string> = {}) {
  w.sent = []
  w.submitAnswer = 'enter'
  w.held = []
  w.inFlight = []
  w.ran = []
  w.toolVerdict = 'allow'
  w.stepAnswers = []
  w.transcriptRows = []
  w.dialogAnswer = { result: 'ok', text: 'ok' }
  w.otherToolAnswer = { result: 'ok', text: 'ok' }
  w.spawnedAgentId = 'a1'
  w.listedAgents = []
  w.ghAnswers = []
  w.isGhMissing = false
  w.slowGhClock = null
  w.ledgerReply = LEDGER_REPLY
  w.statusReply = 'UNCHANGED'
  w.statusPrompts = []
  w.statusHold = null
  w.sessionId = 'session-1'
  w.surfaces = []
  w.files = []
  w.copied = []
  w.toasts = []
  w.theme = ''
  w.beforeAct = undefined
  w.stored = new Map()
  w.storeRefusal = undefined
  w.storeHold = undefined
  w.storeSetHold = undefined
  w.storeSetRefusal = undefined
  w.storeSetLockHeld = 0
  w.logged = []
  w.toolRefusal = undefined
  w.commandRefusal = undefined
  w.panesOpened = []
  w.paneOpens = []
  w.paneState = null
  on('store.get', async (_$, e) => {
    if (e.key.startsWith('s:')) await w.storeHold?.()
    if (w.storeRefusal && e.key.startsWith('s:')) return { deny: w.storeRefusal }
    const json = w.stored.get(e.key)
    return { value: json === undefined ? undefined : JSON.parse(json) }
  })
  on('store.set', async (_$, e) => {
    await w.storeSetHold?.(e.key, e.value)
    if (w.storeSetRefusal && e.key.startsWith('s:')) return { deny: w.storeSetRefusal }
    if (w.storeSetLockHeld > 0 && e.key.startsWith('s:')) {
      w.storeSetLockHeld--
      return { deny: 'Lock file is already being held' }
    }
    w.stored.set(e.key, JSON.stringify(e.value))
    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    w.stored.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...w.stored.keys()] }))
  on('ui.log', (_$, e) => {
    w.logged.push(e.text)
    return { value: undefined }
  })
  on('config.list', () => ({
    value: w.theme
      ? [
          {
            key: 'theme',
            label: 'Theme',
            kind: 'choice' as const,
            value: w.theme,
            provider: { plugin: 'engine', tier: 'core' as const },
            isLocked: false,
          },
        ]
      : [],
  }))
  on('session.surfaces', () => ({ value: w.surfaces }))
  on('session.attach', (_$, e) => ({ clientId: e.clientId }))
  on('session.id', () => ({ value: w.sessionId }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('session.root', () => ({ value: '/tmp/project' }))
  on('env.get', (_$, e) => ({ value: vars[e.name] }))
  on('command.register', (_$, e) => (w.commandRefusal ? { deny: w.commandRefusal } : { value: { command: e.name } }))
  on('tool.register', (_$, e) =>
    w.toolRefusal ? { deny: w.toolRefusal } : { value: { tool: `mcp__inbox__${e.name}` } },
  )
  on('ui.open', (_$, e) => {
    w.panesOpened.push(e.id)
    w.paneOpens.push(e)
    return { value: { isPlaced: true as const } }
  })
  on('ui.panes', () => ({
    value: w.paneState ? [{ id: 'inbox', title: 'Inbox', ...w.paneState, isPlaced: w.paneState.isShown }] : [],
  }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', (_$, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.copy', (_$, e) => {
    w.copied.push(e.text)
    return { value: { isCopied: true as const } }
  })
  on('fs.exists', (_$, e) => ({ value: w.files.some(f => e.path.endsWith(f)) }))
  on('fs.read', (_$, e) => {
    if (!e.path.endsWith('/.claude-plugin/plugin.json')) throw new Error(`ENOENT: ${e.path}`)
    return { value: JSON.stringify({ name: 'inbox', version: '1.2.3' }) }
  })
  on('fs.stat', () => ({ value: { kind: 'file' as const, size: 1, mtimeMs: 1, isLink: false } }))
  on('process.run', async (_$, e) => {
    w.ran.push([...e.argv])
    if (w.isGhMissing && e.argv[0] === 'gh') throw new Error('spawn gh ENOENT')
    if (w.slowGhClock && e.argv[0] === 'gh') {
      await w.slowGhClock.sleep(GH_TIMEOUT_MS)
      return { deny: 'killed at the timeout' }
    }
    await w.ghAnswers.find(a => a.match(e.argv))?.hold?.()
    return { value: gh(e.argv) }
  })
  on('model.complete', async (_$, e) => {
    const isStatusCall =
      (e.systemBlocks ?? []).some(block => block.text === STATUS_SYSTEM) || e.system === STATUS_SYSTEM
    if (isStatusCall) w.statusPrompts.push(e.prompt)
    else prompts.push(e.prompt)
    if (isStatusCall) await w.statusHold
    const statusText = !isStatusCall
      ? null
      : Array.isArray(w.statusReply)
        ? (w.statusReply.shift() ?? 'UNCHANGED')
        : w.statusReply
    if (isStatusCall && statusText === null) return { deny: 'the Status call failed' }

    return {
      value: {
        isAnswered: true,
        text: isStatusCall ? statusText! : w.ledgerReply,
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }
  })
  on('prompt.submit', async (_$, e) => {
    if (e.origin.kind !== 'plugin') return { text: e.text, context: e.context }
    w.sent.push(e.text)
    if (typeof w.submitAnswer === 'object') {
      if ('drop' in w.submitAnswer) {
        await w.submitAnswer.beforeDrop?.()
        return { drop: w.submitAnswer.drop }
      }
      const rewritten = { text: w.submitAnswer.rewrite, origin: e.origin }
      if (w.submitAnswer.hold) await holdUntilStored(rewritten)
      else await storePrompt($, rewritten)
      return { text: rewritten.text, context: e.context }
    }
    if (w.submitAnswer === 'hold') await holdUntilStored({ text: e.text, origin: e.origin })
    else await storePrompt($, { text: e.text, origin: e.origin })

    return { text: e.text, context: e.context }
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('classic.StopFailure', () => ({}))
  on('classic.PermissionRequest', () => ({}))
  on('tool.check', () => ({ decision: w.toolVerdict }))
  on('turn.step', async function* (_$, e) {
    const { answer, callsTool } = w.stepAnswers[e.index] ?? { answer: '' }
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
  on('session.messages', () => ({ value: w.transcriptRows }))
  on('classic.SessionStart', (_$, e) => {
    w.sessionId = e.session_id
    return {}
  })
  on('tool.call', (_$, e) => {
    if (e.tool !== 'AskUserQuestion') return w.otherToolAnswer as never
    return w.dialogAnswer as never
  })
  on('agent.spawn', () => ({ model: 'sonnet', agentId: w.spawnedAgentId }))
  on('agent.list', () => ({ value: w.listedAgents as never }))
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
  on('ui.press', async (_$, e, next) => {
    await runBeforeAct()
    return next(e)
  })
  on('ui.input', async (_$, e, next) => {
    if (e.kind === 'submit') await runBeforeAct()
    return next(e)
  })
}
