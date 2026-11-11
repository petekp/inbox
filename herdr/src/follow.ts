/** The label a host sets on its Herdr app terminal, naming the session it publishes. */
export const SESSION_LABEL = 'inbox.session'

/** What the look reads from Herdr's live data to pick a terminal. Each field is the part of Herdr's own value it uses. */
export type Where = {
  focused: { tab: string; terminal: string | null } | null
  panes: readonly { tab: string; terminal: string | null }[]
  terminals: readonly {
    address: string
    labels?: Record<string, string> | null
    program?: { name: string; shell: boolean } | null
  }[]
}

/**
 * What the look shows. `terminal` is the one it follows, which it keeps while the look itself has focus. A session that
 * ended keeps its label until the host clears it, so a labeled terminal back at its shell reads as ended.
 */
export type Followed =
  | { is: 'session'; terminal: string; sessionId: string }
  | { is: 'ended'; terminal: string }
  | { is: 'no-inbox'; terminal: string; program: string | null }
  | { is: 'no-terminal' }

function shownOf(where: Where, address: string): Followed {
  const t = where.terminals.find(x => x.address === address)
  const sessionId = t?.labels?.[SESSION_LABEL]
  if (!sessionId) return { is: 'no-inbox', terminal: address, program: t?.program?.name ?? null }

  return t?.program?.shell ? { is: 'ended', terminal: address } : { is: 'session', terminal: address, sessionId }
}

/**
 * The terminal the look follows in its tab, `tab`: the focused one; else the one it followed last, while the look or
 * another tab has focus; else the first terminal in the tab with a session label; else the tab's first terminal.
 */
export function follow(where: Where, tab: string, last: string | null): Followed {
  const inTab = where.panes.flatMap(p => (p.tab === tab && p.terminal ? [p.terminal] : []))
  const focused = where.focused?.tab === tab ? where.focused.terminal : null
  const isLabeled = (address: string) =>
    Boolean(where.terminals.find(x => x.address === address)?.labels?.[SESSION_LABEL])
  const address =
    [focused, last].find(a => a !== null && inTab.includes(a)) ?? inTab.find(isLabeled) ?? inTab[0] ?? null

  return address === null ? { is: 'no-terminal' } : shownOf(where, address)
}
