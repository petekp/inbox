import { earlierLineText } from '../hooks/earlier-answers'
import { rowFeedbackText } from '../hooks/feedback'
import type { Look, RowView } from '../hooks/rows'
import { rowTitle, settledLabel, shortAgo } from '../hooks/rows'
import type { GoalBlock, MilestoneRow } from '../hooks/status-goal-page'
import type { StatusPage, StatusRow } from '../hooks/status-page'
import { WAS_PREFIX } from '../hooks/status-page'
import type { FeatureId } from '../hooks/client-features'
import { parseInline } from '../hooks/inline'
import { unfoldedRows } from '../hooks/status-folds'
import { shownMilestones } from '../hooks/status-goal-page'

type Drawn = { look: Look; now: number }

/**
 * How a look shows one field of the shared view. `text`: the words `texts` gives must show in what the look draws.
 * `nested`: the field holds more of the view, whose own fields have rules. `not text`: the look shows the field
 * another way, which `why` names.
 */
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

/**
 * Every field of a row, and `pressAge`, which no field holds: once a press on the row finished, the row shows how long
 * ago in place of `at`.
 */
const ROW_FIELDS: Rules<RowView> & { pressAge: FieldRule<RowView> } = {
  id: KEY,
  type: notText('It picks the list the row sits in.'),
  number: text((r, d) => (r.number === null ? [] : [rowTitle(r, d.look)])),
  title: text((r, d) => [rowTitle(r, d.look)]),
  at: text((r, d) => (r.at === null || pressDoneAt(r) !== null ? [] : [shortAgo(d.now - r.at)])),
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

/** Each kind of Status row's fields. A new kind fails the type check here until it has rules. */
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
}

/** The goal on its page. A suggested next goal takes the place of the goal's text and the lines under it. */
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
  error: text(p => [p.error]),
  stale: text(p => [p.error === null ? p.stale : null]),
}

/** A field of the shared view, as "row.contextLine" or "subject.stall". */
type FieldName =
  | `row.${keyof typeof ROW_FIELDS & string}`
  | `page.${keyof StatusPage & string}`
  | `goal.${keyof typeof GOAL_FIELDS & string}`
  | `milestone.${keyof typeof MILESTONE_FIELDS & string}`
  | {
      [K in StatusRow['kind']]: `${K}.${keyof (typeof STATUS_ROW_FIELDS)[K] & string}`
    }[StatusRow['kind']]

/** One text a look must draw: the field it comes from and its words. */
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

/** The texts an open row draws, from every field its rule says a look shows as words. */
export function rowTexts(row: RowView, d: Drawn): Expected[] {
  return textsOf('row', ROW_FIELDS, row, d)
}

function statusRowTexts(r: StatusRow, d: Drawn): Expected[] {
  return textsOf(r.kind, STATUS_ROW_FIELDS[r.kind] as Record<string, FieldRule<StatusRow>>, r, d)
}

/**
 * The texts the Status page draws: its own fields, the goal, the milestones it shows and every row shown, with the
 * folds `isUnfolded` names open.
 */
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

/** Every fold on the Status page, so a look's test can open them all. */
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

/** Every field whose rule says a look shows it as words, which the contract sessions must each give at least once. */
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

/**
 * The fields a look leaves out on purpose, each with the feature whose entry in the parity record is not `full` for
 * that look. A look's contract test skips these, and fails once the look draws one, so the list stays true.
 */
export const LOOK_GAPS: Record<Look, Partial<Record<FieldName, FeatureId>>> = {
  terminal: {},
  desktop: {},
  codex: {},
  omp: {},
  herdr: { 'row.pressAge': 'done-press-age' },
}

/** Whitespace folded to single spaces, so a text wrapped onto two lines still matches. */
const folded = (s: string): string => s.replace(/\s+/g, ' ').trim()

/** The text with its inline markdown read, so a look that draws `**bold**` as bold and one that draws the markers both match. */
const plain = (s: string): string =>
  parseInline(folded(s))
    .map(span => span.text)
    .join('')

/** Whether `drawn` holds `text` as whole words, so an age such as "4m" does not match inside "14m". */
function isDrawn(text: string, drawn: string): boolean {
  const words = plain(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  return new RegExp(`(?<![\\p{L}\\p{N}])${words}(?![\\p{L}\\p{N}])`, 'u').test(plain(drawn))
}

/** The expected texts a look's drawn text lacks, leaving out its gaps. */
export function missingTexts(look: Look, expected: Expected[], drawn: string): Expected[] {
  return expected.filter(e => LOOK_GAPS[look][e.field] === undefined && !isDrawn(e.text, drawn))
}

/** The expected texts of a look's gaps that its drawn text holds after all, so a gap the look closed leaves the list. */
export function drawnGaps(look: Look, expected: Expected[], drawn: string): Expected[] {
  return expected.filter(e => LOOK_GAPS[look][e.field] !== undefined && isDrawn(e.text, drawn))
}
