import type { Hook } from 'claude-code'

import type { SessionStatus } from '../types'
import { dialogActivity, dialogQuestions, toolActivity } from './catch-up-text'
import {
  childStarted,
  childWorked,
  delegatesStarted,
  delegatesTakenBack,
  delegateSteps,
  delegateWaitsEnded,
  waitsOnDelegate,
} from './children'
import { dialogOutcome, TURN_BOX_TOOL, turnBoxText } from './claude'
import { noteAnsweredDialog, noteDialog } from './dialogs'
import { claudeTasksAfter } from './host-tasks'
import { clearingDialog, openDialog } from './mod-dialogs'
import { modDelegate } from './mod-herdr'
import { modRecordMatches } from './mod-history'
import type { Mod } from './mod-ports'
import { linkPrs } from './mod-prs'
import {
  askedCalls,
  callKey,
  childRefOf,
  delegateWaits,
  endedAgentOf,
  endedCallRan,
  HOST_TASK_TOOLS,
  isActivityWorthSaving,
  MAX_PERSON_LINES,
  spawnedBy,
  startedWorkflowOf,
  toolRecord,
  workflowTasks,
} from './mod-records'
import { isLastSaveRefused } from './mod-saves'
import { answerToolCall, currentOwner } from './mod-sessions'
import { mod, sessionState } from './mod-state'
import { noteActivity } from './mod-updates'
import { statusChanged } from './session-status'
import { commandFindings, noteActivity as noteTurnActivity } from './session-turns'
import { childEnded } from './status-children'
import { type AgentTool, NOT_SAVED, type ToolAnswer } from './tools'

type ToolCallCalls = Pick<
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

type AgentSpawnEvent = Parameters<Hook<'agent.spawn'>>[1]
type ToolCallEvent = Parameters<Hook<'tool.call'>>[1]
type ToolCallNext = Parameters<Hook<'tool.call'>>[2]

export async function runTool(
  m: ToolCallCalls,
  tool: AgentTool,
  input: Record<string, unknown>,
  toolUseId: string | undefined,
): Promise<string> {
  const [now, delegate, earlier] = await Promise.all([
    m.clock.now(),
    modDelegate(m.herdr),
    tool === 'record' ? modRecordMatches(m.history, input) : [],
  ])
  const owner = currentOwner()
  let answer: Omit<ToolAnswer, 'ledger'> = { result: '', personLine: null }
  await m.commit(owner, s => {
    const r = answerToolCall(s, tool, input, now, delegate, earlier)
    answer = r
    return r.state
  })
  const { personLine } = answer
  if (personLine !== null && toolUseId)
    await m.atoms.personLines.update(lines =>
      Object.fromEntries([...Object.entries(lines), [toolUseId, personLine]].slice(-MAX_PERSON_LINES)),
    )
  const isChangeUnsaved = personLine !== null && isLastSaveRefused(owner.id)

  return isChangeUnsaved ? `${answer.result} ${NOT_SAVED}` : answer.result
}

export async function noteChild(
  m: ToolCallCalls,
  change: (o: SessionStatus | null, at: number) => SessionStatus | null,
  isWorthSaving: (at: number) => boolean = () => true,
) {
  const at = await m.clock.now()
  if (!isWorthSaving(at)) return null
  let before: SessionStatus | null = null
  const changed = (o: SessionStatus | null) => change((before = o), at)
  await m.commit(currentOwner(), s => statusChanged(s, changed)).catch(() => undefined)

  return { before, at }
}

export async function noteAgentWork(m: ToolCallCalls, agentId: string) {
  const ref = childRefOf(agentId)
  await noteChild(
    m,
    (o, at) => childWorked(o, ref, at),
    at => isActivityWorthSaving(ref, at),
  )
}

/** A spawned agent: a subagent's child work counts as its parent's, and any other starts a child of the Status. */
export async function agentSpawned(m: ToolCallCalls, e: AgentSpawnEvent, agentId: string | undefined) {
  if (!mod.isOn || !agentId || e.isTeammate) return
  const parent = e.parentAgentId ?? (e.workflow ? e.tool_use_id : undefined)
  if (parent) {
    spawnedBy.set(agentId, parent)
    await noteAgentWork(m, agentId)

    return
  }
  await noteChild(m, (o, at) => childStarted(o, { ref: agentId, kind: 'subagent', name: e.description }, at))
}

