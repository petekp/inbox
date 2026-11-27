import {
  DARK_BANNER_TINTS,
  DARK_TONES,
  fadedOver,
  LIGHT_BANNER_TINTS,
  LIGHT_TONES,
  MUTED_TEXT,
  THEME_TEXT,
} from '../../core/view/tones'
import type { Style, Tone } from './panel'

/** The slice of omp's theme the panel's style uses. omp 18 says `isLight`, and omp 19.2 says `dark` instead. */
type OmpTheme = ({ isLight: boolean } | { dark: boolean }) & {
  bold(text: string): string
  inverse(text: string): string
  underline(text: string): string
  fg(color: 'accent' | 'statusLineSep', text: string): string
}

const ESC = '\x1b['

function rgbOf(hex: string): string {
  return [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16)).join(';')
}

function truecolor(hex: string, text: string): string {
  return `${ESC}38;2;${rgbOf(hex)}m${text}${ESC}39m`
}

function truecolorFill(hex: string, text: string): string {
  return `${ESC}48;2;${rgbOf(hex)}m${text}${ESC}49m`
}

/** Maps the panel's styles onto omp's theme. The separator and the accent follow the theme; the tones follow `core/view/tones.ts`. */
export function styleOf(theme: OmpTheme): Style {
  const isLight = 'isLight' in theme ? theme.isLight : !theme.dark
  const tones = isLight ? LIGHT_TONES : DARK_TONES
  const mode = isLight ? 'light' : 'dark'
  const tints = isLight ? LIGHT_BANNER_TINTS : DARK_BANNER_TINTS

  return {
    bold: theme.bold.bind(theme),
    dim: text => `${ESC}2m${text}${ESC}22m`,
    inverse: theme.inverse.bind(theme),
    underline: theme.underline.bind(theme),
    tone: (name: Tone, text) =>
      name === 'sep' || name === 'accent'
        ? theme.fg(name === 'sep' ? 'statusLineSep' : 'accent', text)
        : name === 'working'
          ? text
          : truecolor(tones[name], text),
    banner: (tone, part, text) =>
      part === 'line' ? truecolor(tints[tone].line, text) : truecolorFill(tints[tone].fill, text),
    tint: (tone, share, text, rest = null) =>
      truecolor(
        fadedOver(
          tone === 'key'
            ? tones.key
            : tone === 'muted'
              ? MUTED_TEXT[mode]
              : tones[tone === 'error' ? 'errorMark' : 'done'],
          rest === 'dim'
            ? MUTED_TEXT[mode]
            : rest && rest !== 'sep' && rest !== 'accent'
              ? tones[rest]
              : THEME_TEXT[mode],
          share,
        ),
        text,
      ),
  }
}
