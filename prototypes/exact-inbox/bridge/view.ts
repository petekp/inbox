import { remoteRowDigest, supportsRemotePress } from '../../../core/remote/remote-commands'
import { createHash } from 'node:crypto'
import type { HerdrEnvelope } from '../../../core/remote/herdr'
import { readSession } from '../../../herdr/src/files'
import { sessionView } from '../../../core/view/session-view'
import type { SessionView } from '../../../core/view/session-view'
import { isMaybeStale } from '../../../core/view/band'
import { rowKeyPlan } from '../../../core/view/action-plan'
import { rowFeedbackText } from '../../../core/view/feedback'
import {
  settledLabel,
  rowResultMark,
  waitingCount,
  shownOptionDescriptions,
  optionBody,
  optionReasonLine,
} from '../../../core/view/rows'
import type { RowView } from '../../../core/view/rows'
import type { RowPress } from '../../../core/domain/presses'
import { SETTLED_MS, NO_HOLDS } from '../../../core/view/timing'
import type { StatusRow } from '../../../core/view/status-page'
import { readPublished, publishedTerminal } from './remote'
import { activeBinding, boundTerminal } from './binding'
import type { SessionBinding } from './binding'
import type { Result } from '../app.contract'

type Snapshot = Omit<Result<'loadInbox'>, 'key' | 'readOnly' | 'connectionState'>
type Row = Snapshot['asks'][number]
type StatusLine = Snapshot['statusRows'][number]
type AllowedPress = { press: RowPress; disabled: boolean }
type CurrentView = {
  binding: SessionBinding
  snapshot: Snapshot
  view: SessionView
  envelope: HerdrEnvelope
  versions: Map<string, string>
  allowed: Map<string, AllowedPress>
}

function keyFor(binding: SessionBinding, generation: string, row: RowView, press: RowPress, position = 'undo'): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        binding.source,
        binding.socket,
        binding.appHome,
        binding.session,
        binding.terminal,
        generation,
        row.id,
        row.title,
        row.at,
        row.item,
        row.finding,
        row.state,
        row.feedback,
        press,
        position,
      ]),
    )
    .digest('hex')
}

function projectRow(
  binding: SessionBinding,
  generation: string,
  row: RowView,
  allowed: Map<string, AllowedPress>,
): Row {
  const plan = rowKeyPlan(row, true)
  const actions = [...plan.keys, ...plan.more].flatMap((p, index) => {
    if (p.slot === 'allOptions') return []
    const a = p.slot === 'retry' ? { ...p, isOut: false, isPrimary: false } : p.action
    const isLocal = a.kind === 'local'
    const unsupported = process.env.INBOX_EXPERIMENTAL_PROTOCOL === '2' && !supportsRemotePress(a.press)
    const key = keyFor(binding, generation, row, a.press, `${p.slot}-${index}`)
    allowed.set(key, { press: a.press, disabled: a.isOut || isLocal || unsupported })
    return [
      {
        key,
        label: a.label,
        primary: a.isPrimary,
        disabled: a.isOut || isLocal || unsupported,
        input: a.press.action === 'type',
        reason: isLocal
          ? 'Open this from the agent’s computer.'
          : unsupported
            ? 'This action is not available in this preview.'
            : '',
      },
    ]
  })
  const settled = row.state.is === 'settled' ? row.state : null
  if (settled?.canUndo) {
    const press: RowPress = { id: row.id, action: 'undo' }
    const key = keyFor(binding, generation, row, press)
    allowed.set(key, { press, disabled: false })
    actions.push({ key, label: 'Undo', primary: false, disabled: false, input: false, reason: '' })
  }
  return {
    id: row.id,
    kind: row.type,
    title: row.title,
    detail: row.detail ?? '',
    context: row.contextLine ?? '',
    recommendation: shownOptionDescriptions(row, false)
      .flatMap(option => {
        const line = optionBody(option) ?? optionReasonLine(option)
        return line ? [`${option.label}: ${line}`] : []
      })
      .join('\n'),
    feedback: settled
      ? settledLabel(settled.label, settled.delivery, settled.reply)
      : (rowFeedbackText(row, 'codex') ?? ''),
    state: row.state.is,
    mark: rowResultMark(row)?.text ?? (row.type === 'finding' ? '◇' : '◆'),
    actions,
  }
}

