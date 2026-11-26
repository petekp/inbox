import { publishInboxFile, notifyInbox } from './publication'
import { agentClock } from './remote-clock'
import { pressFile } from '../../../core/remote/herdr-press-file'
import { selectedBinding } from './catalog'
import { currentView } from './view'

export async function heartbeat(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('Invalid viewer.')
  const v = input as Record<string, unknown>
  if (typeof v.session !== 'string' || !/^[a-f0-9]{64}$/.test(v.session)) throw new Error('Invalid session.')
  const binding = await selectedBinding(v.session)
  const current = await currentView(0, binding, true)
  if (!current || process.env.INBOX_EXPERIMENTAL_PROTOCOL !== '2' || current.envelope.remoteProtocol !== 2)
    return { enabled: false, generation: -1, sequence: -1, expiresAt: 0, hostNow: 0, released: true }
  const clock = await agentClock(binding, true)
  if (!clock.reliable || !clock.privateFiles)
    return { enabled: false, generation: -1, sequence: -1, expiresAt: 0, hostNow: 0, released: true }
  const update = { ...v, format: 2, kind: 'viewer', session: binding.session, issuedAt: clock.now }
  const parsed = pressFile(JSON.stringify(update))
  if (!parsed.ok || parsed.file.format !== 2 || parsed.file.kind !== 'viewer') throw new Error('Invalid viewer.')
  await publishInboxFile(
    binding,
    `${parsed.file.id}-${parsed.file.generation}-${parsed.file.sequence}`,
    JSON.stringify(parsed.file),
  )
  void notifyInbox(binding, `${parsed.file.id}-${parsed.file.sequence}`).catch(() => undefined)
  const ack = current.envelope.viewers?.[parsed.file.id]
  return {
    enabled: true,
    hostNow: clock.now,
    ...(ack ?? { generation: -1, sequence: -1, expiresAt: 0, released: true }),
  }
}
