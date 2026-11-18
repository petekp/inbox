import { CHILD_GAP_PT, CONTROL_GAP_PT, INSIDE_GAP_PT, ITEM_GAP_PT, LIST_GAP_PT, ROW_PAD_PT } from './layout'
import { DESKTOP_LINE_PT } from './desktop-metrics'
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
export const BETWEEN_STEPS = { child: CHILD_GAP_PT, control: CONTROL_GAP_PT, item: ITEM_GAP_PT } as const
export type GapStep = keyof typeof GROUP_STEPS | keyof typeof BETWEEN_STEPS

const STEP_PT: Record<GapStep, number> = { ...GROUP_STEPS, ...BETWEEN_STEPS }

/**
 * A form of an open row that places its parts in points. Desktop draws a row whose lines hang on a tree as a card of
 * frames, and any other row as one frame, and the two place some parts apart differently.
 */
export type PartForm = 'herdr' | 'codex' | 'desktopCard' | 'desktopFrame'

/**
 * The gap between two parts: the step every form draws, the points a form draws where it differs today, and the blank
 * rows the docked terminal draws. omp and the inline terminal draw no blank row inside a row.
 */
export type PartGap = { step: GapStep; forms: Partial<Record<PartForm, number>>; rows: 0 | 1 }

/** A blank line on desktop: a written 1, which the pane draws as half its line. */
export const DESKTOP_BLANK_LINE_PT = DESKTOP_LINE_PT / 2


const TITLE_PARTS: readonly RowPart[] = ['title', 'titleStatus']
const TREE_TEXT: readonly RowPart[] = ['holdsUp', 'context', 'earlier']
const BODY_PARTS: readonly RowPart[] = ['detail', 'file']
const ANSWER_PARTS: readonly RowPart[] = ['answer', 'note', 'answers', 'reason']
const TREE_PARTS: readonly RowPart[] = [...TREE_TEXT, ...ANSWER_PARTS]

const gap = (step: GapStep, rows: 0 | 1, forms: PartGap['forms'] = {}): PartGap => ({ step, forms, rows })

/** A line of text under the title is the title's own detail. */
const UNDER_TITLE = gap('inside', 0)
/** Answers sit under the text above them as any buttons do. */
const ANSWERS_UNDER_TITLE = gap('control', 0, { codex: CONTROL_GAP_PT })

/** The parts the Codex tab draws as lines of a tree. A note or a reason sits inside its answer's line. */
const CODEX_TREE_LINES: readonly RowPart[] = ['holdsUp', 'context', 'earlier', 'answer', 'answers']
/** The px the Codex tab adds to a step above a line of a tree, and again under one. */
const CODEX_TREE_EXTRA_PX = 1

const codexTreeExtra = (above: RowPart, below: RowPart) =>
  CODEX_TREE_EXTRA_PX *
  (Number(CODEX_TREE_LINES.includes(below)) +
    Number(TREE_PARTS.includes(above) && below !== 'note' && below !== 'reason'))

/**
 * The buttons or the field under the parts above them. Desktop's card puts them a row's padding under its tree, and
 * desktop's frame a blank line under any part.
 */
function aboveButtons(above: RowPart): PartGap {
  const desktopFrame = DESKTOP_BLANK_LINE_PT
  if (TREE_PARTS.includes(above)) return gap('control', 1, { desktopCard: ROW_PAD_PT, desktopFrame })
  if (above === 'status') return gap('control', 1, { desktopCard: 0, desktopFrame })

  return gap('control', 1, { desktopFrame })
}

/** The gap above each part, given the part above it. The title is always first, so nothing sits above it. */
const GAP_ABOVE: Record<Exclude<RowPart, 'title'>, (above: RowPart) => PartGap> = {
  titleStatus: () => gap('inside', 0),
  holdsUp: () => UNDER_TITLE,
  context: above => (TITLE_PARTS.includes(above) ? UNDER_TITLE : gap('child', 0)),
  earlier: above =>
    TITLE_PARTS.includes(above) ? UNDER_TITLE : gap('child', 0, above === 'context' ? { desktopFrame: 0 } : {}),
  detail: () => gap('inside', 1, { codex: CONTROL_GAP_PT, desktopFrame: DESKTOP_BLANK_LINE_PT }),
  file: above =>
    above === 'detail'
      ? gap('inside', 1, { codex: LIST_GAP_PT, desktopFrame: DESKTOP_BLANK_LINE_PT })
      : GAP_ABOVE.detail(above),
  answer: above =>
    TITLE_PARTS.includes(above)
      ? ANSWERS_UNDER_TITLE
      : above === 'answer' || above === 'note'
        ? gap('item', 0)
        : gap('child', 0),
  note: () => gap('list', 0),
  answers: above => (TITLE_PARTS.includes(above) ? ANSWERS_UNDER_TITLE : gap('child', 0)),
  reason: () => gap('list', 0),
  status: above => {
    if (TITLE_PARTS.includes(above))
      return gap('inside', 1, { codex: CONTROL_GAP_PT, desktopFrame: DESKTOP_BLANK_LINE_PT })
    if (BODY_PARTS.includes(above)) return gap('control', 1, { desktopFrame: DESKTOP_BLANK_LINE_PT })

    return gap('control', 1, { desktopCard: ROW_PAD_PT + DESKTOP_BLANK_LINE_PT, desktopFrame: DESKTOP_BLANK_LINE_PT })
  },
  buttons: aboveButtons,
  field: aboveButtons,
  result: () => gap('control', 0, { desktopCard: 0, desktopFrame: 0 }),
  copy: () => gap('control', 0),
}

/** The gap between two neighboring parts, `above` drawn directly over `below`. */
export function partGap(above: RowPart, below: Exclude<RowPart, 'title'>): PartGap {
  return GAP_ABOVE[below](above)
}

/** The points `form` draws between two neighboring parts: its own value, else the step, with Codex's tree extra. */
export function partPt(above: RowPart, below: Exclude<RowPart, 'title'>, form: PartForm): number {
  const g = partGap(above, below)

  return g.forms[form] ?? STEP_PT[g.step] + (form === 'codex' ? codexTreeExtra(above, below) : 0)
}

/** The blank rows between two neighboring parts in a look that draws whole rows: none unless it is the docked terminal. */
export function partRows(above: RowPart, below: Exclude<RowPart, 'title'>, isDocked: boolean): number {
  return isDocked ? partGap(above, below).rows : 0
}

/** How a row draws its answers: stacked, each with or without its note, or side by side, with or without a reason. */
export type AnswersForm = { is: 'stacked'; hasNotes: boolean[] } | { is: 'side by side'; hasReason: boolean }

/** What a look shows of an open row beyond its view: the parts that come from its presses, its field and its form. */
export type ShownParts = {
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
