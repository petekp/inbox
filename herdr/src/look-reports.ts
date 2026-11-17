import { HERDR_FORMAT } from '../../hooks/herdr'
import type { HerdrFile } from '../../hooks/herdr-press-file'
import type { ReadSession } from './files'
import { newPressId, pressPath } from './press-file'
import type { QueueIo } from './press-queue'
import { StatusLook, writeLook } from './status-look'

/** How often the look tells the host its PRs tab is still shown. The host reads PRs at most every two minutes. */
const PRS_REPORT_MS = 30_000

type PrsTarget = { sessionId: string; terminal: string }

/**
 * The session whose PRs tab the look shows, or null: the pane is not shown, another tab is, or the session's file is
 * not read.
 */
function prsShownTarget(
  isPaneShown: boolean,
  tab: string,
  sessionId: string | null,
  read: ReadSession | null,
): PrsTarget | null {
  if (!isPaneShown || tab !== 'prs' || sessionId === null || read?.is !== 'read') return null

  return { sessionId, terminal: read.envelope.terminal }
}

/** When the look last told a host its PRs tab is shown, so it tells again on opening the tab and each `PRS_REPORT_MS`. */
class PrsShownReport {
  private last: { sessionId: string; at: number } | null = null

  /** The session to report at this check, or null when the host heard lately or the tab is not shown. */
  check(target: PrsTarget | null, now: number): PrsTarget | null {
    if (target === null) {
      this.last = null
      return null
    }
    const last = this.last
    if (last?.sessionId === target.sessionId && now - last.at < PRS_REPORT_MS) return null
    this.last = { sessionId: target.sessionId, at: now }

    return target
  }
}

/** Writes the report to the session's press folder, then wakes the host on the session's terminal. */
async function writePrsShown(
  io: Pick<QueueIo, 'random' | 'write' | 'wake'>,
  appHome: string,
  target: PrsTarget,
  now: number,
) {
  const id = newPressId(now, io.random())
  const file: HerdrFile = { format: HERDR_FORMAT, id, prsShown: { at: now } }
  if ((await io.write(pressPath(appHome, target.sessionId, id), JSON.stringify(file))) === null)
    await io.wake(target.terminal, id)
}

/** What the panel tells a session's host about its use: the looks at the Status, and that its PRs tab is shown. */
export class LookReports {
  status = new StatusLook()
  private prs = new PrsShownReport()

  /** Writes what is due at this check. `isPaneShown` is whether the Herdr app shows the panel. */
  async check(
    io: Pick<QueueIo, 'random' | 'write' | 'wake'>,
    appHome: string,
    isPaneShown: boolean,
    page: { tab: string; sessionId: string | null; read: ReadSession | null },
    now: number,
  ): Promise<void> {
    const ended = this.status.check(isPaneShown, now)
    if (ended) await writeLook(io, appHome, ended)
    const target = this.prs.check(prsShownTarget(isPaneShown, page.tab, page.sessionId, page.read), now)
    if (target) await writePrsShown(io, appHome, target, now)
  }
}
