import type {
  AgentInfo,
  ModelCompleteRequest,
  ModelCompleteResult,
  ModelForkRequest,
  ModelForkResult,
  PluginState,
  PromptSubmitResult,
  RenderSurface,
  SessionMessage,
  ToolCheckResult,
  ToolSpec,
  UiCopyResult,
  UiFocusResult,
  UiOpenResult,
  UiPane,
  UiPressArgument,
  UiScrollBlock,
  UiScrollResult,
} from 'claude-code'

import type { Session } from '../types'
import type { EngineCalls } from './mod-engine-calls'
import type { HerdrCalls } from './mod-herdr'
import type { HistoryEngine } from './mod-history'
import type { SaveEngine } from './mod-saves'
import type { ModSession, Owner } from './mod-sessions'
import type { SessionHost } from './session-host'
import type { UiEvent } from './ui-controller-types'

/** The request id of the inbox pane, which every pane call names. */
export const PANE = 'inbox'

type InboxState = PluginState['inbox']

/** One of the mod's engine atoms: its value, and a change to it. */
type AtomCalls<T> = { read: () => Promise<T>; update: (change: (value: T) => T) => Promise<T> }

/** The separate keys an older build kept the session and the pane's state in. */
export type OldKey =
  | 'ledger'
  | 'presence'
  | 'prViews'
  | 'stop'
  | 'lastActions'
  | 'sent'
  | 'untrackedSent'
  | 'tab'
  | 'page'
  | 'selection'
  | 'statusSelection'
  | 'typing'
  | 'drafts'
  | 'discarded'
  | 'shown'
  | 'notes'
  | 'unfolded'
  | 'closedAll'
  | 'statusUnfolded'
  | 'optionsShown'
  | 'isHelpShown'

export type OldFields = Pick<InboxState, OldKey>

/**
 * The mod's engine atoms. The engine reads an atom only through a `const` the hooks module declares, so
 * `register.tsx` declares each one and binds it here.
 */
type AtomStore = {
  ui: AtomCalls<InboxState['ui']>
  theme: AtomCalls<string>
  dialogs: AtomCalls<InboxState['dialogs']>
  redraw: AtomCalls<number>
  runningFrame: AtomCalls<number>
  /** Read only here: `writeSession` writes it. */
  session: Pick<AtomCalls<ModSession>, 'read'>
  away: AtomCalls<InboxState['away']>
  unreadable: AtomCalls<string | null>
  demo: AtomCalls<InboxState['demo']>
  demoRecording: AtomCalls<boolean>
  personLines: AtomCalls<Record<string, string>>
  /** What the engine holds under the session key, or undefined when nothing was ever written there. */
  writtenSession: () => Promise<unknown>
  /** What an older build kept under each of its separate keys, undefined when it wrote nothing there. */
  old: { [K in OldKey]: () => Promise<{ value: OldFields[K] | undefined }> }
}

type Clock = {
  now: () => Promise<number>
  sleep: (ms: number) => Promise<void>
  after: (ms: number, fn: () => void) => { cancel: () => void }
  every: (ms: number, fn: () => void) => { cancel: () => void }
}

/** The calls on the inbox pane, and the copy and conversation scroll a press makes from it. */
type PaneCalls = {
  /** Opens the pane, or raises it. */
  open: (opts: { focus?: true; closeOnEscape?: true }) => Promise<UiOpenResult>
  /** The inbox pane as the surface reports it, or undefined when it is not open. */
  find: () => Promise<UiPane | undefined>
  focus: (key: string) => Promise<UiFocusResult>
  scrollTo: (key: string, block: UiScrollBlock) => Promise<UiScrollResult>
  scrollToStart: () => Promise<UiScrollResult>
  /** Scrolls the conversation to the start of the message drawn under `requestId`. */
  scrollConversation: (requestId: string) => Promise<UiScrollResult>
  copy: (text: string, surface: UiPressArgument['surface']) => Promise<UiCopyResult>
  /** Draws every `ui.render` again, as after the mod turns on. */
  redrawAll: () => void
}

