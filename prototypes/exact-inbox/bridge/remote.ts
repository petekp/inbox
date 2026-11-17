import { readFile } from 'node:fs/promises'
import { resolve, isAbsolute } from 'node:path'
import { runtimeRoot } from '../tools/paths'
import { publishedSessionPath } from '../../../hooks/herdr'
import { coreRequest } from './core'
import type { SessionBinding } from './binding'

type Remote = { name: string; id: string; appHome: string }
const settings: unknown = await readFile(resolve(runtimeRoot, 'remote-hosts.json'), 'utf8')
  .then(JSON.parse)
  .catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
if (
  !Array.isArray(settings) ||
  !settings.every(
    v =>
      v &&
      typeof v.name === 'string' &&
      /^[\w.-]+$/.test(v.name) &&
      typeof v.id === 'string' &&
      v.id !== '' &&
      typeof v.appHome === 'string' &&
      isAbsolute(v.appHome),
  )
)
  throw new Error('Invalid remote Inbox hosts.')
const hosts = settings as Remote[]

export function remoteHost(address: string) {
  const name = address.split('/')[0]
  return hosts.find(h => h.name === name)
}

export function publishedTerminal(binding: SessionBinding) {
  return binding.machine ? binding.terminal.slice(binding.machine.length + 1) : binding.terminal
}

const remoteReads = new Map<string, { at: number; result: Promise<string> }>()

export async function readPublished(binding: SessionBinding): Promise<string> {
  const path = publishedSessionPath(binding.appHome, binding.session)
  if (!binding.machine) return readFile(path, 'utf8')
  const { machines } = await coreRequest('machine.list', {}, binding)
  if (!machines.some(m => m.name === binding.machine && m.id === binding.machineId && m.state === 'connected'))
    throw new Error('The agent host is disconnected.')
  const key = JSON.stringify([binding.socket, binding.machineId, binding.machine, path])
  const cached = remoteReads.get(key)
  if (cached && Date.now() - cached.at < 1000) return cached.result
  const result = coreRequest('file.read', { on: binding.machine, path }, binding)
    .then(value => {
      if (value.last < value.lines) throw new Error('The remote Inbox file is incomplete.')
      return value.text
    })
    .catch(error => {
      remoteReads.delete(key)
      throw error
    })
  remoteReads.set(key, { at: Date.now(), result })
  return result
}
