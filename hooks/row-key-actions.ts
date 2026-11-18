import type { UiPressArgument } from 'claude-code'
import { rowKeyPlan } from './action-plan'
import type { AnswerRow, PlannedKey, PlannedOption } from './action-plan'
import { ACTION_GLYPHS } from './pane-keys'
import type { KeyAction } from './pane-keys'
import type { RowPress } from './presses'
import type { RowView } from './rows'

/** What a row's key actions do when pressed; the mod's engine supplies each. */
type RowKeyEffects = {
  runPress: (press: RowPress, surface: UiPressArgument['surface']) => Promise<void>
  startTyping: (id: string) => Promise<void>
  discardReply: (id: string) => Promise<void>
  showAllOptions: (id: string) => void
}

export function rowKeyActions(
  fx: RowKeyEffects,
  r: RowView,
  isAllShown: boolean,
): { options: KeyAction[]; keys: KeyAction[]; more: KeyAction[]; answerRow: AnswerRow | null } {
  const { id, item, finding } = r
  const keyAction = (k: PlannedKey): KeyAction => {
    switch (k.slot) {
      case 'retry':
        return {
          key: `retry-${id}`,
          label: k.label,
          icon: ACTION_GLYPHS[k.icon],
          emphasis: k.emphasis,
          kind: k.kind,
          onPress: press => fx.runPress(k.press, press.surface),
        }
      case 'allOptions':
        return {
          key: `all-options-${id}`,
          label: k.label,
          emphasis: k.emphasis,
          kind: 'view',
          onPress: () => fx.showAllOptions(id),
        }
      case 'choice': {
        const { action: a, hotkey } = k
        const p = a.press
        const icon = a.icon && ACTION_GLYPHS[a.icon]
        return {
          label: a.label,
          kind: a.kind,
          emphasis: a.emphasis,
          isOut: a.isOut,
          ...(hotkey ? { hotkey } : {}),
          onPress: (press: UiPressArgument) => fx.runPress(p, press.surface),
          ...(icon ? { icon } : {}),
          key: `help-${id}-${p.step}`,
        }
      }
      case 'action': {
        const { action: a, hotkey } = k
        const p = a.press
        const presentation = { emphasis: a.emphasis, isOut: a.isOut }
        if (p.action === 'type')
          return {
            label: a.label,
            kind: 'view',
            key: `typekey-${id}`,
            hotkey,
            ...presentation,
            onPress: () => void fx.startTyping(id),
          }
        if (p.action === 'discard')
          return {
            label: a.label,
            kind: a.kind,
            key: `discard-${id}`,
            hotkey,
            ...presentation,
            onPress: () => void fx.discardReply(id),
          }
        return {
          label: a.label,
          kind: a.kind,
          key: p.action === 'dismiss' && finding ? `drop-${id}` : `${p.action}-${id}`,
          hotkey,
          ...presentation,
          onPress: press => fx.runPress(p, press.surface),
        }
      }
    }
  }
  const { options, keys, more, answerRow } = rowKeyPlan(r, isAllShown)

  const answerAction = ({ action: a, note, hotkey }: PlannedOption): KeyAction => ({
    label: a.label,
    kind: a.kind,
    emphasis: a.emphasis,
    isOut: a.isOut,
    ...(hotkey ? { hotkey } : {}),
    ...(note ? { note } : {}),
    ...(a.isPrimary ? { variant: 'primary' as const } : {}),
    key: `answer-${id}-${(item?.options ?? []).indexOf(a.press.option)}`,
    onPress: press => fx.runPress(a.press, press.surface),
  })

  return {
    options: options.map(answerAction),
    keys: keys.map(keyAction),
    more: more.map(keyAction),
    answerRow,
  }
}