/** The conversation the session runs: its id, folder, transcript and agents, and the prompts the mod sends into it. */
type ConversationCalls = {
  id: () => Promise<string>
  root: () => Promise<string>
  turns: () => Promise<number>
  messages: () => Promise<SessionMessage[]>
  /** Adds `text` to the transcript as a user message. */
  append: (text: string) => Promise<unknown>
  submit: (text: string) => Promise<PromptSubmitResult>
  agents: () => Promise<AgentInfo[]>
  /** The permission verdict the session would give a call, from a query that runs nothing. */
  checkTool: (tool: string, input: Record<string, unknown>) => Promise<ToolCheckResult>
}

/** What the mod registers as it turns on, and the session facts, environment variables and plugin files it reads. */
type SetupCalls = {
  registerCommand: () => Promise<unknown>
  registerTool: (tool: ToolSpec) => Promise<unknown>
  surfaces: () => Promise<readonly RenderSurface[]>
  /** `CLAUDE_CODE_ENTRYPOINT` and `CLAUDE_CODE_CHILD_SESSION`. */
  launchEnv: () => Promise<[string | undefined, string | undefined]>
  terminalProgram: () => Promise<string | undefined>
  /** The plugin's `.claude-plugin/plugin.json`. */
  manifest: () => Promise<string>
  /** Whether the plugin folder holds the next-build mark. */
  isNextBuild: () => Promise<boolean>
  /** The `theme` row's value in /config. */
  theme: () => Promise<unknown>
}

type ModelCalls = {
  complete: (request: ModelCompleteRequest) => Promise<ModelCompleteResult>
  fork: (request: ModelForkRequest) => Promise<ModelForkResult>
}

/**
 * What the mod's modules reach, which `register.tsx` binds from `$` for each hook: narrow engine calls, and the
 * operations modules share. A module that uses some of them names those with `Pick`, and one that uses most takes `Mod`. The shared operations run through here
 * rather than by import, so the modules that call them and the modules that define them import no value from each
 * other in a loop.
 */
export type Mod = {
  atoms: AtomStore
  clock: Clock
  pane: PaneCalls
  conversation: ConversationCalls
  model: ModelCalls
  setup: SetupCalls
  saves: SaveEngine
  history: HistoryEngine
  commands: EngineCalls
  herdr: HerdrCalls
  pluginRoot: string
  /** Writes the drawn session. Of the modules that name their fields, only the session write loop, the state upgrade and message delivery take it. */
  writeSession: (change: (s: ModSession) => ModSession) => Promise<ModSession>
  /** Changes `owner`'s session, as `commit` in `hooks/mod-session-write.ts` does. */
  commit: (owner: Owner, change: (s: Session) => Session | Promise<Session>) => Promise<Session>
  /** Runs events through the shared controller, as `sendUi` in `hooks/mod-ui-loop.ts` does. */
  sendUi: (events: (UiEvent | 'read')[], surface?: UiPressArgument['surface']) => Promise<void>
  /** Publishes the session to the Herdr look, as `publishStatus` in `hooks/mod-publish.ts` does. */
  publishStatus: (isEnding?: boolean, isExit?: boolean) => Promise<boolean>
  /** Starts or ends the Status look, as `syncLook` in `hooks/mod-pane-open.ts` does. */
  syncLook: (isOpen?: boolean) => Promise<void>
  /** The SessionHost for `owner`, as `hostOf` in `hooks/mod-host.ts` builds it. */
  hostOf: (owner: Owner, surface?: UiPressArgument['surface']) => SessionHost<Session>
  /** Queues a PR fetch, as `fetchPrs` in `hooks/mod-prs.ts` does. */
  fetchPrs: (findsBranchPr: boolean, isPress?: boolean) => Promise<void>
}
