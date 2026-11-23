import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import {
  DARK_DALTONIZED_TONES,
  DARK_TONES,
  fadedOver,
  FAINT_TEXT,
  FAINT_TEXT_CONTRAST,
  faintOver,
  LIGHT_DALTONIZED_TONES,
  LIGHT_TONES,
  MUTED_TEXT,
  THEME_BACKGROUND,
} from '../core/view/tones'

const luminance = (hex: string) => {
  const [r = 0, g = 0, b = 0] = [0, 1, 2].map(i => {
    const c = Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: string, b: string) => {
  const [lighter = 0, darker = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

const MARKER_TONES = new Set(['issue', 'errorMark'])

test('every tone reads over its theme’s background at 4.5:1, a marker-only tone at 3:1, and muted text at 4.5:1', () => {
  const themes = [
    [DARK_TONES, THEME_BACKGROUND.dark],
    [LIGHT_TONES, THEME_BACKGROUND.light],
    [DARK_DALTONIZED_TONES, THEME_BACKGROUND.dark],
    [LIGHT_DALTONIZED_TONES, THEME_BACKGROUND.light],
  ] as const
  const unreadable = themes.flatMap(([tones, background]) =>
    Object.entries(tones).filter(([name, hex]) => contrast(hex, background) < (MARKER_TONES.has(name) ? 3 : 4.5)),
  )
  expect(unreadable).toEqual([])
  expect(contrast(MUTED_TEXT.dark, THEME_BACKGROUND.dark) >= 4.5).toBe(true)
  expect(contrast(MUTED_TEXT.light, THEME_BACKGROUND.light) >= 4.5).toBe(true)
})

test('a faded color is the color at full share, the color under it at none, and each channel’s mix between', () => {
  expect(fadedOver('#ff8000', '#000000', 1)).toBe('#ff8000')
  expect(fadedOver('#ff8000', '#000000', 0)).toBe('#000000')
  expect(fadedOver('#ff8000', '#204060', 0.5)).toBe('#906030')
})

test('faint text reads at the faint contrast, under muted text, and is muted where muted already reads at it or less', () => {
  for (const mode of ['dark', 'light'] as const) {
    const ratio = contrast(FAINT_TEXT[mode], THEME_BACKGROUND[mode])
    expect(ratio >= FAINT_TEXT_CONTRAST && ratio < FAINT_TEXT_CONTRAST + 0.1).toBe(true)
    expect(ratio < contrast(MUTED_TEXT[mode], THEME_BACKGROUND[mode])).toBe(true)
  }
  expect(faintOver('#8e8f90', '#ffffff')).toBe('#8e8f90')
})
