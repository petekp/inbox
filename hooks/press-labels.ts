import type { PrPress } from './pr-press'
import type { RowPress } from './presses'

export function actionId(p: RowPress | PrPress): string {
  return p.action === 'step' ? `step-${p.step}` : p.action
}

export function pressText(p: RowPress): string {
  switch (p.action) {
    case 'answer':
      return p.option
    case 'type':
      return 'Reply'
    case 'issue':
      return ISSUE_LABEL
    case 'step':
      return p.label
    default:
      return capitalized(p.action)
  }
}

export function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export const ISSUE_LABEL = 'File issue'
