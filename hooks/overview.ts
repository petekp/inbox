import type { Overview, OverviewItem, OverviewStatus } from '../types'

export const HEADLINE_WORDS = 12
export const ITEM_WORDS = 12
export const SENTENCE_WORDS = 30
export const DETAIL_WORDS = 20
export const LIST_ITEMS = 6
export const EARLIER_KEPT = 6

const NL = '\n'

export const EMPTY_OVERVIEW: Overview = {
  isCoordinator: false,
  state: 'on-track',
  headline: '',
  status: '',
  course: '',
  queue: [],
  works: [],
  open: [],
  next: [],
  since: [],
  workstreams: [],
  earlier: [],
  lastLookAt: null,
}

const LIST_KEYS = {
  QUEUE: 'queue',
  WORKS: 'works',
  OPEN: 'open',
  NEXT: 'next',
  SINCE: 'since',
  STREAM: 'workstreams',
} as const

type ListKey = (typeof LIST_KEYS)[keyof typeof LIST_KEYS]

const STATUSES: readonly OverviewStatus[] = [
  'working',
  'queued',
  'waits-on-you',
  'waits-on-other',
  'done',
  'ruled-out',
  'problem',
  'unknown',
]

const STATES: readonly Overview['state'][] = ['on-track', 'stuck', 'finished']

/** A bulleted item under a list key that stands alone on its line. */
const BULLET_ITEM = /^\s*[-*]\s*[a-z-]+\s*\|/

const KEY_LINE =
  /^\s*[-*]?\s*(UNCHANGED|KIND|TOPIC|STATE|HEADLINE|STATUS|COURSE|FOLDED|QUEUE|WORKS|OPEN|NEXT|SINCE|STREAM)\s*(?::\s*(.*)|$)/

/** The first `limit` words of `text`, with an ellipsis when words were cut. */
export function clipWords(text: string, limit: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean)

  return words.length <= limit ? words.join(' ') : `${words.slice(0, limit).join(' ')}…`
}

function plain(value: string): string {
  const text = value.trim()

  return text === '-' ? '' : text
}

function itemOf(value: string): OverviewItem | null {
  const [status, text, ...detail] = value.split('|').map(part => part.trim())
  const isStatus = (s: string | undefined): s is OverviewStatus => STATUSES.includes(s as OverviewStatus)
  if (!isStatus(status) || !text) return null
  const rest = plain(detail.join(' | '))

  return { status, text: clipWords(text, ITEM_WORDS), detail: rest === '' ? null : clipWords(rest, DETAIL_WORDS) }
}

/** What the Overview call answered: nothing to change, or a whole new Overview. */
export type OverviewAnswer =
  | { kind: 'unchanged' }
  | {
      kind: 'written'
      overview: Overview
      /** Whether the exchange started a new topic, so the topic it left folds into one earlier line. */
      isNewTopic: boolean
      /** The earlier line for the topic left; empty when the call wrote none. */
      folded: string
    }

