import type { Dialog } from '../../types'
import type { Mod } from './mod-ports'
import { askedCalls, callKey, permissionText } from './mod-records'
import { mod } from './mod-state'
import { PERMISSION_FALLBACK_DELAY_MS } from '../../core/view/timing'

type DialogCalls = Pick<Mod, 'clock' | 'conversation' | 'publishStatus' | 'sendUi'> & {
  atoms: Pick<Mod['atoms'], 'dialogs'>
}

export async function openDialog(m: DialogCalls, dialog: Dialog) {
  await m.atoms.dialogs.update(d => [...d.filter(x => x.key !== dialog.key), dialog])
  void m.publishStatus()
  void m.sendUi(['read']).catch(() => undefined)
}

export async function closeDialogs(m: DialogCalls, key: string | null) {
  if (!(await m.atoms.dialogs.read()).some(d => key === null || d.key === key)) return
  await m.atoms.dialogs.update(d => (key === null ? [] : d.filter(x => x.key !== key)))
  void m.publishStatus()
  void m.sendUi(['read']).catch(() => undefined)
}

export async function clearingDialog<T>(m: DialogCalls, key: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } finally {
    await closeDialogs(m, key)
  }
}

/**
 * Shows the permission row of the call `id` if its verdict is an ask and the call is still waiting
 * PERMISSION_FALLBACK_DELAY_MS later. The auto-mode classifier can settle an ask well within the delay, and the
 * verdict does not say whether a dialog or the classifier answers it. A query asks no PreToolUse hook, so an ask
 * that only a PreToolUse hook makes shows no row.
 */
export async function waitForPermission(m: DialogCalls, id: string, tool: string, rawInput: unknown) {
  const input = (rawInput ?? {}) as Record<string, unknown>
  const key = callKey(tool, input)
  askedCalls.set(id, key)
  try {
    const { decision } = await m.conversation.checkTool(tool, input)
    if (decision !== 'ask') {
      askedCalls.delete(id)
      return
    }
    await m.clock.sleep(PERMISSION_FALLBACK_DELAY_MS)
    if (!askedCalls.has(id) || mod.hasPermissionRequestHook) return
    await openDialog(m, { kind: 'permission', text: permissionText(tool, input), key })
    const wasAllowedWhileOpening = !askedCalls.has(id)
    if (wasAllowedWhileOpening) await closeDialogs(m, key)
  } catch {
    askedCalls.delete(id)
  }
}

/**
 * tool.run: the call was allowed, by the person or by auto mode, so its permission step is over. Ends the wait for its
 * permission row and closes the row. An AskUserQuestion call's dialog is its run, which its tool.call hook closes.
 */
export async function callAllowed(
  m: DialogCalls,
  id: string | undefined,
  tool: string,
  input: Record<string, unknown>,
) {
  if (tool === 'AskUserQuestion') return
  if (id) askedCalls.delete(id)
  await closeDialogs(m, callKey(tool, input))
}

/** classic.PermissionRequest: a permission dialog opened. A question dialog opens from its own tool call. */
export async function permissionAsked(m: DialogCalls, tool: string, rawInput: unknown) {
  if (!mod.isOn || tool === 'AskUserQuestion') return
  const input = (rawInput ?? {}) as Record<string, unknown>
  await openDialog(m, { kind: 'permission', text: permissionText(tool, input), key: callKey(tool, input) })
}
