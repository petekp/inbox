import type { Closed, ClosedFinding, Finding, Item, Ledger } from '../types'

export type { Exchange, Press } from '../types'
import { recommendedOption } from './ask-match'
import { EXPIRED } from './ledger-update'
import { readKind } from './reply-parse'
import { upgradeStatus } from './status-upgrade'

export { isAskedForChoices, LIST_CHOICES } from './ask-match'
export { closedAt, closedState, closeItem, reopenFinding, reopenItem } from './ledger-close'
export type { ClosedState } from './ledger-close'
export { parseReply, readKind, tasksRunBy } from './reply-parse'

/** How many saved sessions each host keeps; the newest by save time. */
export const KEPT_SESSIONS = 40

export const EMPTY: Ledger = {
  overview: null,
  items: [],
  closed: [],
  findings: [],
  closedFindings: [],
  prs: [],
  prOrder: null,
  nextId: 1,
  turn: 0,
  batchTurn: 0,
  updates: 0,
}

/** Whether nothing has been recorded: no model answer applied, no Status, no item and no finding. */
export function isBlankLedger(ledger: Ledger): boolean {
  const isStatusBlank = !ledger.overview || (ledger.overview.head === null && ledger.overview.subjects.length === 0)

  return ledger.updates === 0 && isStatusBlank && ledger.items.length === 0 && ledger.findings.length === 0
}

/**
 * A ledger saved by an earlier version of the mod, in the current shape.
 * Findings were once saved as `notes`; items once had no time, and closed
 * items no kind or `how`, so an old closed item counts as a question. Closed
 * items were saved as `decided`, and kinds as `decide` and `do`. Closed
 * findings were once not kept.
 */
export function upgradeLedger(ledger: Ledger): Ledger {
  const {
    notes,
    decided,
    milestones: _milestones,
    card,
    ...rest
  } = ledger as Ledger & {
    notes?: Finding[]
    decided?: Ledger['closed']
    milestones?: unknown
    card?: unknown
  }
  const updates = typeof rest.updates === 'number' ? rest.updates : card ? 1 : 0

  return {
    ...rest,
    prOrder: rest.prOrder
      ? { ...rest.prOrder, why: rest.prOrder.why ?? null, statuses: rest.prOrder.statuses ?? null }
      : null,
    updates,
    overview: upgradeStatus(rest.overview),
    findings: [...(rest.findings ?? []), ...(notes ?? [])],
    // reopenFinding puts these back, so a conversion added for findings must run on them too.
    closedFindings: (rest.closedFindings ?? []).map(upgradeClosedFinding),
    items: rest.items.map(upgradeItem),
    closed: (rest.closed ?? decided ?? []).map(d => ({
      ...d,
      kind: readKind(d.kind),
      how: d.how ?? howFromOutcome(d.outcome),
      ...(d.item ? { item: upgradeItem(d.item) } : {}),
    })),
  }
}

const ASKED_AS = /^asked as (i\d+)$/

/** A finding closed as "asked as iN" before the close record kept `askedAs` gets the link from its outcome. */
function upgradeClosedFinding(f: ClosedFinding): ClosedFinding {
  const asker = f.how === 'update' ? ASKED_AS.exec(f.outcome)?.[1] : undefined

  return asker && f.askedAs === undefined ? { ...f, askedAs: asker } : f
}

/** Also run on the copy a close record keeps, which reopenItem puts back. */
function upgradeItem(item: Item): Item {
  return {
    ...item,
    kind: readKind(item.kind),
    at: item.at ?? null,
    rec: recommendedOption(item.options, item.rec),
    from: item.from ?? 'update',
  }
}

/** How a closed item saved before `how` existed closed, read from its outcome's wording. */
function howFromOutcome(outcome: string): Closed['how'] {
  if (outcome === 'dismissed') return 'dismissed'
  if (outcome === EXPIRED) return 'expired'
  if (outcome === 'done' || outcome === 'you ran it') return 'done'
  if (outcome.startsWith(CLOSED_BY_CLAUDE)) return 'claude'

  return 'update'
}

/** How an outcome the mod saved before `how` existed marks an item Claude closed. */
const CLOSED_BY_CLAUDE = 'closed by Claude'
