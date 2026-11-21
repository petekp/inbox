/** The version every host writes on a session it saves. */
export const SESSION_VERSION = 1

/** Throws for a saved session of another version. A session saved with no version is version 1, the oldest. */
export function checkVersion(saved: { version?: unknown }): void {
  const version = saved.version ?? 1
  if (version !== SESSION_VERSION) throw new Error(`Unsupported inbox state version: ${version}`)
}
