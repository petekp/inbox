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
  /^\s*[-*]?\s*(UNCHANGED|KIND|TOPIC|STATE|HEADLINE|STATUS|COURSE|FOLDED|QUEUE|WORKS|OPEN|NEXT|SINCE|STREAM)\s*:?\s*(.*)$/

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
  if (!answer.isNewTopic || last === null || last.headline === '') return { ...answer.overview, earlier }
  const left = answer.folded || last.headline

  return { ...answer.overview, course: '', earlier: [...earlier, left].slice(-EARLIER_KEPT) }
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
