export const MAX_REPLY_LENGTH = 8000

async function digest(first: string, second: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${first}\0${second}`)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

export const submissionId = (session: string, operation: string) => digest(session, operation)
export const legacySubmissionId = (key: string, text: string) => digest(key, text)
