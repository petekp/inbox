import type { Closed, ClosedFinding, Exchange, Finding, Help, Item, Ledger, Press, PressKind } from '../types'

export type { Exchange, Press } from '../types'
import type { Host } from './model-text'
import { upgradeOverview } from './overview'
import { codeBlocks, dash } from './text'

/** How many saved sessions each host keeps; the newest by save time. */
export const KEPT_SESSIONS = 40

export const EMPTY: Ledger = {
  overview: null,
  items: [],
  closed: [],
  findings: [],
  closedFindings: [],
  prs: [],
  nextId: 1,
  turn: 0,
  batchTurn: 0,
  updates: 0,
}

/** Whether nothing has been recorded: no model answer applied, no Overview, no item and no finding. */
export function isBlankLedger(ledger: Ledger): boolean {
  const isOverviewBlank = !ledger.overview || (ledger.overview.goal === '' && ledger.overview.subjects.length === 0)

  return ledger.updates === 0 && isOverviewBlank && ledger.items.length === 0 && ledger.findings.length === 0
}

const NL = '\n'
const MAX_OPEN = 20
const STALE_AFTER = 12
/**
 * A "no longer applies" close whose reason says nothing made the item moot, as "not related to this exchange". The
 * rule asks for what made it moot, and Sonnet at low effort writes these for unrelated items it should leave open.
 */
const UNFOUNDED_MOOT =
  /^no longer applies:.*(\b(not|never) (related|relevant|addressed|mentioned|discussed|answered|raised|part of)\b|\bunrelated\b|\b(still|stays) open\b|\boutside (the|this)\b|\bnothing\b.*\b(touch|address|mention|relate))/i
const MAX_CLOSED = 12
const EXPIRED = 'expired, unanswered'
const MAX_HELPS = 3
const MAX_FINDINGS = 30

/** Reads a kind the model wrote or an older version saved; anything but a task is a question. */
export function readKind(kind: string | null | undefined): Item['kind'] {
  return kind === 'task' || kind === 'do' ? 'task' : 'question'
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
    updates,
    overview: upgradeOverview(rest.overview),
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

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

/**
 * The option a recommendation names: the one whose words all appear in it,
 * the longest when several do. "Symlink into a PATH folder" names "Symlink
 * into PATH".
 */
export function recommendedOption(options: string[], rec: string | null): string | null {
  if (!rec) return null
  const named = new Set(words(rec))
  let best: string | null = null
  for (const option of options) {
    const w = words(option)
    if (w.length > words(best ?? '').length && w.every(x => named.has(x))) best = option
  }
  const label = (text: string) => text.match(/^\s*\(?([a-z]|\d{1,2})\s*[:.)]/i)?.[1]?.toLowerCase()
  const byLabel = /^\s*(?:option\s+)?([a-z]|\d{1,2})\s*[.!]?\s*$/i.exec(rec)?.[1]?.toLowerCase()

  return best ?? (byLabel ? (options.find(o => label(o) === byLabel) ?? null) : null)
}

/** The recommendation of a question asked again: the stated one when it names one of `options`, else the old one when it still does. */
function restatedRec(options: string[], old: string | null, stated: string | null): string | null {
  return recommendedOption(options, stated) ?? recommendedOption(options, old)
}

/** How a closed item saved before `how` existed closed, read from its outcome's wording. */
function howFromOutcome(outcome: string): Closed['how'] {
  if (outcome === 'dismissed') return 'dismissed'
  if (outcome === EXPIRED) return 'expired'
  if (outcome === 'done' || outcome === 'you ran it') return 'done'
  if (outcome.startsWith(CLOSED_BY_CLAUDE)) return 'claude'

  return 'update'
}

/**
 * Commands that sign in or ask for a password. They need the person's own
 * terminal, so their button copies them instead of asking Claude to run them.
 * Each word counts only as a command or subcommand, as in `gh auth login`, so a
 * path or URL holding it, as in `curl https://x/login`, stays the agent's to run.
 */
const NEEDS_PERSON =
  /(?:^|[\s;&|])(?:login|logout|signin|sign-in|sudo|passwd|ssh-add|ssh-keygen)(?=[\s:]|$)|\binit --interactive\b/i

/**
 * Words a reply uses when only the person can run a command: their credentials, device or account. The inbox
 * model sometimes marks a command the reply merely asks the person to run as theirs, so a terminal step in a
 * reply with none of these words is the agent's to run.
 */
const PERSON_ONLY_REASON =
  /credential|password|passphrase|secret|\btoken|\b2fa\b|\bmfa\b|\bdevice\b|phone|android|tablet|account|sign(?:ed)?[- ]?in|log(?:ged)?[- ]?in|only you|you hold|your (?:mac|machine|laptop|computer|keychain)|\bsudo\b/i

export type Update = {
  closed: { id: string; outcome: string }[]
  added: (Omit<Item, 'id' | 'turn' | 'at' | 'helps' | 'from'> & { helps: Help[] })[]
  helped: { id: string; help: Help }[]
  /** New options or a new recommendation for open questions. Null keeps what the question has. */
  updated: { id: string; options: string[] | null; rec: string | null }[]
  /** Findings an item now asks about: an open item's id, or the place of a NEW item in `added`. */
  asked: { id: string; item: string | number }[]
  todos: string[]
}

function readHelp(
  kind: string,
  value: string,
  name: string | null,
  blocks: string[],
  source: string | null,
): Help | null {
  const isQuoted = (text: string) => source === null || source.includes(text)
  const block = value.match(/^block\s+(\d+)$/i)
  const quoted = block ? (blocks[Number(block[1]) - 1] ?? '') : value.replace(/^`|`$/g, '')
  const isFromReply = (text: string) => block !== null || isQuoted(text)
  if (kind === 'open') {
    const path = value.replace(/^`|`$/g, '')
    const isPath = /[/.~]/.test(path) && !/^[a-z]+:/i.test(path) && path.length <= 300
    const standsAlone = (text: string) => new RegExp(`(?<![\\w.~-])${escaped(path)}(?![\\w/-])`).test(text)
    return isPath && (source === null || standsAlone(source)) ? { kind, path } : null
  }
  if (kind === 'copy') {
    return quoted.trim() !== '' && quoted.length <= 8000 && isFromReply(quoted) ? { kind, text: quoted, name } : null
  }
  if (kind === 'run' || kind === 'terminal') {
    const command = commandText(quoted)
    const isUsable = command !== '' && command.length <= 4000 && isFromReply(command)
    const isTheirs =
      NEEDS_PERSON.test(command) || (kind === 'terminal' && (source === null || PERSON_ONLY_REASON.test(source)))
    return isUsable ? { kind: isTheirs ? 'terminal' : 'run', command, name } : null
  }
  if (kind === 'link') {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && isQuoted(value) ? { kind, url: url.href, name } : null
    } catch {
      return null
    }
  }

  return null
}

