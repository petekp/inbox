import type { Hook } from 'claude-code'

import type { Stop } from '../../types'
import { RESUME_TEXT } from '../../core/view/banners'
import { delegatesSettled, subagentsSettled } from '../../core/domain/children'
import { resetTime, stopKindOf, stopOfMessage } from './claude'
import { withApiError } from '../../core/domain/stops'
import { withReplyWaitEnded } from './explanation-reply'
import { addsTabPr, isPrFetchDue } from '../../core/runtime/host-prs'
import { closeDialogs } from './mod-dialogs'
import { isPaneShown, isPrsTabShown, redraw, shownScreenTab } from './mod-drawn'
import { delegatesAsked } from './mod-herdr'
import { deliver } from './mod-host'
import { placeNow } from './mod-load'
import type { Mod } from './mod-ports'
import { wakeAfterSettle } from './mod-press-run'
import { askedCalls } from './mod-records'
import { currentOwner, isCurrent } from './mod-sessions'
import { mod, resetTurn, sessionState } from './mod-state'
import { noteAgentWork } from './mod-tool-calls'
import { updateLedger } from './mod-updates'
import { CLAUDE_CODE } from '../../core/domain/model-text'
import { tabPrs } from '../../core/domain/pr-fetch'
import { upgradeSession } from '../../core/view/session-files'
import { statusChanged } from '../../core/runtime/session-status'
import { endTurn, startTurn, turnEnded, turnStarted } from '../../core/runtime/session-turns'
import { turnReply } from '../../core/domain/text'

type StopFailureEvent = Parameters<Hook<'classic.StopFailure'>>[1]
type TurnCompleteEvent = Parameters<Hook<'turn.complete'>>[1]

export async function setStop(m: Mod, stop: Stop | null) {
  if (stop === null && (await m.atoms.session.read()).stop === null) return
  sessionState.stopGeneration++
  sessionState.resuming = null
  await m.commit(currentOwner(), s => ({ ...s, stop }))
  void m.publishStatus()
}

/** Sets the stop from the error text the transcript ends on, where no StopFailure hook ran. */
async function setStopFromLastReply(m: Mod) {
  const last = (await m.conversation.messages().catch(() => [])).at(-1)
  const message = last?.role === 'assistant' ? last.text : ''
  await setStop(m, withApiError({ ...stopOfMessage(message), at: await m.clock.now() }))
}

export async function resume(m: Mod) {
  // [Resume] keeps its key while it reads "Resuming…", so a second press lands here.
  if (sessionState.resuming?.is === 'sending') return
  const owner = currentOwner()
  const generation = sessionState.stopGeneration
  const isSameStop = () => isCurrent(owner) && generation === sessionState.stopGeneration
  sessionState.resuming = { is: 'sending' }
  await redraw(m)
  if (!isSameStop()) return
  const sent = await deliver(m, owner, RESUME_TEXT, crypto.randomUUID())
  if (sent.state === 'rejected' && isSameStop()) {
    sessionState.resuming = { is: 'refused', why: sent.reason }
    await redraw(m)
  }
}

/** A turn starts. A subagent's turn counts as its work, and the main agent's turn is counted before it can end. */
export async function noteTurnStart(m: Mod, agentId: string | undefined) {
  if (agentId) {
    if (mod.isOn) await noteAgentWork(m, agentId)
    return
  }
  resetTurn()
  sessionState.hasStopFromError = false
  // Counted here, before the
  // turn can end, since a reload can cut off its end-of-turn hook.
  if (!mod.isOn) return
  const before = await m.atoms.session.read()
  const startedAt = await m.clock.now()
  await m.commit(currentOwner(), s => turnStarted(startTurn(s), startedAt))
  if (before.stop) {
    sessionState.stopGeneration++
    sessionState.resuming = null
    void m.publishStatus()
  }
}

/** The main agent's turn stopped on an error that classic.StopFailure reports. */
export async function noteStopFailure(m: Mod, e: StopFailureEvent) {
  if (!mod.isOn || e.agent_id) return
  sessionState.hasStopFromError = true
  const message = e.last_assistant_message ?? ''
  await setStop(
    m,
    withApiError({
      kind: stopKindOf(String(e.error), message),
      detail: String(e.error),
      resets: resetTime(message),
      at: await m.clock.now(),
    }),
  )
}

/** The main agent's turn ended: its children settle, and an answered turn runs the inbox model's update. */
export async function noteTurnEnd(m: Mod, e: TurnCompleteEvent) {
  if (e.agentId) return
  askedCalls.clear()
  await closeDialogs(m, null)
  if (!mod.isOn) return
  const endedAt = await m.clock.now()
  const [listed, inHerdr, place] = await Promise.all([
    m.conversation.agents().catch(() => null),
    m.atoms.session.read().then(s => delegatesAsked(m.herdr, upgradeSession(s).ledger.overview)),
    placeNow(m),
  ])
  const running = listed && new Set(listed.filter(a => a.status === 'running' || a.status === 'pending').map(a => a.id))
  await m.commit(currentOwner(), s => {
    const turnOver = turnEnded(s, endedAt)
    const ended = { ...turnOver, lastActions: withReplyWaitEnded(turnOver.lastActions) }
    const withSubagents = running ? statusChanged(ended, o => subagentsSettled(o, running, endedAt)) : ended
    const withDelegates = inHerdr
      ? statusChanged(withSubagents, o => delegatesSettled(o, inHerdr, endedAt))
      : withSubagents
    return place ? place(withDelegates) : withDelegates
  })
  if (e.reason === 'error' && !sessionState.hasStopFromError) await setStopFromLastReply(m)
  void wakeAfterSettle(m).catch(() => undefined)
  const reply = turnReply([turnReply(sessionState.stepTexts, e.answer), sessionState.turnBox ?? ''])
  const isAnswered = e.reason === 'answer' && reply !== ''
  if (!isAnswered && !sessionState.isDialogDismissed) return

  const [screenTab, isShown, now, before] = await Promise.all([
    shownScreenTab(m),
    isPaneShown(m),
    m.clock.now(),
    m.atoms.session.read(),
  ])
  const queuesEmptyReply = sessionState.isDialogDismissed
  resetTurn()
  await m.atoms.away.update(a => ({ ...a, lastActiveAt: now }))
  await m.commit(currentOwner(), s => endTurn(CLAUDE_CODE, s, reply, isShown, { tab: screenTab, queuesEmptyReply }))
  updateLedger(m)
  const after = await m.atoms.session.read()
  const addsPr = addsTabPr(before, after)
  const tracksPrs = tabPrs(after.ledger).length > 0 || after.prViews.branchRef !== null
  const isTabShown = await isPrsTabShown(m)
  if (addsPr || (tracksPrs && isPrFetchDue(after, mod.prFetchEndedAt, now, isTabShown))) void m.fetchPrs(isTabShown)
}
