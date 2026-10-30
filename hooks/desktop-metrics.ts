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
// A native Button's padding around its label, and its bolder primary label, measured live: 163 to 167 pt for
// "Plain (recommended)", whose label is 130 pt in the regular weight.
export const DESKTOP_BUTTON_EXTRA_PT = 38
/** Desktop cuts a label wider than its control, so a control is sized from each character's width. */
export function desktopTextPt(text: string): number {
  let pt = 0
  for (const c of text) pt += DESKTOP_CHAR_PT.get(c) ?? DESKTOP_WIDEST_CHAR_PT
  return pt
}
/** The words of `text` in lines `widthPt` wide. `desktopTextPt` never counts a line narrower than desktop draws it, so desktop needs no more lines. */
export function desktopLines(text: string, widthPt: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ').filter(Boolean)) {
    const longer = line ? `${line} ${word}` : word
    if (line && desktopTextPt(longer) > widthPt) {
      lines.push(line)
      line = word
    } else line = longer
  }
  if (line) lines.push(line)
  return lines
}
