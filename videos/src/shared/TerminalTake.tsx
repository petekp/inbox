import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { cancelRender, continueRender, delayRender, staticFile } from 'remotion'

/** A terminal take's entry in its video's takes.json, which record/cut.py writes from term.py's log. */
export type TerminalTakeInfo = { src: string; kind: 'terminal'; cols: number; rows: number }

/** A terminal take as cut.py writes it. `t` is seconds from the take's first screen. */
export type TerminalClip = {
  cols: number
  rows: number
  /** Each row as tmux captured it, with its colors as escape sequences, and the cursor's column, row and visibility. */
  screens: Screen[]
  keys: { t: number; key: string }[]
  marks: { t: number; mark: string }[]
}

/** One captured screen of a take. */
type Screen = { t: number; lines: string[]; cursor: [number, number, boolean] }

/** The terminal's colors: its default text and background, and the 16 ANSI colors, normal then bright. */
export type Palette = { foreground: string; background: string; ansi: string[] }

/** A dark palette like Terminal.app's, for apps that draw with the terminal's own colors. */
export const DARK_PALETTE: Palette = {
  foreground: '#d4d4d8',
  background: '#16161a',
  ansi: [
    '#1d1d22',
    '#e5534b',
    '#57ab5a',
    '#c69026',
    '#539bf5',
    '#b083f0',
    '#39c5cf',
    '#c5c5cc',
    '#636370',
    '#ff6a63',
    '#6bc46d',
    '#daaa3f',
    '#6cb6ff',
    '#dcbdfb',
    '#56d4dd',
    '#f4f4f6',
  ],
}

/** The font a terminal take draws in, and the size of one cell, in pixels. */
export type TerminalFont = { family: string; size: number; lineHeight: number }
export const TERMINAL_FONT: TerminalFont = { family: 'Menlo, monospace', size: 24, lineHeight: 1.25 }

const loading = new Map<string, Promise<TerminalClip>>()
const loaded = new Map<string, TerminalClip>()

/** Loads a take's clip from public/. A clip not loaded yet holds the render until it has. */
export function useTerminalClip(src: string): TerminalClip | undefined {
  const [clip, setClip] = useState(() => loaded.get(src))
  const [handle] = useState(() => (loaded.has(src) ? undefined : delayRender(`Loading ${src}`)))
  useEffect(() => {
    if (handle === undefined) return
    if (!loading.has(src))
      loading.set(
        src,
        fetch(staticFile(src))
          .then(r => r.json() as Promise<TerminalClip>)
          .then(json => {
            loaded.set(src, json)
            return json
          }),
      )
    loading
      .get(src)!
      .then(json => {
        setClip(json)
        continueRender(handle)
      })
      .catch(err => cancelRender(err))
  }, [src, handle])
  return clip
}

let measure: CanvasRenderingContext2D | undefined
const cellWidths = new Map<string, number>()
/** The width of one cell in the font, measured once per font, so a run of text lands on its columns. */
export function cellWidth(font: TerminalFont): number {
  const key = `${font.size}px ${font.family}`
  let width = cellWidths.get(key)
  if (width === undefined) {
    measure ??= document.createElement('canvas').getContext('2d')!
    measure.font = key
    width = measure.measureText('M'.repeat(100)).width / 100
    cellWidths.set(key, width)
  }
  return width
}

/** The take's size in pixels, drawn in `font`. */
export function terminalSize(clip: { cols: number; rows: number }, font: TerminalFont) {
  return { width: Math.ceil(clip.cols * cellWidth(font)), height: Math.ceil(clip.rows * font.size * font.lineHeight) }
}

/** The screen showing `t` seconds into the take: the last one that has started. */
export function screenAt(clip: TerminalClip, t: number) {
  let shown = clip.screens[0]!
  for (const screen of clip.screens) {
    if (screen.t > t) break
    shown = screen
  }
  return shown
}

/**
 * A terminal take's screen `t` seconds into it, drawn cell by cell from tmux's capture, in the take's own colors.
 * The terminal's background fills the whole grid.
 */
export function TerminalTake(props: {
  src: string
  t: number
  font?: TerminalFont
  palette?: Palette
  showCursor?: boolean
}) {
  const { src, t, font = TERMINAL_FONT, palette = DARK_PALETTE, showCursor = true } = props
  const clip = useTerminalClip(src)
  if (!clip) return null

  const cw = cellWidth(font)
  const lh = font.size * font.lineHeight
  const screen = screenAt(clip, t)
  const [cx, cy, isCursorShown] = screen.cursor
  return (
    <div
      style={{
        position: 'relative',
        width: clip.cols * cw,
        height: clip.rows * lh,
        backgroundColor: palette.background,
        fontFamily: font.family,
        fontSize: font.size,
        lineHeight: `${lh}px`,
        overflow: 'hidden',
      }}
    >
      {screenRuns(screen).map((runs, row) =>
        runs.map(run => (
          <div
            key={`${row}-${run.col}`}
            style={{
              position: 'absolute',
              left: run.col * cw,
              top: row * lh,
              width: run.cells * cw,
              height: lh,
              whiteSpace: 'pre',
              textAlign: run.isWide ? 'center' : undefined,
              ...styleOf(run.style, palette),
            }}
          >
            {run.text}
          </div>
        )),
      )}
      {showCursor && isCursorShown && (
        <div
          style={{
            position: 'absolute',
            left: cx * cw,
            top: cy * lh,
            width: cw,
            height: lh,
            backgroundColor: palette.foreground,
            opacity: 0.8,
          }}
        />
      )}
    </div>
  )
}

