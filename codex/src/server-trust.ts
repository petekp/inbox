import { homedir } from 'node:os'

import { isTurnHeard } from './core'
import type { HooksTrust } from '../../core/view/hooks-trust'
import { codexStore } from './host'
import type { ServerDeps } from './server'
import type { SessionState } from './state'

/** How long a failed or unclear answer about the hooks' trust stands before a view asks Codex again. */
const HOOKS_UNCLEAR_CACHE_MS = 30_000
/** How long an answer that Codex does not run the hooks stands, so its notice leaves soon after the person trusts them. */
const HOOKS_STOPPED_CACHE_MS = 5_000

/** When the chat last heard one of the inbox's hooks, or -Infinity when it heard none. */
const lastHookAt = (s: SessionState): number =>
  Math.max(...[s.heard.startAt, s.heard.promptAt, s.heard.stopAt].map(at => at ?? -Infinity))

export function makeHooksTrustNow(
  deps: ServerDeps,
  newestTurns: Map<string, string>,
  track: (work: Promise<unknown>) => void,
) {
  const { now } = deps
  /** Codex's last answer about the hooks' trust in each chat folder, with when it was asked for. */
  const hooksTrust = new Map<string, { at: number; askedAt: number; answer: HooksTrust | 'trusted' | null }>()
  const askingHooksIn = new Set<string>()
  /** The unheard turn each chat last asked about. */
  const askedTurns = new Map<string, string>()

  /**
   * Saves a clear answer to the chat when it differs from the one it holds, so the chat's Herdr publish carries it. A
   * failed or unclear answer keeps what the chat holds. So does an answer that the hooks do not run, asked for before
   * the chat's last hook ran, since that hook shows they run.
   */
  async function saveTrust(id: string, answer: HooksTrust | 'trusted' | null, askedAt: number): Promise<void> {
    if (answer === null) return
    const trust = answer === 'trusted' ? undefined : answer
    const isSaved = (s: SessionState) => s.hooksTrust === trust || (trust !== undefined && lastHookAt(s) >= askedAt)
    const store = codexStore(deps.dir, id, now, deps.onWrite)
    if (isSaved(await store.read())) return
    await store.update(s => {
      if (isSaved(s)) return s
      const { hooksTrust: _old, ...rest } = s
      return trust ? { ...rest, hooksTrust: trust } : rest
    })
  }

  /** The chat's newest turn, when the inbox heard neither its prompt nor its Stop, as while Codex skips the hooks. */
  function unheardTurnOf(s: SessionState, id: string): string | null {
    const newest = newestTurns.get(id)

    return newest === undefined || isTurnHeard(s, newest) ? null : newest
  }

  /**
   * Why Codex does not run the inbox's hooks in the chat's folder, from the last answer. A view starts a new call for
   * the next view to read, so no view waits on it: on a folder's first view, a few seconds after a stopped answer, a
   * while after a failed or unclear one, and after a trusted one only once the chat's view sees a turn the hooks did not
   * hear. Each chat asks once per such turn, so chats in one folder never ask in turn after each other. A plugin update,
   * which stops the hooks, also loads a new handler, whose first view asks again. A failed or unclear answer reads as
   * null.
   */
  function hooksTrustNow(s: SessionState, id: string): HooksTrust | null {
    const { hooksTrust: ask } = deps
    if (!ask) return null
    const folder = s.root || homedir()
    const known = hooksTrust.get(folder)
    const unheardTurn = unheardTurnOf(s, id)
    const isAskDue =
      known === undefined ||
      (known.answer === 'trusted'
        ? unheardTurn !== null && askedTurns.get(id) !== unheardTurn
        : now() - known.at >= (known.answer === null ? HOOKS_UNCLEAR_CACHE_MS : HOOKS_STOPPED_CACHE_MS))
    if (isAskDue && !askingHooksIn.has(folder)) {
      askingHooksIn.add(folder)
      if (unheardTurn !== null) askedTurns.set(id, unheardTurn)
      const askedAt = now()
      track(
        (async () => {
          const answer = await Promise.resolve(s.cliPath ?? deps.fallbackCli())
            .then(cli => ask(cli, folder))
            .catch(() => null)
          hooksTrust.set(folder, { at: now(), askedAt, answer })
          askingHooksIn.delete(folder)
          await saveTrust(id, answer, askedAt)
        })(),
      )
    }
    const answer = known?.answer
    if (
      known &&
      answer !== undefined &&
      answer !== null &&
      (answer === 'trusted' ? undefined : answer) !== s.hooksTrust
    )
      track(saveTrust(id, answer, known.askedAt))

    return answer === 'untrusted' || answer === 'modified' ? answer : null
  }

  return hooksTrustNow
}
