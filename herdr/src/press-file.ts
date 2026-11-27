import { pressFolder } from '../../core/remote/herdr'

/** Where the look writes a press for the host that publishes the session. A host reads only names ending in `.json`. */
export const pressPath = (appHome: string, sessionId: string, pressId: string) =>
  `${pressFolder(appHome, sessionId)}/${pressId}.json`

/** A press id that sorts by time and stays unique between looks pressing in the same millisecond. */
export const newPressId = (now: number, random: number) =>
  `${now.toString(36)}-${Math.floor(random * 36 ** 6).toString(36)}`
