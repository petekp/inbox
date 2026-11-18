import type { ComponentChildren } from 'preact'
import { answersFitLine } from '../../hooks/action-plan'
import type { AnswerRow } from '../../hooks/action-plan'
import type { RowView } from '../../hooks/rows'
import { ActionButton } from './row-actions'
import type { Key, Row } from './tab-state'

/** A line of the tree. `isBranch` joins it to the trunk with an arm. */
type Entry = { isBranch: boolean; draw: (place: string) => ComponentChildren }

type AnswersProps = { rowId: string; options: Key[]; answerRow: AnswerRow | null; isBlocked: () => boolean }

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
 * Calls `redraw` in the next frame when a tree's width changes its answers' form, as a window resize or a classic
 * scrollbar appearing does. A redraw inside the observer's callback would resize the trees it observes, which the
 * browser reports as a ResizeObserver loop error. Returns the call that watches the trees drawn now, which each draw
 * makes.
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
function Answers({ rowId, options, answerRow, isBlocked }: AnswersProps) {
  const isSideBySide = answerRow !== null && (answersFit.get(rowId) ?? true)

  if (isSideBySide)
    return (
      <p class="option-choice option-row tree-last">
        <span class="option-button">
          {options.map((o, n) => (
            <ActionButton key={n} action={o} isBlocked={isBlocked} />
          ))}
        </span>
        {answerRow.recLine ? <span class="muted option-note">{answerRow.recLine}</span> : null}
      </p>
    )

  return (
    <>
      {options.map((o, n) => (
        <p key={n} class={`option-choice tree-${n === options.length - 1 ? 'last' : 'before'}`}>
          <span class="option-button">
            <ActionButton action={o} isBlocked={isBlocked} />
          </span>
          {o.note ? <span class="muted option-note">{o.note}</span> : null}
        </p>
      ))}
    </>
  )
}

/**
 * An open question's Holds up line, context, earlier answer and answers, in that order, as the body of its panel. With
 * a Holds up line or an answer, they hang from the ◆ in the row's mark column as one tree. The trunk ends at the last
 * branch, and a line after it hangs from nothing.
 */
export function askTree(
  r: RowView,
  options: Key[],
  answerRow: AnswerRow | null,
  isBlocked: () => boolean,
): Pick<Row, 'body' | 'hasTree'> {
  const holdsUp = r.state.is === 'open' ? r.holdsUpLine : null
  const hasTree = options.length > 0 || holdsUp !== null
  const earlier = r.earlierLine
  if (!hasTree && !r.contextLine && !earlier) return {}

  const entries: Entry[] = [
    ...(holdsUp
      ? [{ isBranch: true, draw: (place: string) => <p class={`branch holds-up muted tree-${place}`}>{holdsUp}</p> }]
      : []),
    ...(r.contextLine
      ? [{ isBranch: false, draw: (place: string) => <p class={`context-line tree-${place}`}>{r.contextLine}</p> }]
      : []),
    ...(earlier
      ? [
          {
            isBranch: false,
            draw: (place: string) => (
              <p class={`context-line tree-${place}`}>
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

  return {
    hasTree,
    body: () => (
      <div class={hasTree ? 'tree' : 'tree plain'} {...(answerRow ? { [ANSWERS_ATTRIBUTE]: r.id } : {})}>
        {entries.map((e, n) => e.draw(n === lastBranch ? 'last' : n > lastBranch ? 'after' : 'before'))}
        {hasAnswers ? <Answers rowId={r.id} options={options} answerRow={answerRow} isBlocked={isBlocked} /> : null}
      </div>
    ),
  }
}
