import type { ComponentChildren } from 'preact'
import { answersFitLine } from '../../core/view/action-plan'
import type { AnswerRow } from '../../core/view/action-plan'
import type { RowPart } from '../../core/view/row-parts'
import type { RowView } from '../../core/view/rows'
import { ActionButton } from './row-actions'
import { partAttrs } from './tab-part-gap'
import type { Key, Row } from './tab-state'

/** A line of the tree, the part `part`. `isBranch` joins it to the trunk with an arm. */
type Entry = {
  part: 'holdsUp' | 'context' | 'earlier'
  isBranch: boolean
  draw: (place: string, above: RowPart) => ComponentChildren
}

type AnswersProps = {
  rowId: string
  options: Key[]
  answerRow: AnswerRow | null
  above: RowPart
  isBlocked: () => boolean
}

/** The attribute on a tree whose answers may sit side by side, naming its row. */
const ANSWERS_ATTRIBUTE = 'data-answers'

/** Whether each row's answers last fit one line, by row id. A row not yet measured draws them side by side. */
const answersFit = new Map<string, boolean>()

/** Whether the answers' buttons, as drawn in `tree`, fit side by side on one line of it. */
function fitsOneLine(tree: HTMLElement): boolean {
  const line = tree.querySelector<HTMLElement>('.option-choice')
  const widths = Array.from(
    tree.querySelectorAll<HTMLElement>('.option-choice > .option-button > .key'),
    b => b.getBoundingClientRect().width,
  )
  const gap = parseFloat(getComputedStyle(tree).getPropertyValue('--control-gap')) || 0

  return line !== null && answersFitLine(widths, gap, line.clientWidth)
}

/**
 * Measures the answers of every tree under `root` that may draw them side by side, in the form they are drawn in now.
 * True when a row's form changed, so the caller draws again before it measures the rows for their glides.
 */
export function settleAnswers(root: HTMLElement): boolean {
  let isChanged = false
  for (const tree of root.querySelectorAll<HTMLElement>(`[${ANSWERS_ATTRIBUTE}]`)) {
    const rowId = tree.getAttribute(ANSWERS_ATTRIBUTE)!
    const fits = fitsOneLine(tree)
    if ((answersFit.get(rowId) ?? true) !== fits) isChanged = true
    answersFit.set(rowId, fits)
  }

  return isChanged
}

/**
 * Calls `redraw` in the next frame when a tree's width changes its answers' form, as a window resize does. A redraw
 * inside the observer's callback would resize the trees it observes, which the browser reports as a ResizeObserver loop
 * error. Returns the call that watches the trees drawn now, which each draw makes.
 */
export function watchAnswerWidths(root: HTMLElement, redraw: () => void, signal: AbortSignal): () => void {
  const observer = new ResizeObserver(() => requestAnimationFrame(() => settleAnswers(root) && redraw()))
  signal.addEventListener('abort', () => observer.disconnect())

  return () => {
    observer.disconnect()
    for (const tree of root.querySelectorAll<HTMLElement>(`[${ANSWERS_ATTRIBUTE}]`)) observer.observe(tree)
  }
}

/**
 * A question's answers, the last branches of its tree. When `answerRow` lets them, and their buttons last fit one line
 * of the tree, they share one branch with the recommendation's reason under them. Otherwise each answer is its own
 * branch with its note under it. `settleAnswers` measures them.
 */
