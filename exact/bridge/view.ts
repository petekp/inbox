import { desktopView } from './desktop'
import { projectInbox } from './inbox-projection'
import { NO_VIEW_PREFERENCES } from './collapse-view'
import type { ViewPreferences } from './collapse-view'
import { agentClock } from './remote-clock'
import { LEGACY_REMOTE_ACTIONS, REMOTE_ACTIONS } from '../../core/remote/remote-commands'
import type { HerdrEnvelope } from '../../core/remote/herdr-envelope'
import { readSession } from '../../core/remote/herdr-read'
import type { SessionView } from '../../core/view/session-view'
import { ROW_COPY } from '../../core/view/rows'
import type { AllowedAction } from './row-view'
import { NO_HOLDS } from '../../core/view/timing'
import { readPublished, publishedTerminal } from './remote'
import { activeBinding, boundTerminal } from './binding'
import type { HostBinding } from './binding'
import type { Result } from '../app.contract'

type Snapshot = Omit<Result<'loadInbox'>, 'key' | 'readOnly' | 'connectionState' | 'rowVersion'>
type AllowedPress = AllowedAction
export type CurrentView = {
  binding: HostBinding
  projectFolder: string | null
  canPublish: boolean
  snapshot: Snapshot
  view: SessionView
  envelope: Omit<HerdrEnvelope, 'terminal' | 'format' | 'session'> & { terminal?: string }
  versions: Map<string, string>
  allowed: Map<string, AllowedPress>
}

export async function currentView(
  shownSince: number,
  binding: HostBinding | null = null,
  fresh = false,
  viewerId = '',
  preferences: ViewPreferences = NO_VIEW_PREFERENCES,
): Promise<CurrentView | null> {
  binding ??= await activeBinding()
  if (!binding) return null
  if (binding.source === 'codex') return desktopView(binding, shownSince, viewerId, preferences, !fresh)
  const terminal = await boundTerminal(binding, fresh)
  const session = binding.session
  const text = await readPublished(binding, fresh)
  const read = readSession(text)
  if (read.is !== 'read') throw new Error('The agent’s Inbox could not be read.')
  if (
    read.envelope.terminal !== publishedTerminal(binding) ||
    read.envelope.sessionId !== session ||
    read.envelope.host !== terminal.status?.app
  )
    throw new Error('The published Inbox does not match its agent session.')
  const clock = await agentClock(binding)
  const now = clock.reliable ? clock.now : read.envelope.writtenAt
  shownSince = Math.min(shownSince, now)
  const viewer = read.envelope.viewers?.[viewerId]
  const activeViewer = viewer && !viewer.released && viewer.expiresAt > now
  const holds = activeViewer
    ? { ...NO_HOLDS, replies: viewer.replies, shownSince: viewer.shownSince, listInput: viewer.listInput ?? null }
    : { ...NO_HOLDS, shownSince }
  const projected = await projectInbox(
    binding,
    read.session,
    {
      sessionId: session,
      agent: read.envelope.agent,
      name: terminal.labels['inbox.title'] || terminal.title || terminal.name || 'Agent session',
      connected: terminal.state === 'live',
      waiting: terminal.status?.state === 'waiting',
      writtenAt: read.envelope.writtenAt,
      fetching: read.isFetchingPrs,
      reliable: clock.reliable,
      canPublish: clock.privateFiles,
      durable: process.env.INBOX_EXPERIMENTAL_PROTOCOL === '2' && read.envelope.remoteProtocol === 2,
      actions:
        process.env.INBOX_EXPERIMENTAL_PROTOCOL === '2'
          ? (read.envelope.remoteActions ?? LEGACY_REMOTE_ACTIONS)
          : REMOTE_ACTIONS,
    },
    now,
    holds,
    preferences,
  )
  return {
    ...projected,
    binding,
    projectFolder: read.projectFolder,
    canPublish: clock.reliable && clock.privateFiles,
    envelope: read.envelope,
  }
}

export function emptySnapshot(message = 'No agent session is connected.'): Snapshot {
  return {
    banners: [],
    prVersion: '',
    foldPlans: [],
    foldVersion: '',
    sendLabel: ROW_COPY.send,
    discardLabel: ROW_COPY.discard,
    statusGoalHint: '',
    collapseInput: { ids: [], entries: [] },
    collapsed: [],
    collapses: [],
    session: '',
    name: 'Agent session',
    connected: false,
    updatedAt: 0,
    serverNow: Date.now(),
    running: false,
    failure: message,
    fresh: false,
    statusError: '',
    asks: [],
    findings: [],
    askGroups: [],
    findingGroups: [],
    asksEmptyTitle: '',
    asksEmptyHint: '',
    findsEmptyTitle: '',
    findsEmptyHint: '',
    prLines: [],
    prNotice: '',
    prEmptyTitle: '',
    prEmptyHint: '',
    asksBadge: '',
    findsBadge: '',
    prsBadge: '',
    statusVersion: '',
    statusGoalKey: '',
    statusSubmitLabel: '',
    statusLabel: '',
    statusMark: '',
    statusMarkColor: '-exact-secondary-label',
    statusHasGoal: false,
    statusIsMet: false,
    statusWas: '',
    statusNow: '',
    statusOffer: '',
    statusHeadingActions: [],
    statusOfferActions: [],
    statusActions: [],
    statusTitle: '',
    statusDetail: '',
    statusRows: [],
    questionCount: 0,
    taskCount: 0,
  }
}
