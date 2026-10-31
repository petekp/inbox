import { Icon } from './row-actions'
import {
  canUndoRefused,
  closedShown,
  closedTotal,
  earlierLabel,
  foldLabel,
  waitingCount,
  settledLabel,
  shortAgo,
} from '../../hooks/rows'
import { emptyText, groupEmptyText } from '../../hooks/banners'
import { entryId, settledIn } from '../../hooks/action-plan'
import { FINDING_GROUPS } from '../../hooks/help'
import type { ResultMark } from '../../hooks/rows'
import type { Finding } from '../../types'
import type { FoldGroup } from './arrivals'
import type { TabView as View } from './core'
import { unfolded, sending, closingFolds, drawnRows } from './tab-state'
import type { Row, Entry, Lists } from './tab-state'
import { toggleFold } from './tab-motion'
import { act } from './tab-rows'
import { ResultMarkView, GroupTitle } from './tab-parts'
import { Entries } from './tab-list'

function itemsClosed(v: View, kind: 'question' | 'task', entries: Entry[]): ClosedLine[] {
  return closedShown(v.needsYou.closed[kind === 'question' ? 'questions' : 'tasks'], settledIn(entries)).map(d => ({
    id: d.id,
    ask: d.ask,
    outcomeLabel: d.outcomeLabel,
    mark: d.mark,
    at: d.at,
    delivery: d.delivery,
  }))
}

function ItemGroup({
  v,
  kind,
  entries,
  all,
  now,
}: {
  v: View
  kind: 'question' | 'task'
  entries: Entry[]
  all: Row[]
  now: number
}) {
  const title = kind === 'question' ? 'Questions' : 'Tasks'
  const rest = staying(entries)
  const closed = itemsClosed(v, kind, rest)
  const rows = rest.flatMap(x => ('row' in x ? [x.row] : []))

  return (
    <section>
      <GroupTitle title={title} count={waitingCount(rows.map(r => r.view))} />
      <Entries entries={entries} group={kind} all={all} now={now} />
      <GroupEnd
        group={kind}
        empty={groupEmpty(title, rest)}
        closed={closed}
        total={closedTotal(v.needsYou.closed[kind === 'question' ? 'questions' : 'tasks'], settledIn(rest))}
        now={now}
      />
    </section>
  )
}

function staying(entries: Entry[]): Entry[] {
  return entries.filter(x => drawnRows.get(entryId(x))?.track.state !== 'leaving')
}

type GroupEmpty = { text: string; isLeaving: boolean }

function groupEmpty(title: string, rest: Entry[]): GroupEmpty | null {
  const isArriving = rest.every(x => drawnRows.get(entryId(x))?.track.state === 'entering')

  return rest.length === 0 || isArriving ? { text: groupEmptyText(title), isLeaving: rest.length > 0 } : null
}

type ClosedLine = {
  id: string
  ask: string
  outcomeLabel: string
  mark: ResultMark
  at: number
  delivery: Parameters<typeof settledLabel>[1]
}

function GroupEnd({
  group,
  empty,
  closed,
  total,
  now,
}: {
  group: FoldGroup
  empty: GroupEmpty | null
  closed: ClosedLine[]
  total: number
  now: number
}) {
  const earlier = earlierLabel(total, closed.length)
  const isUnfolded = unfolded.has(group)
  const isListed = total > 0 && (isUnfolded || closingFolds.has(group))

  return (
    <>
      <div class="group-end" data-motion={`end-${group}`}>
        <div class="group-end-content">
          {empty ? (
            <div class={empty.isLeaving ? 'group-empty leaving' : 'group-empty'} aria-hidden={empty.isLeaving}>
              {empty.text}
            </div>
          ) : null}
          {total > 0 ? (
            <button type="button" class="fold" data-fold={group} onClick={() => toggleFold(group)}>
              <Icon name={isUnfolded ? 'down' : 'right'} />
              {foldLabel(total)}
            </button>
          ) : null}
        </div>
      </div>
      {isListed ? (
        <div class="list closed-list" data-motion={`closed-${group}`}>
          {closed.map(d => (
            <div class="entry" key={`closed-${d.id}`}>
              <div class="row">
                <ResultMarkView mark={d.mark} />
                <div class="content tight">
                  <div class="muted">{d.ask}</div>
                  <div class="outcome">{settledLabel(d.outcomeLabel, d.delivery)}</div>
                  {canUndoRefused(d.delivery) ? (
                    <button
                      type="button"
                      disabled={sending.has(d.id)}
                      onClick={() => act(d.id, { id: d.id, action: 'undo' })}
                    >
                      Undo
                    </button>
                  ) : null}
                </div>
                <span class="side">{shortAgo(now - d.at)}</span>
              </div>
            </div>
          ))}
          {earlier ? <div class="earlier muted">{earlier}</div> : null}
        </div>
      ) : null}
    </>
  )
}

