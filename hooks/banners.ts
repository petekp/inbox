import type { Stop } from '../types'
import { capitalized } from './press-labels'
import type { BannerTone } from './tones'

export function groupEmptyText(title: string): string {
  return `No open ${title.toLowerCase()}`
}

/** The message Resume sends after an API error stopped a turn. */
export const RESUME_TEXT = 'Continue'

/** True when Resume can continue past the stop. */
export function isResumable(stop: Stop): boolean {
  return stop.kind === 'api-error'
}

export function stopText(stop: Stop): string {
  switch (stop.kind) {
    case 'sign-in':
      return 'sign-in expired'
    case 'billing':
      return 'billing problem'
    case 'usage-limit':
      return 'usage limit reached'
    default:
      return stop.detail === 'rate_limit'
        ? 'the API is limiting requests'
        : stop.detail === 'overloaded'
          ? 'the API is overloaded'
          : `API error (${stop.detail})`
  }
}

export function stopFix(stop: Stop): string {
  switch (stop.kind) {
    case 'sign-in':
      return 'Run /login, then send a message to resume.'
    case 'billing':
      return 'Check billing in the Claude console, then resume.'
    case 'usage-limit':
      return stop.resets ? `Resume after ${stop.resets}.` : 'Resume when the limit resets.'
    default:
      return 'Send a message to resume.'
  }
}

/** A banner's subject. A look draws a button on the banners that have one: Try again, Resume, Hide demo, Reload. */
export type BannerKind =
  | 'demo'
  | 'update-failed'
  | 'tools-refused'
  | 'read-failed'
  | 'stopped'
  | 'gh-missing'
  | 'gh-signed-out'
  | 'press-note'
  | 'press-failed'
  | 'hooks-trust'
  | 'server-gone'
  | 'server-load-failed'
  | 'server-builds-differ'
  | 'tab-update-failed'

/**
 * Error: the inbox cannot do its job, or the turn stopped, until something changes. Warning: part of the inbox is
 * missing or out of date, and it still works. Notice: a fact.
 */
const BANNER_TONES: Record<BannerKind, BannerTone> = {
  demo: 'notice',
  'update-failed': 'warning',
  'tools-refused': 'error',
  'read-failed': 'error',
  stopped: 'error',
  'gh-missing': 'warning',
  'gh-signed-out': 'warning',
  'press-note': 'notice',
  'press-failed': 'error',
  'hooks-trust': 'error',
  'server-gone': 'error',
  'server-load-failed': 'error',
  'server-builds-differ': 'warning',
  'tab-update-failed': 'warning',
}

/** A message about the inbox's own state, or the turn's stop. Each look draws it as a tinted box, the lead in bold. */
export type BannerView = { kind: BannerKind; tone: BannerTone; lead: string; body: string | null }

/** The banner for `text`. Its first sentence is the lead, and the rest is the body. */
export function bannerOf(kind: BannerKind, text: string): BannerView {
  const end = text.indexOf('. ')
  const lead = end < 0 ? text : text.slice(0, end + 1)
  const body = end < 0 ? null : text.slice(end + 2)

  return { kind, tone: BANNER_TONES[kind], lead, body }
}

/** The stop's banner. Its lead is "Stopped", and its body why, with the fix when Resume cannot continue past it. */
export function stopBanner(stop: Stop): BannerView {
  const why = `${capitalized(stopText(stop))}.`

  return {
    kind: 'stopped',
    tone: BANNER_TONES.stopped,
    lead: 'Stopped',
    body: isResumable(stop) ? why : `${why} ${stopFix(stop)}`,
  }
}

/**
 * The banners under the tab bar, in the order every look draws them: the host's own, then a failed update, then the
 * result of a press whose row the tab no longer shows.
 */
export function tabBarBanners(
  host: BannerView[],
  statusError: string | null,
  pressNote: { text: string; isError: boolean } | null,
): BannerView[] {
  return [
    ...host,
    ...(statusError ? [bannerOf('update-failed', statusError)] : []),
    ...(pressNote ? [bannerOf(pressNote.isError ? 'press-failed' : 'press-note', pressNote.text)] : []),
  ]
}

export const DEMO_NOTICE = 'Sample entries. Buttons here send nothing.'
export const READING_TEXT = 'Reading the inbox…'

/**
 * A checkout that follows the `next` branch can hold this file in each folder a host installs or loads: the repo root,
 * `codex/plugin` and `omp`. Git ignores it, and the Codex and omp installs copy it.
 */
export const NEXT_BUILD_MARK = '.next-build'

export function versionLabel(version: string, isNextBuild: boolean): string {
  return isNextBuild ? `v${version} · next` : `v${version}`
}

export function emptyText(tab: 'needsYou' | 'findings', agent: string): { title: string; hint: string } {
  return tab === 'needsYou'
    ? { title: 'Nothing needed', hint: `${agent}'s questions and the tasks only you can do show up here.` }
    : { title: 'No findings yet', hint: `${agent} flags issues and opportunities it spots beyond your task.` }
}
