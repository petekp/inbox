import { CLOSED_MARKS } from './help'
import { RUNNING_PULSE_MS } from './view'
import { ROW_PAD_PT } from './layout'
import { markShape, mutedMarkShape } from './marks'
import { DARK_TONES, LIGHT_TONES, toneColors, type ToneName } from './tones'
import {
  DESKTOP_CELL_PT,
  DESKTOP_LINE_PT,
  DESKTOP_MARK_CELLS,
  FRAME_INSET_PT,
  UNDO_CELLS,
  UNDO_HEIGHT_PT,
} from './pane-sizes'
import { DESKTOP_AGE } from './palettes'

/**
 * The app draws an Svg as an image, which runs SMIL animation, so the fill moves
 * without the pane redrawing. An image cannot read the app's theme, so it follows the color scheme instead.
 */
export function undoSvg(fraction: number, leftMs: number): string {
  const width = UNDO_CELLS * DESKTOP_CELL_PT
  const height = UNDO_HEIGHT_PT
  const left = (width * fraction).toFixed(1)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>.used{fill:rgba(255,255,255,0.6)}.left{fill:rgba(0,0,0,0.06)}.edge{fill:none;stroke:rgba(0,0,0,0.1)}` +
    `text{fill:#0b0b0b}@media (prefers-color-scheme: dark){.used{fill:rgba(255,255,255,0.05)}` +
    `.left{fill:rgba(255,255,255,0.1)}.edge{stroke:none}text{fill:#f0efec}}</style>` +
    `<clipPath id="shape"><rect width="${width}" height="${height}" rx="6"/></clipPath>` +
    `<g clip-path="url(#shape)"><rect class="used" width="${width}" height="${height}"/>` +
    `<rect class="left" width="${left}" height="${height}">` +
    `<animate attributeName="width" from="${left}" to="0" dur="${leftMs}ms" fill="freeze"/></rect></g>` +
    `<rect class="edge" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="5.5"/>` +
    `<text x="${width / 2}" y="${height / 2}" dominant-baseline="central" text-anchor="middle" ` +
    `font-family="-apple-system, system-ui, sans-serif" font-size="14">↺ Undo</text></svg>`
  )
}
/**
 * Text draws one color in both
 * appearances, which the mod cannot read, but an Svg follows the system's light or dark setting, so this takes the
 * shared tone for each, as the Codex tab does.
 */
export function toneSvg(tone: ToneName, mark: string): string {
  const { light, dark } = toneColors(tone)
  // A marker needs only 3:1, so an error mark takes a stronger red than text could.
  const shape = markShape(mark, DESKTOP_LINE_PT / 2)
  return tone === 'error'
    ? markSvg(mark, shape, LIGHT_TONES.errorMark, DARK_TONES.errorMark)
    : markSvg(mark, shape, light, dark)
}
/** A muted mark's color in an Svg, in the light and dark appearances. */
export const MUTED_MARK = { light: '#595959', dark: '#a8a8a8' }
/** A mark in an Svg `cells` wide: its `shape` when it has one, else its text. */
export function markSvg(mark: string, shape: string | null, lightMark: string, darkMark: string, cells = 1): string {
  const width = cells * DESKTOP_CELL_PT
  const height = DESKTOP_LINE_PT
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>text{font-family:-apple-system,system-ui,sans-serif;font-size:14px;fill:currentColor}` +
    `.mark{color:${lightMark}}` +
    `@media (prefers-color-scheme: dark){.mark{color:${darkMark}}}</style>` +
    (shape === null
      ? `<text class="mark" x="0" y="${height / 2}" dominant-baseline="central">${escapeXml(mark)}</text>`
      : `<g class="mark">${shape}</g>`) +
    `</svg>`
  )
}
/** The pane's ● and ○ glyphs, as measured in the app: 11 pt across, centred 6.55 pt into the mark column. */
const MARK_GLYPH_PT = 11
const MARK_GLYPH_MID_PT = 6.55
export const RUNNING_SVG_CELLS = 2
/**
 * A muted mark the pane draws as a shape, and the cells its Svg takes, or null for one it draws as text. The ✗ fits one
 * cell. The ◌ ring is as wide as the font's ○, so it takes the running mark's two cells and sits where ○ sits.
 */
export function mutedMarkSvg(mark: string, light: string, dark: string): { source: string; cells: number } | null {
  const shape = mutedMarkShape(mark, DESKTOP_LINE_PT / 2)
  if (shape === null) return null
  if (mark === CLOSED_MARKS.lapsed) return { source: markSvg(mark, shape, light, dark), cells: 1 }
  const placed = `<g transform="translate(${MARK_GLYPH_MID_PT - 4} 0)">${shape}</g>`
  return { source: markSvg(mark, placed, light, dark, RUNNING_SVG_CELLS), cells: RUNNING_SVG_CELLS }
}
/** A result mark and the space after it, as wide as a running mark's Svg on desktop. */
export const RESULT_MARK_CELLS = RUNNING_SVG_CELLS
/**
 * A running mark on desktop: a dot that fades and returns. SMIL runs it, since a pane redraw loop stops clicks there.
 * Each pane redraw starts the animation again, so it begins at the clock's point in the pulse.
 */
export function runningSvg(now: number): string {
  const width = RUNNING_SVG_CELLS * DESKTOP_CELL_PT
  const height = DESKTOP_LINE_PT
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>.mark{fill:${MUTED_MARK.light}}@media (prefers-color-scheme: dark){.mark{fill:${MUTED_MARK.dark}}}</style>` +
    `<circle class="mark" cx="${MARK_GLYPH_MID_PT}" cy="${height / 2}" r="${MARK_GLYPH_PT / 2}">` +
    `<animate attributeName="opacity" values="1;0.3;1" dur="${RUNNING_PULSE_MS}ms" begin="-${now % RUNNING_PULSE_MS}ms" repeatCount="indefinite"/>` +
    `</circle></svg>`
  )
}
function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
/**
 * It is an Svg, the
 * only icon the pane can draw, sized to the fold line, so it sits in the mark column at the line's middle.
 */
export function chevronSvg(isUnfolded: boolean, isHover: boolean): string {
  const width = FRAME_INSET_PT + DESKTOP_MARK_CELLS * DESKTOP_CELL_PT
  const height = 2 * ROW_PAD_PT + DESKTOP_LINE_PT
  const x = FRAME_INSET_PT - DESKTOP_CELL_PT + 0.5
  const y = height / 2
  const points = isUnfolded
    ? `${x},${y - 2} ${x + 3.5},${y + 1.5} ${x + 7},${y - 2}`
    : `${x + 1.5},${y - 3.5} ${x + 5},${y} ${x + 1.5},${y + 3.5}`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    (isHover
      ? `<style>polyline{stroke:#0b0b0b}@media (prefers-color-scheme: dark){polyline{stroke:#f0efec}}</style>`
      : `<style>polyline{stroke:${DESKTOP_AGE}}</style>`) +
    `<polyline points="${points}" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  )
}
