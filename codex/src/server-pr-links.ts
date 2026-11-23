import { untriedPrs } from '../../core/runtime/host-prs'
import type { SessionState } from './state'

type TabLinks = Pick<SessionState, 'ledger' | 'prViews'>

/**
 * Reads the PRs when a saved state shows a PR on the tab that no read has tried, as after a hook linked the PRs a reply
 * or a command names. The hook process starts no read, and in a Herdr app terminal no view may come to ask for one.
 * Each such PR is asked for once, until a save shows its view or its `unread` entry. `asked` notes the PRs a read the
 * server starts itself covers. `heard` reads a session's saved state and reads the PRs for those not asked for yet.
 */
export function linkedPrReads(read: (id: string) => Promise<TabLinks>, fetchPrsNow: (id: string) => void) {
  const askedFor = new Map<string, Set<string>>()
  const reading = new Map<string, Promise<void>>()
  const isHeardAgain = new Set<string>()

  /** Notes the untried PRs `s` shows as asked for, and says whether any was not yet. */
  function ask(id: string, s: TabLinks): boolean {
    const asked = askedFor.get(id) ?? new Set<string>()
    askedFor.set(id, asked)
    const { views, unread = {} } = s.prViews
    for (const ref of asked) if (ref in views || ref in unread) asked.delete(ref)
    const fresh = untriedPrs(s).filter(ref => !asked.has(ref))
    for (const ref of fresh) asked.add(ref)

    return fresh.length > 0
  }

  /** Each session's reads run one at a time, in the order the saves came. */
  function heard(id: string): Promise<void> {
    const current = reading.get(id)
    if (current) {
      isHeardAgain.add(id)
      return current
    }
    const run = (async () => {
      do {
        isHeardAgain.delete(id)
        await read(id)
          .then(s => ask(id, s) && fetchPrsNow(id))
          .catch(() => undefined)
      } while (isHeardAgain.has(id))
    })().finally(() => reading.delete(id))
    reading.set(id, run)

    return run
  }

  return { asked: (s: SessionState) => void ask(s.sessionId, s), heard }
}
