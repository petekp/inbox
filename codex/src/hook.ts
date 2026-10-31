import { resolve } from 'node:path'

import {
  childrenCutOff,
  childStarted,
  childWorked,
  delegatesSettled,
  delegatesStarted,
  delegateSteps,
  delegateWaitsEnded,
} from '../../hooks/children'
import { branchIn } from '../../hooks/gh'
import type { Run } from '../../hooks/gh'
import { delegatesInHerdr } from '../../hooks/herdr'
import { dialogActivity, toolActivity } from '../../hooks/catch-up-text'
import { childEnded } from '../../hooks/status-children'
import { turnReply } from '../../hooks/text'
import {
  cleared,
  messageTyped,
  noteActivity,
  noteCommandOutput,
  placed,
  startContext,
  turnEnded,
  turnStarted,
} from '../../hooks/session-turns'
import { claimedStatusRefresh, needsUpdate, statusChanged } from '../../hooks/session-status'
import { namedCli } from './cli'
import { endTurn, heardState, noteHook, notePrompt, patchFiles } from './core'
import { noteDialogs } from './dialogs'
import { withEarlierHistory, withMissedTurns } from './history'
import { codexStore } from './host'
import type { OnWrite } from './host'
import type { SessionState } from './state'
import { CODEX } from './texts'
import { rolloutMeta } from './rollout-rows'
import { turnOf } from './rollout-turns'
import { rolloutReads, rolloutTail } from './transcript'

export type HookInput = {
  hook_event_name: string
  session_id: string
  turn_id?: string
  /** Set when a subagent's hook fires. It carries the parent's session id. */
  agent_id?: string
  agent_type?: string
  transcript_path: string | null
  cwd?: string
  source?: string
  prompt?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  last_assistant_message?: string | null
}

export type HookDeps = {
  dir: string
  env: NodeJS.ProcessEnv
  now: () => number
  run: Run
  startUpdate: (sessionId: string) => void
  /** Starts the Status call a hook claimed for the running turn, in a process of its own. */
  startStatusRefresh: (sessionId: string) => void
  onWrite: OnWrite
}