/** A cell's look, as the escape sequences before it set it. Colors are an ANSI index or a CSS color. */
type Style = {
  fg?: number | string
  bg?: number | string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  inverse?: boolean
  strike?: boolean
}

/** A stretch of cells in one style. A wide or uncommon glyph gets a run of its own, centered in its cells. */
type Run = { col: number; cells: number; text: string; style: Style; isWide: boolean }

/** Characters drawn in their own run, since a fallback font may give them another width than the cell. */
const isPlain = (ch: string) => ch >= ' ' && ch <= '~'

/** How many cells a character takes, as a terminal counts them. */
function widthOf(ch: string): number {
  if (/\p{M}/u.test(ch)) return 0
  if (/\p{Emoji_Presentation}/u.test(ch)) return 2
  const code = ch.codePointAt(0)!
  const isWide =
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd)
  return isWide ? 2 : 1
}

const runsByScreen = new WeakMap<Screen, Run[][]>()
/** Each row of a screen split into runs, once per screen. */
function screenRuns(screen: Screen): Run[][] {
  let runs = runsByScreen.get(screen)
  if (!runs) {
    runs = screen.lines.map(runsOf)
    runsByScreen.set(screen, runs)
  }
  return runs
}

/** Splits one captured row into runs, applying its SGR sequences and dropping other escapes, such as OSC 8 links. */
export function runsOf(line: string): Run[] {
  const runs: Run[] = []
  let style: Style = {}
  let col = 0
  let current: Run | undefined
  const flush = () => {
    if (current && current.text.length > 0) runs.push(current)
    current = undefined
  }
  const tokens = line.match(/\x1b\[[0-9;:]*m|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[^[\]]|[\s\S]/gu) ?? []
  for (const token of tokens) {
    if (token.startsWith('\x1b[') && token.endsWith('m')) {
      flush()
      style = applySgr(style, token.slice(2, -1))
      continue
    }
    if (token.startsWith('\x1b')) continue
    const cells = widthOf(token)
    if (cells === 0) {
      if (current) current.text += token
      continue
    }
    if (isPlain(token)) {
      if (!current || current.isWide) {
        flush()
        current = { col, cells: 0, text: '', style, isWide: false }
      }
      current.text += token
      current.cells += 1
    } else {
      flush()
      current = { col, cells, text: token, style, isWide: true }
      flush()
    }
    col += cells
  }
  flush()
  return runs
}

function applySgr(style: Style, params: string): Style {
  const codes = params === '' ? [0] : params.split(/[;:]/).map(Number)
  let next = { ...style }
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]!
    if (c === 0) next = {}
    else if (c === 1) next.bold = true
    else if (c === 2) next.dim = true
    else if (c === 3) next.italic = true
    else if (c === 4) next.underline = true
    else if (c === 7) next.inverse = true
    else if (c === 9) next.strike = true
    else if (c === 22) next.bold = next.dim = false
    else if (c === 23) next.italic = false
    else if (c === 24) next.underline = false
    else if (c === 27) next.inverse = false
    else if (c === 29) next.strike = false
    else if (c >= 30 && c <= 37) next.fg = c - 30
    else if (c >= 90 && c <= 97) next.fg = c - 90 + 8
    else if (c === 39) delete next.fg
    else if (c >= 40 && c <= 47) next.bg = c - 40
    else if (c >= 100 && c <= 107) next.bg = c - 100 + 8
    else if (c === 49) delete next.bg
    else if (c === 38 || c === 48) {
      const key = c === 38 ? 'fg' : 'bg'
      if (codes[i + 1] === 5) {
        next[key] = codes[i + 2]!
        i += 2
      } else if (codes[i + 1] === 2) {
        next[key] = `rgb(${codes[i + 2]}, ${codes[i + 3]}, ${codes[i + 4]})`
        i += 4
      }
    }
  }
  return next
}

/** An ANSI color index as CSS: the 16 from the palette, then the 6×6×6 cube and the grays. */
function colorOf(color: number | string, palette: Palette): string {
  if (typeof color === 'string') return color
  if (color < 16) return palette.ansi[color]!
  if (color < 232) {
    const n = color - 16
    const level = (v: number) => (v === 0 ? 0 : 55 + v * 40)
    return `rgb(${level(Math.floor(n / 36))}, ${level(Math.floor(n / 6) % 6)}, ${level(n % 6)})`
  }
  const gray = 8 + (color - 232) * 10
  return `rgb(${gray}, ${gray}, ${gray})`
}

function styleOf(style: Style, palette: Palette): CSSProperties {
  const fg = style.fg === undefined ? palette.foreground : colorOf(style.fg, palette)
  const bg = style.bg === undefined ? undefined : colorOf(style.bg, palette)
  const [text, back] = style.inverse ? [bg ?? palette.background, fg] : [fg, bg]
  return {
    color: text,
    backgroundColor: back,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : undefined,
    opacity: style.dim ? 0.6 : undefined,
    textDecoration:
      [style.underline && 'underline', style.strike && 'line-through'].filter(Boolean).join(' ') || undefined,
  }
}
