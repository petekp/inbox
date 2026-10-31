import type { Closed, ClosedFinding, Exchange, Finding, Item, Ledger, Press, PressKind } from '../types'
import {
  matchOpen,
  recommendedOption,
  repeatsClosed,
  repeatsSettled,
  repeatsSubject,
  restates,
  sameAsk,
} from './ask-match'
import { asksAbout, closedRecord, closeFinding, OVERTAKEN_OUTCOMES, reopenAskedFindings } from './ledger-close'
import { todoAsk, withHelp } from './reply-parse'
import type { Update } from './reply-parse'

const MAX_OPEN = 20
const STALE_AFTER = 12
/**
 * A "no longer applies" close whose reason says nothing made the item moot, as "not related to this exchange". The
 * rule asks for what made it moot, and Sonnet at low effort writes these for unrelated items it should leave open.
 */
const UNFOUNDED_MOOT =
  /^no longer applies:.*(\b(not|never) (related|relevant|addressed|mentioned|discussed|answered|raised|part of)\b|\bunrelated\b|\b(still|stays) open\b|\boutside (the|this)\b|\bnothing\b.*\b(touch|address|mention|relate))/i
export const EXPIRED = 'expired, unanswered'
const MAX_FINDINGS = 30

/** The recommendation of a question asked again: the stated one when it names one of `options`, else the old one when it still does. */
function restatedRec(options: string[], old: string | null, stated: string | null): string | null {
  return recommendedOption(options, stated) ?? recommendedOption(options, old)
}

/** The kind of each press that sends a message. A Talk press asks about its row, which its reply leaves open. */
const SENT_PRESS_KINDS: Record<Press['action'], PressKind> = {
  answer: 'mark',
  explain: 'talk',
  compare: 'talk',
  run: 'handoff',
  done: 'mark',
}

export function applyExchangeUpdate(
  ledger: Ledger,
  update: Update,
  exchange: Exchange,
  now: number,
  promptAt: number,
): Ledger {
  const press = exchange.press
  const talkedAboutId = press && SENT_PRESS_KINDS[press.action] === 'talk' ? press.id : null

  return applyUpdate(
    ledger,
    { ...update, closed: update.closed.filter(c => c.id !== talkedAboutId) },
    now,
    exchange.turn,
    promptAt,
  )
}

/** The CLOSED outcome forms that are not the person's answer: systemText's "done:" and "no longer applies:", and the words closedState reads as overtaken. */
const NOT_AN_ANSWER = new RegExp(`^\\s*(?:done\\s*:|(?:${OVERTAKEN_OUTCOMES}|no longer relevant|dealt with)\\b)`, 'i')

function isPersonsAnswer(outcome: string): boolean {
  return outcome.trim() !== '' && !NOT_AN_ANSWER.test(outcome)
}

/**
 * `promptAt` is when the update's prompt was built. A NEW line that repeats an
 * item closed since then is dropped: the person answered it while the model ran.
 * The agent closes the items it recorded with its close tool, so a CLOSED line
 * closes one of those only with the person's answer.
 */
