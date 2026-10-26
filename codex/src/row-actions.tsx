import type { ActionEmphasis, ActionIcon, RowView } from '../../hooks/view'
import type { RowPress } from '../../hooks/presses'
import { actionId } from '../../hooks/presses'
import { actionLabel, rowKeyPlan, ROW_COPY } from '../../hooks/view'

const ICONS = {
  check: 'M20 6 9 17l-5-5',
  play: 'M7 4.5v15l12-7.5z',
  copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  open: 'M7 17 17 7M8 7h9v9',
  retry: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  right: 'm9 18 6-6-6-6',
  down: 'm6 9 6 6 6-6',
} as const
export type IconName = keyof typeof ICONS
const ACTION_ICONS: Record<ActionIcon, IconName> = {
  done: 'check',
  retry: 'retry',
  open: 'open',
  copy: 'copy',
  run: 'play',
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      class="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  )
}

export type RowAction = {
  label: string
  emphasis: ActionEmphasis
  isDismiss?: boolean
  icon?: IconName
  /** Its press is out, so it draws dim and ignores presses. */
  isOut?: boolean
  run: () => void
}

export type LedgerAction = RowAction & { hotkey?: string }

/** `pressing` is the action of a press on its way to the server, which the row's view does not show yet. */
export function ledgerActions(
  row: RowView,
  allOptions: boolean,
  pressing: string | null,
  on: {
    press: (press: RowPress) => void
    reply: () => void
    discard: () => void
    showOptions: () => void
  },
): { keys: LedgerAction[]; more: LedgerAction[] } {
  const planned = rowKeyPlan(row, allOptions)
  const draw = (k: (typeof planned.keys)[number]): LedgerAction => {
    if (k.slot === 'retry') return { label: k.label, emphasis: k.emphasis, icon: k.icon, run: () => on.press(k.press) }
    if (k.slot === 'allOptions') return { label: k.label, emphasis: k.emphasis, run: on.showOptions }
    const a = k.action
    return {
      label: actionLabel(a),
      emphasis: a.emphasis,
      ...(k.hotkey ? { hotkey: k.hotkey } : {}),
      ...(a.icon ? { icon: ACTION_ICONS[a.icon] } : {}),
      ...(a.press.action === 'dismiss' ? { isDismiss: true } : {}),
      ...(a.isOut || actionId(a.press) === pressing ? { isOut: true } : {}),
      run: a.press.action === 'type' ? on.reply : a.press.action === 'discard' ? on.discard : () => on.press(a.press),
    }
  }
  return { keys: planned.keys.map(draw), more: planned.more.map(draw) }
}

export type Reply = {
  id: string
  hint: string
  draft: () => string
  onDraft: (text: string) => void
  send: (text: string) => void
  exit: 'cancel' | 'discard'
  onExit: () => void
}

export function ActionButton({ action, isBlocked }: { action: RowAction; isBlocked: () => boolean }) {
  return (
    <button
      type="button"
      class={`${action.emphasis === 'primary' ? 'key primary' : action.emphasis === 'quiet' ? 'key ghost' : 'key'}${action.isDismiss ? ' dismiss' : ''}${action.isOut ? ' out' : ''}`}
      disabled={isBlocked() || action.isOut === true}
      onClick={() => {
        if (!isBlocked() && !action.isOut) action.run()
      }}
    >
      {action.icon ? <Icon name={action.icon} /> : null}
      {action.label}
    </button>
  )
}

export function RowActions({
  keys,
  more,
  reply,
  isBlocked,
}: {
  keys: RowAction[]
  more: RowAction[]
  reply: Reply | null
  isBlocked: () => boolean
}) {
  if (reply)
    return (
      <div class="actions">
        <form
          onSubmit={e => {
            e.preventDefault()
            const text = reply.draft().trim()
            if (text) reply.send(text)
          }}
        >
          <input
            id={`type-${reply.id}`}
            value={reply.draft()}
            placeholder={reply.hint}
            aria-label={reply.hint}
            onInput={e => reply.onDraft(e.currentTarget.value)}
          />
          <button type="submit" class="key primary">
            {ROW_COPY.send}
          </button>
          <button type="button" class="key ghost" onClick={reply.onExit}>
            {ROW_COPY[reply.exit]}
          </button>
        </form>
      </div>
    )
  return (
    <div class="actions">
      {keys.length + more.length > 0 ? (
        <div class="keys">
          {keys.map(action => (
            <ActionButton action={action} isBlocked={isBlocked} />
          ))}
          {more.length > 0 ? (
            <div class="follow-ups">
              {more.map(action => (
                <ActionButton action={action} isBlocked={isBlocked} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
