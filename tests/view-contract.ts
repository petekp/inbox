import { earlierLineText } from '../core/domain/earlier-answers'
import { rowFeedbackText } from '../core/view/feedback'
import type { Look, RowView } from '../core/view/rows'
import { rowTitle, settledLabel, shortAgo } from '../core/view/rows'
import type { GoalBlock, MilestoneRow } from '../core/view/status-goal-page'
import type { StatusPage, StatusRow } from '../core/view/status-page'
import { WAS_PREFIX } from '../core/view/status-page'
import type { FeatureId } from '../core/domain/client-features'
import { parseInline } from '../core/view/inline'
import { unfoldedRows } from '../core/view/status-folds'
import { shownMilestones } from '../core/view/status-goal-page'

type Drawn = { look: Look; now: number }

type FieldRule<T> =
  { is: 'text'; texts: (v: T, d: Drawn) => (string | null)[] } | { is: 'nested' } | { is: 'not text'; why: string }

const text = <T>(texts: (v: T, d: Drawn) => (string | null)[]): FieldRule<T> => ({ is: 'text', texts })
const NESTED = { is: 'nested' } as const
const notText = (why: string) => ({ is: 'not text', why }) as const
const STYLE = notText('It styles the line: its color, weight or motion.')
const KEY = notText('It names the line for presses and motion.')
const BUTTON = notText('It sets a button from the shared key plan, whose order tests check the buttons.')

type Rules<T, V = T> = Record<keyof T, FieldRule<V>>

const pressDoneAt = (r: RowView): number | null => (r.feedback?.is === 'done' ? r.feedback.at : null)

const ROW_FIELDS: Rules<RowView> & { pressAge: FieldRule<RowView> } = {
  id: KEY,
  type: notText('It picks the list the row sits in.'),
  number: text((r, d) => (r.number === null ? [] : [rowTitle(r, d.look)])),
  title: text((r, d) => [rowTitle(r, d.look)]),
  at: text((r, d) => {
    const isAgeShown = r.at !== null && r.state.is !== 'settled' && pressDoneAt(r) === null

    return isAgeShown ? [shortAgo(d.now - r.at!)] : []
  }),
  pressAge: text((r, d) => {
    const at = pressDoneAt(r)

    return at === null ? [] : [shortAgo(d.now - at)]
  }),
  detail: text(r => [r.detail]),
  fileName: text(r => [r.fileName]),
  replyKind: notText('It picks the reply field’s hint, which shows only while the field is open.'),
  item: notText('The record the row’s other fields come from.'),
  finding: notText('The record the row’s other fields come from.'),
  steps: BUTTON,
  state: text(r =>
    r.state.is === 'settled'
      ? [settledLabel(r.state.label, r.state.delivery, r.state.reply)]
      : r.state.is === 'held'
        ? [r.state.label]
        : [],
  ),
  feedback: text((r, d) => [rowFeedbackText(r, d.look)]),
  actions: BUTTON,
  optionDescriptions: text(r => r.optionDescriptions.filter(o => !o.isFolded).flatMap(o => [o.description, o.reason])),
  holdsUpLine: text(r => [r.holdsUpLine]),
  contextLine: text(r => [r.contextLine]),
  earlierLine: text(r => [r.earlierLine && earlierLineText(r.earlierLine)]),
}

type Kind<K extends StatusRow['kind']> = Extract<StatusRow, { kind: K }>

