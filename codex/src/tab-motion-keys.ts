export const statusRowMotion = (id: string) => `status-${id}`
export const goalLineMotion = (id: string) => `goal-${id}`

/**
 * The motion key of the row that draws the same subject or child in the other list, the goal's or the one after it. A
 * subject that moves between them leaves one row and enters the other (`moveLines`). Null for any other key.
 */
export function otherListKey(motion: string): string | null {
  if (motion.startsWith('status-')) return goalLineMotion(motion.slice('status-'.length))
  if (motion.startsWith('goal-')) return statusRowMotion(motion.slice('goal-'.length))

  return null
}
