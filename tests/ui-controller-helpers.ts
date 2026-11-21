import { closeFinding, closeItem } from '../core/domain/ledger-close'
import { emptySession } from '../core/view/session-files'
import { sessionView, type SessionView } from '../core/view/session-view'
import { SETTLED_MS } from '../core/view/timing'
import { notesOf, reduceUi } from '../core/view/ui-controller'
import { holdsOf } from '../core/view/ui-controller-reply'
import {
  freshUi,
  type HostFacts,
  type LookConfig,
  type UiCommand,
  type UiEvent,
  type UiState,
} from '../core/view/ui-controller-types'
import type { Finding, Item, LastAction, Session } from '../types'

export const LOOK: LookConfig = { runningMarks: 'pulse', titleTint: 'self', undoClock: 'session' }
export const FACTS: HostFacts = { isFetchingPrs: false, hasAsksBlocker: false, lastTypedMessageAt: null }
export const T0 = 1_000_000

export const question = (id: string, at = 1): Item => ({
  id,
  kind: 'question',
  label: null,
  ask: `Question ${id}`,
  options: ['Yes', 'No'],
  rec: null,
  helps: [],
  turn: 1,
  at,
  from: 'record',
})

export const finding = (id: string, at = 1): Finding => ({
  id,
  kind: 'issue',
  title: `Finding ${id}`,
  detail: 'Detail',
  path: null,
  at,
})

export function sessionWith(rows: { items?: Item[]; findings?: Finding[] }): Session {
  const s = emptySession()

  return { ...s, ledger: { ...s.ledger, items: rows.items ?? [], findings: rows.findings ?? [] } }
}

export const withItems = (s: Session, items: Item[]): Session => ({ ...s, ledger: { ...s.ledger, items } })

export const withFindings = (s: Session, findings: Finding[]): Session => ({ ...s, ledger: { ...s.ledger, findings } })

export const closedByAgent = (s: Session, id: string, now: number): Session => ({
  ...s,
  ledger: s.ledger.items.some(i => i.id === id)
    ? closeItem(s.ledger, id, { how: 'claude', outcome: 'handled' }, now)
    : closeFinding(s.ledger, id, { how: 'claude', outcome: 'handled' }, now),
})

export const withLastAction = (s: Session, id: string, last: LastAction): Session => ({
  ...s,
  lastActions: { ...s.lastActions, [id]: last },
})

export const replyAction = (reply: string, at: number, delivery?: LastAction['delivery']): LastAction => ({
  kind: 'talk',
  action: 'type',
  text: 'Reply',
  reply,
  at,
  ...(delivery === undefined ? {} : { delivery }),
})

export const viewOf = (s: Session, ui: UiState, now: number): SessionView =>
  sessionView(s, now, SETTLED_MS, holdsOf(ui, now), notesOf(ui))

type Run = { ui: UiState; commands: UiCommand[]; nextWakeAt: number | null }

export function send(ui: UiState, s: Session, event: UiEvent, now: number): Run {
  return reduceUi(ui, viewOf(s, ui, now), event, now)
}

export function openOn(s: Session, now = T0, tab: UiState['tab'] = 'needsYou', config = LOOK): Run {
  const opened = send(freshUi(config, tab), s, { type: 'opened' }, now)
  const read = send(opened.ui, s, { type: 'read', host: FACTS }, now)

  return { ...read, commands: [...opened.commands, ...read.commands] }
}

export const read = (ui: UiState, s: Session, now: number): Run => send(ui, s, { type: 'read', host: FACTS }, now)

export const kinds = (commands: UiCommand[]) => commands.map(c => c.kind)
