import type { AgentTool } from '../hooks/tools'
import type { Ledger } from '../types'

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
  /** Files to put in the folder the agent runs in, by path within it. */
  files?: Record<string, string>
  prompt: string
  checks: Check[]
  min?: Partial<Record<Agent, number>>
  /** The agents that run the case, when not all of them do. */
  agents?: Agent[]
}

export type Call = { tool: string; args: Record<string, unknown>; result: string }

/**
 * `error`: why the run could not be graded. `model`: the model that answered, as the agent reported it. `raw`: the
 * agent's own output, kept in the results as the evidence for each verdict.
 */
export type Outcome = { reply: string; calls: Call[]; error: string | null; model: string | null; raw: string }

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
      const mine = o.calls.filter(
        call =>
          call.tool === c.calls &&
          (!c.kind || has(`^(?:${c.kind})$`, String(call.args.kind ?? ''))) &&
          Object.entries(c.match ?? {}).every(([k, p]) => has(p, String(call.args[k] ?? ''))) &&
          (!c.result || has(c.result, call.result)) &&
          (c.has ?? []).every(k => {
            const v = call.args[k]
            return Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim() !== ''
          }),
      )
      const label = `${c.calls}${c.kind ? ` ${c.kind}` : ''}${c.match ? ` ${JSON.stringify(c.match)}` : ''}${c.has ? ` with ${c.has.join(', ')}` : ''}${c.result ? ` answered /${c.result}/` : ''}`
      const exact = c.count
      const min = exact ?? c.min ?? (c.max === undefined ? 1 : 0)
      const max = exact ?? c.max ?? Infinity
      if (mine.length < min || mine.length > max)
        out.push(
          `${mine.length} ${label} calls, want ${exact ?? `${min}${max === Infinity ? '+' : `-${max}`}`}; calls: ${
            o.calls.map(x => `${x.tool}(${JSON.stringify(x.args)}) → ${x.result}`).join(' ') || 'none'
          }`,
        )
    }
  }

  return out
}
