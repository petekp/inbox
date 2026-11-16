import type { JSX } from 'preact'
import { SUBJECT_MARKS } from '../../hooks/help'
import { prMarkId } from '../../hooks/pr-rows'
import type { TabView } from './core'
import { pendingLocal, act } from './tab-rows'
import { closingFolds, drawnRows, timelineFolded } from './tab-state'
import { outPending } from './tab-press'
import { selectTimelineRow, timelinePageOf, toggleTimelineFold } from './rows'

const TREE_BRANCH = { mid: '├─ ', last: '└─ ' } as const

export function TimelineTab({ view }: { view: TabView }) {
  const page = timelinePageOf(view)
  const all = view.timeline.rows
  const visible = new Map(page.rows.map(row => [row.task.id, row]))
  const hidden = new Set([...timelineFolded].filter(id => !closingFolds.has(`timeline-${id}`)))
  const barParts = (id: string, parts: (typeof page.bars)[number]['parts']) =>
    parts.map((part, index) => (
      <span
        class={`tone-${part.state === 'stalled' ? 'error' : part.state === 'working' ? 'needsYou' : part.state === 'done' ? 'done' : 'muted'}`}
        key={`${id}-${index}`}
      >
        {part.mark.repeat(part.count)}
      </span>
    ))

  const children = (parentId: string | null) =>
    all.filter(row => row.task.parentId === parentId && !hidden.has(parentId ?? ''))
  const drawRow = (row: (typeof all)[number]): JSX.Element => {
    const id = `timeline:${row.task.id}`
    const track = drawnRows.get(id)?.track
    const selected = page.selected?.row.task.id === row.task.id
    const selection = selected ? page.selected : track?.hasPanel ? (drawnRows.get(id)?.openTimeline ?? null) : null
    const selectAction = visible.get(row.task.id)?.actions.find(action => action.action === 'select')
    const branchAction = selection?.row.actions.find(action => action.action === 'toggle-branch')
    const isClosing = track?.state === 'closing' || track?.state === 'leaving'
    const mark = row.status === 'stalled' ? '!' : (SUBJECT_MARKS[row.status as keyof typeof SUBJECT_MARKS]?.mark ?? '·')

    return (
      <section class="timeline-tree-item" key={row.task.id}>
        <div
          class={`row timeline-node${selected ? ' selected' : ''}${isClosing ? ' closing' : ''}`}
          data-motion={id}
          style={{ '--depth': row.depth }}
        >
          <span class={`mark tone-${row.status === 'done' ? 'done' : row.status === 'stalled' ? 'error' : 'needsYou'}`}>
            {mark}
          </span>
          <div class="content tight">
            <div>
              {row.branch ? <span class="muted">{TREE_BRANCH[row.branch]}</span> : null}
              {selectAction && !isClosing ? (
                <button
                  type="button"
                  class="timeline-title-link"
                  style={{ textDecoration: 'underline' }}
                  onClick={() => selectTimelineRow(selectAction.id)}
                >
                  {row.task.title}
                </button>
              ) : (
                <span class="timeline-title">{row.task.title}</span>
              )}
              <span class="muted">{` · ${row.statusLabel} · ${row.measure}`}</span>
            </div>
            {row.warnings.map((warning, index) => (
              <div class="warning" key={`${row.task.id}-warning-${index}`}>
                ⚠ {warning}
              </div>
            ))}
          </div>
          {selection ? (
            <div class={`timeline-detail${isClosing ? ' closing' : ''}`} {...(isClosing ? { inert: true } : {})}>
              {branchAction ? (
                <button type="button" class="key quiet" onClick={() => toggleTimelineFold(view, branchAction.id)}>
                  {branchAction.label}
                </button>
              ) : null}
              {selection.details.map((line, index) => (
                <div key={`${row.task.id}-detail-${index}`}>
                  <span class="muted">{TREE_BRANCH.last}</span>
                  <strong class="timeline-detail-label">{line.label} · </strong>
                  {line.label === 'Links'
                    ? line.actions.map(link => {
                        const press = link.press
                        if (press.action !== 'pr-open') return null
                        const ref = press.ref
                        const pending = outPending(view, prMarkId(ref))
                        const isOpening =
                          link.result?.state === 'pending' ||
                          (pending?.is === 'local' && pending.result.state === 'pending')
                        return (
                          <span key={`${row.task.id}-${link.label}`}>
                            <button
                              type="button"
                              class="key"
                              disabled={link.isOut || isOpening}
                              onClick={() =>
                                void act(
                                  prMarkId(ref),
                                  press,
                                  undefined,
                                  pendingLocal({ kind: 'open', target: ref, name: link.label }),
                                )
                              }
                            >
                              {isOpening ? 'Opening…' : link.label}
                            </button>
                            {!isOpening && link.result?.state === 'done' ? (
                              <span class="tone-done">✓ Opened</span>
                            ) : null}
                            {!isOpening && link.result?.state === 'failed' ? (
                              <span class="tone-error">{link.result.parts.find(part => part.error)?.error}</span>
                            ) : null}
                          </span>
                        )
                      })
                    : line.text}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {row.hasChildren && !hidden.has(row.task.id) ? (
          <div class="timeline-children" data-motion={`closed-timeline-${row.task.id}`}>
            {children(row.task.id).map(drawRow)}
          </div>
        ) : null}
      </section>
    )
  }

  return (
    <main class="status-page timeline-page">
      <div class="timeline-bars" style={{ padding: '0 14px 8px var(--text-x)' }}>
        <div class="muted">
          Task plan · {page.summary}
          {page.bars[0]?.parts.length ? ' · ' : null}
          {page.bars[0] ? barParts(page.bars[0].id, page.bars[0].parts) : null}
        </div>
        {page.bars.slice(1).map(bar => (
          <div class="timeline-bar" key={bar.id}>
            <span class="muted">{bar.label}: </span>
            {barParts(bar.id, bar.parts)}
          </div>
        ))}
      </div>
      {page.isEmpty ? (
        <div class="empty">
          <h1>{page.empty.title}</h1>
          <p>{page.empty.hint}</p>
        </div>
      ) : (
        <div class="list timeline-list">{children(null).map(drawRow)}</div>
      )}
    </main>
  )
}