/**
 * Runs a tool call through `next`, noting what it shows: the agent's activity, delegates and subagents it starts or
 * waits on, the PRs a command names, a question dialog, and the host's own task list.
 */
export async function toolCalled(m: ToolCallCalls, e: ToolCallEvent, next: ToolCallNext) {
  if (!mod.isOn) return next(e)
  const { tool: _tool, tool_use_id: _id, agentId: _agent, ...input } = e as unknown as Record<string, unknown>
  const key = callKey(String(e.tool), input)
  const activity = e.agentId ? null : toolActivity(String(e.tool), input)
  const call = { didRun: true }
  const run = async () => {
    try {
      return await clearingDialog(m, key, () => next(e))
    } finally {
      if (e.tool_use_id) askedCalls.delete(e.tool_use_id)
      call.didRun = endedCallRan(e.tool_use_id, String(e.tool))
      if (call.didRun && activity) await noteActivity(m, activity)
    }
  }
  if (e.agentId) {
    await noteAgentWork(m, e.agentId)
    return run()
  }
  if (String(e.tool) === TURN_BOX_TOOL) sessionState.turnBox = turnBoxText(input) ?? sessionState.turnBox
  if (e.tool === 'Bash') {
    const steps = delegateSteps(e.command)
    const isDelegateCommand = steps.length > 0
    const isWait = waitsOnDelegate(e.command)
    const started = isWait ? await noteChild(m, (o, at) => delegatesStarted(o, e.command, at)) : null
    const ran = await run()
    if (!call.didRun) {
      if (started) await noteChild(m, o => delegatesTakenBack(o, e.command, started.before, started.at))
      return ran
    }
    if (isDelegateCommand && !isWait) await noteChild(m, (o, at) => delegatesStarted(o, e.command, at))
    const found = commandFindings(e.command, ran.text ?? '')
    for (const line of found.lines) await noteActivity(m, line)
    void linkPrs(m, found.prRefs)
    const taskId = toolRecord('Bash', ran.result)?.backgroundTaskId
    const waitsOn = steps.filter(step => step.isWaitForEnd).map(step => step.name)
    if (taskId && isDelegateCommand) {
      for (const name of waitsOn) for (const id of [taskId, e.tool_use_id]) if (id) delegateWaits.set(id, name)
    } else if (!taskId && waitsOn.length > 0) {
      await noteChild(m, (o, at) => delegateWaitsEnded(o, e.command, at))
    }

    return ran
  }
  if (e.tool === 'Agent') {
    const ran = await run()
    const agentId = endedAgentOf(ran.result)
    if (agentId) await noteChild(m, (o, at) => childEnded(o, agentId, at))

    return ran
  }
  if (e.tool === 'Workflow') {
    const ran = await run()
    const child = startedWorkflowOf(ran.result, e.description)
    if (child) {
      if (e.tool_use_id) workflowTasks.set(e.tool_use_id, child.ref)
      await noteChild(m, (o, at) => childStarted(o, child, at))
    }

    return ran
  }
  if (e.tool === 'AskUserQuestion') {
    const questions = (Array.isArray(input.questions) ? input.questions : []) as { question?: unknown }[]
    const question = typeof questions[0]?.question === 'string' ? questions[0].question : 'A question'
    await openDialog(m, { kind: 'question', text: question, key })
    const ran = await run()
    const outcome = dialogOutcome(ran)
    const asked = dialogQuestions(input.questions)
    const wasDismissed = outcome.kind === 'dismissed'
    if (wasDismissed) sessionState.isDialogDismissed = true
    const line = dialogActivity(asked, outcome)
    const endedAt = await m.clock.now()
    await m
      .commit(currentOwner(), s => {
        const noted = noteTurnActivity(s, line)
        if (wasDismissed) return noteDialog(noted, null, asked)

        return outcome.kind === 'answered' ? noteAnsweredDialog(noted, asked, outcome, endedAt) : noted
      })
      .catch(() => undefined)

    return ran
  }
  if (HOST_TASK_TOOLS.has(String(e.tool))) {
    const ran = await run()
    const tool = String(e.tool)
    const didRun = !ran.isError && typeof ran.deny !== 'string'
    if (didRun)
      await m
        .commit(currentOwner(), s => ({
          ...s,
          hostTasks: claudeTasksAfter(s.hostTasks, tool, input, ran.text ?? null),
        }))
        .catch(() => undefined)

    return ran
  }
  return run()
}
