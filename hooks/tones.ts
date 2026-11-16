/**
 * `success` is the green of a met goal and a PR that is ready to merge. It is the same green as `opportunity`, since both
 * mean something good, and neither shares a mark with the other.
 */
export type ToneName =
  'needsYou' | 'issue' | 'findings' | 'prs' | 'done' | 'success' | 'opportunity' | 'working' | 'error'

type ToneSet = Record<ToneName, string> & {
  /**
   * A marker in the error color. A marker needs only 3:1, so in dark it takes a stronger red than text could. `issue`
   * is a marker only, so it takes this red.
   */
  errorMark: string
  key: string
}

const DARK_AMBER = '#ffc107'
export const DARK_TONES: ToneSet = {
  needsYou: DARK_AMBER,
  issue: '#ff6b80',
  findings: '#cab0ff',
  prs: '#8cc8c0',
  done: '#82c1ff',
  success: '#7ecd8f',
  opportunity: '#7ecd8f',
  working: '#ffffff',
  error: '#ffa3b0',
  errorMark: '#ff6b80',
  key: '#b1b9f9',
}

const LIGHT_AMBER = '#745417'
export const LIGHT_TONES: ToneSet = {
  needsYou: LIGHT_AMBER,
  issue: '#a5293d',
  findings: '#7b00e8',
  prs: '#006363',
  done: '#0a54a0',
  success: '#25652f',
  opportunity: '#25652f',
  working: '#1a1a1a',
  error: '#a5293d',
  errorMark: '#a5293d',
  key: '#243bf5',
}

const DARK_DALTONIZED_AMBER = '#ffcc00'
export const DARK_DALTONIZED_TONES: ToneSet = {
  needsYou: DARK_DALTONIZED_AMBER,
  issue: '#ff6666',
  findings: '#cab0ff',
  prs: '#a3c2c2',
  done: '#82c1ff',
  success: '#5cf0aa',
  opportunity: '#5cf0aa',
  working: '#ffffff',
  error: '#ffa3a3',
  errorMark: '#ff6666',
  key: '#99ccff',
}

const LIGHT_DALTONIZED_AMBER = '#7a4900'
export const LIGHT_DALTONIZED_TONES: ToneSet = {
  needsYou: LIGHT_DALTONIZED_AMBER,
  issue: '#ad0000',
  findings: '#7400db',
  prs: '#2d5a5a',
  done: '#005885',
  success: '#17602b',
  opportunity: '#17602b',
  working: '#1a1a1a',
  error: '#ad0000',
  errorMark: '#ad0000',
  key: '#003ae8',
}

export function toneColors(tone: ToneName): { light: string; dark: string } {
  return { light: LIGHT_TONES[tone], dark: DARK_TONES[tone] }
}

/**
 * What a banner says: an action failed or the inbox cannot work until something changes, part of it is missing or out
 * of date, a fact, or a question the person answers with the banner's buttons.
 */
export type BannerTone = 'error' | 'warning' | 'notice' | 'ask'

/** A banner's border and fill in a terminal. The fill sits inside the border, so the border is a step stronger. */
type BannerTint = { line: string; fill: string }

/** A fact and a question share one blue, mixed from `DARK_TONES.key`. */
const DARK_BLUE_TINT: BannerTint = { line: '#5d5f73', fill: '#3a3b44' }

export const DARK_BANNER_TINTS: Record<BannerTone, BannerTint> = {
  error: { line: '#7a4a52', fill: '#3d2a2e' },
  warning: { line: '#6e5a2c', fill: '#3a3322' },
  notice: DARK_BLUE_TINT,
  ask: DARK_BLUE_TINT,
}

/** Mixed from `LIGHT_TONES.key`. */
const LIGHT_BLUE_TINT: BannerTint = { line: '#bcc3fb', fill: '#eef0fe' }

export const LIGHT_BANNER_TINTS: Record<BannerTone, BannerTint> = {
  error: { line: '#d9a3ab', fill: '#f8e9eb' },
  warning: { line: '#d6c19a', fill: '#f6efe1' },
  notice: LIGHT_BLUE_TINT,
  ask: LIGHT_BLUE_TINT,
}

/** The backgrounds a terminal theme is drawn for. A terminal does not report its own, so a fade moves toward these. */
export const THEME_BACKGROUND = { dark: '#1e1e1e', light: '#ffffff' }
/** Muted text over `THEME_BACKGROUND`, in the terminal's light and dark palettes and in omp's. */
export const MUTED_TEXT = { dark: '#bdbdbd', light: '#595959' }

/** `hex` at `share` of its strength over `under`, as one opaque color, for a fade a terminal draws in steps. */
export function fadedOver(hex: string, under: string, share: number): string {
  const channel = (c: string, i: number) => Number.parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16)
  const mixed = [0, 1, 2].map(i => Math.round(channel(hex, i) * share + channel(under, i) * (1 - share)))

  return `#${mixed.map(c => c.toString(16).padStart(2, '0')).join('')}`
}
