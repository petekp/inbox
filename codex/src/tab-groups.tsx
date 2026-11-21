import { Icon, inputOf } from './row-actions'
import {
  closedLineAction,
  closedShown,
  closedTotal,
  earlierLabel,
  foldLabel,
  waitingCount,
  settledLabel,
  shortAgo,
} from '../../core/view/rows'
import { groupEmptyText } from '../../core/view/banners'
import { LEAVE_FADE_MS } from '../../core/view/row-motion'
import { emptyTab } from '../../core/view/empty-tab'
import { entryId, settledIn } from '../../core/view/action-plan'
import { FINDING_GROUPS, NEEDS_YOU_MARKS } from '../../core/view/help'
import type { ResultMark } from '../../core/view/rows'
import type { Finding } from '../../types'
import type { FoldGroup } from './arrivals'
import type { TabView as View } from './core'
import { closingFolds, drawnRows, tabState } from './tab-state'
import type { Entry, Lists } from './tab-state'
import { clickFold, toggleFold } from './tab-fold-all'
import { outOn } from './tab-press'
import { dispatch, pressRow } from './tab-ui'
import { ResultMarkView, GroupTitle, EmptyState } from './tab-parts'
import { Entries } from './tab-list'

function itemsClosed(v: View, kind: 'question' | 'task', entries: Entry[]): ClosedLine[] {
  const closed = v.needsYou.closed[kind === 'question' ? 'questions' : 'tasks']

  return closedShown(closed, settledIn(entries), tabState.ui.closedAll.includes(kind)).map(d => ({
    id: d.id,
    how: d.how,
    ask: d.ask,
    outcomeLabel: d.outcomeLabel,
    mark: d.mark,
    at: d.at,
    delivery: d.delivery,
  }))
}

function ItemGroup({ v, kind, entries, now }: { v: View; kind: 'question' | 'task'; entries: Entry[]; now: number }) {
  const title = kind === 'question' ? 'Questions' : 'Tasks'
  const mark = NEEDS_YOU_MARKS[kind]
  const rest = staying(entries)
  const closed = itemsClosed(v, kind, entries)
  const rows = rest.flatMap(x => ('row' in x ? [x.row] : []))

  return (
    <section>
      <GroupTitle title={title} count={waitingCount(rows.map(r => r.view))} mark={mark} />
      <Entries entries={entries} now={now} />
      <GroupEnd
        group={kind}
        empty={groupEmpty(title, rest)}
        closed={closed}
        total={closedTotal(v.needsYou.closed[kind === 'question' ? 'questions' : 'tasks'], settledIn(entries))}
        now={now}
      />
    </section>
  )
}

function staying(entries: Entry[]): Entry[] {
  return entries.filter(x => drawnRows.get(entryId(x))?.track.state !== 'leaving')
}

type GroupEmpty = { text: string; isLeaving: boolean }

/**
 * A group's empty note, and whether it leaves: it stays in its place, fading out, until the group's first rows have
 * waited `LEAVE_FADE_MS` to arrive, and then its space closes as theirs opens.
 */
function groupEmpty(title: string, rest: Entry[]): GroupEmpty | null {
  const now = Date.now()
  const isArriving = rest.every(x => {
    const track = drawnRows.get(entryId(x))?.track
    return track?.state === 'entering' && now - track.since < LEAVE_FADE_MS
  })

  return rest.length === 0 || isArriving ? { text: groupEmptyText(title), isLeaving: rest.length > 0 } : null
}

type ClosedLine = {
  id: string
  how: Parameters<typeof closedLineAction>[0]['how']
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
  const isUnfolded = tabState.ui.unfolded.includes(group)
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
            <button
              type="button"
              class="fold"
              data-fold={group}
              onClick={e => clickFold(e, isUnfolded, () => toggleFold(group))}
            >
              {foldLabel(total)}
              <Icon name={isUnfolded ? 'down' : 'right'} />
            </button>
          ) : null}
        </div>
      </div>
      {isListed ? (
        <div class="list closed-list" data-motion={`closed-${group}`}>
          {closed.map(d => {
            const action = closedLineAction(d)
            return (
              <div class="entry" key={`closed-${d.id}`}>
                <div class="row">
                  <ResultMarkView mark={d.mark} />
                  <div class="content tight">
                    <div class="muted">{d.ask}</div>
                    <div class="outcome">{settledLabel(d.outcomeLabel, d.delivery)}</div>
                    {action ? (
                      <button
                        type="button"
                        disabled={outOn(d.id) !== null}
                        onClick={e => pressRow(action.press, inputOf(e))}
                      >
                        {action.label}
                      </button>
                    ) : null}
                  </div>
                  <span class="side">{shortAgo(now - d.at)}</span>
                </div>
              </div>
            )
          })}
          {earlier ? (
            <button type="button" class="earlier" onClick={() => dispatch([{ type: 'earlier', fold: group }])}>
              {earlier}
            </button>
          ) : null}
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
  const closedCount = itemsClosed(v, 'question', lists.questions).length + itemsClosed(v, 'task', lists.tasks).length
  const notHeard = notHeardText(v)
  const empty = emptyTab(v, {
    tab: 'needsYou',
    agent: 'Codex',
    drawn: lists.questions.length + lists.tasks.length + closedCount,
    hasBlocker: false,
    hostText: notHeard ? { title: notHeard[0], hint: notHeard[1] ?? null } : null,
  })
  if (empty) return <EmptyState empty={empty} />

  return (
    <main>
      {notHeard ? (
        <section>
          <div class="group-title unmarked">
            {notHeard[0]}
            {notHeard[1] ? <div class="muted">{notHeard[1]}</div> : null}
          </div>
        </section>
      ) : null}
      <ItemGroup v={v} kind="question" entries={lists.questions} now={now} />
      <ItemGroup v={v} kind="task" entries={lists.tasks} now={now} />
    </main>
  )
}

export function Findings({ v, lists, now }: { v: View; lists: Lists; now: number }) {
  const settled = settledIn(lists.findings)
  const closedOf = (kind: Finding['kind']) => v.findings.closed.filter(f => f.kind === kind)
  const shown = (kind: Finding['kind']) =>
    closedShown(closedOf(kind), settled, tabState.ui.closedAll.includes(kind)).map(f => ({
      id: f.id,
      how: f.how,
      ask: f.title,
      outcomeLabel: f.outcomeLabel,
      mark: f.mark,
      at: f.closedAt,
      delivery: f.delivery,
    }))
  const empty = emptyTab(v, {
    tab: 'findings',
    agent: 'Codex',
    drawn: lists.findings.length + closedTotal(v.findings.closed, settled),
    hasBlocker: false,
  })
  if (empty) return <EmptyState empty={empty} />

  return (
    <main>
      {lists.findingGroups.map(g => {
        const rest = staying(g.entries)
        const rows = rest.flatMap(x => ('row' in x ? [x.row] : []))
        return (
          <section>
            <GroupTitle title={g.title} count={waitingCount(rows.map(r => r.view))} mark={FINDING_GROUPS[g.kind]} />
            <Entries entries={g.entries} now={now} />
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