/** Parses the Overview call's lines. Null when the answer has neither UNCHANGED nor a headline. */
export function parseOverview(text: string | null): OverviewAnswer | null {
  const overview: Overview = { ...EMPTY_OVERVIEW }
  const lists: Record<ListKey, OverviewItem[]> = {
    queue: [],
    works: [],
    open: [],
    next: [],
    since: [],
    workstreams: [],
  }
  let isUnchanged = false
  let hasHeadline = false
  let isNewTopic = false
  let folded = ''
  let current: OverviewItem[] | null = null
  for (const line of (text ?? '').split(NL)) {
    const m = KEY_LINE.exec(line)
    if (!m) {
      const item = current && BULLET_ITEM.test(line) ? itemOf(line.replace(/^\s*[-*]\s*/, '')) : null
      if (current && item && current.length < LIST_ITEMS) current.push(item)
      continue
    }
    current = null
    const key = m[1]!
    const value = (m[2] ?? '').trim()
    if (key === 'UNCHANGED') isUnchanged = true
    else if (key === 'KIND') overview.isCoordinator = value.toLowerCase() === 'coordinator'
    else if (key === 'TOPIC') isNewTopic = value.toLowerCase() === 'new'
    else if (key === 'STATE') overview.state = STATES.find(s => s === value.toLowerCase()) ?? 'on-track'
    else if (key === 'HEADLINE') {
      hasHeadline = true
      overview.headline = clipWords(plain(value), HEADLINE_WORDS)
    } else if (key === 'STATUS') overview.status = clipWords(plain(value), SENTENCE_WORDS)
    else if (key === 'COURSE') overview.course = clipWords(plain(value), SENTENCE_WORDS)
    else if (key === 'FOLDED') folded = clipWords(plain(value), ITEM_WORDS * 2)
    else {
      const item = itemOf(value)
      const list = lists[LIST_KEYS[key as keyof typeof LIST_KEYS]]
      if (item && list.length < LIST_ITEMS) list.push(item)
      if (value === '') current = list
    }
  }
  if (isUnchanged && !hasHeadline) return { kind: 'unchanged' }
  if (!hasHeadline) return null

  return { kind: 'written', overview: { ...overview, ...lists }, isNewTopic, folded }
}

/** The Overview after an answer. A new topic folds the last headline into the earlier lines. */
export function applyOverview(last: Overview | null, answer: OverviewAnswer): Overview | null {
  if (answer.kind === 'unchanged') return last
  const earlier = last?.earlier ?? []
  const lastLookAt = last?.lastLookAt ?? null
  if (!answer.isNewTopic || last === null || last.headline === '')
    return { ...answer.overview, course: answer.overview.course || last?.course || '', earlier, lastLookAt }
  const left = answer.folded || last.headline

  return { ...answer.overview, course: '', earlier: [...earlier, left].slice(-EARLIER_KEPT), lastLookAt }
}

function isItem(value: unknown): value is OverviewItem {
  const item = value as Partial<OverviewItem> | null

  return (
    typeof item === 'object' &&
    item !== null &&
    STATUSES.includes(item.status as OverviewStatus) &&
    typeof item.text === 'string' &&
    (item.detail === null || typeof item.detail === 'string')
  )
}

function itemsOf(value: unknown): OverviewItem[] {
  return Array.isArray(value) ? value.filter(isItem).slice(0, LIST_ITEMS) : []
}

/** A saved Overview with any field it lacks or has wrongly shaped replaced by an empty one. Null for no Overview. */
export function upgradeOverview(saved: unknown): Overview | null {
  const o = saved as Partial<Record<keyof Overview, unknown>> | null | undefined
  if (typeof o !== 'object' || o === null || typeof o.headline !== 'string') return null
  const text = (value: unknown) => (typeof value === 'string' ? value : '')

  return {
    isCoordinator: o.isCoordinator === true,
    state: STATES.find(s => s === o.state) ?? 'on-track',
    headline: o.headline,
    status: text(o.status),
    course: text(o.course),
    queue: itemsOf(o.queue),
    works: itemsOf(o.works),
    open: itemsOf(o.open),
    next: itemsOf(o.next),
    since: itemsOf(o.since),
    workstreams: itemsOf(o.workstreams),
    earlier: Array.isArray(o.earlier) ? o.earlier.filter((e): e is string => typeof e === 'string') : [],
    lastLookAt: typeof o.lastLookAt === 'number' ? o.lastLookAt : null,
  }
}

function itemLine(key: string, i: OverviewItem): string {
  return `${key}: ${i.status} | ${i.text}${i.detail ? ` | ${i.detail}` : ''}`
}

