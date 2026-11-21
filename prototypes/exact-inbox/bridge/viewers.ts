import { coreRequest } from './core'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { pressFile } from '../../../core/remote/herdr-press-file'
import { pressFolder } from '../../../core/remote/herdr'
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
  if (binding.machine) throw new Error('Remote viewer publication is not enabled.')
  const update = { ...v, format: 2, kind: 'viewer', session: binding.session, issuedAt: Date.now() }
  const parsed = pressFile(JSON.stringify(update))
  if (!parsed.ok || parsed.file.format !== 2 || parsed.file.kind !== 'viewer') throw new Error('Invalid viewer.')
  const folder = pressFolder(binding.appHome, binding.session)
  await mkdir(folder, { recursive: true, mode: 0o700 })
  const path = join(folder, `${parsed.file.id}-${parsed.file.generation}-${parsed.file.sequence}.json`)
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(parsed.file), { mode: 0o600 })
  await rename(temporary, path)
  void coreRequest(
    'terminal.label',
    { terminal: binding.terminal, labels: { 'inbox.press': `${parsed.file.id}-${parsed.file.sequence}` } },
    binding,
  ).catch(() => undefined)
  const ack = current.envelope.viewers?.[parsed.file.id]
  return {
    enabled: true,
    hostNow: current.envelope.writtenAt,
    ...(ack ?? { generation: -1, sequence: -1, expiresAt: 0, released: true }),
  }
}
