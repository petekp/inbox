import { pressFile } from '../../../hooks/herdr-press-file'
import { selectedBinding } from './catalog'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pressFolder } from '../../../hooks/herdr'
import { pressFileText } from '../../../herdr/src/press-file'
import { actionId } from '../../../hooks/press-labels'
import type { RowPress } from '../../../hooks/presses'
import { NO_HOLDS } from '../../../hooks/timing'
import { runtimeRoot } from '../tools/paths'
import { appHome, coreRequest, demoEndpoint } from './core'
import type { SessionBinding } from './binding'
import { currentView } from './view'
import type { Result } from '../app.contract'

type PressRequest = {
  operation?: string
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
  binding?: SessionBinding
  key: string
  text: string
  session: string
  terminal: string
  press: RowPress
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
  if (Object.keys(v).some(k => !['operation', 'viewer', 'session', 'key', 'text', 'shownSince'].includes(k)))
    throw new Error('Unknown press field.')
  if (typeof v.key !== 'string' || !/^[a-f0-9]{64}$/.test(v.key)) throw new Error('Invalid action.')
  if (typeof v.text !== 'string' || v.text.length > 8000) throw new Error('Reply must be at most 8,000 characters.')
  if (typeof v.shownSince !== 'number' || !Number.isFinite(v.shownSince)) throw new Error('Invalid viewing time.')
  if (v.session !== undefined && (typeof v.session !== 'string' || !/^[a-f0-9]{64}$/.test(v.session)))
    throw new Error('Invalid session.')
  if (v.viewer !== undefined && (typeof v.viewer !== 'string' || !/^[\w-]{16,100}$/.test(v.viewer)))
    throw new Error('Invalid viewer.')
  if (
    v.operation !== undefined &&
    (typeof v.operation !== 'string' || !/^[a-f0-9]{32}$/.test(v.operation) || typeof v.session !== 'string')
  )
    throw new Error('Invalid operation identity.')
  return {
    operation: v.operation as string | undefined,
    viewer: v.viewer as string | undefined,
    session: v.session as string | undefined,
    key: v.key,
    text: v.text,
    shownSince: Math.min(v.shownSince, Date.now()),
  }
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
    ? createHash('sha256').update(request.session!).update('\0').update(request.operation).digest('hex')
    : createHash('sha256').update(request.key).update('\0').update(request.text).digest('hex')
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
        !previous.binding.machine &&
        !current.envelope.receipts?.[previous.sent.pressId] &&
        (previous.submittedAt ?? 0) > (current.envelope.remoteHistoryAfter ?? 0) &&
        Date.now() - (previous.submittedAt ?? 0) < 24 * 60 * 60_000
      ) {
        const folder = pressFolder(previous.binding.appHome, previous.session)
        await mkdir(folder, { recursive: true, mode: 0o700 })
        await atomicWrite(join(folder, `${previous.sent.pressId}.json`), previous.command)
      }
    }
    return publicReceipt(previous)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const refuse = async (state: 'refused' | 'stale', error: string): Promise<Receipt> => {
    const receipt: RefusedReceipt = { ok: false, id, key: request.key, text: request.text, state, error }
    await atomicWrite(path, JSON.stringify(receipt))
    return publicReceipt(receipt)
  }
  if (process.env.INBOX_EXPERIMENTAL_PROTOCOL === '2' && !request.operation)
    return refuse('refused', 'Update Inbox before sending this reply.')
  const binding = request.session ? await selectedBinding(request.session) : null
  const current = await currentView(request.shownSince, binding, true, request.viewer ?? '')
  const useProtocol = process.env.INBOX_EXPERIMENTAL_PROTOCOL === '2' && current?.envelope.remoteProtocol === 2
  if (process.env.INBOX_EXPERIMENTAL_PROTOCOL === '2' && current && !useProtocol)
    return refuse('refused', 'Update this session’s Inbox before replying.')
  if (binding && !useProtocol) {
    const pinned = await currentView(request.shownSince, null, true)
    if (!pinned || JSON.stringify(pinned.binding) !== JSON.stringify(binding))
      throw new Error('This session is read-only.')
  }
  if (binding?.machine) throw new Error('Remote command publication is not enabled.')
  const allowed = current?.allowed.get(request.key)
  if (!current || !allowed || allowed.disabled)
    return refuse('stale', 'This changed before your press. Refresh and try again.')
  const isReply = allowed.press.action === 'type'
  if (isReply && !request.text.trim()) return refuse('refused', 'Write a reply first.')
  if (!isReply && request.text !== '') throw new Error('This action does not accept reply text.')
  const press = isReply ? { ...allowed.press, text: request.text } : allowed.press
  const now = Date.now()
  const fileId = `${now.toString(36)}-${id}`
  const prepared: PreparedReceipt = {
    ...(useProtocol && {
      protocol: 2 as const,
      command: JSON.stringify({
        format: 2,
        kind: 'command',
        id: fileId,
        session: current.envelope.sessionId,
        issuedAt: now,
        expected: current.versions.get(press.id),
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
    submittedAt: now,
    sent: { pressId: fileId, rowId: press.id },
    error: 'Delivery is not confirmed. Refresh before trying another answer.',
  }
  if (prepared.command && (!pressFile(prepared.command).ok || Buffer.byteLength(prepared.command, 'utf8') > 64 * 1024))
    return refuse('refused', 'This action is too large to send. Your reply is kept.')
  await atomicWrite(path, JSON.stringify(prepared))
  const folder = pressFolder(current.binding.appHome, current.envelope.sessionId)
  await mkdir(folder, { recursive: true, mode: 0o700 })
  await atomicWrite(
    join(folder, `${fileId}.json`),
    prepared.command ??
      pressFileText(fileId, now, press, {
        ...NO_HOLDS,
        shownSince: request.shownSince,
      }),
  )
  const submitted: PreparedReceipt = {
    ...prepared,
    ok: true,
    state: 'submitted',
    error: '',
  }
  await atomicWrite(path, JSON.stringify(submitted))
  void coreRequest(
    'terminal.label',
    {
      terminal: current.envelope.terminal,
      labels: { 'inbox.press': fileId },
    },
    current.binding,
  ).catch(error =>
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
  const current = await currentView(
    0,
    receipt.binding ?? {
      ...demoEndpoint,
      appHome,
      session: receipt.session,
      terminal: receipt.terminal,
    },
  )
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
      const outsideHistory = (receipt.submittedAt ?? 0) <= (current.envelope.remoteHistoryAfter ?? 0)
      const expired = Date.now() - (receipt.submittedAt ?? 0) >= 24 * 60 * 60_000
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
