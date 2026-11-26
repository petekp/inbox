import type { RenderSurface } from 'claude-code'
import type { Tab } from '../../types'
import type { ModLook } from '../../core/view/rows'
import {
  type BannerTone,
  DARK_BANNER_TINTS,
  DARK_DALTONIZED_TONES,
  DARK_TONES,
  LIGHT_BANNER_TINTS,
  LIGHT_DALTONIZED_TONES,
  LIGHT_TONES,
  FAINT_TEXT,
  faintOver,
  SUPPORTING_TEXT,
  supportingOver,
  MUTED_TEXT,
  THEME_BACKGROUND,
  THEME_TEXT,
} from '../../core/view/tones'

const NEEDS_YOU = 'warning'
const OPPORTUNITY = 'success'
const DONE = 'suggestion'
/** The theme key of the text color, which a working mark draws in. */
export const WORKING = 'text'
const ISSUE = 'error'
const FINDINGS = 'autoAccept'
const TASKS = FINDINGS
const PRS = 'planMode'

export type Tone = Tab | 'tasks' | 'issue' | 'done' | 'success' | 'opportunity' | 'working' | 'error'
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
  /** The supporting text level, a step brighter than `muted`: `core/view/tones.ts:supportingOver`. */
  supporting: string
  /** The faint text level, a step below `muted`: `core/view/tones.ts:faintOver`. */
  faint: string
  /** Faint text on `selection`, as `selectionLine` is a connector there: `core/view/tones.ts:faintOver` over it. */
  selectionFaint?: string
  age: string
  key: string
  line: string
  selectionLine?: string
  divider: string
  tone: Partial<Record<Tone, string>>
  mark: Record<Tone, string>
  /** The background a palette of hex colors is drawn for, which a fade moves toward. Theme keys have none. */
  under?: string
  /** The text color of a palette of hex colors, which a title's tint fades toward. */
  text?: string
  /** A banner's border, and its fill where the palette can tint one. */
  banner: Record<BannerTone, { line: string; fill?: string }>
}

/** Theme keys have no tint of each tone, so banners in these palettes draw their border alone. */
const THEME_KEY_BANNERS: Palette['banner'] = {
  error: { line: 'error' },
  warning: { line: NEEDS_YOU },
  notice: { line: 'remember' },
  ask: { line: 'remember' },
}
const DARK_SELECTION = '#3b4654'
const LIGHT_SELECTION = '#b4d5ff'
const DARK_PALETTE: Palette = {
  under: THEME_BACKGROUND.dark,
  text: THEME_TEXT.dark,
  card: '#373737',
  tab: '#373737',
  raised: '#4c4c4c',
  selection: DARK_SELECTION,
  muted: MUTED_TEXT.dark,
  supporting: SUPPORTING_TEXT.dark,
  faint: FAINT_TEXT.dark,
  age: '#a3a3a3',
  key: DARK_TONES.key,
  line: '#505050',
  selectionLine: '#5a6f88',
  selectionFaint: faintOver(MUTED_TEXT.dark, DARK_SELECTION),
  divider: '#444444',
  tone: DARK_TONES,
  mark: { ...DARK_TONES, working: WORKING, error: DARK_TONES.errorMark },
  banner: DARK_BANNER_TINTS,
}
const LIGHT_PALETTE: Palette = {
  under: THEME_BACKGROUND.light,
  text: THEME_TEXT.light,
  card: '#e6e6e6',
  tab: '#e6e6e6',
  raised: '#d0d0d0',
  selection: LIGHT_SELECTION,
  muted: MUTED_TEXT.light,
  supporting: SUPPORTING_TEXT.light,
  faint: FAINT_TEXT.light,
  age: '#666666',
  key: LIGHT_TONES.key,
  line: '#afafaf',
  selectionLine: '#7490b8',
  selectionFaint: faintOver(MUTED_TEXT.light, LIGHT_SELECTION),
  divider: '#c8c8c8',
  tone: LIGHT_TONES,
  mark: { ...LIGHT_TONES, working: WORKING },
  banner: LIGHT_BANNER_TINTS,
}
const DARK_ANSI_PALETTE: Palette = {
  body: 'inverseText',
  raised: 'inactive',
  raisedText: 'inverseText',
  muted: 'inactive',
  supporting: 'inactive',
  faint: 'inactive',
  age: 'inactive',
  key: 'suggestion',
  line: 'userMessageBackground',
  divider: 'userMessageBackground',
  tone: {},
  mark: {
    needsYou: NEEDS_YOU,
    issue: ISSUE,
    findings: FINDINGS,
    tasks: TASKS,
    prs: PRS,
    done: DONE,
    success: OPPORTUNITY,
    opportunity: OPPORTUNITY,
    working: WORKING,
    error: 'error',
  },
  banner: THEME_KEY_BANNERS,
}
const LIGHT_ANSI_PALETTE: Palette = {
  body: 'userMessageBackgroundHover',
  raised: 'text',
  raisedText: 'userMessageBackgroundHover',
  muted: 'inactive',
  supporting: 'inactive',
  faint: 'inactive',
  age: 'inactive',
  key: 'suggestion',
  line: 'userMessageBackground',
  divider: 'userMessageBackground',
  tone: {},
  // Red, magenta, blue, green and text: the theme's yellow and cyan fall under 3:1 on bright white, so a wait and an issue
  // share red here.
  mark: {
    needsYou: 'error',
    issue: ISSUE,
    findings: FINDINGS,
    tasks: TASKS,
    prs: 'suggestion',
    done: DONE,
    success: OPPORTUNITY,
    opportunity: OPPORTUNITY,
    working: WORKING,
    error: 'error',
  },
  banner: THEME_KEY_BANNERS,
}
const PALETTES: Record<string, Palette> = {
  dark: DARK_PALETTE,
  'dark-daltonized': {
    ...DARK_PALETTE,
    key: DARK_DALTONIZED_TONES.key,
    tone: DARK_DALTONIZED_TONES,
    mark: { ...DARK_DALTONIZED_TONES, working: WORKING, error: DARK_DALTONIZED_TONES.errorMark },
  },
  light: LIGHT_PALETTE,
  'light-daltonized': {
    ...LIGHT_PALETTE,
    card: '#dcdcdc',
    tab: '#dcdcdc',
    raised: '#c8c8c8',
    muted: '#545454',
    supporting: supportingOver('#545454', THEME_TEXT.light),
    faint: faintOver('#545454', THEME_BACKGROUND.light),
    selectionFaint: faintOver('#545454', LIGHT_SELECTION),
    age: '#5e5e5e',
    key: LIGHT_DALTONIZED_TONES.key,
    divider: '#c0c0c0',
    tone: LIGHT_DALTONIZED_TONES,
    mark: { ...LIGHT_DALTONIZED_TONES, working: WORKING },
  },
  'dark-ansi': DARK_ANSI_PALETTE,
  'light-ansi': LIGHT_ANSI_PALETTE,
}
const THEME_KEY_PALETTE: Palette = {
  tab: 'userMessageBackground',
  raised: 'subtle',
  raisedText: 'text',
  muted: 'inactive',
  supporting: 'inactive',
  faint: 'inactive',
  age: 'inactive',
  key: 'remember',
  line: 'subtle',
  divider: 'subtle',
  tone: {},
  mark: {
    needsYou: NEEDS_YOU,
    issue: ISSUE,
    findings: FINDINGS,
    tasks: TASKS,
    prs: PRS,
    done: DONE,
    success: OPPORTUNITY,
    opportunity: OPPORTUNITY,
    working: WORKING,
    error: 'error',
  },
  banner: THEME_KEY_BANNERS,
}
// Theme keys resolve to the app's colors, so the desktop pane draws text in theme keys.
// The app refuses an hsl() alpha or color-mix() color.
const DESKTOP_AGE = '#85837e'
/**
 * One translucent color serves both of the app's themes: faint text reads 3:1 on white and on the dark page, #191919.
 */
