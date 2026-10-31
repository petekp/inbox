import type { RenderSurface, UiCopyResult, UiPressArgument } from 'claude-code'
import type { Draft, PressKind } from '../types'
import type { PrPress } from './pr-press'
import type { ActionEmphasis, ActionIcon } from './rows'

export function focusHintFor(element: string): string | null {
  const id = element.split('-')[1]

  return /^(answer|done|dismiss|drop)-/.test(element)
    ? `undo-${id}`
    : element.startsWith('typekey-')
      ? `type-${id}`
      : null
}
export const followUpPresses = new Map<string, (press: UiPressArgument) => void>()

export function focusKeys(node: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(node)) for (const child of node) focusKeys(child, keys)
  else if (node && typeof node === 'object') {
    const el = node as { type?: unknown; props?: { key?: unknown }; children?: unknown }
    if ((el.type === 'Button' || el.type === 'Input') && typeof el.props?.key === 'string') keys.add(el.props.key)
    focusKeys(el.children, keys)
  }

  return keys
}
/** Each row's latest reply field: its key, and the draft text it opened with. */
export const openFields = new Map<string, { key: string; seed: string }>()
export const paneHasKeys = new Map<RenderSurface, boolean>()

export const COPY_FAILURES: Record<Extract<UiCopyResult, { isCopied: false }>['reason'], string> = {
  'no-surface': 'no app is attached',
  'no-clipboard': 'the clipboard did not take it',
  refused: 'another plugin refused it',
}

/**
 * The engine keeps a field's typed text under its key after the field leaves the drawing. Enter
 * empties it and a Button press does not. So each draft gets its own key, and the field a new draft
 * opens starts empty.
 */
export function openedField(id: string, draft: Draft | undefined) {
  return { key: `type-${id}-${draft?.since ?? 0}`, seed: draft?.text ?? '' }
}

export function fieldKey(id: string) {
  return openFields.get(id)?.key ?? `type-${id}`
}

export type Action = {
  key: string
  label: string
  variant?: 'primary'
  emphasis?: ActionEmphasis
  icon?: string
  kind: PressKind
  /**
   * A hot reload keeps work an `onPress`
   * returns and drops work it leaves running, so a returned press's result still lands.
   */
  onPress: (press: UiPressArgument) => void | Promise<void>
}

export type KeyAction = Action & { hotkey?: string; isOut?: boolean }

export const ACTION_GLYPHS: Partial<Record<ActionIcon, string>> = { run: '▶', copy: '⧉', open: '↗', retry: '↻' }

export const PR_KEYS: Record<PrPress['action'], string> = {
  'thread-address': 'address',
  'thread-draft': 'draft',
  'thread-open': 'open',
  'thread-discuss': 'discuss',
  'pr-conflicts': 'resolve',
  'pr-address-all': 'address-all',
  'pr-merge': 'merge',
  'pr-open': 'open',
  'pr-refresh': 'refresh',
  'pr-dismiss': 'dismiss-pr',
  'pr-undo': 'undo-pr',
  'pr-dismiss-merged': 'dismiss-merged',
  'pr-rank-again': 'rank-again',
  'check-fix': 'fix',
  log: 'log',
}
