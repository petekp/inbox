import { HERDR_CHECK_MS, HERDR_FORMAT } from '../../core/remote/herdr'
import type { HerdrFile } from '../../core/remote/herdr-press-file'
import type { ReadSession } from '../../core/remote/herdr-read'
import { newPressId, pressPath } from './press-file'
import type { QueueIo } from './press-queue'
import { StatusLook, writeLook } from './status-look'

/**
 * How often the look tells the host each tab it reports is still shown. The host reads PRs at most every two minutes.
 * It asks Herdr about delegates at most every `HERDR_CHECK_MS`, timed by its own clock when it reads a report, so the
 * Status reports twice as often and the host's limit alone sets the pace.
 */
const SHOWN_REPORT_MS: Record<ReportedTab, number> = { prs: 30_000, overview: HERDR_CHECK_MS / 2 }

/** The tabs whose showing the host acts on: the PRs tab, whose PRs it reads, and the Status, whose delegates it follows. */
type ReportedTab = 'prs' | 'overview'

type ShownTarget = { sessionId: string; terminal: string; tab: ReportedTab }

/**
 * The session and tab the look shows, when the host acts on that tab, or null: the pane is not shown, another tab is,
 * or the session's file is not read.
 */
function shownTarget(
  isPaneShown: boolean,
  tab: string,
  sessionId: string | null,
  read: ReadSession | null,
): ShownTarget | null {
  if (!isPaneShown || (tab !== 'prs' && tab !== 'overview') || sessionId === null || read?.is !== 'read') return null

  return { sessionId, terminal: read.envelope.terminal, tab }
}

/** When the look last told a host which tab it shows, so it tells again on opening the tab and each `SHOWN_REPORT_MS` of the tab. */
class ShownReport {
  private last: { sessionId: string; tab: ReportedTab; at: number } | null = null

  /** The session and tab to report at this check, or null when the host heard lately or no reported tab is shown. */
  check(target: ShownTarget | null, now: number): ShownTarget | null {
    if (target === null) {
      this.last = null
      return null
    }
    const last = this.last
    const isSame = last?.sessionId === target.sessionId && last.tab === target.tab
    if (isSame && now - last.at < SHOWN_REPORT_MS[target.tab]) return null
    this.last = { sessionId: target.sessionId, tab: target.tab, at: now }

    return target
  }
}

/** Writes the report to the session's press folder, then wakes the host on the session's terminal. */
async function writeShown(
  io: Pick<QueueIo, 'random' | 'write' | 'wake'>,
  appHome: string,
  target: ShownTarget,
  now: number,
) {
  const id = newPressId(now, io.random())
  const file: HerdrFile =
    target.tab === 'prs'
      ? { format: HERDR_FORMAT, id, prsShown: { at: now } }
      : { format: HERDR_FORMAT, id, statusShown: { at: now } }
  if ((await io.write(pressPath(appHome, target.sessionId, id), JSON.stringify(file))) === null)
    await io.wake(target.terminal, id)
}

/** What the panel tells a session's host about its use: the looks at the Status, and that its PRs tab or Status is shown. */
export class LookReports {
  status = new StatusLook()
  private shown = new ShownReport()

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
    const target = this.shown.check(shownTarget(isPaneShown, page.tab, page.sessionId, page.read), now)
    if (target) await writeShown(io, appHome, target, now)
  }
}