const STATUS_ROW_FIELDS: { [K in StatusRow['kind']]: Rules<Kind<K>> } = {
  subject: {
    depth: STYLE,
    kind: KEY,
    id: KEY,
    mark: STYLE,
    tone: STYLE,
    isRunning: STYLE,
    name: text(r => [r.name]),
    text: text(r => [r.text]),
    stall: text(r => [r.stall?.text ?? null]),
    waitsOn: text(r => [r.waitsOn]),
    merged: text(r => [r.merged]),
    was: text(r => [r.was && `${WAS_PREFIX}${r.was}`]),
    hasChildren: STYLE,
    foldCount: BUTTON,
    ask: BUTTON,
  },
  child: {
    depth: STYLE,
    kind: KEY,
    id: KEY,
    mark: STYLE,
    tone: STYLE,
    isRunning: STYLE,
    name: text(r => [r.name]),
    text: text(r => [r.text]),
    branch: STYLE,
  },
  more: { depth: STYLE, kind: KEY, id: KEY, text: text(r => [r.text]), branch: STYLE },
  fold: {
    depth: STYLE,
    kind: KEY,
    id: KEY,
    mark: STYLE,
    tone: STYLE,
    text: text(r => [r.text]),
    subjectIds: KEY,
  },
  'done-fold': { depth: STYLE, kind: KEY, id: KEY, text: text(r => [r.text]), rows: NESTED },
  part: {
    depth: STYLE,
    kind: KEY,
    id: KEY,
    text: text(r => [r.text]),
    description: text(r => [r.description]),
    isTitle: STYLE,
  },
  counts: { depth: STYLE, kind: KEY, id: KEY, counts: text(r => r.counts.map(c => c.text)), rows: NESTED },
}

const MILESTONE_FIELDS: Rules<MilestoneRow> = {
  id: KEY,
  mark: STYLE,
  tone: STYLE,
  name: text(m => [m.name]),
  place: STYLE,
  line: STYLE,
  startsLater: notText('It draws the shared "Later" label above the milestone.'),
  isBold: STYLE,
  isMuted: STYLE,
  foldId: KEY,
  foldCount: BUTTON,
  text: text(m => [m.text]),
  was: text(m => [m.was && `${WAS_PREFIX}${m.was}`]),
  ask: BUTTON,
  rows: NESTED,
  subject: text(m => (m.subject ? [m.subject.stall?.text ?? null, m.subject.waitsOn, m.subject.merged] : [])),
}

type GoalPlace = { goal: GoalBlock; isOffered: boolean }

const goalLine = (line: (g: GoalBlock) => string | null) =>
  text<GoalPlace>(({ goal, isOffered }) => [isOffered ? null : line(goal)])

const GOAL_FIELDS: Rules<GoalBlock, GoalPlace> = {
  label: text(({ goal }) => [goal.label]),
  mark: STYLE,
  text: goalLine(g => g.text),
  isMet: STYLE,
  was: goalLine(g => g.was && `${WAS_PREFIX}${g.was}`),
  now: goalLine(g => g.now),
  awaiting: goalLine(g => g.awaiting),
  milestonesFold: text(({ goal }) => [goal.milestonesFold?.text ?? null]),
  milestones: NESTED,
}

const PAGE_FIELDS: Rules<StatusPage> = {
  goal: NESTED,
  canRestoreGoal: BUTTON,
  suggestedGoal: text(p => [p.suggestedGoal]),
  isEmpty: notText('It picks the empty tab’s text in place of the page.'),
  head: notText('Its words show as the goal’s `now` or as the first `part` row, whose rules check them.'),
  rows: NESTED,
  sync: notText('Its state picks the status line, whose words are `syncText`.'),
  syncText: text(p => [p.syncText]),
}

type FieldName =
  | `row.${keyof typeof ROW_FIELDS & string}`
  | `page.${keyof StatusPage & string}`
  | `goal.${keyof typeof GOAL_FIELDS & string}`
  | `milestone.${keyof typeof MILESTONE_FIELDS & string}`
  | {
      [K in StatusRow['kind']]: `${K}.${keyof (typeof STATUS_ROW_FIELDS)[K] & string}`
    }[StatusRow['kind']]

export type Expected = { field: FieldName; text: string }