/** The Overview as the lines the call writes, which is how the call reads the last one. */
export function overviewText(o: Overview | null): string {
  if (o === null) return '(none yet)'
  const lists: [string, OverviewItem[]][] = [
    ['QUEUE', o.queue],
    ['WORKS', o.works],
    ['OPEN', o.open],
    ['NEXT', o.next],
    ['STREAM', o.workstreams],
  ]

  return [
    `KIND: ${o.isCoordinator ? 'coordinator' : 'session'}`,
    `STATE: ${o.state}`,
    `HEADLINE: ${o.headline || '-'}`,
    `STATUS: ${o.status || '-'}`,
    ...(o.course ? [`COURSE: ${o.course}`] : []),
    ...lists.flatMap(([key, items]) => items.map(i => itemLine(key, i))),
    ...o.earlier.map(e => `EARLIER: ${e}`),
  ].join(NL)
}

/** The since list as the lines the call reads it and writes it back. */
export function sinceText(o: Overview | null): string {
  return (o?.since ?? []).map(i => itemLine('SINCE', i)).join(NL)
}

/** The person looked: the tab stopped being shown. The changes and the course they saw start over. */
export function looked(o: Overview | null, now: number): Overview | null {
  return o === null ? null : { ...o, since: [], course: '', lastLookAt: now }
}

/** How long the person was away, as the page orders itself by it. */
export const HERE_MS = 5 * 60_000
export const SHORT_MS = 60 * 60_000

export type Away = 'here' | 'short' | 'long'
export type Work = 'running' | 'stopped' | 'finished' | 'idle'

export function awayOf(lastLookAt: number | null, now: number): Away {
  if (lastLookAt === null) return 'long'
  const gone = now - lastLookAt

  return gone < HERE_MS ? 'here' : gone < SHORT_MS ? 'short' : 'long'
}

/** Whether the work waits on the person: the guide says it is stuck, or an item waits on them, or a stop row shows. */
export function workOf(o: Overview, signals: { isTurnRunning: boolean; isStopped: boolean }): Work {
  const waits = o.queue.some(i => i.status === 'waits-on-you')
  if (signals.isTurnRunning) return 'running'
  if (signals.isStopped || o.state === 'stuck' || waits) return 'stopped'

  return o.state === 'finished' ? 'finished' : 'idle'
}

export type PartId =
  | 'headline'
  | 'course'
  | 'status'
  | 'quiet'
  | 'pointer'
  | 'workstreams'
  | 'queue'
  | 'works'
  | 'open'
  | 'next'
  | 'since'
  | 'earlier'

/**
 * The parts to draw, in order, from the three signals. A changed direction leads. A part with nothing in it is
 * left out, and `next` is left out while the queue has queued items, since they already say what comes next.
 */
export function orderParts(o: Overview, away: Away, work: Work): PartId[] {
  const hasQueued = o.queue.some(i => i.status === 'queued')
  const quiet: PartId[] = o.since.length === 0 && o.course === '' && away !== 'here' ? ['quiet'] : []
  const order: PartId[] = o.isCoordinator
    ? ['headline', 'workstreams', 'since', 'queue', 'next', 'open']
    : work === 'running' && away === 'here'
      ? ['headline', 'queue']
      : work === 'stopped'
        ? ['headline', 'status', 'pointer', 'since', 'queue', 'next', 'open']
        : work === 'finished'
          ? ['headline', 'status', 'works', 'open']
          : away === 'short'
            ? ['headline', ...quiet, 'since', 'queue', 'open']
            : ['headline', 'status', ...quiet, 'since', 'queue', 'next', 'open']
  const withCourse: PartId[] = o.course === '' ? order : [order[0]!, 'course', ...order.slice(1)]
  const lists: Partial<Record<PartId, boolean>> = {
    workstreams: o.workstreams.length > 0,
    queue: o.queue.length > 0,
    works: o.works.length > 0,
    open: o.open.length > 0,
    next: o.next.length > 0 && !hasQueued,
    since: o.since.length > 0,
    headline: o.headline !== '',
    status: o.status !== '',
  }
  const parts = withCourse.filter(p => lists[p] ?? true)

  return o.earlier.length > 0 ? [...parts, 'earlier'] : parts
}