export async function handleHook(input: HookInput, deps: HookDeps): Promise<Record<string, unknown> | null> {
  const id = input.session_id
  const { dir, env, now } = deps
  if (!id) return null
  const meta = await rolloutMeta(input.transcript_path)
  // INBOX_IN_EXEC lets a test drive a whole session through `codex exec`.
  if (!env.INBOX_IN_EXEC && meta.isNonInteractive) return null
  const { update: write, read } = codexStore(dir, id, now, deps.onWrite)
  const cliPath = namedCli(env)
  const withCli = (s: SessionState): SessionState => (cliPath && s.cliPath !== cliPath ? { ...s, cliPath } : s)
  // A subagent's hook names its own rollout, not the session's.
  const rolloutPath = input.agent_id ? null : input.transcript_path
  const withRollout = (s: SessionState): SessionState =>
    rolloutPath !== null && s.transcriptPath !== rolloutPath ? { ...s, transcriptPath: rolloutPath } : s
  const withHost = (s: SessionState): SessionState => withRollout(withCli(s))
  let isMarkedBehind = false
  /**
   * Makes the reads of the rollout that the history check needs before the state lock, by checking the state
   * `readBefore` gives. It returns the check to run under the lock, which reuses those reads, so it reads more only when
   * another hook changed the state in between. `tail` is the end of the rollout this hook read already. A compaction
   * start runs in the middle of a turn, so it marks nothing behind.
   */
  const readHistoryAhead = async (
    readBefore: () => Promise<SessionState>,
    tail?: string[],
  ): Promise<(s: SessionState) => Promise<SessionState>> => {
    if (rolloutPath === null) return async s => s
    const reads = rolloutReads(rolloutPath, tail)
    const check = (s: SessionState) => {
      const history = {
        dir,
        reads,
        cwd: input.cwd ?? s.root,
        currentTurnId: input.turn_id,
        canMarkBehind: input.source !== 'compact',
        isCleared: input.source === 'clear',
      }

      return heardState(s.heard) === 'none' ? withEarlierHistory(s, history) : withMissedTurns(s, history)
    }
    await check(await readBefore())

    return async s => {
      const r = await check(s)
      isMarkedBehind = r.isBehind

      return r.state
    }
  }
  const withCoveredTurn = (s: SessionState): SessionState =>
    rolloutPath !== null && input.turn_id ? { ...s, coveredTurn: input.turn_id } : s

  switch (input.hook_event_name) {
    case 'SessionStart': {
      const root = input.cwd ?? ''
      // Codex runs SessionStart after compacting too, in the middle of a turn.
      const endsTurn = (s: SessionState) =>
        input.source === 'compact' ? s : statusChanged(turnEnded(s, null), o => childrenCutOff(o, now()))
      const folder = rolloutPath === null ? null : meta.folder
      const [branch, withHistory] = await Promise.all([
        folder === null ? null : branchIn(deps.run, folder),
        readHistoryAhead(read),
      ])
      const withPlace = (s: SessionState) => (folder === null ? s : placed(s, folder, branch))
      const s = await write(async s =>
        noteHook(
          withHost(await withHistory(endsTurn(withPlace({ ...(input.source === 'clear' ? cleared(s) : s), root })))),
          'start',
          now(),
        ),
      )
      if (isMarkedBehind) deps.startUpdate(id)

      const context = startContext(CODEX, s, input.source)

      return context ? { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } } : null
    }
    case 'UserPromptSubmit': {
      let notes: string[] = []
      const withHistory = await readHistoryAhead(read)
      await write(async s => {
        const r = notePrompt(withHost(await withHistory(s)), input.prompt ?? '', now())
        notes = r.notes
        if (input.agent_id) return r.state
        const started = noteHook(turnStarted(r.state, now()), 'prompt', now(), input.turn_id)
        // Codex names no source for a prompt, so a prompt no press sent is one the person typed.
        const isTyped = r.sentBy === null

        return isTyped ? messageTyped(started, now()) : started
      })
      if (isMarkedBehind) deps.startUpdate(id)

      return notes.length === 0
        ? null
        : { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: notes.join('\n\n') } }
    }
    case 'PreToolUse': {
      const tool = input.tool_name ?? ''
      const toolInput = input.tool_input ?? {}
      const command = typeof toolInput.command === 'string' ? toolInput.command : ''
      if (tool === 'apply_patch') {
        const files = patchFiles(command).map(f => resolve(input.cwd || '/', f))
        await write(s => files.reduce((x, f) => noteActivity(x, `edited ${f}`), withRollout(s)))

        return null
      }
      const line = toolActivity(tool, toolInput)
      const agentId = input.agent_id
      const isDelegateCommand = agentId === undefined && delegateSteps(command).length > 0
      const withWork = (s: SessionState) =>
        statusChanged(s, o => (agentId ? childWorked(o, agentId, now()) : delegatesStarted(o, command, now())))
      const hasWork = line !== null || agentId !== undefined || isDelegateCommand
      // Only the main agent's activity is what the Status call reads mid-turn, so only it claims the call.
      const isMainActivity = line !== null && agentId === undefined
      let isClaimed = false
      if (hasWork)
        await write(s => {
          const worked = withWork(line ? noteActivity(withRollout(s), line) : withRollout(s))
          const claimed = isMainActivity ? claimedStatusRefresh(worked, now()) : worked
          isClaimed = claimed !== worked
          return claimed
        })
      if (isClaimed) deps.startStatusRefresh(id)

      return null
    }
    case 'SubagentStart': {
      const ref = input.agent_id
      if (!ref) return null
      const name = input.agent_type || 'subagent'
      await write(s => statusChanged(s, o => childStarted(o, { ref, kind: 'subagent', name }, now())))

      return null
    }
    case 'SubagentStop': {
      const ref = input.agent_id
      if (ref) await write(s => statusChanged(s, o => childEnded(o, ref, now())))

      return null
    }
    case 'Stop': {
      const folder = input.cwd
      const before = read()
      // Herdr is asked outside the write: its run can last its whole timeout, and the server's views and presses wait
      // on the state lock.
      const [tail, branch, inHerdr] = await Promise.all([
        rolloutTail(input.transcript_path),
        folder ? branchIn(deps.run, folder) : null,
        before.then(
          s => delegatesInHerdr(s.ledger.overview, deps.run),
          () => null,
        ),
      ])
      const { dialogs, commands, plan, texts } = turnOf(tail, input.turn_id)
      // Codex runs Stop without writing the rollout out first, so the rollout can lack the turn's last message.
      const reply = turnReply(texts, input.last_assistant_message ?? '')
      const withHistory = await readHistoryAhead(() => before, tail)
      const lines = dialogs.map(d => dialogActivity(d.questions, { kind: 'open' }))
      const written = await write(async s => {
        const withLines = lines.reduce(
          (x, line) => noteActivity(x, line),
          noteDialogs(withHost(await withHistory(s)), dialogs),
        )
        const withOutput = commands.reduce((x, c) => noteCommandOutput(x, c.command, c.output), withLines)
        // A wait on a delegate holds the turn, so the delegate's turn settled by Stop, where the turn's commands are read.
        const waited = statusChanged(withOutput, o =>
          commands.reduce((x, c) => delegateWaitsEnded(x, c.command, now()), o),
        )
        const withDelegates = inHerdr ? statusChanged(waited, o => delegatesSettled(o, inHerdr, now())) : waited
        const withPlace = folder ? placed(withDelegates, folder, branch) : withDelegates

        const ended = withCoveredTurn(noteHook(turnEnded(endTurn(withPlace, reply, now()), now()), 'stop', now()))

        return plan === null ? ended : { ...ended, hostTasks: plan }
      })
      if (needsUpdate(written)) deps.startUpdate(id)

      return null
    }
  }

  return null
}
