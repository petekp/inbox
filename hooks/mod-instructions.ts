/** Reads the mod's per-call instructions through the environment and filesystem functions its host provides. */
export async function readInboxInstructions(
  readXdgConfigHome: () => Promise<string | undefined>,
  readHome: () => Promise<string | undefined>,
  readFile: (path: string) => Promise<string>,
): Promise<string | null> {
  const [xdgConfigHome, home] = await Promise.all([readXdgConfigHome(), readHome()])
  const configHome = xdgConfigHome || (home ? `${home}/.config` : null)
  if (!configHome) return null

  return readFile(`${configHome}/inbox/instructions.md`).catch(() => null)
}
