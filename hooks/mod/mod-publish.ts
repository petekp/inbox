import { startedFile, type StartedFile, startHerdrFile } from '../../core/remote/herdr-app'
import type { HerdrFile } from '../../core/remote/herdr-press-file'
import { sessionFolder } from './mod-commands'
import { later } from './mod-drawn'
import { publishToHerdr } from './mod-herdr'
import { checkDelegatesIfDue } from './mod-pane-open'
import type { Mod } from './mod-ports'
import { wakeAfterSettle } from './mod-press-run'
import { pollPrs } from './mod-prs'
import { removeModRegistry, writeModRegistry } from './mod-registry'
import { readRemoteState } from './mod-saves'
import { conversation, currentOwner } from './mod-sessions'
import { sessionState, viewerLeases } from './mod-state'
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

export async function publishStatus(m: PublishCalls, isEnding = false, isExit = false): Promise<boolean> {
  const id = conversation.id
  const registry = isEnding
    ? removeModRegistry(m, id)
    : writeModRegistry(m, id, async () => {
        const [session, root] = await Promise.all([m.atoms.session.read(), sessionFolder(m.commands)])
        return { root: root ?? '', session }
      })
  const [isTaken] = await Promise.all([
    publishToHerdr(
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
          ...(await readRemoteState(m.saves, conversation.id, session, viewerLeases.peek(conversation.id))),
          isUnread: unreadable === conversation.id,
          isSendHeld: sessionState.isSendHeld,
        }
      },
      isExit,
    ),
    isExit ? null : registry,
  ])

  return isTaken
}

/** Applies a Herdr look's press, and gives what waits for the agent's turn. Null when it is for another conversation. */
export async function herdrPress(m: PublishCalls, id: string, f: HerdrFile): Promise<StartedFile | null> {
  if (id !== conversation.id) return null
  const host = {
    ...m.hostOf(currentOwner(), 'terminal'),
    refreshPrsIfDue: () => pollPrs(m, true),
    checkDelegatesIfDue: async () => void checkDelegatesIfDue(m).catch(() => undefined),
    viewers: viewerLeases.of(id, () => void m.publishStatus()),
    commands: m.saves.commands?.(id, () => void m.publishStatus()),
  }

  return startedFile(await startHerdrFile(host, f, id), outcome => {
    if (outcome.wakesAfterSettle) later(m, SETTLED_MS, () => wakeAfterSettle(m))
  })
}
