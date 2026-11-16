import type { ComponentChildren } from 'preact'
import { parentChevron } from '../../hooks/status-folds'
import { pressCollapse } from './tab-rows'
import { tabState } from './tab-state'

/** Whether the person folded the Status parent `id` by its name, as the drawn view says. */
export const isParentFolded = (id: string) => tabState.view?.collapsed.includes(id) ?? false

/** Folds the Status parent `id`, or opens it once folded. The tab's selection stays where it was. */
export const toggleParentFold = (id: string) => pressCollapse(id, !isParentFolded(id))

/** What follows a parent's name, or null for a row that is no parent. */
export const chevronOf = (p: { id: string; foldCount: number }) =>
  p.foldCount > 0 ? parentChevron(isParentFolded(p.id), p.foldCount) : null

/** A parent's name line, which takes the click that folds its rows or opens them, as a keyboard press on it does. */
export function ParentName({
  id,
  foldCount,
  class: className,
  children,
}: {
  id: string
  foldCount: number
  class?: string
  children: ComponentChildren
}) {
  if (foldCount === 0) return <div class={className}>{children}</div>
  const classes = ['parent-name', isParentFolded(id) ? 'folded' : '', className ?? '']

  return (
    <div
      class={classes.filter(Boolean).join(' ')}
      role="button"
      tabIndex={0}
      aria-expanded={!isParentFolded(id)}
      onClick={() => toggleParentFold(id)}
      onKeyDown={e => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        toggleParentFold(id)
      }}
    >
      {children}
    </div>
  )
}
