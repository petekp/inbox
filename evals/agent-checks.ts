import type { DelegateSession } from '../hooks/hc-terminals'
import type { AgentTool } from '../hooks/tools'
import type { LastAction, Ledger } from '../types'
import type { CaseAnswer } from './case-history'
import type { CaseTools } from './probe-tools'

export type Agent = 'claude' | 'codex' | 'omp'

/** Patterns are case-insensitive regular expressions. */
type Check =
  | {
      calls: AgentTool
      /** Matches the call's `kind`, as a whole. */
      kind?: string
      /** Matches each named argument. */
      match?: Record<string, string>
      /** Arguments that must be non-empty. */
      has?: string[]
      /** Matches the tool's answer. */
      result?: string
      /** Exactly this many matching calls. Without `count` and `max`, at least `min` (default 1). */
      count?: number
      min?: number
      max?: number
      /** Count items instead of calls: recording the same kind and ask again updates that item, so it counts once. */
      items?: true
    }
  | { reply: string }
  | { notReply: string }
  /** No inbox id, such as i3 or f112, in the reply. Ids are lowercase, so "F1" is not one. */
  | { noIds: true }

export type Case = {
  name: string
  about: string
  /** The inbox the agent is shown. */
  ledger?: Partial<Ledger>
  /** The inbox the tools answer from, when it differs from what the agent was shown. */
  toolLedger?: Partial<Ledger>
  /** The person's latest press on each row, by row id, as the tools see it. */
  lastActions?: Record<string, LastAction>
  /** Files to put in the folder the agent runs in, by path within it. */
  files?: Record<string, string>
  /** Scripts for an agent with a shell, by command name, in a folder at the front of its `PATH`. */
  bin?: Record<string, string>
  prompt: string
  checks: Check[]
  min?: Partial<Record<Agent, number>>
  /** The agents that run the case, when not all of them do. */
  agents?: Agent[]
  /** The inbox tools the agent has, when not this build's, as `evals/probe-tools.ts:probeTools` gives them. */
  tools?: CaseTools
  /** The delegate session the agent runs as, which the tools answer for. Without it, the agent runs as no delegate. */
  delegate?: DelegateSession
  /** Answers the person gave before, which the `record` answer lists for a question like them. */
  history?: CaseAnswer[]
}

export type Call = { tool: string; args: Record<string, unknown>; result: string }

/**
 * `error`: why the run could not be graded. `model`: the model that answered, as the agent reported it. `raw`: the
 * agent's own output, kept in the results as the evidence for each verdict.
 */
export type Outcome = {
  reply: string
  calls: Call[]
  error: string | null
  model: string | null
  raw: string
}

/** The item a call is about: a record's kind and ask. Any other call stands alone. */
function itemKey(call: Call, n: number): string {
  const ask =
    call.tool === 'record'
      ? String(call.args.ask ?? call.args.title ?? '')
          .trim()
          .toLowerCase()
      : ''

  return ask === '' ? `#${n}` : `${String(call.args.kind)}\n${ask}`
}

export function failures(o: Outcome, checks: Check[]): string[] {
  const has = (pattern: string, text: string) => new RegExp(pattern, 'i').test(text)
  const out: string[] = []
  for (const c of checks) {
    if ('reply' in c) {
      if (!has(c.reply, o.reply)) out.push(`reply lacks /${c.reply}/`)
    } else if ('notReply' in c) {
      const m = o.reply.match(new RegExp(c.notReply, 'i'))
      if (m) out.push(`reply has "${m[0]}"`)
    } else if ('noIds' in c) {
      const m = o.reply.match(/\b[if]\d+\b/)
      if (m) out.push(`reply has the id "${m[0]}"`)
    } else {
      const fits = (call: Call) =>
        call.tool === c.calls &&
        (!c.kind || has(`^(?:${c.kind})$`, String(call.args.kind ?? ''))) &&
        Object.entries(c.match ?? {}).every(([k, p]) => has(p, String(call.args[k] ?? ''))) &&
        (!c.result || has(c.result, call.result)) &&
        (c.has ?? []).every(k => {
          const v = call.args[k]
          return Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim() !== ''
        })
      const mine = new Set(o.calls.flatMap((call, n) => (fits(call) ? [c.items ? itemKey(call, n) : `#${n}`] : [])))
      const label = `${c.calls}${c.kind ? ` ${c.kind}` : ''}${c.match ? ` ${JSON.stringify(c.match)}` : ''}${c.has ? ` with ${c.has.join(', ')}` : ''}${c.result ? ` answered /${c.result}/` : ''}`
      const exact = c.count
      const min = exact ?? c.min ?? (c.max === undefined ? 1 : 0)
      const max = exact ?? c.max ?? Infinity
      if (mine.size < min || mine.size > max)
        out.push(
          `${mine.size} ${label} ${c.items ? 'items' : 'calls'}, want ${exact ?? `${min}${max === Infinity ? '+' : `-${max}`}`}; calls: ${
            o.calls.map(x => `${x.tool}(${JSON.stringify(x.args)}) → ${x.result}`).join(' ') || 'none'
          }`,
        )
    }
  }

  return out
}
