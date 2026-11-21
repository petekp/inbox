import { startedFile, type StartedFile, startHerdrFile } from '../../core/remote/herdr-app'
import type { HerdrFile } from '../../core/remote/herdr-press-file'
import { sessionFolder } from './mod-commands'
import { later } from './mod-drawn'
import { publishToHerdr } from './mod-herdr'
import type { Mod } from './mod-ports'
import { wakeAfterSettle } from './mod-press-run'
import { pollPrs } from './mod-prs'
import { readRemoteState } from './mod-saves'
import { conversation, currentOwner } from './mod-sessions'
import { SETTLED_MS } from '../../core/view/timing'

type PublishCalls = Pick<
  Mod,
  | 'atoms'
  | 'clock'
  | 'pane'
  | 'saves'
  | 'history'
  | 'commands'
  | 'herdr'
  | 'pluginRoot'
  | 'commit'
  | 'sendUi'
  | 'publishStatus'
  | 'syncLook'
  | 'hostOf'
  | 'fetchPrs'
>

export function publishStatus(m: PublishCalls, isEnding = false, isExit = false): Promise<boolean> {
  return publishToHerdr(
    m.herdr,
    isEnding ? conversation.id : null,
    async () => {
      const [session, dialogs, unreadable] = await Promise.all([
        m.atoms.session.read(),
        m.atoms.dialogs.read(),
        m.atoms.unreadable.read(),
      ])

      const root = (await sessionFolder(m.commands)) ?? ''

      return {
        id: conversation.id,
        root,
        session,
        dialogs,
        ...(await readRemoteState(m.saves, conversation.id, session)),
        isUnread: unreadable === conversation.id,
      }
    },
    isExit,
  )
}

/** Applies a Herdr look's press, and gives what waits for the agent's turn. Null when it is for another conversation. */
export async function herdrPress(m: PublishCalls, id: string, f: HerdrFile): Promise<StartedFile | null> {
  if (id !== conversation.id) return null
  const host = { ...m.hostOf(currentOwner(), 'terminal'), refreshPrsIfDue: () => pollPrs(m, true) }

  return startedFile(await startHerdrFile(host, f, id), outcome => {
    if (outcome.wakesAfterSettle) later(m, SETTLED_MS, () => wakeAfterSettle(m))
  })
}
