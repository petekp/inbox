import { createHash } from 'node:crypto'
import { projectBanners } from './banner-view'
import { projectFolds } from './fold-view'
import { collapseProjection } from './collapse-view'
import type { ViewPreferences } from './collapse-view'
import { projectPrs } from './pr-view'
import { tabBadge } from '../../../core/view/tabs'
import { remoteRowDigest } from '../../../core/remote/remote-commands'
import { emptyTab } from '../../../core/view/empty-tab'
import { projectRowGroups } from './row-view'
import type { AllowedAction, ViewIdentity } from './row-view'
import { sessionView } from '../../../core/view/session-view'
import { isMaybeStale } from '../../../core/view/band'
import { waitingCount, ROW_COPY } from '../../../core/view/rows'
import { SETTLED_MS } from '../../../core/view/timing'
import type { Holds } from '../../../core/view/timing'
import type { Session } from '../../../types'
import { projectStatus } from './status-view'

type ProjectionSource = {
  sessionId: string
  agent: string
  name: string
  connected: boolean
  waiting: boolean
  writtenAt: number
  fetching: boolean
  reliable: boolean
  canPublish: boolean
  durable: boolean
  actions: readonly string[]
}

export async function projectInbox(
  binding: ViewIdentity,
  state: Session,
  source: ProjectionSource,
  now: number,
  holds: Holds,
  preferences: ViewPreferences,
) {
  const collapsedView = collapseProjection(state, preferences, now)
  const view = sessionView(collapsedView.state, now, SETTLED_MS, holds, {}, false, {
    isReadFailed: false,
    isFetchingPrs: source.fetching,
    turnReadFailedAt: null,
    isDemo: false,
  })
  const allowed = new Map<string, AllowedAction>()
  const versions = new Map(
    await Promise.all(
      [...state.ledger.items, ...state.ledger.findings, ...state.ledger.closed, ...state.ledger.closedFindings].map(
        async row => [row.id, await remoteRowDigest(state, row.id)] as const,
      ),
    ),
  )
  versions.set('goal', await remoteRowDigest(state, 'goal'))
  const prVersion = await remoteRowDigest(state, 'pr:remote')
  const remoteActions = source.actions
  const foldPlans = projectFolds(view, collapsedView.offer)
  const foldVersion = createHash('sha256')
    .update(
      JSON.stringify([
        state.ledger,
        state.prViews,
        state.lastActions,
        foldPlans.map(({ records: _records, ...targets }) => targets),
      ]),
    )
    .digest('hex')
  const groups = projectRowGroups(
    binding,
    view,
    versions,
    allowed,
    remoteActions,
    now,
    collapsedView.offer,
    source.agent,
  )
  const emptyFor = (tab: 'needsYou' | 'findings', listed: typeof groups.askGroups) =>
    emptyTab(view, {
      tab,
      agent: source.agent,
      drawn: listed.reduce((n, group) => n + group.rows.length + group.closedAll.length, 0),
      hasBlocker: source.waiting,
    })
  const asksEmpty = emptyFor('needsYou', groups.askGroups)
  const findsEmpty = emptyFor('findings', groups.findingGroups)
  return {
    view,
    versions,
    allowed,
    snapshot: {
      banners: await projectBanners(
        state,
        view.status.error,
        binding,
        source.durable ? remoteActions : [],
        versions,
        allowed,
      ),
      prVersion,
      foldPlans,
      foldVersion,
      sendLabel: ROW_COPY.send,
      discardLabel: ROW_COPY.discard,
      collapseInput: collapsedView.collapseInput,
      collapsed: collapsedView.collapsed,
      collapses: collapsedView.collapses,
      session: source.sessionId,
      name: source.name,
      connected: source.connected,
      updatedAt: source.writtenAt,
      serverNow: now,
      running: state.presence.isTurnRunning,
      failure: [
        !source.reliable
          ? 'Replies are paused because this host’s clock could not be read.'
          : !source.canPublish
            ? 'This host cannot publish private replies.'
            : null,
      ]
        .filter(Boolean)
        .join(' '),
      fresh: source.reliable && !isMaybeStale(view.sync.ledger),
      statusError: view.statusPage.error ?? '',
      asks: groups.askGroups.flatMap(group => group.rows),
      findings: groups.findingGroups.flatMap(group => group.rows),
      ...groups,
      ...projectPrs(view, { ...state.prViews, isFetching: source.fetching }, source.agent, now, collapsedView.offer, {
        binding,
        version: prVersion,
        versions,
        allowed,
        actions: source.durable ? remoteActions : [],
      }),
      asksBadge:
        tabBadge('needsYou', { needsYou: view.needsYou.count, findings: view.findings.count, prs: view.prs.count }) ??
        '',
      findsBadge:
        tabBadge('findings', { needsYou: view.needsYou.count, findings: view.findings.count, prs: view.prs.count }) ??
        '',
      prsBadge:
        tabBadge('prs', { needsYou: view.needsYou.count, findings: view.findings.count, prs: view.prs.count }) ?? '',

      asksEmptyTitle: asksEmpty?.title ?? '',
      asksEmptyHint: asksEmpty?.hint ?? '',
      findsEmptyTitle: findsEmpty?.title ?? '',
      findsEmptyHint: findsEmpty?.hint ?? '',
      ...projectStatus(
        view.statusPage,
        { folds: preferences.folds, collapsed: collapsedView.collapsed },
        {
          binding,
          version: versions.get('goal')!,
          allowed,
          actions: remoteActions,
        },
        collapsedView.offer,
      ),
      questionCount: waitingCount(view.needsYou.questions),
      taskCount: waitingCount(view.needsYou.tasks),
    },
  }
}
