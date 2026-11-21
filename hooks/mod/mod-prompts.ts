import type { Hook } from 'claude-code'

import type { Session } from '../../types'
import { delegateRef, noticeApplied, taskNotice } from '../../core/domain/children'
import { commandRowLine, readCommandRow } from './claude'
import { withExplanationAwaited, withExplanationReply } from './explanation-reply'
import { statusCarryText } from '../../core/domain/inbox-text'
import { closeItem } from '../../core/domain/ledger-close'
import { arrived, messageText, noteStored } from './mod-delivery'
import { isPaneShown } from './mod-drawn'
import { loadConversation } from './mod-load'
import type { Mod } from './mod-ports'
import { delegateWaits } from './mod-records'
import { commitLedger } from './mod-session-write'
import { conversation, currentOwner } from './mod-sessions'
import { mod, sessionState } from './mod-state'
import { noteChild } from './mod-tool-calls'
import { setStop } from './mod-turns'
import { CLAUDE_CODE } from '../../core/domain/model-text'
import { tasksRunBy } from '../../core/domain/reply-parse'
import { messageTyped, recordPrompt, type SentBy } from '../../core/runtime/session-turns'
import { childEnded } from '../../core/domain/status-children'

type PromptSubmitEvent = Parameters<Hook<'prompt.submit'>>[1]
type SessionAppendEvent = Parameters<Hook<'session.append'>>[1]

/** Adds the person's words to the turn, as a shell command row does. */
function notePerson(m: Mod, line: string) {
  return m.commit(currentOwner(), s => ({
    ...s,
    turn: { ...s.turn, person: s.turn.person === null ? line : `${s.turn.person}\n\n${line}` },
  }))
}

/**
 * Records a prompt's words for the turn and returns what Claude reads beside it. `match` finds the press that sent a
 * message of the mod's own, when its row is stored. `isTyped` says the person typed the prompt.
 */
async function notePrompt(
  m: Mod,
  text: string,
  {
    match = s => ({ state: s, sentBy: null }),
    isTyped = false,
    personSource = 'prompt',
    isOwnTurn = true,
  }: {
    match?: (s: Session) => { state: Session; sentBy: SentBy | null }
    isTyped?: boolean
    personSource?: 'prompt' | 'command'
    isOwnTurn?: boolean
  } = {},
): Promise<string[]> {
  const [now, isShown] = await Promise.all([m.clock.now(), isPaneShown(m)])
  await m.atoms.away.update(a => ({ ...a, lastActiveAt: now, isAway: false }))
  let notes: string[] = []
  await m.commit(currentOwner(), s => {
    const matched = match(s)
    const lastActions = withExplanationAwaited(s.lastActions, matched.state.lastActions, isOwnTurn)
    const r = recordPrompt(CLAUDE_CODE, { ...matched.state, lastActions }, text, isShown, matched.sentBy, personSource)
    notes = r.notes
    return isTyped ? messageTyped(r.state, now) : r.state
  })

  return notes
}

async function appendContext(m: Mod, context: string[]) {
  await m.conversation.append(context.join('\n\n')).catch(() => undefined)
}

async function closeTasksRunBy(m: Mod, command: string) {
  const ran = tasksRunBy((await m.atoms.session.read()).ledger, command)
  if (ran.length === 0) return
  const now = await m.clock.now()
  await commitLedger(m, l =>
    ran.reduce((after, item) => closeItem(after, item.id, { how: 'done', outcome: 'you ran it' }, now), l),
  )
}

/** A prompt was submitted. Returns what Claude reads beside it, which is nothing for a prompt that is not the person's. */
export async function promptSubmitted(m: Mod, e: PromptSubmitEvent): Promise<string[]> {
  if (!mod.isOn) return []
  // Where a guard skips classic.SessionStart, the first prompt after /clear, /resume or /branch is what shows the
  // session has changed conversations. A reload that classic.SessionStart already did leaves the ids equal.
  const sessionId = await m.conversation.id()
  if (sessionId !== conversation.id) {
    const reason = sessionState.endReason
    sessionState.endReason = null
    const parent = reason === 'resume' ? conversation.id : undefined
    await loadConversation(m, sessionId, reason === 'clear' ? 'clear' : 'resume', parent || undefined)
  }
  const origin = e.origin
  // send() already recorded this mod's own prompts.
  if (origin.kind === 'plugin' && origin.name === 'inbox') return []
  const notice = origin.kind === 'task-notification' ? taskNotice(e.text) : null
  if (notice) {
    const delegate = notice.ids.map(id => delegateWaits.get(id)).find(name => name !== undefined)
    await noteChild(m, (o, at) =>
      delegate && notice.hasEnded ? childEnded(o, delegateRef(delegate), at) : noticeApplied(o, notice, at),
    )
  }
  const isTyped = origin.kind === 'composer' || origin.kind === 'bridge'
  const isPersonsWords = isTyped || (origin.kind === 'plugin' && origin.asUser === true)
  if (!isPersonsWords) {
    if (!e.turnId) await m.commit(currentOwner(), s => ({ ...s, turn: { ...s.turn, trigger: origin.kind } }))

    return []
  }

  const notes = await notePrompt(m, e.text, { isTyped, personSource: e.command ? 'command' : 'prompt' })
  if (sessionState.carriedFor !== conversation.id) {
    sessionState.carriedFor = conversation.id
    const carry = statusCarryText((await m.atoms.session.read()).ledger)
    if (carry) notes.unshift(carry)
  }

  return notes
}

/** A message the mod sent is stored: its press is matched, and what Claude reads beside it is added. */
export async function ownMessageStored(m: Mod, e: SessionAppendEvent) {
  if (!mod.isOn || e.agentId) return
  const text = messageText(e.message)
  const count = noteStored(text)
  const match = (current: Session) => arrived(current, text, count)
  const notes = await notePrompt(m, text, { match, isOwnTurn: e.door === 'prompt' })
  if (notes.length > 0) await appendContext(m, notes)
}

/** A reply is stored, which answers an Explain press that waits on it. */
export async function replyStored(m: Mod, e: SessionAppendEvent) {
  if (!mod.isOn || e.agentId || messageText(e.message).trim() === '') return
  const { lastActions } = await m.atoms.session.read()
  if (withExplanationReply(lastActions, e.uuid) !== lastActions)
    await m.commit(currentOwner(), s => ({ ...s, lastActions: withExplanationReply(s.lastActions, e.uuid) }))
}

/** A command row is stored: a shell command and its output, or a slash command such as /login. */
export async function commandRowStored(m: Mod, e: SessionAppendEvent) {
  if (!mod.isOn || e.agentId) return
  const row = readCommandRow(messageText(e.message))
  if (!row) return
  const line = commandRowLine(row)
  if (line) await notePerson(m, line)
  if (row.kind === 'shell') {
    sessionState.shellCommand = row.command
  } else if (row.kind === 'output') {
    // The row has no exit code, so only a run with nothing on stderr closes a
    // task here.
    if (sessionState.shellCommand && !row.stderr) await closeTasksRunBy(m, sessionState.shellCommand)
    sessionState.shellCommand = null
  } else if (row.name === 'login' && (await m.atoms.session.read()).stop?.kind === 'sign-in') {
    await setStop(m, null)
  }
}
