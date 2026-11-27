import { pressRowId } from '../../core/view/pr-press'
import { isRemoteRowDigest } from '../../core/remote/remote-commands'
import { snapshotArtifact } from './artifacts'
import { currentView } from './view'
import { selectedBinding } from './catalog'
import type { Result } from '../app.contract'

type Work = Omit<Result<'prepareLocal'>, 'sequence'>
type Request = { session: string; key: string; operation: string; row: string; version: string }

function requestOf(value: unknown): Request {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid local action.')
  const v = value as Record<string, unknown>
  const knownFields = Object.keys(v).every(key => ['session', 'key', 'operation', 'row', 'version'].includes(key))
  const validIdentity =
    typeof v.session === 'string' &&
    /^[a-f0-9]{64}$/.test(v.session) &&
    typeof v.key === 'string' &&
    /^[a-f0-9]{64}$/.test(v.key) &&
    typeof v.operation === 'string' &&
    /^[a-f0-9]{32}$/.test(v.operation) &&
    typeof v.row === 'string' &&
    v.row.length <= 1400 &&
    typeof v.version === 'string' &&
    isRemoteRowDigest(v.version)
  if (!knownFields || !validIdentity) throw new Error('Invalid local action identity.')
  return v as Request
}

export async function prepareLocal(value: unknown): Promise<Work> {
  const request = requestOf(value)
  const binding = await selectedBinding(request.session)
  const current = await currentView(0, binding, true)
  const allowed = current?.allowed.get(request.key)
  const matches =
    current &&
    allowed &&
    !allowed.disabled &&
    allowed.localEffects &&
    pressRowId(allowed.press) === request.row &&
    current.versions.get(request.row) === request.version
  if (!matches) throw new Error('This item changed. Refresh before opening or copying it.')
  const effects: Work['effects'] = []
  for (const effect of allowed.localEffects!) {
    if (effect.kind === 'copy') {
      if (Buffer.byteLength(effect.text) > 1024 * 1024) throw new Error('This text is too large to copy here.')
      effects.push({ kind: 'copy', value: effect.text, name: effect.name, isCommand: effect.isCommand })
    } else if (effect.kind === 'open') {
      if (!/^https:/i.test(effect.target)) {
        const value = await snapshotArtifact(binding, effect.target, current.projectFolder)
        effects.push({ kind: 'open', value, name: effect.name, isCommand: false })
        continue
      }
      const url = new URL(effect.target)
      if (url.protocol !== 'https:' || url.username || url.password)
        throw new Error('This link must be opened on the agent’s computer.')
      effects.push({ kind: 'open', value: url.href, name: effect.name, isCommand: false })
    } else throw new Error('This action must run on the agent’s computer.')
  }
  if (effects.length === 0) throw new Error('This action has no local effect.')
  return {
    ok: true,
    error: '',
    id: request.operation,
    session: request.session,
    row: request.row,
    version: request.version,
    effects,
  }
}
