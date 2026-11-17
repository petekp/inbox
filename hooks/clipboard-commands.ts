/** The commands that put stdin on the clipboard, in the order to try them on a platform. */
export function clipboardCommands(platform: string): string[][] {
  if (platform === 'darwin') return [['pbcopy']]
  if (platform === 'win32') return [['clip']]

  return [['wl-copy'], ['xclip', '-selection', 'clipboard']]
}

/** Why no command could copy, in words a row can show. */
export function noClipboardCommand(commands: string[][]): string {
  return `no clipboard command started (${commands.map(c => c[0]).join(', ')})`
}
