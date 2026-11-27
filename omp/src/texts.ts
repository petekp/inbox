import type { Host } from '../../core/domain/model-text'
import type { AgentTool } from '../../core/runtime/tools'

export const OMP: Host = {
  agent: 'omp',
  surface: 'the /inbox panel',
  band: 'a band above their prompt',
  findingsIn: 'the Finds tab of the /inbox panel',
  prsIn: 'the PRs tab of the /inbox panel',
  recordTool: 'record',
  closeTool: 'close',
  splitsPlanIntoSubjects: false,
  heldActRule:
    'Marking a PR ready is such an act, since reviewers see it. Leave out a step outside the task, such as a commit nobody asked for, and say in your reply that you have not taken it.',
  intro:
    "The inbox extension shows the user what waits on them: your open questions and the tasks only they can do, in the /inbox panel, and your findings, in the panel's Finds tab. A band above their prompt shows only counts: one for your questions and their tasks together, one for your findings, and one for their PRs that wait on them.",
}

/** The names omp shows for the inbox's tools. */
export const TOOL_LABELS: Record<AgentTool, string> = {
  record: 'Inbox record',
  close: 'Inbox close',
  order_prs: 'Inbox PR order',
}
