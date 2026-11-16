import type { Closed, ClosedFinding, Exchange, Finding, Item, Ledger, Press, PressKind } from '../types'
import {
  dismissedFindingOf,
  isQuestionBack,
  matchOpen,
  raisesOnly,
  CLOSED_CONTEXT_LIMIT,
  canAskAgain,
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

/**
 * A "no longer applies" close whose reason says nothing made the item moot, as "not related to this exchange". The
 * rule asks for what made it moot, and Sonnet at low effort writes these for unrelated items it should leave open.
 */
const UNFOUNDED_MOOT =
  /^no longer applies:.*(\b(not|never) (related|relevant|addressed|mentioned|discussed|answered|raised|part of)\b|\bunrelated\b|\b(still|stays) open\b|\boutside (the|this)\b|\bnothing\b.*\b(touch|address|mention|relate))/i
/**
 * A FIXED outcome that says the person put the finding off rather than that a change fixed it. systemText says to
 * write no FIXED line then, and the finding stays open until the person dismisses it.
 */
const PUT_OFF =
  /^\s*(?:(?:the )?(?:user|person) )?(?:dismissed|declined|deferred (?:to|until|till|for)|postponed|put (?:it )?off|set aside|not now|later\b|can wait|won'?t fix|skipped)|\b(?:user|person) (?:said|says|asked|wants|chose|decided|declined|dismissed|deferred|put it off)\b/i
export const EXPIRED = 'expired, unanswered'
const MAX_FINDINGS = 30

/** The recommendation of a question asked again: the stated one when it names one of `options`, else the old one when it still does. */
function restatedRec(options: string[], old: string | null, stated: string | null): string | null {
  return recommendedOption(options, stated) ?? recommendedOption(options, old)
}

/** `item` with recommendation `rec`, and `reason` as its reason when given. A reason given for another option is dropped. */
function withRec(item: Item, rec: string | null, reason?: string): Item {
  const { recReason, ...rest } = item
  const kept = reason ?? (rec === item.rec ? recReason : undefined)

  return { ...rest, rec, ...(rec && kept ? { recReason: kept } : {}) }
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

export function isPersonsAnswer(outcome: string): boolean {
  return outcome.trim() !== '' && !NOT_AN_ANSWER.test(outcome)
}

/**
 * `promptAt` is when the update's prompt was built. A NEW line that repeats an
 * item closed since then is dropped: the person answered it while the model ran.
 * The agent closes the items it recorded with its close tool, so a CLOSED line
 * closes one of those only with the person's answer. A question back is not an
 * answer, so it closes no question.
 */
export function applyUpdate(ledger: Ledger, u: Update, now: number, turn: number, promptAt = now): Ledger {
  const feedIds = new Set(ledger.findings.filter(f => f.feedOwned).map(f => f.id))
  const sourceItemIds = new Set(ledger.items.filter(i => i.sourceManaged).map(i => i.id))
  const stillAsked = new Set(u.updated.filter(c => c.options || c.rec).map(c => c.id))
  const isPutOffFinding = (c: Update['closed'][number]) =>
    ledger.findings.some(f => f.id === c.id) && PUT_OFF.test(c.outcome)
  const closing = new Map(
    u.closed
      .filter(
        c =>
          !feedIds.has(c.id) &&
          !sourceItemIds.has(c.id) &&
          !stillAsked.has(c.id) &&
          !UNFOUNDED_MOOT.test(c.outcome) &&
          !isPutOffFinding(c),
      )
      .map(c => [c.id, c.outcome]),
  )
  const closed = [...ledger.closed]
  const items: Item[] = []
  for (const item of ledger.items) {
    if (item.sourceManaged) {
      items.push(item)
      continue
    }
    const outcome = closing.get(item.id)
    const helps = u.helped.filter(h => h.id === item.id).reduce((all, h) => withHelp(all, h.help), item.helps)
    const isQuestionBackOutcome =
      outcome !== undefined && item.kind === 'question' && isQuestionBack(outcome, item.options)
    const isClosing = outcome !== undefined && !isQuestionBackOutcome && item.from !== 'record'
    if (isClosing) closed.push(closedRecord(item, { outcome, how: 'update' }, now))
    else items.push(withUpdate({ ...item, helps }, u.updated))
  }
  const recordedThisTurn = new Set(
    [...ledger.items, ...ledger.closed.flatMap(c => c.item ?? [])]
      .filter(i => !i.sourceManaged && i.from === 'record' && i.turn === turn)
      .map(i => i.kind),
  )

  let nextId = ledger.nextId
  let added = 0
  const addedIds: (string | null)[] = []
  const created = new Set<string>()
  for (const a of u.added) {
    if (items.some(i => i.sourceManaged && matchOpen([i], a) >= 0)) {
      addedIds.push(null)
      continue
    }
    if (repeatsClosed(ledger.closed, a, promptAt, isPersonsAnswer, ledger.closedFindings)) {
      addedIds.push(null)
      continue
    }
    const at = matchOpen(items, a, created)
    const restated = items[at]
    if (restated) {
      items[at] = {
        ...withRec(restated, restatedRec(restated.options, restated.rec, a.rec)),
        helps: a.helps.reduce((all, h) => withHelp(all, h), restated.helps),
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
      ledger.findings.some(f => !f.feedOwned && restates(f.title, work)) ||
      repeatsClosed(ledger.closed, { ...todo, helps: [] }, promptAt, isPersonsAnswer)
    if (isKnown) continue
    items.push({ ...todo, helps: [], id: `i${nextId}`, turn, at: now, from: 'update' })
    nextId += 1
    added += 1
  }

  const askedBy = new Map<string, string>()
  for (const a of u.asked) {
    const id = typeof a.item === 'number' ? addedIds[a.item] : a.item
    const asker = items.find(i => i.id === id)
    const finding = ledger.findings.find(f => f.id === a.id)
    if (asker && finding && !finding.sourceManaged && asksAbout(asker, finding, true)) askedBy.set(a.id, asker.id)
  }
  for (const i of items.filter(i => created.has(i.id)))
    for (const f of ledger.findings)
      if (!f.sourceManaged && !f.feedOwned && !askedBy.has(f.id) && asksAbout(i, f)) askedBy.set(f.id, i.id)
  const { findings, closedFindings } = ledger.findings.reduce((l, f) => {
    const asker = askedBy.get(f.id)
    const outcome = closing.get(f.id)
    if (outcome !== undefined) return closeFinding(l, f.id, { outcome, how: 'update' }, now)

    return asker ? closeFinding(l, f.id, { outcome: `asked as ${asker}`, how: 'update' }, now, asker) : l
  }, ledger)

  return reopenAskedFindings(
    {
      ...ledger,
      items,
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

  return withRec({ ...item, options }, restatedRec(options, item.rec, change.rec))
}

/**
 * Adds a finding Claude recorded. One whose title matches an open finding, or
 * rewords an open item's ask, is skipped, so one thing shows in one list. So is
 * one that repeats a finding or an ask the person dismissed (`dismissed` is that record) as
 * `repeatsSubject` says; a finding that expired
 * or was closed as fixed can be recorded again. When the list is full, the
 * oldest finding closes as expired to make room.
 */
export function addFinding(
  ledger: Ledger,
  finding: Omit<Finding, 'id'>,
): {
  ledger: Ledger
  id: string
  isAdded: boolean
  expired: Finding | null
  dismissed: ClosedFinding | Pick<Closed, 'id' | 'outcome'> | null
} {
  const sourceManaged =
    ledger.findings.find(f => f.sourceManaged && sameAsk(f.title, finding.title)) ??
    ledger.items.find(i => i.sourceManaged && restates(i.ask, finding.title))
  if (sourceManaged) return { ledger, id: sourceManaged.id, isAdded: false, expired: null, dismissed: null }

  const sameFinding = ledger.findings.find(f => sameAsk(f.title, finding.title))
  const same = sameFinding ?? ledger.items.find(i => restates(i.ask, finding.title))
  if (same) {
    const findings =
      finding.document && sameFinding
        ? ledger.findings.map(f =>
            f.id === same.id ? { ...f, document: finding.document, documentPreview: finding.documentPreview } : f,
          )
        : ledger.findings
    return {
      ledger: findings === ledger.findings ? ledger : { ...ledger, findings },
      id: same.id,
      isAdded: false,
      expired: null,
      dismissed: null,
    }
  }
  const dismissed =
    ledger.closedFindings.findLast(f => f.how === 'dismissed' && repeatsSubject(f.title, finding.title)) ??
    ledger.closed.findLast(c => c.how === 'dismissed' && raisesOnly(c.ask, finding.title)) ??
    null
  if (dismissed) return { ledger, id: dismissed.id, isAdded: false, expired: null, dismissed }
  const id = `f${ledger.nextId}`
  const ordinary = ledger.findings.filter(f => !f.feedOwned)
  const expired = ordinary.length >= MAX_FINDINGS ? ordinary[0]! : null
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
  | { ledger: Ledger; is: 'added'; id: string; expired: Item | null; reopened?: boolean }
  | { ledger: Ledger; is: 'source-managed'; id: string }
  /** `newRec` is the recommendation the record changed the item to, or null when it kept the item's own. */
  | {
      ledger: Ledger
      is: 'open'
      id: string
      addedSteps: number
      isNewlyMarked: boolean
      newRec: string | null
      isNewReason: boolean
      hasNewDetail: boolean
      hasNewDocument: boolean
    }
  /** `record` is the closed item it repeats, or the dismissed finding it raises again. */
  | { ledger: Ledger; is: 'closed'; record: Closed | ClosedFinding }

/**
 * Adds a question or task the agent recorded. One that an open item restates adds its steps and its design-choice mark
 * to that item, gives it the recommendation when that names one of the item's options, and stamps its `reportedAt`.
 * One that repeats a closed item is skipped, unless the inbox closed it, it expired or the agent closed it. So is one that raises a
 * finding the person dismissed.
 * Unanswered questions and tasks stay open until answered by the person, closed by the person's press or the agent's
 * close tool, or expired. A finding the new ask restates closes, so one thing shows in one list.
 */
export function addAgentItem(
  ledger: Ledger,
  entry: Pick<
    Item,
    | 'kind'
    | 'ask'
    | 'options'
    | 'rec'
    | 'recReason'
    | 'helps'
    | 'isDesignChoice'
    | 'detail'
    | 'document'
    | 'documentPreview'
  >,
  now: number,
): AgentItemResult {
  const candidate = { ...entry, label: null }
  const managedMatch = ledger.items.find(i => i.sourceManaged && matchOpen([i], candidate) >= 0)
  if (managedMatch) return { ledger, is: 'source-managed', id: managedMatch.id }

  const recordedThisTurn = new Set(ledger.items.filter(i => !i.sourceManaged && i.turn === ledger.turn).map(i => i.id))
  const open = matchOpen(ledger.items, candidate, recordedThisTurn)
  const openItem = ledger.items[open]
  if (openItem) {
    const helps = entry.helps.reduce(withHelp, openItem.helps)
    const isDesignChoice = openItem.isDesignChoice === true || entry.isDesignChoice === true
    const rec = restatedRec(openItem.options, openItem.rec, entry.rec)
    const reason =
      entry.recReason && rec === recommendedOption(openItem.options, entry.rec) ? entry.recReason : undefined
    const hasNewDetail = entry.detail !== undefined && entry.detail !== openItem.detail
    const hasNewDocument =
      entry.document !== undefined &&
      (entry.document !== openItem.document ||
        (entry.documentPreview !== undefined && entry.documentPreview !== openItem.documentPreview))
    const reported = {
      ...withRec(openItem, rec, reason),
      helps,
      isDesignChoice,
      reportedAt: now,
      ...(hasNewDetail ? { detail: entry.detail } : {}),
      ...(hasNewDocument
        ? {
            document: entry.document,
            ...(entry.documentPreview !== undefined ? { documentPreview: entry.documentPreview } : {}),
          }
        : {}),
    }
    const items = ledger.items.map(i => (i === openItem ? reported : i))

    return {
      ledger: { ...ledger, items },
      is: 'open',
      id: openItem.id,
      addedSteps: helps.length - openItem.helps.length,
      isNewlyMarked: isDesignChoice && openItem.isDesignChoice !== true,
      newRec: rec !== openItem.rec ? rec : null,
      isNewReason: reason !== undefined && reason !== openItem.recReason,
      hasNewDetail,
      hasNewDocument,
    }
  }
  const recentClosed = ledger.closed.slice(-CLOSED_CONTEXT_LIMIT)
  const reopened = recentClosed.findLast(c => canAskAgain(c, isPersonsAnswer) && repeatsSettled(c, candidate))
  const repeated =
    recentClosed.findLast(c => !canAskAgain(c, isPersonsAnswer) && repeatsSettled(c, candidate)) ??
    dismissedFindingOf(ledger.closedFindings, entry.ask)
  if (repeated) return { ledger, is: 'closed', record: repeated }

  const id = `i${ledger.nextId}`
  const items = [...ledger.items, { ...entry, label: null, id, turn: ledger.turn, at: now, from: 'record' as const }]
  const asked = { ...entry, label: null }
  const restated = ledger.findings.filter(f => !f.sourceManaged && asksAbout(asked, f))
  const base: Ledger = { ...ledger, items, nextId: ledger.nextId + 1, batchTurn: ledger.turn }
  const next = reopenAskedFindings(
    restated.reduce((l, f) => closeFinding(l, f.id, { outcome: `asked as ${id}`, how: 'update' }, now, id), base),
    [],
  )

  return { ledger: next, is: 'added', id, expired: null, ...(reopened ? { reopened: true } : {}) }
}
