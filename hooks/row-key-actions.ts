import type { UiPressArgument } from 'claude-code'

import { rowKeyPlan, type PlannedKey } from './action-plan'
import type { PaneHandlers } from './pane-context'
import { ACTION_GLYPHS, type KeyAction } from './pane-keys'
import type { RowView } from './rows'

/**
 * The keys and the More keys of the row `r`, as KeyActions the pane draws as Buttons. `isAllShown` is whether the row
 * shows all its options. register.tsx passes its pane handlers.
 */
export function rowKeyActions(
  r: RowView,
  isAllShown: boolean,
  { runPress, startTyping, discardReply }: Pick<PaneHandlers, 'runPress' | 'startTyping' | 'discardReply'>,
  showAllOptions: (id: string) => void,
): { keys: KeyAction[]; more: KeyAction[] } {
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
          onPress: press => runPress(k.press, press.surface),
        }
      case 'allOptions':
        return {
          key: `all-options-${id}`,
          label: k.label,
          emphasis: k.emphasis,
          kind: 'view',
          onPress: () => showAllOptions(id),
        }
      case 'choice': {
        const { action: a, hotkey } = k
        const p = a.press
        const base = {
          label: a.label,
          kind: a.kind,
          emphasis: a.emphasis,
          isOut: a.isOut,
          ...(hotkey ? { hotkey } : {}),
          onPress: (press: UiPressArgument) => runPress(p, press.surface),
        }
        if (p.action === 'answer')
          return {
            ...base,
            key: `answer-${id}-${(item?.options ?? []).indexOf(p.option)}`,
            ...(a.isPrimary ? { variant: 'primary' as const } : {}),
          }
        const icon = a.icon && ACTION_GLYPHS[a.icon]
        return { ...base, ...(icon ? { icon } : {}), key: `help-${id}-${p.step}` }
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
            onPress: () => void startTyping(id),
          }
        if (p.action === 'discard')
          return {
            label: a.label,
            kind: a.kind,
            key: `discard-${id}`,
            hotkey,
            ...presentation,
            onPress: () => void discardReply(id),
          }
        return {
          label: a.label,
          kind: a.kind,
          key: p.action === 'dismiss' && finding ? `drop-${id}` : `${p.action}-${id}`,
          hotkey,
          ...presentation,
          onPress: press => runPress(p, press.surface),
        }
      }
    }
  }
  const { keys, more } = rowKeyPlan(r, isAllShown)

  return { keys: keys.map(keyAction), more: more.map(keyAction) }
}
