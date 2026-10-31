import type { RenderSurface } from 'claude-code'
import type { Tab } from '../types'
import type { ModLook } from './rows'
import {
  type BannerTone,
  DARK_BANNER_TINTS,
  DARK_DALTONIZED_TONES,
  DARK_TONES,
  LIGHT_BANNER_TINTS,
  LIGHT_DALTONIZED_TONES,
  LIGHT_TONES,
} from './tones'

const NEEDS_YOU = 'warning'
const DONE = 'success'
const FINDINGS = 'autoAccept'
const PRS = 'planMode'

export type Tone = Tab | 'issue' | 'done' | 'error'
/**
 * The pane's colors in one Claude Code theme. Each text color meets WCAG AA,
 * 4.5:1, on every background the pane draws it on, and each marker meets 3:1.
 */
type Palette = {
  body?: string
  card?: string
  tab?: string
  raised: string
  raisedText?: string
  selection?: string
  muted: string
  age: string
  key: string
  line: string
  selectionLine?: string
  divider: string
  tone: Partial<Record<Tone, string>>
  mark: Record<Tone, string>
  /** A banner's border, and its fill where the palette can tint one. */
  banner: Record<BannerTone, { line: string; fill?: string }>
}

/** Theme keys have no tint of each tone, so banners in these palettes draw their border alone. */
const THEME_KEY_BANNERS: Palette['banner'] = {
  error: { line: 'error' },
  warning: { line: NEEDS_YOU },
  notice: { line: 'inactive' },
}
const DARK_PALETTE: Palette = {
  card: '#373737',
  tab: '#373737',
  raised: '#4c4c4c',
  selection: '#3b4654',
  muted: '#bdbdbd',
  age: '#a3a3a3',
  key: DARK_TONES.key,
  line: '#505050',
  selectionLine: '#5a6f88',
  divider: '#444444',
  tone: DARK_TONES,
  mark: { ...DARK_TONES, error: DARK_TONES.errorMark },
  banner: DARK_BANNER_TINTS,
}
const LIGHT_PALETTE: Palette = {
  card: '#e6e6e6',
  tab: '#e6e6e6',
  raised: '#d0d0d0',
  selection: '#b4d5ff',
  muted: '#595959',
  age: '#666666',
  key: LIGHT_TONES.key,
  line: '#afafaf',
  selectionLine: '#7490b8',
  divider: '#c8c8c8',
  tone: LIGHT_TONES,
  mark: LIGHT_TONES,
  banner: LIGHT_BANNER_TINTS,
}
const DARK_ANSI_PALETTE: Palette = {
  body: 'inverseText',
  raised: 'inactive',
  raisedText: 'inverseText',
  muted: 'inactive',
  age: 'inactive',
  key: 'suggestion',
  line: 'userMessageBackground',
  divider: 'userMessageBackground',
  tone: {},
  mark: { needsYou: NEEDS_YOU, issue: NEEDS_YOU, findings: FINDINGS, prs: PRS, done: DONE, error: 'error' },
  banner: THEME_KEY_BANNERS,
}
const LIGHT_ANSI_PALETTE: Palette = {
  body: 'userMessageBackgroundHover',
  raised: 'text',
  raisedText: 'userMessageBackgroundHover',
  muted: 'inactive',
  age: 'inactive',
  key: 'suggestion',
  line: 'userMessageBackground',
  divider: 'userMessageBackground',
  tone: {},
  mark: { needsYou: 'error', issue: 'error', findings: FINDINGS, prs: 'suggestion', done: DONE, error: 'error' },
  banner: THEME_KEY_BANNERS,
}
const PALETTES: Record<string, Palette> = {
  dark: DARK_PALETTE,
  'dark-daltonized': {
    ...DARK_PALETTE,
    key: DARK_DALTONIZED_TONES.key,
    tone: DARK_DALTONIZED_TONES,
    mark: { ...DARK_DALTONIZED_TONES, error: DARK_DALTONIZED_TONES.errorMark },
  },
  light: LIGHT_PALETTE,
  'light-daltonized': {
    ...LIGHT_PALETTE,
    card: '#dcdcdc',
    tab: '#dcdcdc',
    raised: '#c8c8c8',
    muted: '#545454',
    age: '#5e5e5e',
    key: LIGHT_DALTONIZED_TONES.key,
    divider: '#c0c0c0',
    tone: LIGHT_DALTONIZED_TONES,
    mark: LIGHT_DALTONIZED_TONES,
  },
  'dark-ansi': DARK_ANSI_PALETTE,
  'light-ansi': LIGHT_ANSI_PALETTE,
}
const THEME_KEY_PALETTE: Palette = {
  tab: 'userMessageBackground',
  raised: 'subtle',
  raisedText: 'text',
  muted: 'inactive',
  age: 'inactive',
  key: 'remember',
  line: 'subtle',
  divider: 'subtle',
  tone: {},
  mark: { needsYou: NEEDS_YOU, issue: NEEDS_YOU, findings: FINDINGS, prs: PRS, done: DONE, error: 'error' },
  banner: THEME_KEY_BANNERS,
}
// Theme keys resolve to the app's colors, so the desktop pane draws text in theme keys.
// The app refuses an hsl() alpha or color-mix() color.
export const DESKTOP_AGE = '#85837e'
const DESKTOP_PALETTE: Palette = {
  raised: 'rgba(128, 120, 105, 0.14)',
  raisedText: 'text',
  selection: 'rgba(128, 120, 105, 0.14)',
  muted: 'inactive',
  age: DESKTOP_AGE,
  key: 'remember',
  line: 'subtle',
  divider: 'rgba(128, 128, 128, 0.25)',
  tone: { error: 'error' },
  mark: { needsYou: NEEDS_YOU, issue: NEEDS_YOU, findings: FINDINGS, prs: 'suggestion', done: DONE, error: 'error' },
  banner: {
    error: { line: 'rgba(214, 69, 80, 0.32)', fill: 'rgba(214, 69, 80, 0.1)' },
    warning: { line: 'rgba(212, 160, 23, 0.36)', fill: 'rgba(212, 160, 23, 0.1)' },
    notice: { line: 'rgba(128, 120, 105, 0.28)', fill: 'rgba(128, 120, 105, 0.1)' },
  },
}
/**
 * Mobile and VS Code get the terminal look, which nobody has checked
 * there: docs/reference/claude-desktop-app.md records what is known about those surfaces.
 */
export function lookOf(surface: RenderSurface): ModLook {
  return surface === 'desktop' ? 'desktop' : 'terminal'
}
export function paletteFor(theme: string, look: ModLook): Palette {
  return look === 'desktop' ? DESKTOP_PALETTE : (PALETTES[theme] ?? THEME_KEY_PALETTE)
}
