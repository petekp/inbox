import { resolve } from 'node:path'

import {
  childName,
  childrenCutOff,
  delegateRef,
  delegateRunning,
  delegatesSettled,
  delegateSteps,
  hasRunningDelegate,
} from '../../hooks/children'
import type { Run } from '../../hooks/gh'
import { HERDR_AGENT_LIST, HERDR_TIMEOUT_MS, herdrRunning } from '../../hooks/herdr'
import { dialogActivity } from '../../hooks/model-text'
import { childActive, childEnded, withChild } from '../../hooks/overview'
import {
  cleared,
  needsUpdate,
  noteActivity,
  noteCommandOutput,
  overviewChanged,
  placed,
  startContext,
  turnEnded,
  turnStarted,
} from '../../hooks/session'
import { namedCli } from './cli'
import { activityOf, endTurn, heardState, noteHook, notePrompt, patchFiles } from './core'
import { noteDialogs } from './dialogs'
import { withEarlierHistory, withMissedTurns } from './history'
import { codexStore } from './host'
import type { OnWrite } from './host'
import type { SessionState } from './state'
import { CODEX } from './texts'
import { isNonInteractiveRun, placeIn, rolloutReads, rolloutTail, turnOf } from './transcript'
import type { RolloutReads } from './transcript'

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
  onWrite: OnWrite
}

export async function handleHook(input: HookInput, deps: HookDeps): Promise<Record<string, unknown> | null> {
  const id = input.session_id
  const { dir, env, now } = deps
  // INBOX_IN_EXEC lets a test drive a whole session through `codex exec`.
  if (!id || (!env.INBOX_IN_EXEC && (await isNonInteractiveRun(input.transcript_path)))) return null
  const { update: write, read } = codexStore(dir, id, now, deps.onWrite)
  const cliPath = namedCli(env)
  const withCli = (s: SessionState): SessionState => (cliPath && s.cliPath !== cliPath ? { ...s, cliPath } : s)
  // A subagent's hook names its own rollout, not the session's.
  const rolloutPath = input.agent_id ? null : input.transcript_path
  const withRollout = (s: SessionState): SessionState =>
    rolloutPath !== null && s.transcriptPath !== rolloutPath ? { ...s, transcriptPath: rolloutPath } : s
  const withHost = (s: SessionState): SessionState => withRollout(withCli(s))
  let isMarkedBehind = false
  let reads: RolloutReads | null = null
  /** A compaction start runs in the middle of a turn, so it marks nothing behind. */
  const withHistory = async (s: SessionState): Promise<SessionState> => {
    if (rolloutPath === null) return s
    reads ??= rolloutReads(rolloutPath)
    const history = {
      dir,
      rolloutPath,
      reads,
      cwd: input.cwd ?? s.root,
      currentTurnId: input.turn_id,
      canMarkBehind: input.source !== 'compact',
      isCleared: input.source === 'clear',
    }
    const r = heardState(s.heard) === 'none' ? await withEarlierHistory(s, history) : await withMissedTurns(s, history)
    isMarkedBehind = r.isBehind

    return r.state
  }
  /**
   * Makes the reads of the rollout that `withHistory` needs before the state lock, so the check under the lock reads
   * more only when another hook changed the state in between. `tail` is the end of the rollout this hook read already.
   */
  const readHistoryAhead = async (tail?: string[]) => {
    if (rolloutPath === null) return
    reads = rolloutReads(rolloutPath, tail)
    await withHistory(await read())
  }
  const withCoveredTurn = (s: SessionState): SessionState =>
    rolloutPath !== null && input.turn_id ? { ...s, coveredTurn: input.turn_id } : s

  switch (input.hook_event_name) {
    case 'SessionStart': {
      const root = input.cwd ?? ''
      // Codex runs SessionStart after compacting too, in the middle of a turn.
      const endsTurn = (s: SessionState) =>
        input.source === 'compact' ? s : overviewChanged(turnEnded(s, null), o => childrenCutOff(o, now()))
      const place = rolloutPath === null ? null : await placeIn(rolloutPath)
      const withPlace = (s: SessionState) => (place ? placed(s, place.folder, place.branch) : s)
      await readHistoryAhead()
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
      await readHistoryAhead()
      await write(async s => {
        const r = notePrompt(withHost(await withHistory(s)), input.prompt ?? '', now())
        notes = r.notes

        return input.agent_id ? r.state : noteHook(turnStarted(r.state, now()), 'prompt', now(), input.turn_id)
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
      const line = activityOf(tool, toolInput)
      const agentId = input.agent_id
      const delegates = agentId ? [] : delegateSteps(command).map(step => step.name)
      const withWork = (s: SessionState) =>
        overviewChanged(s, o => {
          const ran = delegates.reduce<typeof o>((x, name) => delegateRunning(x, name, now()), o)
          return agentId ? childActive(ran, agentId, now()) : ran
        })
      const hasWork = line !== null || agentId !== undefined || delegates.length > 0
      if (hasWork) await write(s => withWork(line ? noteActivity(withRollout(s), line) : withRollout(s)))

      return null
    }
    case 'SubagentStart': {
      const ref = input.agent_id
      if (!ref) return null
      const name = childName(input.agent_type || 'subagent')
      await write(s =>
        overviewChanged(s, o =>
          withChild(o, { ref, kind: 'subagent', name, startedAt: now(), endedAt: null, lastActivityAt: now() }, now()),
        ),
      )

      return null
    }
    case 'SubagentStop': {
      const ref = input.agent_id
      if (ref) await write(s => overviewChanged(s, o => childEnded(o, ref, now())))

      return null
    }
    case 'Stop': {
      const reply = input.last_assistant_message ?? ''
      const tail = await rolloutTail(input.transcript_path)
      const { dialogs, commands, plan } = turnOf(tail, input.turn_id)
      await readHistoryAhead(tail)
      const inHerdr = hasRunningDelegate((await read()).ledger.overview) ? await delegatesInHerdr(deps.run, dir) : null
      const lines = dialogs.map(d => dialogActivity(d.questions, { kind: 'open' }))
      const written = await write(async s => {
        const withLines = lines.reduce(
          (x, line) => noteActivity(x, line),
          noteDialogs(withHost(await withHistory(s)), dialogs),
        )
        const withOutput = commands.reduce((x, c) => noteCommandOutput(x, c.command, c.output), withLines)
        // A wait on a delegate holds the turn, so the delegate's turn settled by Stop, where the turn's commands are read.
        const settled = commands.flatMap(c => delegateSteps(c.command).filter(step => step.isWaitForEnd))
        const withDelegates = overviewChanged(withOutput, o => {
          const waited = settled.reduce((x, step) => childEnded(x, delegateRef(step.name), now()), o)
          return inHerdr ? delegatesSettled(waited, inHerdr, now()) : waited
        })

        const ended = withCoveredTurn(noteHook(turnEnded(endTurn(withDelegates, reply, now()), now()), 'stop', now()))

        return plan === null ? ended : { ...ended, hostTasks: plan }
      })
      if (needsUpdate(written)) deps.startUpdate(id)

      return null
    }
  }

  return null
}

/** The delegates Herdr shows running. Null outside Herdr, or when it gave no answer. */
async function delegatesInHerdr(run: Run, cwd: string): Promise<Set<string> | null> {
  const r = await run(HERDR_AGENT_LIST, { cwd, timeoutMs: HERDR_TIMEOUT_MS }).catch(() => null)

  return r?.code === 0 ? herdrRunning(r.stdout) : null
}
