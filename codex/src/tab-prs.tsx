import { settledMark, DOT, settledLabel } from '../../hooks/rows'
import { bannerOf } from '../../hooks/banners'
import type { SettledState } from '../../hooks/rows'
import { prBlockActions } from '../../hooks/pr-tab'
import {
  DISMISS_MERGED_ID,
  RANK_AGAIN_ID,
  ghNoticeOf,
  PR_GROUP_TITLES,
  PR_TONES,
  prMarkId,
  prsEmptyText,
  prRefreshFailedText,
  threadSentIn,
} from '../../hooks/pr-rows'
import { prRankText } from '../../hooks/pr-order'
import type { PrOrderView } from '../../hooks/pr-order'
import type { PrAction } from '../../hooks/pr-press'
import { readiness } from '../../hooks/prs'
import type { PrView } from '../../types'
import type { TabView as View } from './core'
import { tabState, sending, errors, undoing, drawnRows } from './tab-state'
import type { Key, Row } from './tab-state'
import { select } from './tab-selection'
import { act, pressesOf, prKey } from './tab-rows'
import { KeyButton, ResultMarkView, GroupTitle, UndoPlace, Banner } from './tab-parts'
import { ListRow } from './tab-list'
import { pressLine } from './tab-pr-lines'
import type { PressLine } from './tab-pr-lines'
import { PR_GROUPS, prGroupMotion, prLineMotion } from './tab-pr-steps'
import type { DrawnPrBlock, DrawnPrs, PrGroup } from './tab-pr-steps'

/** The PRs tab's own buttons, drawn after its PR blocks. */
export function prTabKeys(v: View): Key[] {
  return v.prs.tabActions.map(a => tabKey(DISMISS_MERGED_ID, a))
}

/** The order's changed line's buttons: Rank again. */
export function prOrderKeys(v: View): Key[] {
  return (v.prs.order?.changed?.actions ?? []).map(a => tabKey(RANK_AGAIN_ID, a))
}

function tabKey(rowId: string, a: PrAction): Key {
  return {
    ...(a.hotkey ? { hotkey: a.hotkey } : {}),
    label: a.label,
    emphasis: a.emphasis,
    ...(a.isOut || sending.get(rowId)?.action === a.press.action ? { isOut: true } : {}),
    run: () => void act(rowId, a.press),
  }
}

function SettledPr({ pr, state }: { pr: PrView; state: SettledState }) {
  const id = prMarkId(pr.ref)
  const start = tabState.seen.get(id) ?? Date.now()
  const error = errors.get(id)

  return (
    <div class="row settled">
      <ResultMarkView mark={settledMark(state)} />
      <div class="content">
        <div class="settled-head">
          <div class="settled-line">
            <span class="what">
              <span class="tone-prs">#{pr.number}</span> {pr.title}
            </span>
            <span class="outcome-label">{`${DOT}${settledLabel(state.label, state.delivery)}`}</span>
            {error ? <span class="tone-error">{`${DOT}${error}`}</span> : null}
          </div>
          <UndoPlace
            start={start}
            isUndoing={undoing.has(id)}
            canUndo={state.canUndo}
            offersUndo={state.offersUndo}
            onUndo={() => void undoPr(id, pr.ref)}
          />
        </div>
      </div>
    </div>
  )
}

async function undoPr(id: string, ref: string) {
  if (undoing.has(id)) return
  undoing.add(id)
  try {
    await act(id, { action: 'pr-undo', ref })
  } finally {
    undoing.delete(id)
    tabState.draw()
  }
}

/** The order's title, the agent's reason under it, and the changed line with Rank again and its press status. */
function PrOrderLines({ v, order }: { v: View; order: PrOrderView }) {
  const keys = prOrderKeys(v)
  const last = order.changed ? pressLine(v, RANK_AGAIN_ID, order.changed.showsPress) : null

  return (
    <section class="pr-order">
      <div class="pr-order-title">{order.title}</div>
      {order.why ? <div class="muted">{order.why}</div> : null}
      {order.changed ? (
        <div class="pr-order-changed">
          {order.changed.text ? <span>{order.changed.text}</span> : null}
          {keys.length > 0 ? (
            <span class="pr-actions keys">
              {keys.map(k => (
                <KeyButton k={k} />
              ))}
            </span>
          ) : null}
        </div>
      ) : null}
      {last ? <PrLine line={last} /> : null}
    </section>
  )
}

