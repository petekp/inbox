import { mock } from 'claude-code/testing'
import type { Mounted } from 'claude-code/testing'
import { reportedTokens } from './session-script'
import { w } from './hooks-world'

export const BAND = {
  component: 'AbovePrompt' as const,
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 16,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 15 },
    view: {},
  },
}

export const PANE = {
  plugin: 'inbox',
  surface: 'terminal' as const,
  component: 'Pane' as const,
  requestId: 'inbox',
  props: {
    title: 'Inbox',
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
}

export async function selectRow(
  pane: { find(q: { key: string }): Promise<unknown>; press(q: { key: string }): Promise<unknown> },
  id: string,
) {
  if (await pane.find({ key: `title-${id}` })) await pane.press({ key: `title-${id}` })
}

export async function leaveAndReturn(
  pane: Pick<Mounted, 'press'>,
  clock: Pick<ReturnType<typeof mock.clock>, 'advance' | 'settle'>,
  tab: 'needsYou' | 'findings' | 'prs',
) {
  await clock.advance(1)
  await pane.press({ key: tab === 'findings' ? 'tab-needsYou' : 'tab-findings' })
  await clock.settle()
  await pane.press({ key: `tab-${tab}` })
  await clock.settle()
}

export async function replyField(pane: Pick<Mounted, 'findAll'>, id: string) {
  return (await pane.findAll({ type: 'Input' })).find(e => e.key?.startsWith(`type-${id}-`))
}

export async function replyKey(pane: Pick<Mounted, 'findAll'>, id: string) {
  const key = (await replyField(pane, id))?.key
  if (!key) throw new Error(`no reply field on ${id}`)
  return key
}

function sidebarReports(): Record<string, string | null>[] {
  return w.ran.filter(argv => argv[0] === 'herdr').map(reportedTokens)
}

export function sidebarLines(): string[] {
  return sidebarReports().map(tokens => tokens.inbox ?? '')
}

export function sidebarTokens(): Record<string, string | null> {
  return sidebarReports().at(-1) ?? {}
}

export const NO_COUNTS = { 'inbox-stop': null, 'inbox-needs-you': null, 'inbox-findings': null, 'inbox-prs': null }

export const SAVED_SESSION = {
  savedAt: 900_000,
  ledger: {
    items: [
      {
        id: 'i1',
        kind: 'question',
        label: '1',
        ask: 'Use Node or Python?',
        options: ['Node', 'Python'],
        rec: 'Node',
        helps: [],
        turn: 1,
        at: 900_000,
      },
    ],
    closed: [],
    findings: [],
    closedFindings: [],
    prs: [],
    nextId: 2,
    turn: 1,
    batchTurn: 1,
  },
}

export const childrenOf = (stored: Map<string, string>) => {
  const saved = [...stored].find(([k]) => k.startsWith('s:'))
  const children: {
    kind: string
    name: string
    endedAt: number | null
    lastActivityAt: number | null
    delegateState: string | null
  }[] = (saved && JSON.parse(saved[1]).ledger.overview?.children) ?? []

  return children
}

export const notice = (id: string, status: string) =>
  `<task-notification>\n<task-id>${id}</task-id>\n<status>${status}</status>\n<summary>Done</summary>\n</task-notification>`
