import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { STATUS_SYSTEM } from '../../hooks/model-text'
import type { HostDeps } from '../src/host'

type Handler = (event: any, ctx: any) => unknown

export const MODEL_ANSWER = ['NEW: decide | 1 | Use Node or Python? | Node / Python | Node'].join('\n')

type Model = { id: string; name: string; provider: string; identity: { family?: string; revision?: string } }
export const sonnet: Model = {
  id: 'claude-sonnet-4-5',
  name: 'Claude Sonnet 4.5',
  provider: 'anthropic',
  identity: { family: 'sonnet', revision: '4.5.0' },
}
export const retiredSonnet: Model = {
  id: 'claude-3-5-sonnet-20240620',
  name: 'Claude Sonnet 3.5',
  provider: 'anthropic',
  identity: { family: 'sonnet', revision: '3.5.0' },
}
export const smol: Model = { id: 'gpt-mini', name: 'GPT Mini', provider: 'openai', identity: {} }

export type World = {
  dir: string
  clock: number
  handlers: Map<string, Handler>
  tools: Map<string, any>
  commands: Map<string, any>
  sent: { text: string; options: unknown }[]
  hidden: { content: string; options: unknown }[]
  timers: { fn: () => void; ms: number }[]
  notices: string[]
  completions: { model: Model; system: string[]; prompt: string }[]
  background: Promise<unknown>[]
  models: Model[]
  smolModel: Model | undefined
  inboxRoleModel: Model | undefined
  reply: string | Error
  statusReply: string | Error
  statusHold: Promise<void> | null
  statusCompletions: { model: Model; system: string[]; prompt: string }[]
  isIdle: boolean
  execResults: Map<string, { code: number; stdout?: string; stderr?: string; killed?: boolean } | Error>
  execCalls: { command: string; args: string[] }[]
  copied: string[]
  agentKind: 'main' | 'sub' | undefined
  hasUI: boolean
  branch: unknown[]
  activeTools: string[]
}

export let w: World

export function startWorld() {
  w = {
    dir: mkdtempSync(join(tmpdir(), 'inbox-omp-host-')),
    clock: 1_000_000,
    handlers: new Map(),
    tools: new Map(),
    commands: new Map(),
    sent: [],
    hidden: [],
    timers: [],
    notices: [],
    completions: [],
    background: [],
    models: [smol, sonnet],
    smolModel: smol,
    inboxRoleModel: undefined,
    reply: MODEL_ANSWER,
    statusReply: 'UNCHANGED',
    statusHold: null,
    statusCompletions: [],
    isIdle: false,
    execResults: new Map(),
    execCalls: [],
    copied: [],
    agentKind: 'main',
    hasUI: true,
    branch: [],
    activeTools: ['read', 'bash', 'record', 'close'],
  }
}

export function endWorld() {
  rmSync(w.dir, { recursive: true, force: true })
}

export const pi = () =>
  ({
    on: (name: string, handler: Handler) => w.handlers.set(name, handler),
    events: { on: (channel: string, handler: Handler) => w.handlers.set(channel, handler) },
    registerTool: (tool: any) => w.tools.set(tool.name, tool),
    registerCommand: (name: string, command: any) => w.commands.set(name, command),
    sendMessage: (message: { content: string }, options: unknown) => {
      w.hidden.push({ content: message.content, options })
    },
    sendUserMessage: (text: string, options: unknown) => {
      w.sent.push({ text, options })
    },
    exec: async (command: string, args: string[]) => {
      w.execCalls.push({ command, args })
      const result = w.execResults.get(command) ?? { code: 0 }
      if (result instanceof Error) throw result

      return { stdout: '', stderr: '', killed: false, ...result }
    },
    getActiveTools: () => w.activeTools,
    setActiveTools: async (names: string[]) => {
      w.activeTools = names
    },
  }) as never

export const makeCtx = (id = 's1') =>
  ({
    sessionManager: { getSessionId: () => id, getBranch: () => w.branch },
    cwd: '/work',
    hasUI: w.hasUI,
    isIdle: () => w.isIdle,
    setTimeout: (fn: () => void, ms: number) => w.timers.push({ fn, ms }),
    models: {
      list: () => w.models,
      resolve: (spec: string) => (spec === '@smol' ? w.smolModel : spec === '@inbox' ? w.inboxRoleModel : undefined),
    },
    modelRegistry: { getApiKey: async () => 'key' },
    ui: { notify: (message: string) => w.notices.push(message) },
    ...(w.agentKind ? { agent: { kind: w.agentKind } } : {}),
  }) as never

export const deps = (): HostDeps => ({
  stateDir: () => w.dir,
  now: () => (w.clock += 10),
  newId: (() => {
    let n = 0
    return () => `id${++n}`
  })(),
  settleWindowMs: 1000,
  home: '/home/me',
  isNextBuild: false,
  comparePage: '/omp/dist/compare-page.html',
  complete: async (model, context) => {
    const isStatusCall = context.systemPrompt?.[0] === STATUS_SYSTEM
    const call = {
      model: model as never,
      system: context.systemPrompt ?? [],
      prompt: String((context.messages[0] as { content: unknown }).content),
    }
    ;(isStatusCall ? w.statusCompletions : w.completions).push(call)
    if (isStatusCall) await w.statusHold
    const answer = isStatusCall ? w.statusReply : w.reply
    if (answer instanceof Error) throw answer

    return { stopReason: 'stop', content: [{ type: 'text', text: answer }] } as never
  },
  copy: async text => {
    w.copied.push(text)

    return null
  },
  background: work => {
    w.background.push(work.catch(() => undefined))
  },
  isUsageLimit: async (_status, message) => /usage limit/i.test(message),
  herdrPane: null,
})

export const settle = async () => {
  for (let seen = 0; seen < w.background.length;) {
    seen = w.background.length
    await Promise.all(w.background)
  }
}

export const state = (id = 's1') => JSON.parse(readFileSync(join(w.dir, 'sessions', `${id}.json`), 'utf8'))
export const call = (name: string, event: unknown, ctx: unknown = makeCtx()) => w.handlers.get(name)!(event, ctx)
export const record = (args: Record<string, unknown>, ctx: unknown = makeCtx()) =>
  w.tools.get('record').execute('call', args, undefined, undefined, ctx)
export const prompt = (text: string, ctx: unknown = makeCtx()) =>
  call('before_agent_start', { type: 'before_agent_start', prompt: text, systemPrompt: ['base'] }, ctx) as Promise<any>
export const endAgent = (text: string, extra: Record<string, unknown> = {}, ctx: unknown = makeCtx()) =>
  call(
    'agent_end',
    { type: 'agent_end', messages: [{ role: 'assistant', content: [{ type: 'text', text }] }], ...extra },
    ctx,
  )
