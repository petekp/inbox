import type { ListedTab } from '../../hooks/arrivals'

export type Group = 'question' | 'task' | 'finding'
export type FoldGroup = 'question' | 'task' | 'issue' | 'opportunity'

export const TAB_OF: Record<Group, ListedTab> = { question: 'needsYou', task: 'needsYou', finding: 'findings' }