function helpFields(tail: string[], source: string | null): { help: string; name: string | null } {
  const whole = tail.join('|').trim()
  if (tail.length <= 1 || (source !== null && source.includes(commandText(whole.replace(/^`|`$/g, '')))))
    return { help: whole, name: null }

  return { help: tail.slice(0, -1).join('|').trim(), name: dash(tail.at(-1)) }
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function commandText(text: string): string {
  return text.trim().replace(/^!\s*/, '')
}

function commandOf(help: Help): string | null {
  if (isCommand(help)) return help.command
  if (help.kind === 'copy') return commandText(help.text)

  return null
}

function isCommand(help: Help): help is Extract<Help, { kind: 'run' | 'terminal' }> {
  return help.kind === 'run' || help.kind === 'terminal'
}

function helpTarget(help: Help): string {
  if (help.kind === 'open') return `open ${help.path}`
  if (help.kind === 'link') return `link ${help.url}`

  return `command ${commandOf(help)}`
}

function withHelp(helps: Help[], help: Help): Help[] {
  const command = commandOf(help)
  const kept = isCommand(help) ? helps.filter(h => h.kind !== 'copy' || commandOf(h) !== command) : helps
  const isCovered = kept.some(h => helpTarget(h) === helpTarget(help))

  return isCovered || kept.length >= MAX_HELPS ? kept : [...kept, help]
}

/**
 * The open tasks a shell command the person ran completes: those whose run or
 * sign-in step is that exact command, so nothing closes on a guess.
 */
export function tasksRunBy(ledger: Ledger, command: string): Item[] {
  const typed = squash(command)

  return ledger.items.filter(i => i.kind === 'task' && i.helps.some(h => isCommand(h) && squash(h.command) === typed))
}

function squash(command: string): string {
  return command.trim().replace(/\s+/g, ' ')
}

const KEY_LINE = /^\s*[-*]?\s*(?:(NONE)(?::|\s|$)|(CLOSED|FIXED|ASKED|NEW|UPDATE|HELP|TODO)\s*:)\s*(.*)$/

function keyOf(line: string): { key: string; value: string } | null {
  const m = KEY_LINE.exec(line)

  return m ? { key: (m[1] ?? m[2])!, value: m[3] ?? '' } : null
}

/**
 * The model sometimes writes an answer, then a prose line that corrects it, and a whole second answer. The answer
 * it settled on is the last run of key lines that follows a prose line after an earlier run.
 */
function lastAnswerStart(lines: string[]): number {
  let start = 0
  let hasKeys = false
  let isAfterProse = false
  lines.forEach((line, i) => {
    if (keyOf(line)) {
      if (hasKeys && isAfterProse) start = i
      hasKeys = true
      isAfterProse = false
    } else if (line.trim() !== '') isAfterProse = true
  })

  return start
}

/**
 * Reads the model's line format; null when no known key appears. `source` is
 * the reply followed by the activity: HELP values must appear in it, and
 * "copy | block N" names its code blocks. Null skips both, so block copies drop.
 */
export function parseReply(text: string, source: string | null = null): Update | null {
  const blocks = source === null ? [] : codeBlocks(source)
  const closed: Update['closed'] = []
  const added: Update['added'] = []
  const helped: Update['helped'] = []
  const updated: Update['updated'] = []
  const helps: { target: string; help: Help }[] = []
  const asks: { id: string; target: string }[] = []
  const todos: string[] = []
  let seen = 0
  const lines = text.split(NL)
  const newLines: (Update['added'][number] | undefined)[] = []

  for (const raw of lines.slice(lastAnswerStart(lines))) {
    const parsed = keyOf(raw)
    if (!parsed) continue
    seen += 1
    const key = parsed.key
    const value = dash(parsed.value) ?? ''
    if (key === 'NONE') continue
    if (key === 'CLOSED' || key === 'FIXED') {
      const [id, outcome] = value.split('|').map(s => s.trim())
      if (id && /^f\d/.test(id) === (key === 'FIXED')) closed.push({ id, outcome: outcome ?? '' })
    } else if (key === 'ASKED') {
      const [id, target] = value.split('|').map(s => s.trim())
      if (id && /^f\d+$/.test(id) && target) asks.push({ id, target })
    } else if (key === 'NEW') {
      const fields = value.split('|')
      const isLabelSkipped = !dash(fields[2]) && /\s/.test((fields[1] ?? '').trim())
      const [kind, label, ask, ...rest] = (isLabelSkipped ? [fields[0], '-', ...fields.slice(1)] : fields).map(dash)
      // A sixth field is the design mark only when it reads "design" or "-", so an answer written after a stray "|"
      // in an older five-field line stays an answer.
      const last = rest.at(-1)
      const isDesignField = rest.length > 2 && (last === null || /^design$/i.test(last ?? ''))
      if (isDesignField) rest.pop()
      const rec = rest.length > 1 ? rest.pop() : null
      if (!ask) {
        newLines.push(undefined)
        continue
      }
      const options = rest.flatMap(o => o?.split(/\s+\/\s+/) ?? []).filter(Boolean)
      const isDesignChoice = isDesignField && last !== null && readKind(kind) === 'question'
      const item = {
        kind: readKind(kind),
        label: label ?? null,
        ask,
        options,
        rec: recommendedOption(options, rec ?? null),
        helps: [],
        ...(isDesignChoice ? { isDesignChoice } : {}),
      }
      added.push(item)
      newLines.push(item)
    } else if (key === 'TODO' && value && !isTakenUp(value, source)) {
      todos.push(value)
    } else if (key === 'UPDATE') {
      const [target, options, rec] = value.split('|').map(dash)
      const id = target?.match(/\b(i\d+)\b/)?.[1]
      if (id)
        updated.push({ id, options: options ? options.split(/\s+\/\s+/).filter(Boolean) : null, rec: rec ?? null })
    } else if (key === 'HELP') {
      const [target, kind, ...tail] = value.split('|')
      const { help, name } = helpFields(tail, source)
      const parsed = readHelp((kind ?? '').trim(), help, name, blocks, source)
      if (parsed && target) helps.push({ target: target.trim(), help: parsed })
    }
  }
  for (const { target, help } of helps) {
    // Lenient about extra words: the model sometimes writes "open i9" for "i9".
    const n = target.match(/\bnew\s*(\d+)\b/i)
    const id = target.match(/\b(i\d+)\b/)?.[1]
    const item = n ? newLines[Number(n[1]) - 1] : undefined
    if (item) item.helps = withHelp(item.helps, help)
    else if (!n && id) helped.push({ id, help })
  }
  const asked: Update['asked'] = []
  for (const { id, target } of asks) {
    const n = target.match(/\bnew\s*(\d+)\b/i)
    const item = n ? added.indexOf(newLines[Number(n[1]) - 1]!) : target.match(/\b(i\d+)\b/)?.[1]
    if (item !== undefined && item !== -1) asked.push({ id, item })
  }

  return seen === 0 ? null : { closed, added, helped, updated, asked, todos }
}

function isTakenUp(work: string, reply: string | null): boolean {
  const key = [...keyWords(work)]
  const said = new Set(words(reply ?? ''))

  return key.length > 0 && key.filter(w => said.has(w)).length * 2 >= key.length
}

export function todoAsk(work: string): string {
  return `Ready to start on ${work.replace(/[.?!\s]+$/, '')}?`
}

const FILLER = new Set([
  'the',
  'and',
  'for',
  'with',
  'use',
  'into',
  'from',
  'that',
  'this',
  'your',
  'you',
  'should',
  'make',
  'add',
  'all',
])

function keyWords(text: string): Set<string> {
  return new Set(words(text).filter(w => /\p{N}/u.test(w) || (w.length > 2 && !FILLER.has(w))))
}

export function restates(a: string, b: string): boolean {
  const x = keyWords(a)
  const y = keyWords(b)
  const fewer = Math.min(x.size, y.size)
  const shared = [...x].filter(w => y.has(w)).length
  const numbers = (words: Set<string>) =>
    [...words]
      .filter(w => /\p{N}/u.test(w))
      .sort()
      .join(' ')
  if (numbers(x) !== '' && numbers(y) !== '' && numbers(x) !== numbers(y)) return false

  return fewer >= 2 ? shared / fewer >= 0.7 : sameAsk(a, b)
}

/**
 * Whether `b` repeats `a` with no subject of its own: it restates `a`, and one of the two has no key word the other
 * lacks. "Hotkeys vanish in the ANSI mode" repeats "Hotkeys vanish in ANSI mode", but "package.json has no engines
 * field" does not repeat "package.json has no license field".
 */
function repeatsSubject(a: string, b: string): boolean {
  const x = keyWords(a)
  const y = keyWords(b)
  const within = (inner: Set<string>, outer: Set<string>) => [...inner].every(w => outer.has(w))

  return sameAsk(a, b) || (restates(a, b) && (within(x, y) || within(y, x)))
}

function sameAsk(a: string, b: string): boolean {
  const norm = (s: string) => words(s).join(' ')

  return norm(a) !== '' && norm(a) === norm(b)
}

/**
 * The open item `a` repeats. Items in `sameBatch` came from the same writer and turn as `a` and count as distinct
 * asks, so they match only on the same words or label: "Which license do you prefer?" and "Which Node version do you
 * prefer?" from one dialog are two questions.
 */
function matchOpen(
  items: Pick<Item, 'id' | 'kind' | 'ask'>[],
  a: Update['added'][number],
  sameBatch: ReadonlySet<string> = new Set(),
): number {
  return items.findIndex(
    i =>
      i.id === a.label ||
      sameAsk(i.ask, a.ask) ||
      (!sameBatch.has(i.id) && i.kind === a.kind && restates(i.ask, a.ask)),
  )
}

/**
 * An ask closed this turn repeats on its label too. An expired one from before can be asked again, as in addAgentItem.
 * An ask closed before the prompt repeats a settled item as `repeatsSettled` says.
 */
function repeatsClosed(closed: Closed[], a: Update['added'][number], since: number): boolean {
  const recent = closed.filter(c => c.at >= since && !isAskedForChoices(c))
  const settled = closed.filter(c => c.at < since && c.how !== 'expired')

  return (
    matchOpen(recent, a) >= 0 ||
    (a.label !== null && recent.some(c => c.label === a.label)) ||
    settled.some(c => repeatsSettled(c, a))
  )
}

/** The answer the inbox model offers when an ask names no choices. It asks for the same question again, with them. */
export const LIST_CHOICES = 'List the choices'

export function isAskedForChoices(c: Closed): boolean {
  return c.how === 'answered' && c.outcome.trim().toLowerCase() === LIST_CHOICES.toLowerCase()
}

/**
 * An answered question repeats only in the same words or label: a follow-up shares its words but asks something new,
 * as "Which cache size should the product API use?" after "Which cache should the product API use?". A dismissed or
 * handled item repeats in other words too, as `repeatsSubject` says: "Which engines should package.json use?" does not
 * repeat "Which license should package.json use?". A question answered with LIST_CHOICES repeats nothing.
 */
function repeatsSettled(c: Closed, a: Update['added'][number]): boolean {
  if (isAskedForChoices(c)) return false
  if (c.how === 'answered') return c.id === a.label || sameAsk(c.ask, a.ask)

  return c.id === a.label || sameAsk(c.ask, a.ask) || (c.kind === a.kind && repeatsSubject(c.ask, a.ask))
}

function closedRecord(item: Item, closing: Closing, now: number): Closed {
  const { id, kind, ask, label } = item

  return { id, kind, ask, ...(label ? { label } : {}), ...closing, at: now, item }
}

function closedFindingRecord(finding: Finding, closing: Closing, now: number, askedAs?: string): ClosedFinding {
  return { ...finding, ...(askedAs ? { askedAs } : {}), ...closing, closedAt: now }
}

/** How an outcome the mod saved before `how` existed marks an item Claude closed. */
const CLOSED_BY_CLAUDE = 'closed by Claude'

/**
 * Closes an open item or finding for the agent: one the user answered in their
 * own message, with that answer as its outcome, or one that is done or no
 * longer applies, with the agent's reason. A finding moves to
 * `closedFindings` the same way. `closed` is null when no open one has the id.
 * Its `how` is the stored value 'claude' for either agent.
 */
export function closeByAgent(
  host: Host,
  ledger: Ledger,
  id: string,
  how: { answer: string } | { reason: string },
  now: number,
): { ledger: Ledger; closed: 'item' | 'finding' | null } {
  const closing: Closing =
    'answer' in how
      ? { how: 'answered', outcome: how.answer }
      : { how: 'claude', outcome: `closed by ${host.agent}: ${how.reason}` }
  if (ledger.items.some(i => i.id === id)) return { ledger: closeItem(ledger, id, closing, now), closed: 'item' }
  if (ledger.findings.some(f => f.id === id))
    return { ledger: closeFinding(ledger, id, closing, now), closed: 'finding' }

  return { ledger, closed: null }
}

export type Closing = Pick<Closed, 'how' | 'outcome'>

export function closeItem(ledger: Ledger, id: string, closing: Closing, now: number): Ledger {
  const records = ledger.items.filter(i => i.id === id).map(i => closedRecord(i, closing, now))

  return reopenAskedFindings(
    { ...ledger, items: ledger.items.filter(i => i.id !== id), closed: [...ledger.closed, ...records] },
    records,
  )
}

/** `askedAs` is the id of the item that replaces the finding, kept on its close record. */
export function closeFinding(ledger: Ledger, id: string, closing: Closing, now: number, askedAs?: string): Ledger {
  const finding = ledger.findings.find(f => f.id === id)
  if (!finding) return ledger

  return {
    ...ledger,
    findings: ledger.findings.filter(f => f.id !== id),
    closedFindings: [...ledger.closedFindings, closedFindingRecord(finding, closing, now, askedAs)],
  }
}

const SHARED_TITLE_WORDS = 2
const PUT_OFF = /\b(?:not (?:now|yet)|put off|for later|postpone|defer)/i

/** A close that leaves the work undone: the person dismissed it, it expired or no longer applies, or they put it off. */
function leavesWorkOpen(c: Pick<Closed, 'how' | 'outcome'>): boolean {
  return c.how !== 'done' && (isLapsed(c) || PUT_OFF.test(c.outcome))
}

/** Reopens each finding that a question now closed without the work done had replaced. */
function reopenAskedFindings(ledger: Ledger, closes: Closed[]): Ledger {
  return closes.filter(leavesWorkOpen).reduce((l, c) => {
    const record = l.closedFindings.findLast(f => f.askedAs === c.id)
    if (!record) return l
    const reopened = reopenFinding(l, record.id)

    return {
      ...reopened,
      findings: reopened.findings.map(f => {
        const { askedAs: _askedAs, ...rest } = f

        return f.id === record.id ? rest : f
      }),
    }
  }, ledger)
}

function prNumbers(text: string): Set<string> {
  return new Set([...text.matchAll(/(?:#|\bPR\s*#?|\/pull\/)(\d+)/gi)].map(m => m[1]!))
}

/**
 * Whether an item asks about a finding: its label is the finding's id, or its ask restates the finding's title or
 * detail or both name a pull request number. A claimed link (the inbox model's ASKED line) also passes when the ask shares
 * two key words with the title.
 */
function asksAbout(item: Pick<Item, 'ask' | 'label'>, finding: Finding, isClaimed = false): boolean {
  if (item.label === finding.id) return true
  if (restates(finding.title, item.ask) || restates(finding.detail, item.ask)) return true
  if (isClaimed) {
    const known = keyWords(finding.title)
    if ([...keyWords(item.ask)].filter(w => known.has(w)).length >= SHARED_TITLE_WORDS) return true
  }
  const itemPrs = prNumbers(`${item.label ?? ''} ${item.ask}`)

  return [...prNumbers(`${finding.title} ${finding.detail}`)].some(n => itemPrs.has(n))
}

/**
 * Cuts each closed list to its newest MAX_CLOSED records, and keeps every older record whose id is in `keep`.
 * closeItem, closeFinding and applyUpdate do not cut, so each host runs this on every ledger it commits.
 */
export function pruneClosed(ledger: Ledger, keep: ReadonlySet<string>): Ledger {
  const pruned = <T extends { id: string }>(records: T[]) =>
    records.filter((r, n) => n >= records.length - MAX_CLOSED || keep.has(r.id))

  return { ...ledger, closed: pruned(ledger.closed), closedFindings: pruned(ledger.closedFindings) }
}

function idNumber(id: string): number {
  return Number(id.match(/\d+/)?.[0] ?? Number.NaN)
}

/**
 * Order matters: answerNote reads the batch by position, and expiry
 * keeps the last MAX_OPEN items.
 */
function inIdOrder<T extends { id: string }>(open: T[], entry: T): T[] {
  const at = open.findIndex(x => idNumber(x.id) > idNumber(entry.id))

  return at < 0 ? [...open, entry] : [...open.slice(0, at), entry, ...open.slice(at)]
}

/**
 * Reopens a closed item from the item its close record kept, and removes the
 * record. Unchanged when the item is open, or no record of it kept the item.
 */
export function reopenItem(ledger: Ledger, id: string): Ledger {
  const item = ledger.closed.findLast(c => c.id === id)?.item
  if (!item || ledger.items.some(i => i.id === id)) return ledger

  return { ...ledger, items: inIdOrder(ledger.items, item), closed: ledger.closed.filter(c => c.id !== id) }
}

/** Reopens a closed finding and removes its close record. Unchanged when it is open or has no record. */
export function reopenFinding(ledger: Ledger, id: string): Ledger {
  const record = ledger.closedFindings.findLast(f => f.id === id)
  if (!record || ledger.findings.some(f => f.id === id)) return ledger
  const { how: _how, outcome: _outcome, closedAt: _closedAt, ...finding } = record

  return {
    ...ledger,
    findings: inIdOrder(ledger.findings, finding),
    closedFindings: ledger.closedFindings.filter(f => f.id !== id),
  }
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

const OVERTAKEN_OUTCOMES = 'no longer applies|replaced|superseded|moot'
const OVERTAKEN = new RegExp(`^(?:closed by \\w+: )?(?:${OVERTAKEN_OUTCOMES})`, 'i')

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

export type AgentItemResult =
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

/** A step for a task: a link, a file or a command. Anything else is not usable and returns null. */
export function stepHelp(step: string): Help | null {
  const value = step.trim()
  if (/^https?:\/\//i.test(value)) return readHelp('link', value, null, [], null)
  if (/^(?:\/|~\/|\.{1,2}\/)\S*$/.test(value)) return readHelp('open', value, null, [], null)

  const isSentence = /^[A-Z][a-z]+\s+[a-z]/.test(value) || /[.!?]$/.test(value)

  return value !== '' && !isSentence ? readHelp('terminal', value, null, [], null) : null
}

export type ClosedState = 'handled' | 'dismissed' | 'lapsed'

export function closedState(d: Pick<Closed, 'how' | 'outcome'>): ClosedState {
  if (d.how === 'dismissed') return 'dismissed'
  if (d.how === 'expired') return 'lapsed'
  // The agent's close and the per-reply update write their own outcome, so only its wording says the work
  // overtook the item. An agent's close reads "closed by <agent>: <reason>".
  const isOvertaken = OVERTAKEN.test(d.outcome)

  return (d.how === 'claude' || d.how === 'update') && isOvertaken ? 'lapsed' : 'handled'
}

export function isLapsed(d: Pick<Closed, 'how' | 'outcome'>): boolean {
  return closedState(d) !== 'handled'
}
