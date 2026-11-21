import type { Hook, SessionEndReason } from 'claude-code'

import { PR_POLL_MS } from './host-prs'
import { forgetStored } from './mod-delivery'
import { setDemo } from './mod-demo'
import { readUi, redraw } from './mod-drawn'
import { recordsFolder } from './mod-engine-calls'
import { askHerdrModAgain, isExitReason, listenForHerdrPresses, openInHerdr, startInHerdr } from './mod-herdr'
import { loadConversation } from './mod-load'
import { showInbox } from './mod-pane-open'
import { nextBuildMarkPath } from './mod-plugin-files'
import type { Mod } from './mod-ports'
import { findPrs, pollPrs } from './mod-prs'
import { herdrPress } from './mod-publish'
import { replaceDrawn } from './mod-session-write'
import { AWAY_MS, conversation, DESKTOP_APP_ENTRYPOINTS, withoutRowActions } from './mod-sessions'
import { mod, resetTurn, sessionState } from './mod-state'
import { leaveUi } from './mod-ui-loop'
import { upgradeState } from './mod-upgrade'
import { CLAUDE_CODE } from './model-text'
import { cleared } from './session-turns'
import { agentTools } from './tools'

type CommandRunEvent = Parameters<Hook<'command.run'>>[1]

async function tick(m: Mod) {
  const now = await m.clock.now()
  const [away, { presence }] = await Promise.all([m.atoms.away.read(), m.atoms.session.read()])
  if (away.isAway) {
    await m.atoms.away.update(a => ({ ...a, minute: Math.floor(now / 60_000) }))
  } else if (!presence.isTurnRunning && away.lastActiveAt > 0 && now - away.lastActiveAt > AWAY_MS) {
    await m.atoms.away.update(a => ({ ...a, isAway: true, minute: Math.floor(now / 60_000) }))
  }
}

function readIsNextBuild(m: Mod): Promise<boolean> {
  return m.setup.exists(nextBuildMarkPath(m.pluginRoot)).catch(() => false)
}

export function registerInboxCommand(m: Mod) {
  return m.setup.registerCommand().catch(() => undefined)
}

/**
 * Whether the desktop app started this process. Claude Code sets `CLAUDE_CODE_CHILD_SESSION` for every command it
 * runs and the app leaves it out, so a `claude -p` run from a desktop session inherits the entrypoint but not this.
 */
async function isStartedByDesktopApp(m: Mod) {
  const [entrypoint, childSession] = await m.setup.launchEnv()

  return DESKTOP_APP_ENTRYPOINTS.includes(entrypoint ?? '') && childSession === undefined
}

export function ensureOn(m: Mod): Promise<void> {
  return mod.turningOn ?? (mod.isOn ? Promise.resolve() : turnOn(m))
}

function turnOn(m: Mod): Promise<void> {
  return (mod.turningOn ??= initializeInbox(m).finally(() => {
    mod.turningOn = null
  }))
}

async function readVersion(m: Mod) {
  try {
    const manifest: unknown = JSON.parse(await m.setup.read(`${m.pluginRoot}/.claude-plugin/plugin.json`))
    const stated = (manifest as { version?: unknown } | null)?.version
    mod.version = typeof stated === 'string' ? stated : null
  } catch {
    mod.version = null
  }
  mod.isNextBuild = await readIsNextBuild(m)
  mod.statusRecordsFolder = mod.isNextBuild ? await recordsFolder(m.commands).catch(() => null) : null
}

