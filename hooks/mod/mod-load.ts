import type { Session } from '../../types'
import { childrenCutOff } from '../../core/domain/children'
import { withReplyWaitEnded } from './explanation-reply'
import { isBlankLedger } from '../../core/domain/ledger'
import { placeChange, sessionFolder } from './mod-commands'
import { isPrsTabShown, redraw, syncTheme } from './mod-drawn'
import type { Mod } from './mod-ports'
import { wakeForHeldSends } from './mod-press-run'
import { readSaved, readSettled } from './mod-saves'
import { replaceDrawn } from './mod-session-write'
import {
  broughtBack,
  conversation,
  currentOwner,
  cutOffUpdate,
  type LoadedBy,
  type SavedRecord,
  withLoadedToolFields,
  withoutRowActions,
} from './mod-sessions'
import { cancelUndoScroll, mod, paneState, sessionState } from './mod-state'
import { enterUi } from './mod-ui-loop'
import { catchUpNow } from './mod-updates'
import { upgradeState } from './mod-upgrade'
import { tabPrs } from '../../core/domain/pr-fetch'
import { upgradeSession } from '../../core/view/session-files'
import { forkedFrom, statusChanged } from '../../core/runtime/session-status'
import { cutOffTurn } from '../../core/runtime/session-turns'

/**
 * Loads the conversation `id` the session runs: at the start, and after
 * /clear, /resume or /branch, which switch conversations under a new session
 * id without a session.start.
 */
export function loadConversation(m: Mod, id: string, by: LoadedBy, forkedFrom?: string): Promise<void> {
  const revision = ++sessionState.loadRevision
  return prepareConversation(m, id, revision, by, forkedFrom)
}

async function prepareConversation(m: Mod, id: string, revision: number, by: LoadedBy, forkedFrom?: string) {
  const writesAtRead = sessionState.savedWrites
  const [sessionRoot, saved] = await Promise.all([m.conversation.root(), readSettled(m.saves, id)])
  if (revision !== sessionState.loadRevision) return
  const applying = sessionState.applyingConversation.then(async () => {
    if (revision !== sessionState.loadRevision) return
    // A write to a saved session after the read above, such as a refused Done message, is read again.
    const latest = writesAtRead === sessionState.savedWrites ? saved : await readSettled(m.saves, id)
    // A fork continues its parent's inbox, so a new id with no saved state starts from the parent's.
    const parent = latest?.session || !forkedFrom ? null : await readSettled(m.saves, forkedFrom)
    await applyConversation(m, id, revision, by, sessionRoot, latest, parent?.session)
  })
  sessionState.applyingConversation = applying.catch(() => undefined)
  return applying
}

async function applyConversation(
  m: Mod,
  id: string,
  revision: number,
  by: LoadedBy,
  sessionRoot: string,
  saved: { session: SavedRecord | undefined } | null,
  parent?: SavedRecord,
) {
  paneState.loadingRevision = revision
  try {
    await loadConversationRows(m, id, revision, by, sessionRoot, saved, parent)
  } finally {
    endConversationLoad(m, revision)
  }
}

/** The loaded conversation's rows are drawn: the controller sees the pane as it is, and opens it on them. */
function endConversationLoad(m: Mod, revision: number) {
  if (paneState.loadingRevision !== revision) return
  paneState.loadingRevision = null
  if (revision !== sessionState.loadRevision) return
  sessionState.isConversationLoading = false
  void redraw(m)
  void m.sendUi(['read']).catch(() => undefined)
}

async function loadConversationRows(
  m: Mod,
  id: string,
  revision: number,
  by: LoadedBy,
  sessionRoot: string,
  saved: { session: SavedRecord | undefined } | null,
  parent?: SavedRecord,
) {
  if (revision !== sessionState.loadRevision) return
  const isLoading = () => revision === sessionState.loadRevision && conversation.id === id
  cancelUndoScroll()
  sessionState.stopGeneration++
  sessionState.resuming = null
  conversation.id = id
  conversation.root = sessionRoot
  sessionState.isReadingAgain = false
  // A reload stops any update the previous load had running, and state outlives
  // it, so an update in flight at load was cut off: record it as failed.
  // The theme read at the start is gone after /clear, so each conversation reads it.
  const [current] = await Promise.all([upgradeState(m), syncTheme(m)])
  const loadedAt = await m.clock.now()
  // The pane now shows another conversation, so it opens on it as on a new showing.
  await enterUi(m, id)
  const turns = await m.conversation.turns().catch(() => null)
  const cutOff = (s: Session) => {
    const loaded = statusChanged(cutOffTurn(cutOffUpdate(s), loadedAt), o => childrenCutOff(o, loadedAt))

    return { ...loaded, lastActions: withReplyWaitEnded(loaded.lastActions) }
  }
  // Before notePlace's save, so this conversation is never saved with the previous one's tool fields.
  await replaceDrawn(m, s => withLoadedToolFields(cutOff(s), by, saved?.session, parent, turns))
  if (revision !== sessionState.loadRevision) return
  void notePlace(m)
  const isFresh = isBlankLedger(current)
  const isUnread =
    (await m.atoms.unreadable.update(u =>
      isLoading() ? (isFresh ? (saved === null ? id : null) : u === id ? u : null) : u,
    )) === id
  if (!isLoading()) return
  if (saved !== null) await bringBack(m, parent ?? saved.session, isLoading, parent !== undefined)
  endConversationLoad(m, revision)
  const { ledger, presence } = await m.atoms.session.read()
  const isEmpty = isBlankLedger(ledger)
  const needsCatchUp =
    presence.ledgerState !== 'current' ||
    presence.turnsStarted > presence.turnsApplied ||
    (!isUnread && isEmpty && (turns ?? 0) > 0)
  if (!isLoading()) return
  if (needsCatchUp) await catchUpNow(m)
  void m.publishStatus()
  void m.sendUi(['read']).catch(() => undefined)
  void wakeForHeldSends(m).catch(() => undefined)
  if (tabPrs(ledger).length > 0) void m.fetchPrs(false)
}