export function applyUpdate(ledger: Ledger, u: Update, now: number, turn: number, promptAt = now): Ledger {
  const stillAsked = new Set(u.updated.filter(c => c.options || c.rec).map(c => c.id))
  const closing = new Map(
    u.closed.filter(c => !stillAsked.has(c.id) && !UNFOUNDED_MOOT.test(c.outcome)).map(c => [c.id, c.outcome]),
  )
  const closed = [...ledger.closed]
  const items: Item[] = []
  for (const item of ledger.items) {
    const outcome = closing.get(item.id)
    const helps = u.helped.filter(h => h.id === item.id).reduce((all, h) => withHelp(all, h.help), item.helps)
    const isClosing = outcome !== undefined && (item.from !== 'record' || isPersonsAnswer(outcome))
    if (isClosing) closed.push(closedRecord(item, { outcome, how: 'update' }, now))
    else items.push(withUpdate({ ...item, helps }, u.updated))
  }
  const recordedThisTurn = new Set(
    [...ledger.items, ...ledger.closed.flatMap(c => c.item ?? [])]
      .filter(i => i.from === 'record' && i.turn === turn)
      .map(i => i.kind),
  )

  let nextId = ledger.nextId
  let added = 0
  const addedIds: (string | null)[] = []
  const created = new Set<string>()
  for (const a of u.added) {
    if (repeatsClosed(ledger.closed, a, promptAt)) {
      addedIds.push(null)
      continue
    }
    const at = matchOpen(items, a, created)
    const restated = items[at]
    if (restated) {
      items[at] = {
        ...restated,
        helps: a.helps.reduce((all, h) => withHelp(all, h), restated.helps),
        rec: restatedRec(restated.options, restated.rec, a.rec),
        ...(a.isDesignChoice ? { isDesignChoice: true } : {}),
      }
      addedIds.push(restated.id)
      continue
    }
    if (recordedThisTurn.has(a.kind)) {
      addedIds.push(null)
      continue
    }
    items.push({ ...a, id: `i${nextId}`, turn, at: now, from: 'update' })
    addedIds.push(`i${nextId}`)
    created.add(`i${nextId}`)
    nextId += 1
    added += 1
  }
  for (const work of u.todos) {
    const todo = {
      kind: 'question' as const,
      label: null,
      ask: todoAsk(work),
      options: ['Proceed', 'Not yet'],
      rec: null,
    }
    const isKnown =
      items.some(i => restates(i.ask, work)) ||
      ledger.findings.some(f => restates(f.title, work)) ||
      repeatsClosed(ledger.closed, { ...todo, helps: [] }, promptAt)
    if (isKnown) continue
    items.push({ ...todo, helps: [], id: `i${nextId}`, turn, at: now, from: 'update' })
    nextId += 1
    added += 1
  }

  const kept = items.filter(i => i.from === 'record' || turn - i.turn <= STALE_AFTER).slice(-MAX_OPEN)
  for (const i of items) if (!kept.includes(i)) closed.push(closedRecord(i, { outcome: EXPIRED, how: 'expired' }, now))

  const askedBy = new Map<string, string>()
  for (const a of u.asked) {
    const id = typeof a.item === 'number' ? addedIds[a.item] : a.item
    const asker = kept.find(i => i.id === id)
    const finding = ledger.findings.find(f => f.id === a.id)
    if (asker && finding && asksAbout(asker, finding, true)) askedBy.set(a.id, asker.id)
  }
  for (const i of kept.filter(i => created.has(i.id)))
    for (const f of ledger.findings) if (!askedBy.has(f.id) && asksAbout(i, f)) askedBy.set(f.id, i.id)
  const { findings, closedFindings } = ledger.findings.reduce((l, f) => {
    const asker = askedBy.get(f.id)
    const outcome = closing.get(f.id)
    if (outcome !== undefined) return closeFinding(l, f.id, { outcome, how: 'update' }, now)

    return asker ? closeFinding(l, f.id, { outcome: `asked as ${asker}`, how: 'update' }, now, asker) : l
  }, ledger)

  return reopenAskedFindings(
    {
      ...ledger,
      items: kept,
      closed,
      findings,
      closedFindings,
      nextId,
      batchTurn: added > 0 ? turn : ledger.batchTurn,
      updates: ledger.updates + 1,
    },
    closed.slice(ledger.closed.length),
  )
}

function withUpdate(item: Item, updated: Update['updated']): Item {
  const change = updated.findLast(c => c.id === item.id)
  if (!change || item.kind !== 'question') return item
  const options = change.options ?? item.options

  return { ...item, options, rec: restatedRec(options, item.rec, change.rec) }
}

/**
 * Adds a finding Claude recorded. One whose title matches an open finding, or
 * rewords an open item's ask, is skipped, so one thing shows in one list. So is
 * one that repeats a finding the person dismissed (`dismissed` is that record) as
 * `repeatsSubject` says; a finding that expired
 * or was closed as fixed can be recorded again. When the list is full, the
 * oldest finding closes as expired to make room.
 */
