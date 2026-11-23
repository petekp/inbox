import type { PaneBase } from './pane-context'
import { paneState } from '../mod/mod-state'

/**
 * The desktop app draws a new Client only after the pane's own elements, 20 to 580 ms late, and each close and open
 * gives the pane new Clients. Until a Client posts, the pane draws a copy of it with its own Box and Text, from the
 * same drawing function. The Client lies over that copy and draws itself there from its first render, so it takes clicks
 * at once. Its first post drops the copy. The app can show a Client's new props a frame after the pane's own elements,
 * so the Client never waits on its props to draw: the region never empties, and for a frame the copy and the Client
 * draw the same text in the same place.
 */
export type OverCopy = { isOverCopy: boolean }

/** A Client's vertical padding in the pane's padding units: in the pane a padding of 1 is half a line, in a Client a whole line. */
export const PANE_PAD_PER_CLIENT_PAD = 2

/** The Clients the desktop drawing being built names, or null outside one. */
let drawnClients: Set<string> | null = null

export function startClientDrawing() {
  drawnClients = new Set()
}

/** A Client the drawing left out has no instance any more, so it is new again when a later drawing names it. */
export function endClientDrawing() {
  if (drawnClients === null) return
  for (const key of paneState.runningClients) if (!drawnClients.has(key)) paneState.runningClients.delete(key)
  drawnClients = null
}

/** Whether the Client under `key` has not posted since it was drawn. */
export function isClientNew(key: string): boolean {
  drawnClients?.add(key)

  return !paneState.runningClients.has(key)
}

/**
 * A Client and, while it is new, the pane's copy of it. The copy takes the room. The Client lies over it, as tall as
 * what it draws, since a Client takes no height from an absolute Box, so a click lands on it once it draws. Once it
 * posts, the Client stands alone: the engine keeps an instance by its key, wherever the drawing puts it.
 */
export function withCopy(Box: PaneBase['Box'], isNew: boolean, client: JSX.Element, copy: () => JSX.Element) {
  if (!isNew) return client

  return (
    <Box position="relative" width="100%">
      <Box width="100%">{copy()}</Box>
      <Box position="absolute" top={0} left={0} width="100%">
        {client}
      </Box>
    </Box>
  )
}
