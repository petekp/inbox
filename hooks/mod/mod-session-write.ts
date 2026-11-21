import type { Ledger, Session } from '../../types'
import { readUi } from './mod-drawn'
import { withHistory } from './mod-history'
import type { Mod } from './mod-ports'
import { changeSaved, save } from './mod-saves'
import { type Changed, currentOwner, isCurrent, MAX_TRIES, type ModSession, type Owner } from './mod-sessions'
import { upgradeSession } from '../../core/view/session-files'
import { pruned } from '../../core/runtime/session-presses'
import { heldReplies } from '../../core/view/timing'
import { viewerLeases } from './mod-state'

type SessionWriteCalls = Pick<
  Mod,
  'atoms' | 'writeSession' | 'clock' | 'pane' | 'saves' | 'history' | 'commit' | 'sendUi' | 'publishStatus' | 'syncLook'
>

/**
 * Replaces the drawn session outside the write loop, as a conversation switch or load does. A change that returns
 * the session it was given writes nothing.
 */
export async function replaceDrawn(
  m: Pick<Mod, 'writeSession'> & { atoms: Pick<Mod['atoms'], 'session'> },
  change: (s: ModSession) => Session,
): Promise<ModSession> {
  const cur = await m.atoms.session.read()
  if (change(cur) === cur) return cur

  return m.writeSession(s => ({ ...change(s), revision: s.revision + 1 }))
}

/**
 * Changes the session of `owner`. While its conversation is drawn, the change runs on the drawn session and is
 * written only if no other write landed meanwhile; otherwise it runs again on what landed. Once the conversation
 * moved on, the change goes to its saved session. A change that returns the session it was given writes nothing.
 * Every write saves the pane's `held` rows and its showing of the real session, and prunes the session with `pruned`.
 * A write that changes more than the running turn saves.
 */
export async function changeSession(
  m: SessionWriteCalls,
  owner: Owner,
  change: (s: Session) => Session | Promise<Session>,
  held: Set<string>,
): Promise<Changed> {
  change = withHistory(m.history, owner.id, change)
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    if (!isCurrent(owner)) return changeSaved(m.saves, owner.id, change)
    const drawn = await m.atoms.session.read()
    // A hot reload can leave a session an earlier build wrote. The fetch that is running still runs.
    const upgraded = upgradeSession(drawn)
    const before = { ...upgraded, prViews: { ...upgraded.prViews, isFetching: drawn.prViews.isFetching } }
    const changed = await change(before)
    if (changed === before) return { before, after: before, isDrawn: true }
    // A resume drops the running turn, so a write that changes only the turn, such as each tool call's activity,
    // leaves the saved copy alone.
    const isTurnOnly = (Object.keys(changed) as (keyof Session)[]).every(k => k === 'turn' || changed[k] === before[k])
    const [ui, demo] = await Promise.all([readUi(m), m.atoms.demo.read()])
    const leases = viewerLeases.peek(owner.id)
    const kept = pruned(
      { ...changed, heldRows: [...held], shownSince: demo === null ? ui.shownSince : null },
      Object.keys(leases).length > 0 ? await m.clock.now() : 0,
      leases,
    )
    let landed: ModSession | null = null
    await m.writeSession(cur => {
      if (!isCurrent(owner) || cur.revision !== drawn.revision) {
        landed = null
        return cur
      }
      landed = { ...kept, revision: drawn.revision + 1 }
      return landed
    })
    const written = landed as ModSession | null
    if (!written) continue
    if (!isTurnOnly && (await m.atoms.unreadable.read()) !== owner.id) await save(m.saves, owner, written)
    return { before, after: written, isDrawn: isCurrent(owner) }
  }
  throw new Error('The session kept changing under this write.')
}

/**
 * Changes `owner`'s session, keeping the rows the person replies on. After a write to the drawn session, the status
 * line follows it, rows that just closed redraw as they leave, and the pane moves to rows that arrived.
 */
export async function commit(
  m: SessionWriteCalls,
  owner: Owner,
  change: (s: Session) => Session | Promise<Session>,
): Promise<Session> {
  const ui = await readUi(m)
  const { before, after, isDrawn } = await changeSession(
    m,
    owner,
    change,
    new Set(Object.keys(heldReplies(ui.typing, ui.drafts))),
  )
  if (!isDrawn || after === before) return after
  if (before.ledger.overview === null && after.ledger.overview !== null) void m.syncLook()
  void m.publishStatus()
  void m.sendUi(['read'])

  return after
}

/** Changes the ledger of `owner`'s session. */
export function commitLedger(
  m: Pick<Mod, 'commit'>,
  change: (l: Ledger) => Ledger,
  owner: Owner = currentOwner(),
): Promise<Session> {
  return m.commit(owner, s => ({ ...s, ledger: change(s.ledger) }))
}
