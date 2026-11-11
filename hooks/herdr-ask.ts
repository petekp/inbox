import type { BannerView } from './banners'
import { answerHerdrMod, herdrModNow } from './herdr-install'
import type { ModFiles } from './herdr-install'

/**
 * The question a host asks before it installs the inbox's Herdr mod. `asking` shows the question with its buttons,
 * `installing` shows while an Install press runs, and `answered` shows a press's result until the host clears it.
 * `answeredAt` is when the answer the host found was saved, so an answer another session saves since closes the
 * question.
 */
export type HerdrAsk =
  | { is: 'asking' | 'installing'; appHome: string; folder: string; answeredAt: number | null }
  | { is: 'answered'; text: string }

export type OpenHerdrAsk = Extract<HerdrAsk, { appHome: string }>

const LEAD = "Install the inbox's Herdr mod?"
const INSTALLING_TEXT = 'Installing the inbox mod in Herdr…'
const INSTALLED_TEXT = '✓ Installed the inbox mod in Herdr.'

/** The question's buttons, in the order every look draws them. Install is the answer the inbox recommends. */
export const HERDR_ASK_BUTTONS = [
  { id: 'herdr-install', label: 'Install', isYes: true },
  { id: 'herdr-skip', label: "Don't install", isYes: false },
] as const

/** The question in a host that found the mod missing, with the home folder written `~` in the folder it names. */
export function herdrAskOf(appHome: string, home: string | undefined, answeredAt: number | null): OpenHerdrAsk {
  const folder = `${appHome}/mods/inbox`
  const shown = home && folder.startsWith(`${home}/`) ? `~${folder.slice(home.length)}` : folder

  return { is: 'asking', appHome, folder: shown, answeredAt }
}

/** The question as the banner under the tab bar, or null when there is none. */
export function herdrAskBanner(ask: HerdrAsk | null): BannerView | null {
  if (!ask) return null
  const isAsking = ask.is === 'asking'
  const lead = ask.is === 'answered' ? ask.text : isAsking ? LEAD : INSTALLING_TEXT
  const body = isAsking
    ? `It adds the inbox panel to the Herdr app, in ${ask.folder}, and keeps it up to date with the inbox.`
    : null

  return { kind: 'herdr-mod-ask', tone: 'ask', lead, body }
}

/**
 * Runs an Install or Don't install press: saves the answer, and installs the mod after Install. `later` says how to
 * install it after Don't install, in the host's words. Resolves with the question's next state and why the press
 * failed, if it did.
 */
export async function answerHerdrAsk(
  files: ModFiles,
  ask: OpenHerdrAsk,
  bundledFolder: string,
  isYes: boolean,
  now: number,
  later: string,
): Promise<{ ask: HerdrAsk | null; failure: string | null }> {
  const result = await answerHerdrMod(files, ask.appHome, bundledFolder, isYes, now)
  if (result.is === 'failed') return { ask: null, failure: result.text }

  return { ask: { is: 'answered', text: isYes ? INSTALLED_TEXT : `${later} to install it later.` }, failure: null }
}

/**
 * The question for a host that draws the inbox outside a Herdr app terminal, as the Codex app's tab: it asks when the
 * app's settings folder exists, the mod is missing and no answer is saved.
 */
export async function herdrAskInApp(
  files: ModFiles,
  appHome: string,
  home: string | undefined,
): Promise<OpenHerdrAsk | null> {
  if ((await files.kind(appHome)) !== 'folder') return null
  const state = await herdrModNow(files, appHome).catch(() => null)

  return state?.installed === 'missing' && state.answeredAt === null ? herdrAskOf(appHome, home, null) : null
}

/** Whether the question still waits: the mod is still missing, and no session has saved an answer since it asked. */
export async function isHerdrAskOpen(files: ModFiles, ask: OpenHerdrAsk): Promise<boolean> {
  const state = await herdrModNow(files, ask.appHome).catch(() => null)

  return state === null || (state.installed === 'missing' && state.answeredAt === ask.answeredAt)
}

/**
 * For `/inbox herdr`: the question again, even after a no, or why it cannot show. `appHome` is null outside a Herdr
 * app terminal, or when the app has no settings folder.
 */
export async function askHerdrAgain(
  files: ModFiles,
  appHome: string | null,
  home: string | undefined,
): Promise<OpenHerdrAsk | string> {
  if (!appHome) return 'Run /inbox herdr in a Herdr app terminal to install the inbox mod there.'
  const state = await herdrModNow(files, appHome).catch((err: unknown) =>
    err instanceof Error ? err : new Error(String(err)),
  )
  if (state instanceof Error) return `Could not read the Herdr app's mods folder. ${state.message}`
  const ask = herdrAskOf(appHome, home, state.answeredAt)
  if (state.installed === 'inbox') return 'The inbox mod is already installed in Herdr.'
  if (state.installed === 'own') return `${ask.folder} holds another mod, so the inbox leaves it alone.`

  return ask
}
