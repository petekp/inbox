import type { ComponentChildren } from 'preact'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { answersFitLine } from '../../hooks/action-plan'
import type { AnswerRow } from '../../hooks/action-plan'
import type { RowView } from '../../hooks/rows'
import { ActionButton } from './row-actions'
import type { Key, Row } from './tab-state'

/** A line of the tree. `isBranch` joins it to the trunk with an arm. */
type Entry = { isBranch: boolean; draw: (place: string) => ComponentChildren }

type AnswersProps = { options: Key[]; answerRow: AnswerRow | null; isBlocked: () => boolean }

/** Whether the answers' buttons, as drawn in `tree`, fit side by side on one line of it. */
function fitsOneLine(tree: HTMLElement, line: HTMLElement): boolean {
  const widths = Array.from(
    tree.querySelectorAll<HTMLElement>('.option-choice > .option-button > .key'),
    b => b.getBoundingClientRect().width,
  )
  const gap = parseFloat(getComputedStyle(tree).getPropertyValue('--control-gap')) || 0

  return answersFitLine(widths, gap, line.clientWidth)
}

/**
 * A question's answers, the last branches of its tree. When `answerRow` lets them, and their buttons fit one line of
 * the tree, they share one branch with the recommendation's reason under them. Otherwise each answer is its own branch
 * with its note under it. The buttons are measured, in either form, before the page paints and whenever the tree's
 * width changes.
 */
function Answers({ options, answerRow, isBlocked }: AnswersProps) {
  const first = useRef<HTMLParagraphElement>(null)
  const [isSideBySide, setSideBySide] = useState(answerRow !== null)
  const labels = options.map(o => o.label).join('\n')

  useLayoutEffect(() => {
    const tree = first.current?.parentElement
    if (!tree) return
    // The first line is a new element after the form changes, so each check finds it again.
    const check = () => {
      const line = first.current
      setSideBySide(answerRow !== null && line !== null && fitsOneLine(tree, line))
    }
    check()
    const resized = new ResizeObserver(check)
    resized.observe(tree)

    return () => resized.disconnect()
  }, [labels, answerRow?.recLine, answerRow === null])

  if (isSideBySide && answerRow)
    return (
      <p ref={first} class="option-choice option-row tree-last">
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
        <p
          key={n}
          ref={n === 0 ? first : undefined}
          class={`option-choice tree-${n === options.length - 1 ? 'last' : 'before'}`}
        >
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
    body: (
      <div class={hasTree ? 'tree' : 'tree plain'}>
        {entries.map((e, n) => e.draw(n === lastBranch ? 'last' : n > lastBranch ? 'after' : 'before'))}
        {hasAnswers ? <Answers options={options} answerRow={answerRow} isBlocked={isBlocked} /> : null}
      </div>
    ),
  }
}
