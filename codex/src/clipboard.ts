import { clipboardCommands, noClipboardCommand } from '../../core/runtime/clipboard-commands'
import type { RunWithInput } from './run'

const COPY_TIMEOUT_MS = 5000

/**
 * Puts `text` on the clipboard of the machine the server runs on, which is the person's, since the tab's frame gets no
 * clipboard permission from the ChatGPT app. Returns null when copied, else why not.
 */
export async function copyToClipboard(
  exec: RunWithInput,
  text: string,
  platform: string = process.platform,
): Promise<string | null> {
  const commands = clipboardCommands(platform)
  for (const argv of commands) {
    const r = await exec(argv, { cwd: '/', timeoutMs: COPY_TIMEOUT_MS, input: text })
    if (r.code === 0) return null
  }

  return noClipboardCommand(commands)
}
