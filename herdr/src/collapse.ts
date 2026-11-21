import { HERDR_FORMAT } from '../../core/remote/herdr'
import type { CollapseFile } from '../../core/remote/herdr-press-file'
import type { ReadSession } from './files'
import { newPressId, pressPath } from './press-file'
import type { QueueIo } from './press-queue'

type Collapse = { isCollapsed: boolean; at: number }

/**
 * Writes a collapse file to the session's press folder, then wakes the host on the session's terminal. Writes nothing
 * when the host does not save collapses.
 */
export async function writeCollapse(
  io: Pick<QueueIo, 'random' | 'write' | 'wake'>,
  to: { appHome: string; sessionId: string },
  read: Extract<ReadSession, { is: 'read' }>,
  row: string,
  c: Collapse,
): Promise<void> {
  if (!read.savesCollapses) return
  const id = newPressId(c.at, io.random())
  const file: CollapseFile = { format: HERDR_FORMAT, id, collapse: { row, ...c } }
  if ((await io.write(pressPath(to.appHome, to.sessionId, id), JSON.stringify(file))) === null)
    await io.wake(read.envelope.terminal, id)
}