export function addFinding(
  ledger: Ledger,
  finding: Omit<Finding, 'id'>,
): { ledger: Ledger; id: string; isAdded: boolean; expired: Finding | null; dismissed: ClosedFinding | null } {
  const same =
    ledger.findings.find(f => sameAsk(f.title, finding.title)) ?? ledger.items.find(i => restates(i.ask, finding.title))
  if (same) return { ledger, id: same.id, isAdded: false, expired: null, dismissed: null }
  const dismissed =
    ledger.closedFindings.findLast(f => f.how === 'dismissed' && repeatsSubject(f.title, finding.title)) ?? null
  if (dismissed) return { ledger, id: dismissed.id, isAdded: false, expired: null, dismissed }
  const id = `f${ledger.nextId}`
  const expired = ledger.findings.length >= MAX_FINDINGS ? ledger.findings[0]! : null
  const room = expired ? closeFinding(ledger, expired.id, { how: 'expired', outcome: 'list full' }, finding.at) : ledger

  return {
    ledger: { ...room, findings: [...room.findings, { ...finding, id }], nextId: ledger.nextId + 1 },
    id,
    isAdded: true,
    expired,
    dismissed: null,
  }
}

type AgentItemResult =
  | { ledger: Ledger; is: 'added'; id: string; expired: Item | null }
  /** `newRec` is the recommendation the record changed the item to, or null when it kept the item's own. */
  | { ledger: Ledger; is: 'open'; id: string; addedSteps: number; isNewlyMarked: boolean; newRec: string | null }
  | { ledger: Ledger; is: 'closed'; record: Closed }

/**
 * Adds a question or task the agent recorded. One that an open item restates adds its steps and its design-choice mark
 * to that item, gives it the recommendation when that names one of the item's options, and stamps its `reportedAt`.
 * One that repeats a closed item is skipped, unless that item expired or the agent closed it.
 * The list keeps its newest MAX_OPEN items. A finding the new ask restates closes, so one thing shows in one list.
 */
export function addAgentItem(
  ledger: Ledger,
  entry: Pick<Item, 'kind' | 'ask' | 'options' | 'rec' | 'helps' | 'isDesignChoice'>,
  now: number,
): AgentItemResult {
  const candidate = { ...entry, label: null }
  const recordedThisTurn = new Set(ledger.items.filter(i => i.turn === ledger.turn).map(i => i.id))
  const open = matchOpen(ledger.items, candidate, recordedThisTurn)
  const openItem = ledger.items[open]
  if (openItem) {
    const helps = entry.helps.reduce(withHelp, openItem.helps)
    const isDesignChoice = openItem.isDesignChoice === true || entry.isDesignChoice === true
    const rec = restatedRec(openItem.options, openItem.rec, entry.rec)
    const reported = { ...openItem, helps, isDesignChoice, rec, reportedAt: now }
    const items = ledger.items.map(i => (i === openItem ? reported : i))

    return {
      ledger: { ...ledger, items },
      is: 'open',
      id: openItem.id,
      addedSteps: helps.length - openItem.helps.length,
      isNewlyMarked: isDesignChoice && openItem.isDesignChoice !== true,
      newRec: rec !== openItem.rec ? rec : null,
    }
  }
  const isAskable = (c: Closed) => c.how === 'expired' || c.how === 'claude'
  const repeated = ledger.closed.findLast(c => !isAskable(c) && repeatsSettled(c, candidate))
  if (repeated) return { ledger, is: 'closed', record: repeated }

  const id = `i${ledger.nextId}`
  const items = [...ledger.items, { ...entry, label: null, id, turn: ledger.turn, at: now, from: 'record' as const }]
  const kept = items.slice(-MAX_OPEN)
  const dropped = items.filter(i => !kept.includes(i))
  const closed = [...ledger.closed, ...dropped.map(i => closedRecord(i, { outcome: EXPIRED, how: 'expired' }, now))]
  const asked = { ...entry, label: null }
  const restated = ledger.findings.filter(f => asksAbout(asked, f))
  const base: Ledger = { ...ledger, items: kept, closed, nextId: ledger.nextId + 1, batchTurn: ledger.turn }
  const next = reopenAskedFindings(
    restated.reduce((l, f) => closeFinding(l, f.id, { outcome: `asked as ${id}`, how: 'update' }, now, id), base),
    closed.slice(ledger.closed.length),
  )

  return { ledger: next, is: 'added', id, expired: dropped[0] ?? null }
}
