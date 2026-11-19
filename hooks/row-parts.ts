import { CHILD_GAP_PT, CONTROL_GAP_PT, INSIDE_GAP_PT, ITEM_GAP_PT, LIST_GAP_PT } from './layout'
import type { RowView } from './rows'

/**
 * The parts an open question, task or finding row draws, top to bottom, each one block of lines.
 * - `title`: the title's line, with its age.
 * - `titleStatus`: the status the Herdr look draws on its own lines under the title. The other looks draw it in the
 *   title's line.
 * - `holdsUp`, `context`, `earlier`: the Holds up line, why the agent asked, and the person's earlier answer.
 * - `detail`, `file`: a finding's detail and its relevant file.
 * - `answer`, `note`: one answer's button, stacked, and the note under it.
 * - `answers`, `reason`: the answers side by side on one line, and the recommendation's reason under them.
 * - `status`: the status lines above the buttons, such as a hand-off's note or a press's status.
 * - `buttons`: the row's other buttons, with its follow-ups, which wrap with them as one line.
 * - `field`: the reply field with its Send and Cancel, in place of the buttons.
 * - `result`: a press's status under the buttons that were pressed.
 * - `copy`: the Codex tab's box to copy from when the clipboard failed.
 */
export const ROW_PARTS = [
  'title',
  'titleStatus',
  'holdsUp',
  'context',
  'earlier',
  'detail',
  'file',
  'answer',
  'note',
  'answers',
  'reason',
  'status',
  'buttons',
  'field',
  'result',
  'copy',
] as const

export type RowPart = (typeof ROW_PARTS)[number]

/**
 * The steps of the scale a gap between two parts takes. `inside` and `list` join two parts into one group, as a title
 * and the line under it, or an answer and its note. `child`, `control` and `item` sit between groups. Every step inside
 * a group is smaller than every step between groups, so space shows what belongs together.
 */
export const GROUP_STEPS = { inside: INSIDE_GAP_PT, list: LIST_GAP_PT } as const
const BETWEEN_STEPS = { child: CHILD_GAP_PT, control: CONTROL_GAP_PT, item: ITEM_GAP_PT } as const
type GapStep = keyof typeof GROUP_STEPS | keyof typeof BETWEEN_STEPS

const STEP_PT: Record<GapStep, number> = { ...GROUP_STEPS, ...BETWEEN_STEPS }

/**
 * The gap between two parts: its step, which Herdr, the Codex tab and desktop draw, and the blank rows the docked
 * terminal draws. omp and the inline terminal draw no blank row inside a row.
 */
type PartGap = { step: GapStep; rows: 0 | 1 }

const TITLE_PARTS: readonly RowPart[] = ['title', 'titleStatus']

const gap = (step: GapStep, rows: 0 | 1 = 0): PartGap => ({ step, rows })

/** A line of text under the title is the title's own detail. */
const UNDER_TITLE = gap('inside')
/**
 * The status, the buttons and the field sit a control's step under the parts above them. The docked terminal puts a
 * blank row there, since a row is the smallest space it can draw and the buttons would otherwise run into the text.
 */
const UNDER_TEXT = gap('control', 1)

/** The gap above each part, given the part above it. The title is always first, so nothing sits above it. */
const GAP_ABOVE: Record<Exclude<RowPart, 'title'>, (above: RowPart) => PartGap> = {
  titleStatus: () => UNDER_TITLE,
  holdsUp: () => UNDER_TITLE,
  context: above => (TITLE_PARTS.includes(above) ? UNDER_TITLE : gap('child')),
  earlier: above => (TITLE_PARTS.includes(above) ? UNDER_TITLE : gap('child')),
  detail: () => UNDER_TITLE,
  file: above => (above === 'detail' ? gap('list') : UNDER_TITLE),
  answer: above =>
    TITLE_PARTS.includes(above) ? gap('control') : above === 'answer' || above === 'note' ? gap('item') : gap('child'),
  note: () => gap('list'),
  answers: above => (TITLE_PARTS.includes(above) ? gap('control') : gap('child')),
  reason: () => gap('list'),
  status: () => UNDER_TEXT,
  buttons: above => (above === 'status' ? gap('list') : UNDER_TEXT),
  field: above => (above === 'status' ? gap('list') : UNDER_TEXT),
  result: () => gap('list'),
  copy: () => gap('control'),
}

