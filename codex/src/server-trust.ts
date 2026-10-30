import { homedir } from 'node:os'

import { isTurnHeard } from './core'
import type { HooksTrust } from './hook-trust'
import type { ServerDeps } from './server'
import type { SessionState } from './state'

/** How long a failed or unclear answer about the hooks' trust stands before a view asks Codex again. */
const HOOKS_UNCLEAR_CACHE_MS = 30_000
/** How long an answer that Codex does not run the hooks stands, so its notice leaves soon after the person trusts them. */
const HOOKS_STOPPED_CACHE_MS = 5_000

export function makeHooksTrustNow(deps: ServerDeps, newestTurns: Map<string, string>) {
  const { now } = deps
  /** Codex's last answer about the hooks' trust in each chat folder. */
  const hooksTrust = new Map<string, { at: number; answer: HooksTrust | 'trusted' | null }>()
  const askingHooksIn = new Set<string>()
  /** The unheard turn each chat last asked about. */
  const askedTurns = new Map<string, string>()

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
      void (async () => {
        const answer = await Promise.resolve(s.cliPath ?? deps.fallbackCli())
          .then(cli => ask(cli, folder))
          .catch(() => null)
        hooksTrust.set(folder, { at: now(), answer })
        askingHooksIn.delete(folder)
      })()
    }
    const answer = known?.answer

    return answer === 'untrusted' || answer === 'modified' ? answer : null
  }

  return hooksTrustNow
}
