import { UNSTARTABLE_CODE } from './gh'
import type { Run } from './gh'
import type { HerdrAgent, HerdrStatus, HerdrTarget } from './herdr'

const HC_TIMEOUT_MS = 5000

const HC_STATUSES: readonly HerdrStatus[] = ['idle', 'working', 'blocked', 'done']

/** A terminal `hc` reports as blocked on the person: a question, an approval, or an error. */
const HC_BLOCKED = new Set(['blocked', 'error'])

/**
 * The agents `hc ls` lists as children of the Herdr app terminal this session runs in, by name, or by address when a
 * terminal has none. Null when no `hc` starts or its answer cannot be read. `hc` finds its core from the terminal's
 * environment, so the command runs in `/`, which always exists.
 */
export async function delegatesInHc(
  target: Extract<HerdrTarget, { kind: 'terminal' }>,
  run: Run,
): Promise<Map<string, HerdrAgent> | null> {
  for (const hc of target.hc) {
    const r = await run([hc, 'ls', '--json'], { cwd: '/', timeoutMs: HC_TIMEOUT_MS })
    if (r.code === UNSTARTABLE_CODE) continue

    return r.code === 0 ? childAgents(r.stdout, target.terminal) : null
  }

  return null
}

type ListedTerminal = { address?: unknown; name?: unknown; parent?: unknown; status?: unknown }

/**
 * Each terminal in `hc ls --json` output that has `parent` as its parent and a status, so a shell or another program
 * never counts. Null when `stdout` is not that output.
 */
function childAgents(stdout: string, parent: string): Map<string, HerdrAgent> | null {
  try {
    const terminals: unknown = JSON.parse(stdout)?.terminals
    if (!Array.isArray(terminals)) return null
    const agents = new Map<string, HerdrAgent>()
    for (const t of terminals as ListedTerminal[]) {
      const key = typeof t?.name === 'string' && t.name ? t.name : t?.address
      if (typeof key !== 'string' || t.parent !== parent || typeof t.status !== 'string') continue
      const status = HC_BLOCKED.has(t.status) ? 'blocked' : (HC_STATUSES.find(s => s === t.status) ?? 'unknown')
      agents.set(key, { status, focus: null, isChild: true })
    }

    return agents
  } catch {
    return null
  }
}
