import { cellWidth } from './text'
// About how many characters of desktop's proportional text fit in one column of `bodyColumns`: sentences and
// the tab labels run 1.23 to 1.30, bold or not.
export const DESKTOP_CHARS_PER_CELL = 1.25
// A lower guess for text that must stay one line, since desktop wraps text that is too long.
export const DESKTOP_CLIP_CHARS_PER_CELL = 1.1
// The widest character in each group, in points, in the pane's 13 pt system font as AppKit measures it. Any other
// character counts as the widest group, so an estimate is never narrower than the text.
const DESKTOP_CHAR_GROUPS: [chars: string, pt: number][] = [
  ["ijl|I ',.:;/\\!", 4],
  ['ftr()[]{}', 4.9],
  ['aceksvxyz-*"`?1J', 7.4],
  ['bdghnopqu_EFL27', 7.95],
  ['ABKPRSTVXYZ0345689#$+<=>^~', 8.8],
  ['CDGHNOQUw&', 10],
]
const DESKTOP_CHAR_PT = new Map(DESKTOP_CHAR_GROUPS.flatMap(([chars, pt]) => [...chars].map(c => [c, pt] as const)))
const DESKTOP_WIDEST_CHAR_PT = 12.6
/** An emoji or a wide East Asian character, which a terminal draws in two cells. */
const DESKTOP_WIDE_CHAR_PT = 17
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
/** Desktop cuts a label wider than its control, so a control is sized from each character's width. */
export function desktopTextPt(text: string): number {
  let pt = 0
  for (const { segment } of graphemes.segment(text)) {
    const cells = cellWidth(segment)
    pt +=
      cells === 0 ? 0 : cells === 2 ? DESKTOP_WIDE_CHAR_PT : (DESKTOP_CHAR_PT.get(segment) ?? DESKTOP_WIDEST_CHAR_PT)
  }
  return pt
}
// A native Button's padding around its label, in points. Measured in the 0.3.0 release pass's capture, taken at 2 px
// per pt and with the app version not recorded: a primary "Merge" is 66.0 pt wide with a 40.0 pt label, so 26 pt
// of padding, and a default "Open PR" is 94.5 pt wide with a 55.0 pt label, an 8 pt icon and a 6 pt gap, so 25.5 pt.
const DESKTOP_BUTTON_PADDING_PT = 26
// How much wider a primary Button's label draws than `desktopTextPt` counts it. Measured on an earlier app: a primary
// "Plain (recommended)" was 163 to 167 pt wide with a 130 pt label, so at most 11 pt of the 37 pt beyond the label is
// the bolder weight, 8.5% of the label. The newer app's primary labels were not measured past "Merge".
const DESKTOP_PRIMARY_LABEL_WIDENING = 0.085
/** The most points a native Button with `label` is as wide as. A primary Button's bolder label counts wider. */
export function desktopButtonPt(label: string, isPrimary: boolean): number {
  const labelPt = desktopTextPt(label)
  return labelPt * (isPrimary ? 1 + DESKTOP_PRIMARY_LABEL_WIDENING : 1) + DESKTOP_BUTTON_PADDING_PT
}
/**
 * The words of `text` in lines `widthPt` wide. A word wider than a line starts a line and breaks between characters, so
 * it counts every line it takes. `desktopTextPt` never counts a line narrower than desktop draws it, so desktop needs no
 * more lines.
 */
export function desktopLines(text: string, widthPt: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ').filter(Boolean)) {
    const longer = line ? `${line} ${word}` : word
    if (desktopTextPt(longer) <= widthPt) {
      line = longer
      continue
    }
    if (line) lines.push(line)
    line = word
    while (desktopTextPt(line) > widthPt) {
      const head = longestStart(line, widthPt)
      lines.push(head)
      line = line.slice(head.length)
    }
  }
  if (line) lines.push(line)
  return lines
}
/** The longest start of `text` that fits `widthPt`, and at least its first character. */
function longestStart(text: string, widthPt: number): string {
  let head = ''
  for (const { segment } of graphemes.segment(text)) {
    if (head && desktopTextPt(head + segment) > widthPt) break
    head += segment
  }
  return head
}
