export type ToneName = 'needsYou' | 'issue' | 'findings' | 'prs' | 'done' | 'error'

export type ToneSet = Record<ToneName, string> & {
  /** A marker in the error color. A marker needs only 3:1, so in dark it takes a stronger red than text could. */
  errorMark: string
  key: string
}

const DARK_AMBER = '#ffc107'
export const DARK_TONES: ToneSet = {
  needsYou: DARK_AMBER,
  issue: DARK_AMBER,
  findings: '#cab0ff',
  prs: '#8cc8c0',
  done: '#7ecd8f',
  error: '#ffa3b0',
  errorMark: '#ff6b80',
  key: '#b1b9f9',
}

const LIGHT_AMBER = '#745417'
export const LIGHT_TONES: ToneSet = {
  needsYou: LIGHT_AMBER,
  issue: LIGHT_AMBER,
  findings: '#7b00e8',
  prs: '#006363',
  done: '#25652f',
  error: '#a5293d',
  errorMark: '#a5293d',
  key: '#243bf5',
}

const DARK_DALTONIZED_AMBER = '#ffcc00'
export const DARK_DALTONIZED_TONES: ToneSet = {
  needsYou: DARK_DALTONIZED_AMBER,
  issue: DARK_DALTONIZED_AMBER,
  findings: '#cab0ff',
  prs: '#a3c2c2',
  done: '#82c1ff',
  error: '#ffa3a3',
  errorMark: '#ff6666',
  key: '#99ccff',
}

const LIGHT_DALTONIZED_AMBER = '#7a4900'
export const LIGHT_DALTONIZED_TONES: ToneSet = {
  needsYou: LIGHT_DALTONIZED_AMBER,
  issue: LIGHT_DALTONIZED_AMBER,
  findings: '#7400db',
  prs: '#2d5a5a',
  done: '#005885',
  error: '#ad0000',
  errorMark: '#ad0000',
  key: '#003ae8',
}

export function toneColors(tone: ToneName): { light: string; dark: string } {
  return { light: LIGHT_TONES[tone], dark: DARK_TONES[tone] }
}

/** What a banner says: the inbox cannot work until something changes, part of it is missing or out of date, or a fact. */
export type BannerTone = 'error' | 'warning' | 'notice'

/** A banner's border and fill in a terminal. The fill sits inside the border, so the border is a step stronger. */
export type BannerTint = { line: string; fill: string }

export const DARK_BANNER_TINTS: Record<BannerTone, BannerTint> = {
  error: { line: '#7a4a52', fill: '#3d2a2e' },
  warning: { line: '#6e5a2c', fill: '#3a3322' },
  notice: { line: '#505050', fill: '#333333' },
}

export const LIGHT_BANNER_TINTS: Record<BannerTone, BannerTint> = {
  error: { line: '#d9a3ab', fill: '#f8e9eb' },
  warning: { line: '#d6c19a', fill: '#f6efe1' },
  notice: { line: '#c8c8c8', fill: '#efefef' },
}
