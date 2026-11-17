import type { ComponentChildren } from 'preact'
import type { RowView } from '../../hooks/rows'
import { ActionButton } from './row-actions'
import type { Key, Row } from './tab-state'

/** A line of the tree. `isBranch` joins it to the trunk with an arm. */
type Entry = { isBranch: boolean; draw: (place: string) => ComponentChildren }

/**
 * An open question's Holds up line, context, earlier answer and answers, in that order, as the body of its panel. Each
 * answer is its button with its note under it. With a Holds up line or an answer line, they hang from the ◆ in the row's mark column as one tree. The trunk
 * ends at the last branch, and a line after it hangs from nothing.
 */
export function askTree(r: RowView, options: Key[], isBlocked: () => boolean): Pick<Row, 'body' | 'hasTree'> {
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
    ...options.map(o => ({
      isBranch: true,
      draw: (place: string) => (
        <p class={`option-choice tree-${place}`}>
          <span class="option-button">
            <ActionButton action={o} isBlocked={isBlocked} />
          </span>
          {o.note ? <span class="muted option-note">{o.note}</span> : null}
        </p>
      ),
    })),
  ]
  const lastBranch = entries.findLastIndex(e => e.isBranch)

  return {
    hasTree,
    body: (
      <div class={hasTree ? 'tree' : 'tree plain'}>
        {entries.map((e, n) => e.draw(n === lastBranch ? 'last' : n > lastBranch ? 'after' : 'before'))}
      </div>
    ),
  }
}