function textsOf<T>(prefix: string, rules: Record<string, FieldRule<T>>, v: T, d: Drawn): Expected[] {
  return Object.entries(rules).flatMap(([key, rule]) =>
    rule.is === 'text'
      ? rule
          .texts(v, d)
          .filter((t): t is string => t !== null && t.trim() !== '')
          .map(text => ({ field: `${prefix}.${key}` as FieldName, text }))
      : [],
  )
}

export function rowTexts(row: RowView, d: Drawn): Expected[] {
  return textsOf('row', ROW_FIELDS, row, d)
}

function statusRowTexts(r: StatusRow, d: Drawn): Expected[] {
  return textsOf(r.kind, STATUS_ROW_FIELDS[r.kind] as Record<string, FieldRule<StatusRow>>, r, d)
}

export function statusTexts(page: StatusPage, d: Drawn, isUnfolded: (id: string) => boolean): Expected[] {
  const rowsOf = (rows: StatusRow[]) => unfoldedRows(rows, isUnfolded).flatMap(r => statusRowTexts(r, d))

  return [
    ...textsOf('page', PAGE_FIELDS, page, d),
    ...(page.goal ? textsOf('goal', GOAL_FIELDS, { goal: page.goal, isOffered: page.suggestedGoal !== null }, d) : []),
    ...shownMilestones(page.goal, isUnfolded).flatMap(m => [
      ...textsOf('milestone', MILESTONE_FIELDS, m, d),
      ...(m.foldId === null || isUnfolded(m.foldId) ? rowsOf(m.rows) : []),
    ]),
    ...rowsOf(page.rows),
  ]
}

export function statusFoldIds(page: StatusPage): string[] {
  const ofRows = (rows: StatusRow[]): string[] =>
    rows.flatMap(r => (r.kind === 'done-fold' || r.kind === 'counts' ? [r.id, ...ofRows(r.rows)] : []))
  const milestones = page.goal?.milestones ?? []

  return [
    ...(page.goal?.milestonesFold ? [page.goal.milestonesFold.id] : []),
    ...milestones.flatMap(m => [...(m.foldId ? [m.foldId] : []), ...ofRows(m.rows)]),
    ...ofRows(page.rows),
  ]
}

export function textFields(): FieldName[] {
  const named = (prefix: string, rules: Record<string, FieldRule<never>>) =>
    Object.entries(rules).flatMap(([key, rule]) => (rule.is === 'text' ? [`${prefix}.${key}` as FieldName] : []))

  return [
    ...named('row', ROW_FIELDS),
    ...named('page', PAGE_FIELDS),
    ...named('goal', GOAL_FIELDS),
    ...named('milestone', MILESTONE_FIELDS),
    ...Object.entries(STATUS_ROW_FIELDS).flatMap(([kind, rules]) => named(kind, rules)),
  ]
}

export const LOOK_GAPS: Record<Look, Partial<Record<FieldName, FeatureId>>> = {
  terminal: {},
  desktop: {},
  codex: {},
  omp: {},
  herdr: { 'row.pressAge': 'done-press-age' },
}

const folded = (s: string): string => s.replace(/\s+/g, ' ').trim()

const plain = (s: string): string =>
  parseInline(folded(s))
    .map(span => span.text)
    .join('')

function isDrawn(text: string, drawn: string): boolean {
  const words = plain(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  return new RegExp(`(?<![\\p{L}\\p{N}])${words}(?![\\p{L}\\p{N}])`, 'u').test(plain(drawn))
}

export function repeatedTexts(expected: Expected[], others: string[]): Expected[] {
  return expected.filter(e => others.some(o => isDrawn(e.text, o)))
}

export function missingTexts(look: Look, expected: Expected[], drawn: string): Expected[] {
  return expected.filter(e => LOOK_GAPS[look][e.field] === undefined && !isDrawn(e.text, drawn))
}

export function drawnGaps(look: Look, expected: Expected[], drawn: string): Expected[] {
  return expected.filter(e => LOOK_GAPS[look][e.field] !== undefined && isDrawn(e.text, drawn))
}
