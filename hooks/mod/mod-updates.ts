import type { Ledger } from '../../types'
import { heardCall } from '../../core/runtime/call-record'
import { catchUpPrompt, transcriptCatchUpPrompt } from '../../core/domain/catch-up-text'
import { transcriptText } from './claude'
import { callReport } from './inbox-model'
import { systemText } from '../../core/domain/ledger-prompt'
import { screen } from './mod-drawn'
import { statusRecords } from './mod-engine-calls'
import { modDelegate } from './mod-herdr'
import { askInboxModel } from './mod-host'
import type { Mod } from './mod-ports'
import { currentOwner, isCurrent, type Owner, resultsOrder } from './mod-sessions'
import { mod } from './mod-state'
import { CLAUDE_CODE } from '../../core/domain/model-text'
import { type Ask, CATCH_UP_CALL, type CatchUpReply, runUpdates } from '../../core/runtime/session-host'
import { claimedStatusRefresh } from '../../core/runtime/session-status'
import { noteActivity as noteTurnActivity } from '../../core/runtime/session-turns'
import { refreshStatus, type StatusCall, type StatusRecords } from '../../core/runtime/status-records'

type UpdateCalls = Pick<
  Mod,
  | 'atoms'
  | 'clock'
  | 'pane'
  | 'conversation'
  | 'model'
  | 'saves'
  | 'history'
  | 'commands'
  | 'herdr'
  | 'pluginRoot'
  | 'commit'
  | 'sendUi'
  | 'publishStatus'
  | 'syncLook'
  | 'hostOf'
  | 'fetchPrs'
>

/** Notes the main agent's activity, and runs the Status call when the running turn is due one. */
export async function noteActivity(m: UpdateCalls, line: string) {
  const owner = currentOwner()
  const now = await m.clock.now()
  let isClaimed = false
  await m
    .commit(owner, s => {
      const noted = noteTurnActivity(s, line)
      const claimed = claimedStatusRefresh(noted, now)
      isClaimed = claimed !== noted
      return claimed
    })
    .catch(() => undefined)
  if (isClaimed)
    void refreshStatus({
      ...m.hostOf(owner),
      names: CLAUDE_CODE,
      inOrder: fn => resultsOrder.run(owner.id, fn),
      records: recordsOf(m, owner),
    })
}

function catchUpStatus(m: UpdateCalls, owner: Owner, transcript: string): StatusCall {
  return {
    exchange: { kind: 'catch-up', conversation: transcript },
    ask: async (prompt, system, _kind, report) =>
      isCurrent(owner) ? askInboxModel(m, prompt, system, 90_000, report) : null,
  }
}

/**
 * The model's answer to a catch-up over the whole conversation: from a fork of it, or from the transcript when there
 * is nothing to fork.
 */
async function catchUpReply(m: UpdateCalls, owner: Owner): Promise<CatchUpReply> {
  if (!isCurrent(owner)) return { kind: 'failed', heard: null }
  const [{ ledger }, shown, transcript] = await Promise.all([
    m.atoms.session.read(),
    screen(m),
    m.conversation.messages().then(transcriptText),
  ])
  // The Status call reads the transcript.
  const statusCall = transcript ? catchUpStatus(m, owner, transcript) : null
  const forkedAt = await m.clock.now()
  const forked = await m.model.fork({ prompt: catchUpPrompt(CLAUDE_CODE, ledger, shown), effort: 'low' })
  if (!isCurrent(owner)) return { kind: 'failed', heard: null }
  // A fork has nothing to read until this process sends its first request,
  // as after a resume. The model then reads the transcript instead, uncached.
  if (!forked.isAnswered && forked.reason === 'nothing-to-fork')
    return transcriptReply(m, owner, ledger, shown, transcript)
  const text = forked.isAnswered ? forked.text : null
  const heard = { text, report: callReport(forked, null), thrown: null, ms: (await m.clock.now()) - forkedAt }

  return text === null ? { kind: 'failed', heard } : { kind: 'reply', text, source: null, statusCall, heard }
}

/** The model's answer to a catch-up over the transcript, for a conversation with nothing to fork. */
async function transcriptReply(
  m: UpdateCalls,
  owner: Owner,
  ledger: Ledger,
  shown: string,
  transcript: string | null,
): Promise<CatchUpReply> {
  if (!transcript) return { kind: 'unreadable' }
  const statusCall = catchUpStatus(m, owner, transcript)
  const prompt = transcriptCatchUpPrompt(ledger, shown, transcript)
  const ask: Ask = (p, system, _kind, report) => askInboxModel(m, p, system, 90_000, report)
  const heard = await heardCall(ask, prompt, systemText(CLAUDE_CODE), CATCH_UP_CALL, () => m.clock.now())
  if (!isCurrent(owner)) return { kind: 'failed', heard: null }

  return heard.text === null
    ? { kind: 'failed', heard }
    : { kind: 'reply', text: heard.text, source: transcript, statusCall, heard }
}

/**
 * Marks the ledger `behind` so the next update catches up over the whole conversation, then runs it. A load calls
 * this when the ledger may have missed turns.
 */
export async function catchUpNow(m: UpdateCalls) {
  await m.commit(currentOwner(), s =>
    s.presence.ledgerState === 'current' ? { ...s, presence: { ...s.presence, ledgerState: 'behind' } } : s,
  )
  updateLedger(m)
}

/**
 * Runs the per-reply update for the conversation, one at a time: the pending exchanges, or a catch-up when the
 * ledger may have missed a turn, as after a failed update or a reload that cut one off.
 */
export function updateLedger(m: UpdateCalls) {
  const owner = currentOwner()
  mod.queue = mod.queue.then(async () => {
    if (!isCurrent(owner)) return
    await runUpdates({
      ...m.hostOf(owner),
      names: CLAUDE_CODE,
      delegate: () => modDelegate(m.herdr),
      catchUp: () => catchUpReply(m, owner),
      inOrder: fn => resultsOrder.run(owner.id, fn),
      background: statuses => void statuses,
      records: recordsOf(m, owner),
    })
    if (isCurrent(owner)) void m.publishStatus()
  })
  // A rejected link would skip every later update, so the chain swallows it.
  mod.queue = mod.queue.catch(() => undefined)
}

function recordsOf(m: UpdateCalls, owner: Owner): StatusRecords | undefined {
  return mod.statusRecordsFolder === null ? undefined : statusRecords(m.commands, mod.statusRecordsFolder, owner)
}
