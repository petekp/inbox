import { HERDR_FORMAT } from './herdr'
import type { PrPress } from '../view/pr-press'
import type { RowPress } from '../domain/presses'
import type { Holds } from '../view/timing'
import type { Precondition } from '../domain/preconditions'

/**
 * What the look did for a press it ran itself, an open or a copy: `error` is null when it worked, else why it could
 * not. The host records it and does not open or copy again. A press without one, the host performs.
 */
type LocalOutcome = { error: string | null }

/** The text of a press file, in the format `core/remote/herdr-press-file.ts:pressFile` reads. */
export function pressFileText(
  id: string,
  pressedAt: number,
  press: RowPress | PrPress,
  holds: Holds,
  result: LocalOutcome | null = null,
  when: readonly Precondition[] = [],
): string {
  const { replies, discarded, shownSince, listInput } = holds

  return JSON.stringify({
    format: HERDR_FORMAT,
    id,
    pressedAt,
    press,
    holds: { replies, discarded, shownSince, listInput },
    ...(result ? { result } : {}),
    ...(when.length > 0 ? { when } : {}),
  })
}