async function initializeInbox(m: Mod) {
  // A hot reload keeps state an older build wrote. Draws start once isOn is set, and they read the current shape.
  await Promise.all([upgradeState(m), readVersion(m)])
  mod.isOn = true
  mod.toolsRefused = false
  const refused = () => {
    mod.toolsRefused = true
  }
  await Promise.all([
    registerInboxCommand(m),
    ...agentTools(CLAUDE_CODE).map(tool => m.setup.registerTool(tool).catch(refused)),
  ])
  // A pane kept across a hot reload is already drawn.
  if (mod.toolsRefused) await redraw(m)
  for (const interval of mod.intervals) interval.cancel()
  mod.intervals = [
    m.clock.every(60_000, () => {
      void tick(m)
    }),
    m.clock.every(PR_POLL_MS, () => {
      void pollPrs(m)
    }),
  ]
  await loadConversation(m, await m.conversation.id(), 'mod-start')
  void startInHerdr(m.herdr, () => redraw(m))
  mod.stopHerdrPresses?.()
  mod.stopHerdrPresses = await listenForHerdrPresses(
    m.herdr,
    () => conversation.id,
    (id, f) => herdrPress(m, id, f),
  )
  // After loadConversation, which brings saved state up to date. A band or pane drawn while the mod was off read no
  // state, so no state write draws it again.
  m.pane.redrawAll()
  await m.sendUi(['read'])
  await redraw(m)
}

/** Turns the mod on in a session that draws: an interactive one, or one the desktop app started. */
export async function sessionStarted(m: Mod, isInteractive: boolean) {
  // The desktop app runs its sessions headless and attaches to them, before or after this start. Only tools
  // registered during this hook are sure to be offered on the first prompt, so a session the app started turns on
  // here too. -p, the SDK and VS Code draw nothing, so the mod stays off there.
  const isDesktop = (await m.setup.surfaces()).includes('desktop') || (await isStartedByDesktopApp(m))
  if (isInteractive || isDesktop) await turnOn(m)
}

/** The session ends its conversation: at exit, and at /clear, /resume and /branch, which go on with another. */
export async function sessionEnded(m: Mod, reason: SessionEndReason) {
  sessionState.endReason = reason
  sessionState.loadRevision++
  sessionState.stopGeneration++
  sessionState.resuming = null
  if (mod.isOn) {
    await Promise.all([
      replaceDrawn(m, s => (s.stop ? { ...s, stop: null } : s)),
      m.atoms.dialogs.update(() => []),
      m.atoms.demo.update(() => null),
      m.atoms.demoRecording.update(() => false),
      m.publishStatus(true, isExitReason(reason)),
    ])
  }
  // /clear, /resume and /branch (which reports resume) go on in this process with another conversation.
  if (mod.isOn && (reason === 'clear' || reason === 'resume')) {
    conversation.generation += 1
    await Promise.all([
      replaceDrawn(m, s => {
        const empty = cleared(s)

        return {
          ...empty,
          lastActions: withoutRowActions(s.lastActions),
          sent: [],
          heldRows: [],
          presence: { ...empty.presence, isUpdating: false },
        }
      }),
      leaveUi(m),
      m.atoms.away.update(a => ({ ...a, isAway: false })),
    ])
    resetTurn()
    sessionState.shellCommand = null
    forgetStored()
  }
}

/** Runs `/inbox`: opens the pane, or with `demo` shows or hides the sample, or with `herdr` asks about the Herdr mod again. */
export async function inboxCommand(m: Mod, e: CommandRunEvent): Promise<{ text?: string }> {
  if (!mod.isOn && !mod.turningOn && e.origin.kind !== 'composer') return {}
  await ensureOn(m)
  const isShown = (await m.atoms.demo.read()) !== null
  const args = e.args.trim().split(/\s+/).join(' ')
  if (args === 'herdr') return { text: await askHerdrModAgain(m.herdr, () => showInbox(m, null)) }
  if (args === 'demo' || args === 'demo recording') await setDemo(m, !isShown, args === 'demo recording')
  else if ((await readUi(m)).tab === 'prs') await findPrs(m)
  const [isDemo, isDemoRecording] = await Promise.all([
    m.atoms.demo.read().then(d => d !== null),
    m.atoms.demoRecording.read(),
  ])
  const note = await showInbox(m, args || isDemo ? null : openInHerdr(m.herdr))

  return {
    text: !isDemo
      ? (note ?? 'Opened the inbox.')
      : isDemoRecording
        ? 'Showing sample entries without their notices, for a recording. Run /inbox demo to go back.'
        : 'Showing sample entries in the inbox. Run /inbox demo again to go back.',
  }
}