function Answers({ rowId, options, answerRow, above, isBlocked }: AnswersProps) {
  if (isSideBySide(rowId, answerRow))
    return (
      <p class="option-choice option-row tree-last" {...partAttrs(above, 'answers')}>
        <span class="option-button">
          {options.map((o, n) => (
            <ActionButton key={n} action={o} isBlocked={isBlocked} />
          ))}
        </span>
        {answerRow.recLine ? (
          <span class="muted option-note" {...partAttrs('answers', 'reason')}>
            {answerRow.recLine}
          </span>
        ) : null}
      </p>
    )

  return (
    <>
      {options.map((o, n) => (
        <p
          key={n}
          class={`option-choice tree-${n === options.length - 1 ? 'last' : 'before'}`}
          {...partAttrs(n === 0 ? above : options[n - 1]!.note ? 'note' : 'answer', 'answer')}
        >
          <span class="option-button">
            <ActionButton action={o} isBlocked={isBlocked} />
          </span>
          {o.note ? (
            <span class="muted option-note" {...partAttrs('answer', 'note')}>
              {o.note}
            </span>
          ) : null}
        </p>
      ))}
    </>
  )
}

const isSideBySide = (rowId: string, answerRow: AnswerRow | null): answerRow is AnswerRow =>
  answerRow !== null && (answersFit.get(rowId) ?? true)

/** The last part the answers draw, in the form they are drawn in now. */
function answersEnd(rowId: string, options: Key[], answerRow: AnswerRow | null): RowPart {
  if (isSideBySide(rowId, answerRow)) return answerRow.recLine ? 'reason' : 'answers'

  return options.at(-1)?.note ? 'note' : 'answer'
}

/**
 * An open question's Holds up line, context, earlier answer and answers, in that order, as the body of its panel. With
 * a Holds up line or an answer, they hang from the ◆ or □ in the row's mark column as one tree. The trunk ends at the last
 * branch, and a line after it hangs from nothing.
 */
export function askTree(
  r: RowView,
  options: Key[],
  answerRow: AnswerRow | null,
  isBlocked: () => boolean,
): Pick<Row, 'body' | 'bodyEnd' | 'hasTree'> {
  const holdsUp = r.state.is === 'open' ? r.holdsUpLine : null
  const hasTree = options.length > 0 || holdsUp !== null
  const earlier = r.earlierLine
  if (!hasTree && !r.contextLine && !earlier) return {}

  const entries: Entry[] = [
    ...(holdsUp
      ? [
          {
            part: 'holdsUp' as const,
            isBranch: true,
            draw: (place: string, above: RowPart) => (
              <p class={`branch holds-up muted tree-${place}`} {...partAttrs(above, 'holdsUp')}>
                {holdsUp}
              </p>
            ),
          },
        ]
      : []),
    ...(r.contextLine
      ? [
          {
            part: 'context' as const,
            isBranch: false,
            draw: (place: string, above: RowPart) => (
              <p class={`context-line tree-${place}`} {...partAttrs(above, 'context')}>
                {r.contextLine}
              </p>
            ),
          },
        ]
      : []),
    ...(earlier
      ? [
          {
            part: 'earlier' as const,
            isBranch: false,
            draw: (place: string, above: RowPart) => (
              <p class={`context-line tree-${place}`} {...partAttrs(above, 'earlier')}>
                {earlier.lead}
                <strong class="option-label">{earlier.answer}</strong>
                {earlier.rest}
              </p>
            ),
          },
        ]
      : []),
  ]
  const hasAnswers = options.length > 0
  const lastBranch = hasAnswers ? entries.length : entries.findLastIndex(e => e.isBranch)
  const textEnd: RowPart = entries.at(-1)?.part ?? 'title'

  return {
    hasTree,
    body: () => (
      <div class={hasTree ? 'tree' : 'tree plain'} {...(answerRow ? { [ANSWERS_ATTRIBUTE]: r.id } : {})}>
        {entries.map((e, n) =>
          e.draw(n === lastBranch ? 'last' : n > lastBranch ? 'after' : 'before', entries[n - 1]?.part ?? 'title'),
        )}
        {hasAnswers ? (
          <Answers rowId={r.id} options={options} answerRow={answerRow} above={textEnd} isBlocked={isBlocked} />
        ) : null}
      </div>
    ),
    bodyEnd: () => (hasAnswers ? answersEnd(r.id, options, answerRow) : textEnd),
  }
}