function statusLines(rows: StatusRow[]): StatusLine[] {
  return rows.map(row => {
    if (row.kind === 'subject' || row.kind === 'child')
      return {
        id: row.id,
        title: row.name,
        detail: row.kind === 'subject' ? [row.text, row.stall?.text].filter(Boolean).join(' · ') : '',
        depth: row.depth,
        mark: row.mark,
      }
    return {
      id: row.id,
      title: row.kind === 'counts' ? row.counts.map(c => `${c.mark} ${c.text}`).join(' · ') : row.text,
      detail: '',
      depth: row.depth,
      mark: 'mark' in row ? row.mark : '',
    }
  })
}

export async function currentView(
  shownSince: number,
  binding: SessionBinding | null = null,
  fresh = false,
  viewerId = '',
): Promise<CurrentView | null> {
  binding ??= await activeBinding()
  if (!binding) return null
  const terminal = await boundTerminal(binding, fresh)
  const session = binding.session
  const text = await readPublished(binding)
  const read = readSession(text)
  if (read.is !== 'read') throw new Error('The agent’s Inbox could not be read.')
  if (
    read.envelope.terminal !== publishedTerminal(binding) ||
    read.envelope.sessionId !== session ||
    (binding.machine ? read.envelope.host !== terminal.status?.app : read.envelope.host !== 'claude-code')
  )
    throw new Error('The published Inbox does not match its agent session.')
  const viewer = read.envelope.viewers?.[viewerId]
  const activeViewer = viewer && !viewer.released && viewer.expiresAt > Date.now()
  const holds = activeViewer
    ? { ...NO_HOLDS, replies: viewer.replies, shownSince: viewer.shownSince, listInput: viewer.listInput ?? null }
    : { ...NO_HOLDS, shownSince }
  const view = sessionView(read.session, Date.now(), SETTLED_MS, holds)
  const allowed = new Map<string, AllowedPress>()
  const generation = read.envelope.lastPress?.id ?? 'initial'
  const versions = new Map(
    await Promise.all(
      [
        ...read.session.ledger.items,
        ...read.session.ledger.findings,
        ...read.session.ledger.closed,
        ...read.session.ledger.closedFindings,
      ].map(async row => [row.id, await remoteRowDigest(read.session, row.id)] as const),
    ),
  )
  const goal = view.statusPage.goal
  const statusRows = [
    ...(goal?.milestones ?? []).flatMap(m => [
      { id: m.id, title: m.name, detail: m.text ?? '', depth: 0, mark: m.mark },
      ...statusLines(m.rows),
    ]),
    ...statusLines(view.statusPage.rows),
  ]
  return {
    binding,
    view,
    envelope: read.envelope,
    versions,
    allowed,
    snapshot: {
      session,
      name: terminal.labels['inbox.title'] || terminal.title || terminal.name || 'Claude session',
      connected: terminal.state === 'live',
      updatedAt: read.envelope.writtenAt,
      serverNow: Date.now(),
      running: read.session.presence.isTurnRunning,
      failure: view.status.error ?? '',
      fresh: !isMaybeStale(view),
      statusError: view.statusPage.error ?? '',
      asks: [...view.needsYou.questions, ...view.needsYou.tasks].map(r =>
        projectRow(binding, `${generation}:${versions.get(r.id)}`, r, allowed),
      ),
      findings: view.findings.rows.map(r => projectRow(binding, `${generation}:${versions.get(r.id)}`, r, allowed)),
      statusTitle: goal?.text ?? view.statusPage.head?.title ?? '',
      statusDetail: view.statusPage.head?.description ?? goal?.awaiting ?? '',
      statusRows,
      questionCount: waitingCount(view.needsYou.questions),
      taskCount: waitingCount(view.needsYou.tasks),
    },
  }
}

export function emptySnapshot(message = 'No Claude session is connected.'): Snapshot {
  return {
    session: '',
    name: 'Claude session',
    connected: false,
    updatedAt: 0,
    serverNow: Date.now(),
    running: false,
    failure: message,
    fresh: false,
    statusError: '',
    asks: [],
    findings: [],
    statusTitle: '',
    statusDetail: '',
    statusRows: [],
    questionCount: 0,
    taskCount: 0,
  }
}
