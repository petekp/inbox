import type { ComponentChildren } from 'preact'
import { optionBody, optionReasonLine, shownOptionDescriptions } from '../../hooks/rows'
import type { RowView } from '../../hooks/rows'
import type { Row } from './tab-state'

/** A line of the tree. `isBranch` joins it to the trunk with an arm. */
type Entry = { isBranch: boolean; draw: (place: string) => ComponentChildren }

/**
 * An open question's Holds up line, context, earlier answer and answers' lines, in that order, as the body of its
 * panel. With a Holds up line or an answer line, they hang from the ◆ in the row's mark column as one tree. The trunk
 * ends at the last branch, and a line after it hangs from nothing.
 */
export function askTree(r: RowView, isAllShown: boolean): Pick<Row, 'body' | 'hasTree'> {
  const options = shownOptionDescriptions(r, isAllShown)
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
    ...options.map(o => {
      const body = optionBody(o)
      const reasonLine = optionReasonLine(o)

      return {
        isBranch: true,
        draw: (place: string) => (
          <p class={`branch option-description tree-${place}`}>
            <span class="option-label">{o.label}</span>
            {body !== null ? <span class="muted">: {body}</span> : null}
            {reasonLine ? <span class="muted reason-line">{reasonLine}</span> : null}
          </p>
        ),
      }
    }),
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
