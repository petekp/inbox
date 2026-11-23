import { addsTabPr, untriedPrs } from '../../core/runtime/host-prs'
import type { SessionState } from './state'

type TabLinks = Pick<SessionState, 'ledger' | 'prViews'>

/**
 * Reads the PRs when a save another process made, such as a hook's, puts a PR on the tab, as `addsTabPr` says. The
 * hook process links the PRs a reply or a command names and starts no read, and in a Herdr app terminal no view may
 * come to ask for one. `saved` notes each state this server saved, which reads its own new PRs. `heard` reads a
 * session's saved state and compares it with the last state noted or read. A session heard of for the first time reads
 * its PRs when a PR on its tab has no view and no `unread` entry, as after the server was restarted.
 */
export function linkedPrReads(read: (id: string) => Promise<TabLinks>, fetchPrsNow: (id: string) => void) {
  const seen = new Map<string, TabLinks>()
  const reading = new Map<string, Promise<void>>()
  const isHeardAgain = new Set<string>()

  async function compare(id: string) {
    const s = await read(id)
    const before = seen.get(id)
    seen.set(id, s)
    const addsPr = before ? addsTabPr(before, s) : untriedPrs(s).length > 0
    if (addsPr) fetchPrsNow(id)
  }

  /** Each session's reads run one at a time, so an older read never replaces a newer one. */
  function heard(id: string): Promise<void> {
    const current = reading.get(id)
    if (current) {
      isHeardAgain.add(id)
      return current
    }
    const run = (async () => {
      do {
        isHeardAgain.delete(id)
        await compare(id).catch(() => undefined)
      } while (isHeardAgain.has(id))
    })().finally(() => reading.delete(id))
    reading.set(id, run)

    return run
  }

  return { saved: (s: SessionState) => void seen.set(s.sessionId, s), heard }
}
