import { optionBody, optionReasonLine, shownOptionDescriptions } from '../../hooks/rows'
import type { RowView } from '../../hooks/rows'
import type { Row } from './tab-state'

/**
 * An open question's context, its answers' lines and its Holds up line, as the body of its panel. With an answer line
 * or Holds up, they hang from the ◆ in the row's mark column as one tree, and Holds up is the last branch.
 */
export function askTree(r: RowView, isAllShown: boolean): Pick<Row, 'body' | 'hasTree'> {
  const options = shownOptionDescriptions(r, isAllShown)
  const holdsUp = r.state.is === 'open' ? r.holdsUpLine : null
  const hasTree = options.length > 0 || holdsUp !== null
  if (!hasTree && !r.contextLine) return {}

  return {
    hasTree,
    body: (
      <div class={hasTree ? 'tree' : 'tree plain'}>
        {r.contextLine ? <p class="context-line">{r.contextLine}</p> : null}
        {options.map(o => {
          const body = optionBody(o)
          const reasonLine = optionReasonLine(o)

          return (
            <p class="branch option-description">
              <span class="option-label">{o.label}</span>
              {body !== null ? <span class="muted">: {body}</span> : null}
              {reasonLine ? <span class="muted reason-line">{reasonLine}</span> : null}
            </p>
          )
        })}
        {holdsUp ? <p class="branch holds-up muted">{holdsUp}</p> : null}
      </div>
    ),
  }
}
