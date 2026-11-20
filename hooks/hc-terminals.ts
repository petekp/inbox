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

/**
 * A delegate session: one that another session started to do part of its work, whose questions and tasks go to that
 * session rather than to the person. `parent` is the Herdr terminal that started it, when Herdr names one.
 */
export type DelegateSession = { parent: string | null }

/**
 * The delegate session the Herdr app terminal `target` runs, from its `hc get` labels and parent. A terminal is a
 * delegate's when it has a parent, or carries a `fleet.domain` label, unless its `fleet.role` label is `coordinator`.
 * A coordinator's own asks are the person's to answer even when another session started it. Null outside an app
 * terminal, and when no `hc` starts or its answer cannot be read.
 */
export async function delegateSession(target: HerdrTarget | null, run: Run): Promise<DelegateSession | null> {
  if (target?.kind !== 'terminal') return null
  for (const hc of target.hc) {
    const r = await run([hc, 'get', target.terminal, '--json'], { cwd: '/', timeoutMs: HC_TIMEOUT_MS })
    if (r.code === UNSTARTABLE_CODE) continue
    if (r.code !== 0) return null
    try {
      const t: { parent?: unknown; labels?: Record<string, unknown> } = JSON.parse(r.stdout)
      const parent = typeof t?.parent === 'string' && t.parent.trim() ? t.parent.trim() : null
      const domain = t?.labels?.['fleet.domain']
      const hasDomain = typeof domain === 'string' && domain.trim() !== ''
      const isCoordinator = t?.labels?.['fleet.role'] === 'coordinator'

      return !isCoordinator && (parent !== null || hasDomain) ? { parent } : null
    } catch {
      return null
    }
  }

  return null
}

/** `delegateSession` read once, at the first call. A terminal's labels and parent are set as Herdr starts it. */
export function delegateReader(target: HerdrTarget | null, run: Run): () => Promise<DelegateSession | null> {
  let read: Promise<DelegateSession | null> | null = null

  return () => (read ??= delegateSession(target, run).catch(() => null))
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
