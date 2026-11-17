import { UNSTARTABLE_CODE } from './gh'
import type { Run } from './gh'
import type { HerdrAgent, HerdrStatus, HerdrTarget } from './herdr'

const HC_TIMEOUT_MS = 5000

const HC_STATUSES: readonly HerdrStatus[] = ['idle', 'working', 'blocked', 'done']

/** A terminal `hc` reports as blocked on the person: a question, an approval, or an error. */
const HC_BLOCKED = new Set(['blocked', 'error'])

/** The label a terminal's inbox publishes its Status focus under. */
const FOCUS_LABEL = 'inbox.focus'

/**
 * The agents `hc ls` lists as children of the Herdr app terminal this session runs in, by name, or by address when a
 * terminal has none. Each the Status holds as running takes the focus its own inbox published and the last note it
 * reported, from `hc get`, so a finished or unknown terminal costs no call. Null
 * when no `hc` starts or its answer cannot be read. `hc` finds its core from the terminal's environment, so the command
 * runs in `/`, which always exists.
 */
export async function delegatesInHc(
  target: Extract<HerdrTarget, { kind: 'terminal' }>,
  run: Run,
  isRunning: (name: string) => boolean,
): Promise<Map<string, HerdrAgent> | null> {
  for (const hc of target.hc) {
    const r = await run([hc, 'ls', '--json'], { cwd: '/', timeoutMs: HC_TIMEOUT_MS })
    if (r.code === UNSTARTABLE_CODE) continue
    const listed = r.code === 0 ? childAgents(r.stdout, target.terminal) : null
    if (listed === null) return null
    const detailed = await Promise.all(
      [...listed].map(
        async ([key, { address, agent }]) =>
          [key, isRunning(key) ? { ...agent, ...(await described(hc, address, run)) } : agent] as const,
      ),
    )

    return new Map(detailed)
  }

  return null
}

/** What `hc get` says about a terminal beyond its status: the focus its inbox published and its last note. */
async function described(hc: string, address: string, run: Run): Promise<Pick<HerdrAgent, 'focus' | 'note'>> {
  const r = await run([hc, 'get', address, '--json'], { cwd: '/', timeoutMs: HC_TIMEOUT_MS })
  if (r.code !== 0) return { focus: null, note: null }
  try {
    const t: { labels?: Record<string, unknown>; status?: { msg?: unknown } } = JSON.parse(r.stdout)
    const focus = t?.labels?.[FOCUS_LABEL]
    const note = t?.status?.msg

    return {
      focus: typeof focus === 'string' && focus.trim() ? focus.trim() : null,
      note: typeof note === 'string' && note.trim() ? note.trim() : null,
    }
  } catch {
    return { focus: null, note: null }
  }
}

type ListedTerminal = { address?: unknown; name?: unknown; parent?: unknown; status?: unknown }

/**
 * Each terminal in `hc ls --json` output that has `parent` as its parent and a status, so a shell or another program
 * never counts, with its address. Null when `stdout` is not that output.
 */
function childAgents(stdout: string, parent: string): Map<string, { address: string; agent: HerdrAgent }> | null {
  try {
    const terminals: unknown = JSON.parse(stdout)?.terminals
    if (!Array.isArray(terminals)) return null
    const agents = new Map<string, { address: string; agent: HerdrAgent }>()
    for (const t of terminals as ListedTerminal[]) {
      const key = typeof t?.name === 'string' && t.name ? t.name : t?.address
      if (
        typeof key !== 'string' ||
        typeof t.address !== 'string' ||
        t.parent !== parent ||
        typeof t.status !== 'string'
      )
        continue
      const status = HC_BLOCKED.has(t.status) ? 'blocked' : (HC_STATUSES.find(s => s === t.status) ?? 'unknown')
      agents.set(key, { address: t.address, agent: { status, focus: null, isChild: true } })
    }

    return agents
  } catch {
    return null
  }
}
