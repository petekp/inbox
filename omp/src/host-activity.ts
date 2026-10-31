import { dialogActivity, dialogQuestions } from '../../hooks/catch-up-text'
import { noteDialog } from '../../hooks/dialogs'
import { noteActivity, noteCommandOutput } from '../../hooks/session-turns'
import { claimedStatusRefresh, statusChanged } from '../../hooks/session-status'
import {
  activityGate,
  childStarted,
  childWorked,
  delegatesRan,
  delegatesStarted,
  delegatesTakenBack,
  waitsOnDelegate,
} from '../../hooks/children'
import { childEnded } from '../../hooks/status-children'
import { refreshStatus } from '../../hooks/session-host'
import { activityOf, askOutcome } from './tool-calls'
import type { SessionStatus } from '../../types'
import { isUnattended, sessionIdOf } from './host-context'
import type { HostContext, OmpContext } from './host-context'
import type { SessionCalls } from './host-sessions'
import { textOfBlocks } from './omp-messages'

export function activityHandlers(context: HostContext, sessions: SessionCalls) {
  const { deps, memory } = context
  const { change, updateHostFor, fetchPrsWhenDue } = sessions

  const isActivityWorthSaving = activityGate()

  const onSubagentLifecycle = async (data: unknown) => {
    const frame = data as { id?: unknown; agent?: unknown; description?: unknown; status?: unknown }
    const id = memory.framesFor
    const ref = frame.id
    if (!id || typeof ref !== 'string') return
    const at = deps.now()
    const label = typeof frame.description === 'string' && frame.description ? frame.description : frame.agent
    const name = typeof label === 'string' ? label : 'subagent'
    await change(id, s =>
      statusChanged(s, o =>
        frame.status === 'started' ? childStarted(o, { ref, kind: 'subagent', name }, at) : childEnded(o, ref, at),
      ),
    ).catch(() => undefined)
  }

  const onSubagentProgress = async (data: unknown) => {
    const ref = (data as { progress?: { id?: unknown } }).progress?.id
    const id = memory.framesFor
    const at = deps.now()
    if (!id || typeof ref !== 'string' || !isActivityWorthSaving(ref, at)) return
    await change(id, s => statusChanged(s, o => childWorked(o, ref, at))).catch(() => undefined)
  }

  /**
   * Notes the main agent's activity, and runs the Status call when the running turn is due one. Activity notes are
   * best effort, so a failed write never surfaces as an extension error.
   */
  const noteQuietly = async (ctx: OmpContext, line: string | null) => {
    if (!line) return
    let isClaimed = false
    try {
      await change(sessionIdOf(ctx), s => {
        const noted = noteActivity(s, line)
        const claimed = claimedStatusRefresh(noted, deps.now())
        isClaimed = claimed !== noted
        return claimed
      })
    } catch {
      return
    }
    if (isClaimed) deps.background(refreshStatus(updateHostFor(ctx)))
  }

  /** Each running bash call that waits on a delegate: its command, when it started, and the Status before it started. */
  const waits = new Map<string, { command: string; at: number; before: SessionStatus | null }>()

  const onToolExecutionStart = async (
    event: { toolCallId: string; toolName: string; args: unknown },
    ctx: OmpContext,
  ) => {
    if (isUnattended(ctx)) return
    const args = (event.args ?? {}) as Record<string, unknown>
    const command = event.toolName === 'bash' && typeof args.command === 'string' ? args.command : ''
    if (!waitsOnDelegate(command)) return
    const wait = { command, at: deps.now(), before: null as SessionStatus | null }
    waits.set(event.toolCallId, wait)
    await change(sessionIdOf(ctx), s => {
      wait.before = s.ledger.overview
      return statusChanged(s, o => delegatesStarted(o, command, wait.at))
    }).catch(() => undefined)
  }

  // A wait that ended with no tool_result never ran.
  const onToolExecutionEnd = async (event: { toolCallId: string }, ctx: OmpContext) => {
    const wait = waits.get(event.toolCallId)
    if (!wait) return
    waits.delete(event.toolCallId)
    const takenBack = (o: SessionStatus | null) => delegatesTakenBack(o, wait.command, wait.before, wait.at)
    await change(sessionIdOf(ctx), s => statusChanged(s, takenBack)).catch(() => undefined)
  }

  // omp raises tool_result only for a call that ran, never for one it blocked.
  const onToolResult = async (
    event: {
      toolCallId: string
      toolName: string
      input: Record<string, unknown>
      content: { type: string; text?: string }[]
      isError: boolean
      details?: unknown
    },
    ctx: OmpContext,
  ) => {
    if (isUnattended(ctx)) return
    waits.delete(event.toolCallId)
    await noteQuietly(ctx, activityOf(event.toolName, event.input))
    if (event.toolName === 'bash') {
      const command = (event.input as { command?: unknown }).command
      if (typeof command !== 'string') return
      let isLinked = false
      const at = deps.now()
      try {
        await change(sessionIdOf(ctx), s => {
          const after = noteCommandOutput(s, command, textOfBlocks(event.content))
          isLinked = after.ledger !== s.ledger
          return statusChanged(after, o => delegatesRan(o, command, at))
        })
      } catch {
        return
      }
      if (isLinked) fetchPrsWhenDue(ctx)
      return
    }
    if (event.toolName !== 'ask') return
    const questions = dialogQuestions((event.input as { questions?: unknown }).questions)
    const outcome = askOutcome(event)
    const line = dialogActivity(questions, outcome)
    await change(sessionIdOf(ctx), s => {
      const noted = noteActivity(s, line)
      return outcome.kind === 'dismissed' ? noteDialog(noted, null, questions) : noted
    }).catch(() => undefined)
  }

  return { onSubagentLifecycle, onSubagentProgress, onToolExecutionStart, onToolExecutionEnd, onToolResult }
}
