import type { Run } from './gh'

export type FeedPathSetting = string | (() => Promise<string | undefined>)

export type HerdrFeedIdentity = {
  paneId?: string
  binPath?: string
}

const HERDR_LOOKUP_TIMEOUT_MS = 5_000

/** Reads only the named agent from Herdr's read-only agent lookup response. */
function agentNameOf(output: string): string | null {
  try {
    const parsed: unknown = JSON.parse(output)
    if (!parsed || typeof parsed !== 'object') return null
    const result = (parsed as { result?: unknown }).result
    if (!result || typeof result !== 'object') return null
    const agent = (result as { agent?: unknown }).agent
    if (!agent || typeof agent !== 'object') return null
    const name = (agent as { name?: unknown }).name

    return typeof name === 'string' ? name : null
  } catch {
    return null
  }
}

/** Resolves the optional shared feed: an explicit path, or the default for the Herdr agent named `meta`. */
export async function resolveInboxFeedPath(
  explicit: string | undefined,
  home: string | undefined,
  identity: HerdrFeedIdentity,
  run: Run,
): Promise<string | undefined> {
  if (explicit !== undefined) return explicit
  if (!home || !identity.paneId) return undefined

  try {
    const result = await run([identity.binPath || 'herdr', 'agent', 'get', identity.paneId], {
      cwd: home,
      timeoutMs: HERDR_LOOKUP_TIMEOUT_MS,
    })
    if (result.code !== 0 || agentNameOf(result.stdout) !== 'meta') return undefined

    return `${home.replace(/[\\/]+$/, '')}/.local/state/inbox/feeds`
  } catch {
    return undefined
  }
}

/** Caches a host's asynchronous feed-path lookup after its first use. */
export function memoizedFeedPath(resolve: () => Promise<string | undefined>): () => Promise<string | undefined> {
  let result: Promise<string | undefined> | undefined

  return () => (result ??= resolve().catch(() => undefined))
}

export function feedPathValue(path: FeedPathSetting | undefined): Promise<string | undefined> {
  return Promise.resolve(typeof path === 'function' ? path() : path)
}
