import { HERDR_FORMAT, pressFolder } from '../../hooks/herdr'
import type { PrPress } from '../../hooks/pr-press'
import type { RowPress } from '../../hooks/presses'
import type { ReportedLook } from '../../hooks/status-children'
import type { Holds } from '../../hooks/timing'

/** The label the look sets on the session's terminal after it writes a press, so a host following `hc events` reads it. */
export const PRESS_LABEL = 'inbox.press'

/** Where the look writes a press for the host that publishes the session. A host reads only names ending in `.json`. */
export const pressPath = (appHome: string, sessionId: string, pressId: string) =>
  `${pressFolder(appHome, sessionId)}/${pressId}.json`

/** A press id that sorts by time and stays unique between looks pressing in the same millisecond. */
export const newPressId = (now: number, random: number) =>
  `${now.toString(36)}-${Math.floor(random * 36 ** 6).toString(36)}`

/**
 * What the look did for a press it ran itself, an open or a copy: `error` is null when it worked, else why it could
 * not. The host records it and does not open or copy again. A press without one, the host performs.
 */
type LocalOutcome = { error: string | null }

/** The text of a press file, in the format `hooks/herdr-press-file.ts:pressFile` reads. */
export function pressFileText(
  id: string,
  pressedAt: number,
  press: RowPress | PrPress,
  holds: Holds,
  result: LocalOutcome | null = null,
): string {
  const { replies, discarded, shownSince, listInput } = holds

  return JSON.stringify({
    format: HERDR_FORMAT,
    id,
    pressedAt,
    press,
    holds: { replies, discarded, shownSince, listInput },
    ...(result ? { result } : {}),
  })
}

/** The text of a look file: a look at the Status that ended, in the format `pressFile` reads. */
export const lookFileText = (id: string, look: ReportedLook): string =>
  JSON.stringify({ format: HERDR_FORMAT, id, look })