/** What the Asks tab says about the hooks the inbox has not heard from. The tab bar's line says why Codex is not running them. */
function notHeardText(v: View): [string, string?] | null {
  if (v.heard === 'heard' || v.hooksTrust) return null
  if (v.heard === 'none') return ['The inbox starts with your next message.']

  return ['Items from Codex’s replies are missing.', 'The inbox has not heard from this chat’s hooks.']
}

export function NeedsYou({ v, lists, now }: { v: View; lists: Lists; now: number }) {
  const all = lists.byTab.needsYou
  const isNothing = lists.questions.length === 0 && lists.tasks.length === 0
  const hasClosed =
    itemsClosed(v, 'question', lists.questions).length > 0 || itemsClosed(v, 'task', lists.tasks).length > 0
  const notHeard = notHeardText(v)
  if (isNothing && !hasClosed)
    return notHeard ? (
      <div class="empty">
        <div class="title">{notHeard[0]}</div>
        {notHeard[1] ? <div class="muted">{notHeard[1]}</div> : null}
      </div>
    ) : (
      <div class="empty">
        <div class="title">{emptyText('needsYou', 'Codex').title}</div>
        <div class="muted">{emptyText('needsYou', 'Codex').hint}</div>
      </div>
    )

  return (
    <main>
      {notHeard ? (
        <section>
          <div class="group-title">
            {notHeard[0]}
            {notHeard[1] ? <div class="muted">{notHeard[1]}</div> : null}
          </div>
        </section>
      ) : null}
      <ItemGroup v={v} kind="question" entries={lists.questions} all={all} now={now} />
      <ItemGroup v={v} kind="task" entries={lists.tasks} all={all} now={now} />
    </main>
  )
}

export function Findings({ v, lists, now }: { v: View; lists: Lists; now: number }) {
  const settled = settledIn(staying(lists.findings))
  const closedOf = (kind: Finding['kind']) => v.findings.closed.filter(f => f.kind === kind)
  const shown = (kind: Finding['kind']) =>
    closedShown(closedOf(kind), settled).map(f => ({
      id: f.id,
      ask: f.title,
      outcomeLabel: f.outcomeLabel,
      mark: f.mark,
      at: f.closedAt,
      delivery: f.delivery,
    }))
  const isNothing = lists.findings.length === 0
  if (isNothing && closedTotal(v.findings.closed, settled) === 0)
    return (
      <div class="empty">
        <div class="title">{emptyText('findings', 'Codex').title}</div>
        <div class="muted">{emptyText('findings', 'Codex').hint}</div>
      </div>
    )

  return (
    <main>
      {lists.findingGroups.map(g => {
        const rest = staying(g.entries)
        const rows = rest.flatMap(x => ('row' in x ? [x.row] : []))
        return (
          <section>
            <GroupTitle title={g.title} count={waitingCount(rows.map(r => r.view))} mark={FINDING_GROUPS[g.kind]} />
            <Entries entries={g.entries} group="finding" all={lists.byTab.findings} now={now} />
            <GroupEnd
              group={g.kind}
              empty={groupEmpty(g.title, rest)}
              closed={shown(g.kind)}
              total={closedTotal(closedOf(g.kind), settled)}
              now={now}
            />
          </section>
        )
      })}
    </main>
  )
}
