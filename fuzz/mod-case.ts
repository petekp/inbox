/** A case for the mod's terminal or desktop look: the rows the agent records, and the pane's width in columns. */
export type ModCase = { look: 'terminal' | 'desktop'; columns: number; records: Record<string, unknown>[] }
