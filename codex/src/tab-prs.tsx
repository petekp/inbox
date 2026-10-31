import { ago } from '../../hooks/text'
import { settledMark, bannerOf, DOT, feedbackOf, feedbackText, hasAge, isFailure, settledLabel } from '../../hooks/view'
import type { SettledState } from '../../hooks/view'
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
import { isDismissed } from '../../hooks/pr-views'
import { prRankText } from '../../hooks/pr-order'
import type { PrOrderView } from '../../hooks/pr-order'
import type { PrAction } from '../../hooks/pr-press'
import { readiness } from '../../hooks/prs'
import type { PrView } from '../../types'
import type { TabView as View } from './core'
import type { RowTrack } from './rows'
import { tabState, sending, SENDING, errors, undoing } from './tab-state'
import type { Key, Row } from './tab-state'
import { selectedIndex, select } from './tab-selection'
import { act, pressesOf, prKey, prPlan } from './tab-rows'
import type { PrBlockPlan } from './tab-rows'
import { KeyButton, noteOf, ResultMarkView, GroupTitle, UndoPlace, Banner } from './tab-parts'
import { ListRow } from './tab-list'

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

function prLastLine(v: View, ref: string): { text: string; isError: boolean } | null {
  return pressLine(v, prMarkId(ref), !isDismissed(v.lastActions, ref))
}

/** A press's status under its buttons. `showsLast` says whether it draws the row's last press once that is saved. */
function pressLine(v: View, id: string, showsLast: boolean): { text: string; isError: boolean } | null {
  if (sending.has(id)) {
    const pending = sending.get(id)?.pending
    return { text: pending ? feedbackText(pending, 'codex') : SENDING, isError: false }
  }
  const error = errors.get(id)
  if (error) return { text: error, isError: true }
  const note = noteOf(id)
  if (note) return { text: note, isError: false }
  const f = showsLast ? feedbackOf(id, v.lastActions[id], undefined, v.turns, v.at) : null
  if (!f) return null
  const text = feedbackText(f, 'codex')

  return { text: hasAge(f) ? `${text}${DOT}${ago(v.at - f.at)}` : text, isError: isFailure(f) }
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
      {last ? <div class={last.isError ? 'pr-last tone-error' : 'pr-last muted'}>{last.text}</div> : null}
    </section>
  )
}

function PrBlock({
  v,
  pr,
  threads,
  checks,
  rank,
  openId,
  all,
  now,
}: PrBlockPlan & { v: View; openId: string | undefined; all: Row[]; now: number }) {
  const isSent = threadSentIn(v.lastActions)
  const { status, head, unlisted } = readiness(pr, isSent)
  const tone = PR_TONES[status]
  const id = prMarkId(pr.ref)
  const keys = prBlockActions(pr, isSent, v.prs.branchRef, pressesOf(v)).map(a => prKey(id, pr, a))
  const last = prLastLine(v, pr.ref)

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
      {last ? <div class={last.isError ? 'pr-last tone-error' : 'pr-last muted'}>{last.text}</div> : null}
      <div class="pr-groups">
        <PrRows title={PR_GROUP_TITLES.threads} rows={threads} all={all} openId={openId} now={now} />
        <PrRows title={PR_GROUP_TITLES.checks} rows={checks} all={all} openId={openId} now={now} />
      </div>
    </section>
  )
}

function PrRows({
  title,
  rows,
  all,
  openId,
  now,
}: {
  title: string
  rows: Row[]
  all: Row[]
  openId: string | undefined
  now: number
}) {
  if (rows.length === 0) return null

  return (
    <>
      <GroupTitle title={title} count={rows.length} />
      <div class="list">
        {rows.map(row => {
          const isOpen = row.id === openId
          const track: RowTrack = { state: isOpen ? 'open' : 'closed', since: 0, hasPanel: isOpen }

          return (
            <div class="entry" key={row.id}>
              <ListRow row={row} track={track} now={now} onSelect={() => select('prs', all, all.indexOf(row))} />
            </div>
          )
        })}
      </div>
    </>
  )
}

export function Prs({ v, now }: { v: View; now: number }) {
  const { blocks, rows } = prPlan(v)
  const ghState = { isGhMissing: v.isGhMissing, isGhSignedOut: v.prs.isGhSignedOut }
  const ghNotice = ghNoticeOf(ghState)
  const empty = prsEmptyText({ isFetching: v.isFetchingPrs, ...ghState }, 'chat')
  if (blocks.length === 0)
    return (
      <div class="empty">
        <div class="title">{empty.title}</div>
        <div class="muted">{empty.hint}</div>
      </div>
    )
  const openId = rows[selectedIndex(rows, 'prs', v)]?.id
  const tabKeys = prTabKeys(v)

  return (
    <main>
      {ghNotice ? (
        <div class="banner-place">
          <Banner banner={bannerOf(ghNotice.kind, ghNotice.text)} />
        </div>
      ) : null}
      {v.prs.order ? <PrOrderLines v={v} order={v.prs.order} /> : null}
      {blocks.map(b =>
        b.state.is === 'settled' ? (
          <section>
            <SettledPr pr={b.pr} state={b.state} />
          </section>
        ) : (
          <PrBlock {...b} v={v} openId={openId} all={rows} now={now} />
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
