import { settledMark, DOT, settledLabel } from '../../hooks/rows'
import { bannerOf } from '../../hooks/banners'
import type { SettledState } from '../../hooks/rows'
import { prBlockActions } from '../../hooks/pr-tab'
import {
  RANK_AGAIN_ID,
  PR_REFRESH_ID,
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
import { act, pendingLocal, pressesOf, prKey } from './tab-rows'
import { KeyButton, ResultMarkView, GroupTitle, UndoPlace, Banner } from './tab-parts'
import { PR_REFRESH } from '../../hooks/pr-press'
import type { PrRefreshView } from '../../hooks/pr-refresh'
import { ListRow } from './tab-list'
import { pressLine } from './tab-pr-lines'
import type { PressLine } from './tab-pr-lines'
import { PR_GROUPS, prBlockMotion, prGroupMotion, prLineMotion } from './tab-pr-steps'
import type { DrawnPrBlock, DrawnPrs, PrGroup } from './tab-pr-steps'
import type { RowTrack } from '../../hooks/row-motion'

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
            <span class="muted">{DOT}</span>
            <span class="outcome-label">{settledLabel(state.label, state.delivery, state.reply)}</span>
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

export async function undoPr(id: string, ref: string) {
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

/** Refresh PRs, as `prRefreshView` lists it, with its press running the refresh. */
function refreshKeys(refresh: PrRefreshView): Key[] {
  return refresh.actions.map(a => ({
    ...tabKey(PR_REFRESH_ID, a),
    run: () => void act(PR_REFRESH_ID, a.press, undefined, pendingLocal(PR_REFRESH)),
  }))
}

function PrRefreshStatus({ v, refresh }: { v: View; refresh: PrRefreshView }) {
  const last = pressLine(v, PR_REFRESH_ID, refresh.showsPress)

  return last ? <PrLine line={last} /> : null
}

/**
 * The line under the notices while a PR could not be read: which ones, with Refresh PRs at its right end, and its
 * press status. While a notice names the cause, the notice holds Refresh PRs instead (see `Prs`).
 */
function PrRefreshLine({ v, refresh }: { v: View; refresh: PrRefreshView }) {
  const keys = refreshKeys(refresh)

  return (
    <section class="pr-order">
      <div class="pr-order-changed pr-refresh-line">
        {refresh.text ? <span class="pr-refresh-text">{refresh.text}</span> : null}
        {keys.length > 0 ? (
          <span class="pr-actions keys">
            {keys.map(k => (
              <KeyButton k={k} />
            ))}
          </span>
        ) : null}
      </div>
      <PrRefreshStatus v={v} refresh={refresh} />
    </section>
  )
}

/**
 * A PR block in the form its track draws. A settling block draws its settled line over the body it last drew open,
 * inert, while its height shrinks over it. A block leaving after the view dropped it draws its last form. The body
 * stays the same element from open to settling, so the rows still moving in it finish their own moves.
 */
function PrEntry({ b, v, prs, now }: { b: DrawnPrBlock; v: View; prs: DrawnPrs; now: number }) {
  const was = b.wasOpen
  const settled = b.state.is === 'settled' ? b.state : null
  const shown = was?.block ?? b
  const hasBody = !settled || was !== null
  const bodyClass = !was ? 'pr-body' : settled ? 'pr-body pr-was-open closing' : 'pr-body closing'

  return (
    <section class="pr-entry" data-motion={prBlockMotion(prMarkId(b.pr.ref))}>
      <div class="pr-entry-content">
        {settled ? <SettledPr key="settled" pr={b.pr} state={settled} /> : <PrHead key="head" v={v} {...shown} />}
        {hasBody ? (
          <div key="body" class={bodyClass} inert={was !== null}>
            <PrBody {...shown} v={v} prs={prs} now={now} tracks={was?.tracks} />
          </div>
        ) : null}
      </div>
    </section>
  )
}

function PrHead({ v, pr, rank }: DrawnPrBlock & { v: View }) {
  const { status, head, unlisted } = readiness(pr, threadSentIn(v.lastActions), 'Codex')
  const tone = PR_TONES[status]

  return (
    <div class="pr-head">
      {rank === null ? null : <span class="rank muted">{prRankText(rank)}</span>}
      <span class="tone-prs num">#{pr.number}</span> {pr.title}{' '}
      <span class={tone ? `pr-verdict tone-${tone}` : 'pr-verdict muted'}>{head}</span>
      <span class="pr-verdict muted">{unlisted.map(r => `${DOT}${r}`).join('')}</span>
    </div>
  )
}

/**
 * An open block's buttons, press line and groups. With `tracks`, the body a settling or leaving block still draws:
 * each row keeps the form it had, and no part takes a new move.
 */
function PrBody({
  v,
  pr,
  drawn,
  line,
  prs,
  now,
  tracks,
}: DrawnPrBlock & { v: View; prs: DrawnPrs; now: number; tracks?: Map<string, RowTrack> }) {
  const isSent = threadSentIn(v.lastActions)
  const id = prMarkId(pr.ref)
  const keys = prBlockActions(pr, isSent, v.prs.branchRef, pressesOf(v)).map(a => prKey(id, pr, a))

  return (
    <>
      {pr.error ? <div class="pr-status tone-error">{prRefreshFailedText(pr.error)}</div> : null}
      <div class="pr-actions keys">
        {keys.map(k => (
          <KeyButton k={k} />
        ))}
      </div>
      {line ? (
        <div data-motion={tracks ? undefined : prLineMotion(id)}>
          <PrLine line={line} />
        </div>
      ) : null}
      <div class="pr-groups">
        {PR_GROUPS.map(group => (
          <PrRows
            key={group}
            motion={tracks ? undefined : prGroupMotion(id, group)}
            group={group}
            rows={drawn[group]}
            prs={prs}
            now={now}
            tracks={tracks}
          />
        ))}
      </div>
    </>
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
  tracks,
}: {
  motion: string | undefined
  group: PrGroup
  rows: Row[] | null
  prs: DrawnPrs
  now: number
  tracks: Map<string, RowTrack> | undefined
}) {
  if (!rows) return null
  const listed = rows.filter(r => prs.rows.includes(r))

  return (
    <div class="pr-group" data-motion={motion}>
      <GroupTitle title={PR_GROUP_TITLES[group]} count={listed.length} />
      <div class="list">
        {rows.map(row => (
          <div class="entry" key={row.id} data-motion={tracks ? undefined : row.id}>
            <ListRow
              row={row}
              track={tracks?.get(row.id) ?? drawnRows.get(row.id)!.track}
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
  const ghState = { isGhMissing: v.isGhMissing, isGhSignedOut: v.prs.isGhSignedOut, failure: v.prs.failure }
  const ghNotice = ghNoticeOf(ghState)
  const empty = prsEmptyText({ isFetching: v.isFetchingPrs, ...ghState }, 'chat')
  if (prs.blocks.length === 0)
    return (
      <main>
        <div class="empty">
          <div class="title">{empty.title}</div>
          <div class="muted">{empty.hint}</div>
        </div>
        {v.prs.refresh ? <PrRefreshLine v={v} refresh={v.prs.refresh} /> : null}
      </main>
    )

  const isRefreshInBanner = ghNotice !== null && v.prs.refresh !== null && v.prs.refresh.text === null
  const refresh = v.prs.refresh

  return (
    <main>
      {ghNotice ? (
        <div class="banner-place">
          <Banner
            banner={bannerOf(ghNotice.kind, ghNotice.text)}
            {...(isRefreshInBanner && refresh
              ? { keys: refreshKeys(refresh), under: <PrRefreshStatus v={v} refresh={refresh} /> }
              : {})}
          />
        </div>
      ) : null}
      {refresh && !isRefreshInBanner ? <PrRefreshLine v={v} refresh={refresh} /> : null}
      {v.prs.order ? <PrOrderLines v={v} order={v.prs.order} /> : null}
      {prs.blocks.map(b => (
        <PrEntry key={prMarkId(b.pr.ref)} b={b} v={v} prs={prs} now={now} />
      ))}
      {v.prs.olderText ? (
        <section>
          <div class="group-title muted">{v.prs.olderText}</div>
        </section>
      ) : null}
    </main>
  )
}
