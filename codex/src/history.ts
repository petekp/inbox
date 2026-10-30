import { forkedFrom, hasLedger, isUnseen, NO_TURN } from '../../hooks/session'
import { heardState, isTurnHeard } from './core'
import { readState } from './state'
import type { SessionState } from './state'
import type { RolloutReads, TurnRow } from './transcript'

type EarlierHistory = {
  /** The data folder, where a forked chat's parent keeps its state. */
  dir: string
  /** This hook's reads of the rollout. */
  reads: RolloutReads
  /** The folder the rollout's paths are shown relative to. */
  cwd: string
  /** The turn a hook runs in, which is not an earlier turn. */
  currentTurnId?: string
  /** False for a compaction start, which runs in the middle of a turn. */
  canMarkBehind?: boolean
  /** True for a clear start: the cleared session keeps nothing from the turns before it. */
  isCleared?: boolean
}

/** A forked chat takes the parent's ledger when the parent has one. */
async function withForkedLedger(s: SessionState, { dir, reads }: EarlierHistory): Promise<SessionState> {
  const parentId = await reads.forkedFromId()
  const parent = parentId === null ? null : await readState(dir, parentId).catch(() => null)

  return parent !== null && hasLedger(parent) ? forkedFrom(s, parent) : s
}

/** The newest turn of `rows` that ended, other than the turn a hook runs in. Null when there is none. */
function newestEndedTurn(rows: TurnRow[] | null, currentTurnId: string | undefined): string | null {
  return rows?.findLast(t => t.hasEnded && t.id !== currentTurnId)?.id ?? null
}

const holdsEndedTurn = (currentTurnId: string | undefined) => (rows: TurnRow[]) =>
  newestEndedTurn(rows, currentTurnId) !== null

/**
 * What the first sight of a session the inbox has heard nothing from takes from its rollout. A fork takes its parent's
 * ledger. A session whose rollout holds earlier turns and whose ledger is still empty, as when the plugin was turned
 * on in the middle of a conversation, is marked `behind`, and `isBehind` says an update should catch it up. The
 * rollout's newest ended turn becomes `coveredTurn`, so `withMissedTurns` counts only turns that end later. A session
 * a hook or the tab has already recorded is returned as it is.
 */
export async function withEarlierHistory(
  s: SessionState,
  history: EarlierHistory,
): Promise<{ state: SessionState; isBehind: boolean }> {
  if (heardState(s.heard) !== 'none') return { state: s, isBehind: false }
  const forked = await withForkedLedger(s, history)
  const { reads, cwd, currentTurnId, canMarkBehind = true } = history
  if (!canMarkBehind) return { state: forked, isBehind: false }
  // An unseen session reads the whole conversation, so its turns come from that same read.
  const rollout = isUnseen(forked) ? await reads.rollout(cwd, currentTurnId) : null
  const coveredTurn = newestEndedTurn(await reads.turns(holdsEndedTurn(currentTurnId)), currentTurnId)
  const covered = coveredTurn === forked.coveredTurn ? forked : { ...forked, coveredTurn }
  if ((rollout?.earlierTurns ?? 0) === 0) return { state: covered, isBehind: false }

  return { state: { ...covered, presence: { ...covered.presence, ledgerState: 'behind' } }, isBehind: true }
}

/**
 * A session the inbox has heard from, checked for turns that ended after `coveredTurn` without the inbox hearing their
 * Stop, as while Codex did not run the hooks after an update. When the rollout holds one, the ledger is marked `behind`
 * so an update catches it up over the whole conversation, and `coveredTurn` moves to the newest ended turn. A
 * `coveredTurn` the rollout does not hold counts every ended turn. The turn the inbox recorded a prompt for is dropped
 * when it is one of them, so its prompt does not join the next turn's. A compaction start checks nothing, and a clear
 * start covers every turn before it. A hook in a turn whose prompt or Stop the inbox heard checks nothing either: that
 * hook checked, and no other turn ends while this one runs.
 */
export async function withMissedTurns(
  s: SessionState,
  { reads, currentTurnId, canMarkBehind = true, isCleared = false }: EarlierHistory,
): Promise<{ state: SessionState; isBehind: boolean }> {
  const unchanged = { state: s, isBehind: false }
  const isTurnChecked = currentTurnId !== undefined && isTurnHeard(s, currentTurnId)
  if (!canMarkBehind || isTurnChecked) return unchanged
  const rows = await reads.turns(
    isCleared ? holdsEndedTurn(currentTurnId) : turns => turns.some(t => t.id === s.coveredTurn),
  )
  if (rows === null) return unchanged
  if (isCleared) return { state: { ...s, coveredTurn: newestEndedTurn(rows, currentTurnId) }, isBehind: false }
  const coveredAt = rows.findLastIndex(t => t.id === s.coveredTurn)
  const missed = rows.slice(coveredAt + 1).filter(t => t.hasEnded && t.id !== currentTurnId)
  const newest = missed.at(-1)
  if (newest === undefined) return unchanged
  const promptTurn = s.heard.promptTurns.at(-1)
  const isRecordedTurnMissed = s.turn.person !== null && missed.some(t => t.id === promptTurn)
  const { ledgerState } = s.presence

  return {
    state: {
      ...s,
      coveredTurn: newest.id,
      turn: isRecordedTurnMissed ? NO_TURN : s.turn,
      presence: { ...s.presence, ledgerState: ledgerState === 'current' ? 'behind' : ledgerState },
    },
    isBehind: true,
  }
}
