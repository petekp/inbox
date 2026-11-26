import { pressRowId } from '../../../core/view/pr-press'
import type { PrPress } from '../../../core/view/pr-press'
import { submissionId, legacySubmissionId, MAX_REPLY_LENGTH } from '../submission-id'
import { publishInboxFile, notifyInbox } from './publication'
import { agentClock } from './remote-clock'
import { pressFile } from '../../../core/remote/herdr-press-file'
import { selectedBinding } from './catalog'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pressFileText } from '../../../herdr/src/press-file'
import { actionId } from '../../../core/domain/press-labels'
import type { RowPress } from '../../../core/domain/presses'
import { NO_HOLDS } from '../../../core/view/timing'
import { runtimeRoot } from '../tools/paths'
import { appHome, demoEndpoint } from './core'
import type { HostBinding } from './binding'
import { currentView } from './view'
import type { Result } from '../app.contract'

type PressRequest = {
  operation?: string
  recover?: boolean
  viewer?: string
  session?: string
  key: string
  text: string
  shownSince: number
}
type Receipt = Result<'press'>
type PreparedReceipt = Receipt & {
  protocol?: 2
  command?: string
  binding?: HostBinding
  key: string
  text: string
  session: string
  terminal?: string
  press: RowPress | PrPress
  submittedAt?: number
  sent?: { pressId: string; rowId: string }
}
type RefusedReceipt = Receipt & { key: string; text: string; state: 'refused' | 'stale' }
type SavedReceipt = PreparedReceipt | RefusedReceipt
let publication = Promise.resolve()
const reading = new Map<string, Promise<Receipt>>()

function readPressRequest(value: unknown): PressRequest {
  if (!value || typeof value !== 'object') throw new Error('A press must be an object.')
  const v = value as Record<string, unknown>
  if (Object.keys(v).some(k => !['operation', 'recover', 'viewer', 'session', 'key', 'text', 'shownSince'].includes(k)))
    throw new Error('Unknown press field.')
  if (typeof v.key !== 'string' || !/^[a-f0-9]{64}$/.test(v.key)) throw new Error('Invalid action.')
  if (typeof v.text !== 'string' || v.text.length > MAX_REPLY_LENGTH)
    throw new Error('Reply must be at most 8,000 characters.')
  if (typeof v.shownSince !== 'number' || !Number.isFinite(v.shownSince) || v.shownSince < 0)
    throw new Error('Invalid viewing time.')
  if (v.session !== undefined && (typeof v.session !== 'string' || !/^[a-f0-9]{64}$/.test(v.session)))
    throw new Error('Invalid session.')
  if (v.viewer !== undefined && (typeof v.viewer !== 'string' || !/^[\w-]{16,100}$/.test(v.viewer)))
    throw new Error('Invalid viewer.')
  if (
    v.operation !== undefined &&
    (typeof v.operation !== 'string' || !/^[a-f0-9]{32}$/.test(v.operation) || typeof v.session !== 'string')
  )
    throw new Error('Invalid operation identity.')
  if (v.recover !== undefined && typeof v.recover !== 'boolean') throw new Error('Invalid recovery request.')
  return {
    recover: v.recover === true,
    operation: v.operation as string | undefined,
    viewer: v.viewer as string | undefined,
    session: v.session as string | undefined,
    key: v.key,
    text: v.text,
    shownSince: v.shownSince,
  }
}

function commandIssuedAt(saved: PreparedReceipt): number | null {
  if (!saved.command) return saved.submittedAt ?? null
  const parsed = pressFile(saved.command)
  return parsed.ok && parsed.file.format === 2 && parsed.file.kind === 'command' ? parsed.file.issuedAt : null
}

function publicReceipt(saved: Receipt): Receipt {
  return { ok: saved.ok, id: saved.id, state: saved.state, error: saved.error }
}

function pendingReceipt(saved: PreparedReceipt): Receipt {
  const waitedTooLong = saved.submittedAt !== undefined && Date.now() - saved.submittedAt > 15_000
  return waitedTooLong
    ? {
        ...publicReceipt(saved),
        ok: false,
        state: 'unconfirmed',
        error: 'Delivery is not confirmed. Your reply is kept.',
      }
    : publicReceipt(saved)
}

async function atomicWrite(path: string, text: string) {
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, text, { mode: 0o600 })
  await rename(temporary, path)
}