/** The gap between two neighboring parts, `above` drawn directly over `below`. */
export function partGap(above: RowPart, below: Exclude<RowPart, 'title'>): PartGap {
  return GAP_ABOVE[below](above)
}

/** The points Herdr, the Codex tab and desktop draw between two neighboring parts: the step of their gap. */
export function partPt(above: RowPart, below: Exclude<RowPart, 'title'>): number {
  return STEP_PT[partGap(above, below).step]
}

/** The blank rows between two neighboring parts in a look drawn in whole rows: none but in the docked terminal. */
export function partRows(above: RowPart, below: Exclude<RowPart, 'title'>, isDocked: boolean): number {
  return isDocked ? partGap(above, below).rows : 0
}

/**
 * The most lines a collapsed row's title takes in every look before it is cut with an ellipsis. Its status is never
 * cut: it follows the title when the title and the whole status fit on one line, and otherwise takes lines of its own
 * under the title.
 */
export const COLLAPSED_TITLE_LINES = 2

/**
 * The blank rows the docked terminal draws between a list's last row and its Closed fold: one in all, as after a
 * collapsed row. An open row draws a blank row of its own under its text, and that row counts toward the one.
 */
export function foldGapRows(isAfterOpenRow: boolean, isDocked: boolean): number {
  return isDocked && !isAfterOpenRow ? 1 : 0
}

/** How a row draws its answers: stacked, each with or without its note, or side by side, with or without a reason. */
export type AnswersForm = { is: 'stacked'; hasNotes: boolean[] } | { is: 'side by side'; hasReason: boolean }

/** What a look shows of an open row beyond its view: the parts that come from its presses, its field and its form. */
type ShownParts = {
  answers: AnswersForm | null
  hasTitleStatus: boolean
  hasStatus: boolean
  hasButtons: boolean
  isTyping: boolean
  hasResult: boolean
  hasCopy: boolean
}

/** The parts an open row draws, in order. Every look draws a row's parts in this order, each `partGap` apart. */
export function rowParts(
  view: Pick<RowView, 'holdsUpLine' | 'contextLine' | 'earlierLine' | 'detail' | 'fileName'>,
  shown: ShownParts,
): RowPart[] {
  const { answers } = shown
  const answerParts: RowPart[] =
    answers === null
      ? []
      : answers.is === 'side by side'
        ? ['answers', ...(answers.hasReason ? (['reason'] as const) : [])]
        : answers.hasNotes.flatMap((hasNote): RowPart[] => (hasNote ? ['answer', 'note'] : ['answer']))
  const has = (part: RowPart, isShown: unknown): RowPart[] => (isShown ? [part] : [])

  return [
    'title',
    ...has('titleStatus', shown.hasTitleStatus),
    ...has('holdsUp', view.holdsUpLine),
    ...has('context', view.contextLine),
    ...has('earlier', view.earlierLine),
    ...has('detail', view.detail),
    ...has('file', view.fileName),
    ...answerParts,
    ...has('status', shown.hasStatus),
    ...has('buttons', shown.hasButtons && !shown.isTyping),
    ...has('field', shown.isTyping),
    ...has('result', shown.hasResult),
    ...has('copy', shown.hasCopy),
  ]
}

/** Each part after the first with the part above it, as `partGap` takes them. */
export function partPairs(parts: RowPart[]): [RowPart, Exclude<RowPart, 'title'>][] {
  return parts.slice(1).map((p, n) => [parts[n]!, p as Exclude<RowPart, 'title'>])
}
