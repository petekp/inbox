import { isSameTaskList, ompTodoFromBranch } from '../../hooks/host-tasks'
import { guidanceText } from '../../hooks/model-text'
import { branchIn } from '../../hooks/gh'
import { CLEARED_TOKENS, delegatesInHerdr } from '../../hooks/herdr'
import { messageTyped, notePrompt, turnStarted, placed, cutOffTurn } from '../../hooks/session-turns'
import { needsUpdate, statusChanged } from '../../hooks/session-status'
import { childrenCutOff, delegatesSettled } from '../../hooks/children'
import { runUpdates } from '../../hooks/session-host'
import { wakeForDone } from '../../hooks/host-press'
import { turnReply } from '../../hooks/text'
import { readState } from './state'
import { OMP } from './texts'
import { isDismissedAsk } from './tool-calls'
import { isUnattended, sessionIdOf } from './host-context'
import type { HostContext, OmpContext } from './host-context'
import type { SessionCalls } from './host-sessions'
import { lastAssistant, stopOf, textOfBlocks, userText } from './omp-messages'
import type { Reply } from './omp-messages'

export const MESSAGE_TYPE = 'inbox'

export function turnHandlers(context: HostContext, sessions: SessionCalls) {
  const { deps, dir, openPanels, prepared, reportToHerdr, run, memory, dropTools, showBand, sendNotes } = context
  const { change, endedTurn, hostFor, updateHostFor, reportCounts, prepare, continueFork, catchUpUnseen } = sessions

  let noted: { id: string; prompt: string; notes: string[] } | null = null

  /**
   * The text of each assistant message in this run since the turn's prompt, in order, and whether the last one finished
   * a reply.
   */
  let agentTexts: { id: string; texts: string[]; isFinished: boolean } | null = null

  /**
   * Counts a prompt that reached the agent: matches it to a press and returns the notes the agent is told.
   * `finishedReply` is the reply the agent finished in this run since the turn's prompt, if any. omp runs a queued
   * follow-up in the same run as the turn before it and fires agent_end once for both. So a prompt that comes after a
   * finished reply first ends the running turn with that reply, and starts a turn of its own.
   */
  async function arrive(ctx: OmpContext, id: string, text: string, finishedReply: string | null): Promise<string[]> {
    const at = deps.now()
    const hostTasks = finishedReply === null ? [] : ompTodoFromBranch(ctx.sessionManager.getBranch())
    let notes: string[] = []
    const written = await change(id, s => {
      const before = finishedReply === null ? s : turnStarted(endedTurn(id, s, finishedReply, at, { hostTasks }), at)
      const r = notePrompt(OMP, before, text, openPanels.has(id))
      notes = r.notes

      return r.state
    })
    if (finishedReply !== null && needsUpdate(written)) deps.background(runUpdates(updateHostFor(ctx)))

    return notes
  }

  /** Takes the reply the agent finished in this run since the turn's prompt, if any. */
  function takeFinishedReply(id: string): string | null {
    if (agentTexts?.id !== id || !agentTexts.isFinished) return null
    const { texts } = agentTexts
    agentTexts = null

    return turnReply(texts)
  }

  const start = async (ctx: OmpContext, parentFile?: string) => {
    if (isUnattended(ctx)) return dropTools()
    // No turn runs as a session starts, so a running turn saved here was cut off by a process that ended.
    const id = sessionIdOf(ctx)
    memory.shownId = id
    memory.framesFor = id
    reportCounts(id)
    // Subagents run in this process, so the ones a saved session lists running ended with the process that ran them.
    const saved = await readState(dir, id).catch(() => null)
    const isCutOff = saved?.presence.isTurnRunning || saved?.ledger.overview?.children.some(c => c.endedAt === null)
    if (isCutOff)
      await change(id, s => statusChanged(cutOffTurn(s), o => childrenCutOff(o, deps.now()))).catch(() => undefined)
    prepare(ctx)
    showBand(ctx)
    deps.background(
      continueFork(ctx, parentFile)
        .catch(() => undefined)
        .then(async () => {
          const hostTasks = ompTodoFromBranch(ctx.sessionManager.getBranch())
          const branch = await branchIn(run, ctx.cwd)
          await change(id, s =>
            placed(isSameTaskList(s.hostTasks, hostTasks) ? s : { ...s, hostTasks }, ctx.cwd, branch),
          )
        })
        .catch(() => undefined)
        .then(() => catchUpUnseen(ctx)),
    )
  }

  const onSessionShutdown = async (_event: unknown, ctx: OmpContext) => {
    const id = sessionIdOf(ctx)
    openPanels.delete(id)
    prepared.delete(id)
    if (noted?.id === id) noted = null
    if (agentTexts?.id === id) agentTexts = null
    const pane = deps.herdrPane
    if (id !== memory.shownId || !pane) return
    memory.shownId = null
    await reportToHerdr(run, async () => ({ pane, tokens: CLEARED_TOKENS }))
  }

  const onBeforeAgentStart = async (event: { prompt: string; systemPrompt: string[] }, ctx: OmpContext) => {
    if (isUnattended(ctx)) return
    prepare(ctx)
    const id = sessionIdOf(ctx)
    const guidance = guidanceText(OMP)
    const systemPrompt = event.systemPrompt.includes(guidance) ? event.systemPrompt : [...event.systemPrompt, guidance]
    // omp can run this handler again for one prompt. The prompt counts once.
    if (noted?.id !== id || noted.prompt !== event.prompt) {
      const notes = await arrive(ctx, id, event.prompt, takeFinishedReply(id)).catch(() => null)
      if (notes) noted = { id, prompt: event.prompt, notes }
    }
    const notes = noted?.notes ?? []

    return {
      systemPrompt,
      ...(notes.length > 0
        ? {
            message: {
              customType: MESSAGE_TYPE,
              content: notes.join('\n\n'),
              display: false,
              attribution: 'agent' as const,
            },
          }
        : {}),
    }
  }

  // omp fires `input` with source `interactive` only for what the person submits in its editor. `sendUserMessage`,
  // which a press sends with, fires no `input` event.
  const onInput = async (event: { source: string }, ctx: OmpContext) => {
    if (isUnattended(ctx) || event.source !== 'interactive') return
    const at = deps.now()
    await change(sessionIdOf(ctx), s => messageTyped(s, at)).catch(() => undefined)
  }

  // Not before_agent_start, which can run twice for one prompt and does not run for a queued message.
  const onAgentStart = async (_event: unknown, ctx: OmpContext) => {
    if (isUnattended(ctx)) return
    const id = sessionIdOf(ctx)
    if (agentTexts?.id === id) agentTexts = null
    const startedAt = deps.now()
    await change(id, s => turnStarted(s, startedAt)).catch(() => undefined)
  }

  const onTurnStart = async (_event: unknown, ctx: OmpContext) => {
    noted = null
    if (isUnattended(ctx)) return
    await change(sessionIdOf(ctx), s => (s.stop ? { ...s, stop: null } : s)).catch(() => undefined)
  }

  // An assistant message with tool calls goes on working, so only one without them finishes a reply.
  const onMessageEnd = (event: { message: unknown }, ctx: OmpContext) => {
    const message = event.message as Reply
    if (isUnattended(ctx) || message.role !== 'assistant' || !Array.isArray(message.content)) return
    const id = sessionIdOf(ctx)
    const texts = agentTexts?.id === id ? agentTexts.texts : []
    const isFinished = !message.content.some((b: { type?: unknown }) => b.type === 'toolCall')
    agentTexts = { id, texts: [...texts, textOfBlocks(message.content)], isFinished }
  }

  /**
   * A press sent while a turn runs reaches the agent as a queued message. omp runs before_agent_start for it.
   * When that has not noted the message, its arrival is noted here, once the message starts.
   */
  const onMessageStart = async (event: { message: unknown }, ctx: OmpContext) => {
    const message = event.message as { role?: unknown; content?: unknown }
    if (isUnattended(ctx) || message.role !== 'user') return
    const id = sessionIdOf(ctx)
    const text = userText(message.content)
    if (text === '' || (noted?.id === id && noted.prompt === text)) return
    // Taken before the state read, since the press's own reply can finish during it.
    const finished = agentTexts?.id === id && agentTexts.isFinished ? agentTexts : null
    try {
      const isSentByPress = (await readState(dir, id)).sent.some(x => x.text === text)
      if (!isSentByPress) return
      // Texts the agent wrote during the read answer this message, so they start the turn it starts.
      if (agentTexts === finished) agentTexts = null
      else if (finished && agentTexts?.id === id)
        agentTexts = { ...agentTexts, texts: agentTexts.texts.slice(finished.texts.length) }
      const notes = await arrive(ctx, id, text, finished ? turnReply(finished.texts) : null)
      noted = { id, prompt: text, notes }
      if (notes.length > 0) {
        sendNotes(notes)
      }
    } catch {
      return
    }
  }

  const onAgentEnd = async (event: { willContinue?: boolean; messages: readonly unknown[] }, ctx: OmpContext) => {
    if (isUnattended(ctx) || event.willContinue) return
    prepare(ctx)
    const id = sessionIdOf(ctx)
    const texts = agentTexts?.id === id ? agentTexts.texts : []
    if (agentTexts?.id === id) agentTexts = null
    const last = lastAssistant(event.messages)
    const stop = await stopOf(last, deps.isUsageLimit, deps.now())
    const reply = stop === null ? turnReply(texts, last ? textOfBlocks(last.content) : '') : ''
    // Escape on the ask dialog aborts the turn, so it ends with no reply text.
    const isDialogDismissed = event.messages.some(isDismissedAsk)
    const hostTasks = ompTodoFromBranch(ctx.sessionManager.getBranch())
    // Herdr and git are asked outside the change: each run can last its whole timeout, and the session's changes run
    // one at a time.
    const [inHerdr, branch] = await Promise.all([
      readState(dir, id)
        .catch(() => null)
        .then(saved => delegatesInHerdr(saved?.ledger.overview ?? null, run)),
      branchIn(run, ctx.cwd),
    ])
    const endedAt = deps.now()
    const written = await change(id, s => {
      const ended = endedTurn(id, s, reply, endedAt, { hostTasks, queuesEmptyReply: isDialogDismissed })
      const settled = inHerdr ? statusChanged(ended, o => delegatesSettled(o, inHerdr, endedAt)) : ended

      return { ...placed(settled, ctx.cwd, branch), stop }
    }).catch(() => null)
    if (!written) return
    const host = hostFor(ctx)
    if (needsUpdate(written)) deps.background(runUpdates(updateHostFor(ctx)))
    deps.background(wakeForDone(host))
  }

  return {
    start,
    onSessionShutdown,
    onBeforeAgentStart,
    onInput,
    onAgentStart,
    onTurnStart,
    onMessageEnd,
    onMessageStart,
    onAgentEnd,
  }
}
