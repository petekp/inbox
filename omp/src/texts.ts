import type { Host } from '../../hooks/model-text'
import type { AgentTool } from '../../hooks/tools'

export const OMP: Host = {
  agent: 'omp',
  surface: 'the /inbox panel',
  band: 'a band above their prompt',
  findingsIn: 'the Finds tab of the /inbox panel',
  prsIn: 'the PRs tab of the /inbox panel',
  recordTool: 'record',
  closeTool: 'close',
  intro:
    "The inbox extension shows the user what waits on them: your open questions and the tasks only they can do, in the /inbox panel, and your findings, in the panel's Finds tab. A band above their prompt shows only two counts: one for your questions and their tasks together, and one for your findings.",
}

/** The names omp shows for the inbox's tools. */
export const TOOL_LABELS: Record<AgentTool, string> = {
  record: 'Inbox record',
  close: 'Inbox close',
  order_prs: 'Inbox PR order',
}