/**
 * Brings back a saved session into a conversation that has not run yet. A fork takes only its parent's ledger.
 * A message the saved session still waited on may never arrive now, so it reads unconfirmed, and its sent record is
 * dropped. A kept record would take the arrival of the same message sent again.
 */
async function bringBack(
  m: Mod,
  saved: SavedRecord | undefined,
  isLoading: () => boolean,
  isFork = false,
): Promise<void> {
  if (!saved) return
  const loaded = upgradeSession(saved)
  let isBrought = false
  await replaceDrawn(m, s => {
    isBrought = false
    if (!isLoading() || !isBlankLedger(s.ledger)) return s
    isBrought = true

    return isFork ? forkedFrom(s, loaded) : broughtBack(s, loaded)
  })
  if (isBrought && !isFork)
    await m.atoms.away.update(a => (isLoading() ? { ...a, lastActiveAt: saved.savedAt, isAway: true } : a))
}

/** Brings back a saved ledger once the store reads it again, under the turns the session ran meanwhile. */
async function restore(m: Mod, saved: SavedRecord) {
  conversation.generation += 1
  const loaded = upgradeSession(saved).ledger
  await Promise.all([
    replaceDrawn(m, s => ({
      ...s,
      ledger: { ...loaded, turn: loaded.turn + s.ledger.turn },
      lastActions: withoutRowActions(s.lastActions),
    })),
    m.sendUi([{ type: 'reset' }]),
  ])
}

export async function readAgain(m: Mod) {
  if (sessionState.isReadingAgain) return
  sessionState.isReadingAgain = true
  const id = conversation.id
  if ((await m.atoms.unreadable.read()) !== id) {
    sessionState.isReadingAgain = false
    return
  }
  await redraw(m)
  const saved = await readSaved(m.saves, id)
  if (conversation.id !== id) return
  sessionState.isReadingAgain = false
  if (saved !== null) {
    await m.atoms.unreadable.update(() => null)
    const current = (await m.atoms.session.read()).ledger
    const hasRun = current.turn !== 0 || !isBlankLedger(current)
    if (hasRun && saved.session) await restore(m, saved.session)
    else await bringBack(m, saved.session, () => conversation.id === id)
    const { ledger } = await m.atoms.session.read()
    if ((hasRun && saved.session) || (isBlankLedger(ledger) && (await m.conversation.turns().catch(() => 0)) > 0))
      await catchUpNow(m)
    void m.publishStatus()
    if (tabPrs(ledger).length > 0) void m.fetchPrs(false)
    void m.sendUi(['read']).catch(() => undefined)
  }
  await redraw(m)
}

async function notePlace(m: Mod) {
  const change = await placeNow(m)
  if (change) await m.commit(currentOwner(), change).catch(() => undefined)
}

/** The change that saves where the session runs now. Null when that folder is not known. */
export async function placeNow(m: Mod): Promise<((s: Session) => Session) | null> {
  const folder = await sessionFolder(m.commands)
  if (!folder) return null
  const left = conversation.root
  conversation.root = folder
  const saved = (await m.atoms.session.read()).place?.folder ?? null

  return placeChange(m.commands, saved, left, folder)
}

/**
 * classic.SessionStart after /clear, /resume or a fork. `$.session.id()` still names the previous conversation here,
 * so the new id comes from the event. A start with --resume also raises this, for the conversation session.start
 * already loaded.
 */
export async function conversationSwitched(m: Mod, id: string, source: 'clear' | 'resume' | 'fork') {
  if (mod.isOn && id !== conversation.id)
    await loadConversation(m, id, source, source === 'fork' ? conversation.id : undefined)
}

/** The Claude app starts a new session in a spare folder and runs SessionStart only once it moves it to the project. */
export async function sessionMoved(m: Mod) {
  const seen = conversation.root
  if (!mod.isOn || seen === '' || (await sessionFolder(m.commands)) === seen) return
  void notePlace(m)
  void isPrsTabShown(m).then(isShown => m.fetchPrs(isShown))
}