const DESKTOP_FAINT = 'rgba(123, 121, 116, 0.8)'
/** Faint text on the selection fill: 3:1 on it over white and over the dark page. */
const DESKTOP_SELECTION_FAINT = 'rgba(123, 121, 116, 0.88)'
/**
 * Needs-you text in the app's own `warning` key draws amber, so a count would not match the orange mark beside it. The
 * app resolves a hex the same in both its themes, so one orange serves: 4.7:1 on the dark page, 3.7:1 on white.
 */
const DESKTOP_NEEDS_YOU = '#cf6a00'
const DESKTOP_PALETTE: Palette = {
  raised: 'rgba(128, 120, 105, 0.14)',
  raisedText: 'text',
  selection: 'rgba(128, 120, 105, 0.14)',
  muted: 'inactive',
  // A theme key cannot be mixed, and no one color sits between the app's muted and text colors in both its themes.
  supporting: 'inactive',
  faint: DESKTOP_FAINT,
  selectionFaint: DESKTOP_SELECTION_FAINT,
  age: DESKTOP_AGE,
  key: 'remember',
  // The tree lines. One alpha serves both of the app's themes, about as strong as the Codex tab's and Herdr's tree lines.
  line: 'rgba(128, 128, 128, 0.45)',
  divider: 'rgba(128, 128, 128, 0.25)',
  tone: { error: 'error', needsYou: DESKTOP_NEEDS_YOU },
  mark: {
    needsYou: NEEDS_YOU,
    issue: ISSUE,
    findings: FINDINGS,
    tasks: TASKS,
    prs: PRS,
    done: DONE,
    success: OPPORTUNITY,
    opportunity: OPPORTUNITY,
    working: WORKING,
    error: 'error',
  },
  banner: {
    error: { line: 'rgba(214, 69, 80, 0.32)', fill: 'rgba(214, 69, 80, 0.1)' },
    warning: { line: 'rgba(212, 160, 23, 0.36)', fill: 'rgba(212, 160, 23, 0.1)' },
    // Halfway between the terminal's light and dark key tones, as one tint serves both of the app's themes.
    notice: { line: 'rgba(106, 122, 247, 0.36)', fill: 'rgba(106, 122, 247, 0.1)' },
    ask: { line: 'rgba(106, 122, 247, 0.36)', fill: 'rgba(106, 122, 247, 0.1)' },
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