async function publish(request: PressRequest): Promise<Receipt> {
  const id = request.operation
    ? await submissionId(request.session!, request.operation)
    : await legacySubmissionId(request.key, request.text)
  const receipts = join(runtimeRoot, 'receipts')
  await mkdir(receipts, { recursive: true, mode: 0o700 })
  const path = join(receipts, `${id}.json`)
  try {
    const previous = JSON.parse(await readFile(path, 'utf8')) as SavedReceipt
    if (previous.key !== request.key || previous.text !== request.text) throw new Error('The request identity changed.')
    if (
      'protocol' in previous &&
      previous.protocol === 2 &&
      previous.command &&
      previous.binding &&
      previous.sent &&
      (previous.state === 'unconfirmed' || previous.state === 'submitted')
    ) {
      const current = await currentView(0, previous.binding, true)
      if (
        process.env.INBOX_EXPERIMENTAL_PROTOCOL === '2' &&
        current?.envelope.remoteProtocol === 2 &&
        current.canPublish &&
        !current.envelope.receipts?.[previous.sent.pressId] &&
        (commandIssuedAt(previous) ?? 0) > (current.envelope.remoteHistoryAfter ?? 0) &&
        current.snapshot.serverNow - (commandIssuedAt(previous) ?? 0) < 24 * 60 * 60_000
      ) {
        await publishInboxFile(previous.binding, previous.sent.pressId, previous.command)
        void notifyInbox(previous.binding, previous.sent.pressId).catch(() => undefined)
      }
    }
    const retryLegacyFailure =
      !request.operation && !request.recover && ['refused', 'stale', 'failed'].includes(previous.state)
    if (!retryLegacyFailure) return publicReceipt(previous)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const refuse = async (state: 'refused' | 'stale', error: string): Promise<Receipt> => {
    const receipt: RefusedReceipt = { ok: false, id, key: request.key, text: request.text, state, error }
    await atomicWrite(path, JSON.stringify(receipt))
    return publicReceipt(receipt)
  }
  if (request.recover) return refuse('refused', 'This reply was not sent. It is kept as a draft.')
  if (process.env.INBOX_EXPERIMENTAL_PROTOCOL === '2' && !request.operation)
    return refuse('refused', 'Update Inbox before sending this reply.')
  let publicationBinding: HostBinding
  let now: number
  let fileId: string
  let prepared: PreparedReceipt
  try {
    const binding = request.session ? await selectedBinding(request.session) : null
    const current = await currentView(request.shownSince, binding, true, request.viewer ?? '')
    const useProtocol = process.env.INBOX_EXPERIMENTAL_PROTOCOL === '2' && current?.envelope.remoteProtocol === 2
    if (process.env.INBOX_EXPERIMENTAL_PROTOCOL === '2' && current && !useProtocol)
      return refuse('refused', 'Update this session’s Inbox before replying.')
    if (binding && !useProtocol) {
      const pinned = await currentView(request.shownSince, null, true)
      const samePinnedSession =
        pinned !== null &&
        pinned.binding.source !== 'codex' &&
        binding.source !== 'codex' &&
        pinned.binding.source === binding.source &&
        pinned.binding.socket === binding.socket &&
        pinned.binding.appHome === binding.appHome &&
        pinned.binding.session === binding.session &&
        pinned.binding.terminal === binding.terminal &&
        pinned.binding.machine === binding.machine &&
        pinned.binding.machineId === binding.machineId
      if (!samePinnedSession) throw new Error('This session is read-only.')
    }
    if (current && !current.canPublish)
      return refuse('refused', 'Replies are paused until this host’s clock can be read.')
    const allowed = current?.allowed.get(request.key)
    if (!current || !allowed || allowed.disabled)
      return refuse('stale', 'This changed before your press. Refresh and try again.')
    if (allowed.localEffects) return refuse('refused', 'This action runs on the viewing device.')
    if (allowed.press.action === 'resume' && (!useProtocol || !current.envelope.remoteActions?.includes('resume')))
      return refuse('refused', 'This session does not support remote Resume.')
    const isReply = allowed.press.action === 'type'
    if (isReply && !request.text.trim()) return refuse('refused', 'Write a reply first.')
    if (!isReply && request.text !== '') throw new Error('This action does not accept reply text.')
    const press = isReply ? { ...allowed.press, text: request.text } : allowed.press
    publicationBinding = current.binding
    const clock = await agentClock(current.binding, true)
    if (!clock.reliable || !clock.privateFiles)
      return refuse('refused', 'Replies are paused until this host’s clock can be read.')
    now = clock.now
    fileId = `${now.toString(36)}-${id}`
    prepared = {
      ...(useProtocol && {
        protocol: 2 as const,
        command: JSON.stringify({
          format: 2,
          kind: 'command',
          id: fileId,
          session: current.envelope.sessionId,
          issuedAt: now,
          expected: current.versions.get(pressRowId(press)),
          press,
        }),
      }),
      binding: current.binding,
      id,
      key: request.key,
      text: request.text,
      ok: false,
      state: 'unconfirmed',
      session: current.envelope.sessionId,
      terminal: current.envelope.terminal,
      press,
      submittedAt: Date.now(),
      sent: { pressId: fileId, rowId: pressRowId(press) },
      error: 'Delivery is not confirmed. Refresh before trying another answer.',
    }
    if (
      prepared.command &&
      (!pressFile(prepared.command).ok || Buffer.byteLength(prepared.command, 'utf8') > 64 * 1024)
    )
      return refuse('refused', 'This action is too large to send. Your reply is kept.')
  } catch (error) {
    return refuse('refused', error instanceof Error ? error.message : 'This action could not be sent.')
  }
  await atomicWrite(path, JSON.stringify(prepared))
  try {
    await publishInboxFile(
      publicationBinding,
      fileId,
      prepared.command ??
        pressFileText(fileId, now, prepared.press, { ...NO_HOLDS, shownSince: Math.min(request.shownSince, now) }),
    )
  } catch {
    return publicReceipt(prepared)
  }
  const submitted: PreparedReceipt = {
    ...prepared,
    ok: true,
    state: 'submitted',
    error: '',
  }
  await atomicWrite(path, JSON.stringify(submitted))
  void notifyInbox(publicationBinding, fileId).catch(error =>
    console.warn('The prototype could not notify its agent:', error instanceof Error ? error.message : String(error)),
  )
  return publicReceipt(submitted)
}

export function submitPress(input: unknown): Promise<Receipt> {
  const request = readPressRequest(input)
  const result = publication.then(() => publish(request))
  publication = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

async function reconcileReceipt(id: string): Promise<Receipt> {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid receipt.')
  const path = join(runtimeRoot, 'receipts', `${id}.json`)
  const receipt = JSON.parse(await readFile(path, 'utf8')) as SavedReceipt
  const isFinal =
    receipt.state === 'confirmed' ||
    receipt.state === 'stale' ||
    receipt.state === 'failed' ||
    receipt.state === 'cancelled' ||
    receipt.state === 'refused' ||
    receipt.state === 'expired'
  if (isFinal || !('sent' in receipt) || !receipt.sent) return publicReceipt(receipt)
  const binding =
    receipt.binding ??
    (typeof receipt.terminal === 'string'
      ? { ...demoEndpoint, appHome, session: receipt.session, terminal: receipt.terminal }
      : null)
  if (!binding) throw new Error('This receipt has no saved host identity.')
  const current = await currentView(0, binding, true)

  if (!current || current.envelope.sessionId !== receipt.session || current.envelope.terminal !== receipt.terminal)
    return {
      ...publicReceipt(receipt),
      ok: false,
      state: 'unconfirmed',
      error: 'The agent session changed. Your reply is kept.',
    }
  if (receipt.protocol === 2) {
    const outcome = current.envelope.receipts?.[receipt.sent.pressId]
    if (!outcome) {
      const outsideHistory = (commandIssuedAt(receipt) ?? Infinity) <= (current.envelope.remoteHistoryAfter ?? 0)
      const issuedAt = commandIssuedAt(receipt)
      const expired =
        current.canPublish && issuedAt !== null && current.snapshot.serverNow - issuedAt >= 24 * 60 * 60_000
      if (!outsideHistory && !expired) return pendingReceipt(receipt)
      const ended = {
        ...receipt,
        ok: false,
        state: 'expired',
        error: 'Delivery can no longer be checked. Your reply is kept.',
      }
      await atomicWrite(path, JSON.stringify(ended))
      return publicReceipt(ended)
    }
    const confirmed = outcome.state === 'applied' && !outcome.pendingDelivery
    const state =
      outcome.delivered || confirmed
        ? 'confirmed'
        : outcome.state === 'cancelled'
          ? 'cancelled'
          : outcome.state === 'stale' ||
              outcome.state === 'failed' ||
              outcome.state === 'refused' ||
              outcome.state === 'expired'
            ? outcome.state
            : outcome.state === 'uncertain' || outcome.state === 'attempting'
              ? 'unconfirmed'
              : 'submitted'
    const completed = {
      ...receipt,
      ok: state === 'confirmed' || state === 'submitted',
      state,
      error: outcome.error ?? (state === 'unconfirmed' ? 'Delivery is not confirmed. Your reply is kept.' : ''),
    }
    await atomicWrite(path, JSON.stringify(completed))
    return publicReceipt(completed)
  }
  const acknowledgement = current.envelope.lastPress
  if (acknowledgement?.id !== receipt.sent.pressId) return pendingReceipt(receipt)
  const last = current.view.lastActions[receipt.sent.rowId]
  const isReply = receipt.press.action === 'type'
  const replyArrived =
    last?.action === actionId(receipt.press) && last.reply === receipt.text.trim() && last.delivery?.state === 'arrived'
  const deliveryFailed = last?.delivery?.state === 'failed'
  const deliveryUnconfirmed = last?.delivery?.state === 'unconfirmed'
  if (acknowledgement.outcome !== 'stale' && isReply && !replyArrived && !deliveryFailed && !deliveryUnconfirmed)
    return pendingReceipt(receipt)
  const confirmed = acknowledgement.outcome === 'applied' && (!isReply || replyArrived)
  const completed: PreparedReceipt = {
    ...receipt,
    ok: confirmed,
    state: confirmed
      ? 'confirmed'
      : acknowledgement.outcome === 'stale'
        ? 'stale'
        : deliveryFailed
          ? 'failed'
          : 'unconfirmed',
    error: confirmed
      ? ''
      : last?.delivery?.state === 'failed'
        ? last.delivery.reason
        : 'The agent did not confirm this press. Your reply is kept.',
  }
  await atomicWrite(path, JSON.stringify(completed))
  return publicReceipt(completed)
}

export function readReceipt(id: string): Promise<Receipt> {
  const existing = reading.get(id)
  if (existing) return existing
  const result = reconcileReceipt(id).finally(() => reading.delete(id))
  reading.set(id, result)
  return result
}
