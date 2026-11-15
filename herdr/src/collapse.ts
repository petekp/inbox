import { withCollapse } from '../../hooks/collapse'
import { HERDR_FORMAT } from '../../hooks/herdr'
import type { CollapseFile } from '../../hooks/herdr-press-file'
import type { Session } from '../../types'
import type { ReadSession } from './files'
import { newPressId, pressPath } from './press-file'
import type { QueueIo } from './press-queue'

type Collapse = { isCollapsed: boolean; at: number }

/** The collapses and expands the look made that the session it read does not show yet, by row. */
export type Collapses = Record<string, Collapse>

/**
 * How long the look draws a collapse the host has not published. The host drops a collapse of a row no tab lists, so
 * the session never shows it.
 */
const COLLAPSE_WAIT_MS = 30_000

const isShown = (s: Session, row: string, c: Collapse) =>
  c.isCollapsed ? s.collapsed[row] === c.at : s.collapsed[row] === undefined

/** The read with the look's own collapses on its session, and those of them it does not show yet. */
export function withCollapses(
  read: ReadSession | null,
  collapses: Collapses,
  now: number,
): { read: ReadSession | null; collapses: Collapses } {
  if (read?.is !== 'read') return { read, collapses }
  const waiting = Object.fromEntries(
    Object.entries(collapses).filter(([row, c]) => now - c.at < COLLAPSE_WAIT_MS && !isShown(read.session, row, c)),
  )
  const session = Object.entries(waiting).reduce(
    (s, [row, c]) => withCollapse(s, row, c.isCollapsed, c.at),
    read.session,
  )

  return { read: { ...read, session }, collapses: waiting }
}

/** Writes a collapse file to the session's press folder, then wakes the host on the session's terminal. */
export async function writeCollapse(
  io: Pick<QueueIo, 'random' | 'write' | 'wake'>,
  to: { appHome: string; sessionId: string; terminal: string },
  row: string,
  c: Collapse,
): Promise<void> {
  const id = newPressId(c.at, io.random())
  const file: CollapseFile = { format: HERDR_FORMAT, id, collapse: { row, ...c } }
  if ((await io.write(pressPath(to.appHome, to.sessionId, id), JSON.stringify(file))) === null)
    await io.wake(to.terminal, id)
}
