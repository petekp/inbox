export const DEFAULT_PERSON_INSTRUCTIONS =
  "Write every free-text value in the same language as the person's messages in this conversation. Keep protocol keywords and labels in English."

const MAX_PERSON_INSTRUCTIONS = 4_000

/** The single headed block appended to inbox-owned model calls. */
export function personInstructionsBlock(text: string | null): string {
  const content =
    text === null || text.trim() === ''
      ? DEFAULT_PERSON_INSTRUCTIONS
      : Array.from(text).slice(0, MAX_PERSON_INSTRUCTIONS).join('')

  return `Person's instructions:\n${content}`
}
