import type { RowPress } from '../domain/presses'
import type { PrPress } from '../view/pr-press'

export const REMOTE_PR_ACTIONS = [
  'thread-address',
  'thread-draft',
  'thread-discuss',
  'pr-conflicts',
  'pr-address-all',
  'pr-merge',
  'pr-dismiss',
  'pr-undo',
  'check-fix',
  'check-rerun',
  'pr-rank-again',
  'pr-refresh',
  'pr-clear-finished',
] as const satisfies readonly PrPress['action'][]

export function isRemotePrPress(value: unknown): value is PrPress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const p = value as Record<string, unknown>
  if (typeof p.action !== 'string' || !(REMOTE_PR_ACTIONS as readonly string[]).includes(p.action)) return false
  const tab = ['pr-rank-again', 'pr-refresh', 'pr-clear-finished'].includes(p.action)
  const thread = p.action.startsWith('thread-')
  const check = p.action.startsWith('check-')
  const fields = tab
    ? ['action']
    : thread
      ? ['action', 'ref', 'thread']
      : check
        ? ['action', 'ref', 'check']
        : ['action', 'ref']
  if (Object.keys(p).length !== fields.length || !Object.keys(p).every(key => fields.includes(key))) return false
  if (tab) return true
  if (
    typeof p.ref !== 'string' ||
    p.ref.length > 256 ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#[1-9][0-9]{0,15}$/.test(p.ref)
  )
    return false
  const target = thread ? p.thread : check ? p.check : null
  return (
    target === null ||
    (typeof target === 'string' && target.length > 0 && target.length <= 1024 && !/[\u0000-\u001f]/.test(target))
  )
}

export function isRemoteCommandPress(value: unknown): value is RowPress | PrPress {
  if (isRemotePrPress(value)) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const p = value as Record<string, unknown>
  const actions = [
    'type',
    'answer',
    'step',
    'done',
    'address',
    'undo',
    'dismiss',
    'discuss',
    'explain',
    'compare',
    'issue',
    'discard',
    'remove-goal',
    'restore-goal',
    'take-goal',
    'resume',
  ]
  if (typeof p.action !== 'string' || !actions.includes(p.action) || typeof p.id !== 'string') return false
  const goal = p.id === 'goal' && ['type', 'remove-goal', 'restore-goal', 'take-goal'].includes(p.action)
  const resume = p.id === 'session' && p.action === 'resume'
  if (p.action === 'resume' && !resume) return false
  if (!goal && !resume && !/^[if]\d{1,16}$/.test(p.id)) return false
  const fields =
    p.action === 'type'
      ? ['action', 'id', 'text']
      : p.action === 'answer'
        ? ['action', 'id', 'option']
        : p.action === 'step'
          ? ['action', 'id', 'step', 'label']
          : ['action', 'id']
  if (Object.keys(p).length !== fields.length || !Object.keys(p).every(key => fields.includes(key))) return false
  if (p.action === 'type' || p.action === 'answer') {
    const text = p.action === 'type' ? p.text : p.option
    return typeof text === 'string' && text.trim() !== '' && text.length <= 8000
  }
  return (
    p.action !== 'step' ||
    (typeof p.step === 'number' &&
      Number.isInteger(p.step) &&
      p.step >= 0 &&
      p.step < 256 &&
      typeof p.label === 'string' &&
      p.label.trim() !== '' &&
      p.label.length <= 256)
  )
}