function PrBlock({ v, pr, rank, drawn, line, prs, now }: DrawnPrBlock & { v: View; prs: DrawnPrs; now: number }) {
  const isSent = threadSentIn(v.lastActions)
  const { status, head, unlisted } = readiness(pr, isSent)
  const tone = PR_TONES[status]
  const id = prMarkId(pr.ref)
  const keys = prBlockActions(pr, isSent, v.prs.branchRef, pressesOf(v)).map(a => prKey(id, pr, a))

  return (
    <section>
      <div class="pr-head">
        {rank === null ? null : <span class="rank muted">{prRankText(rank)}</span>}
        <span class="tone-prs num">#{pr.number}</span> {pr.title}{' '}
        <span class={tone ? `pr-verdict tone-${tone}` : 'pr-verdict muted'}>{head}</span>
        <span class="pr-verdict muted">{unlisted.map(r => `${DOT}${r}`).join('')}</span>
      </div>
      {pr.error ? <div class="pr-status tone-error">{prRefreshFailedText(pr.error)}</div> : null}
      <div class="pr-actions keys">
        {keys.map(k => (
          <KeyButton k={k} />
        ))}
      </div>
      {line ? (
        <div data-motion={prLineMotion(id)}>
          <PrLine line={line} />
        </div>
      ) : null}
      <div class="pr-groups">
        {PR_GROUPS.map(group => (
          <PrRows key={group} motion={prGroupMotion(id, group)} group={group} rows={drawn[group]} prs={prs} now={now} />
        ))}
      </div>
    </section>
  )
}

function PrLine({ line }: { line: PressLine }) {
  return <div class={line.isError ? 'pr-last tone-error' : 'pr-last muted'}>{line.text}</div>
}

/** A PR group's title and rows, the rows still leaving among them. The title counts only the rows the view lists. */
function PrRows({
  motion,
  group,
  rows,
  prs,
  now,
}: {
  motion: string
  group: PrGroup
  rows: Row[] | null
  prs: DrawnPrs
  now: number
}) {
  if (!rows) return null
  const listed = rows.filter(r => prs.rows.includes(r))

  return (
    <div class="pr-group" data-motion={motion}>
      <GroupTitle title={PR_GROUP_TITLES[group]} count={listed.length} />
      <div class="list">
        {rows.map(row => (
          <div class="entry" key={row.id} data-motion={row.id}>
            <ListRow
              row={row}
              track={drawnRows.get(row.id)!.track}
              now={now}
              onSelect={() => select('prs', prs.rows, prs.rows.indexOf(row))}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function Prs({ v, prs, now }: { v: View; prs: DrawnPrs; now: number }) {
  const ghState = { isGhMissing: v.isGhMissing, isGhSignedOut: v.prs.isGhSignedOut }
  const ghNotice = ghNoticeOf(ghState)
  const empty = prsEmptyText({ isFetching: v.isFetchingPrs, ...ghState }, 'chat')
  if (prs.blocks.length === 0)
    return (
      <div class="empty">
        <div class="title">{empty.title}</div>
        <div class="muted">{empty.hint}</div>
      </div>
    )
  const tabKeys = prTabKeys(v)

  return (
    <main>
      {ghNotice ? (
        <div class="banner-place">
          <Banner banner={bannerOf(ghNotice.kind, ghNotice.text)} />
        </div>
      ) : null}
      {v.prs.order ? <PrOrderLines v={v} order={v.prs.order} /> : null}
      {prs.blocks.map(b =>
        b.state.is === 'settled' ? (
          <section>
            <SettledPr pr={b.pr} state={b.state} />
          </section>
        ) : (
          <PrBlock {...b} v={v} prs={prs} now={now} />
        ),
      )}
      {tabKeys.length > 0 ? (
        <section>
          <div class="pr-actions keys">
            {tabKeys.map(k => (
              <KeyButton k={k} />
            ))}
          </div>
        </section>
      ) : null}
      {v.prs.olderText ? (
        <section>
          <div class="group-title muted">{v.prs.olderText}</div>
        </section>
      ) : null}
    </main>
  )
}
