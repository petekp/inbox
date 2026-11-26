import { clipboardCommands, noClipboardCommand } from '../../core/runtime/clipboard-commands'

/** Copies text to the clipboard with the first clipboard command that runs. Returns why it could not, or null. */
export async function copyToClipboard(text: string): Promise<string | null> {
  const commands = clipboardCommands(process.platform)
  for (const argv of commands) {
    try {
      const child = Bun.spawn(argv, { stdin: Buffer.from(text), stdout: 'ignore', stderr: 'ignore' })
      if ((await child.exited) === 0) return null
    } catch {
      continue
    }
  }

  return noClipboardCommand(commands)
}
