const ch = (code: number) => String.fromCodePoint(code)
const ZWJ = ch(0x200d)
const VS16 = ch(0xfe0f)
const ESC = ch(0x1b)

/** Why a drawn text was cut inside a character or a sequence, or null. */
export function glyphCut(t: string): string | null {
  for (let i = 0; i < t.length; i++) {
    const code = t.charCodeAt(i)
    const isHigh = code >= 0xd800 && code <= 0xdbff
    const isLow = code >= 0xdc00 && code <= 0xdfff
    const next = t.charCodeAt(i + 1)
    if (isHigh && !(next >= 0xdc00 && next <= 0xdfff)) return `half a surrogate pair at ${i}`
    if (isHigh) i++
    else if (isLow) return `half a surrogate pair at ${i}`
  }
  if (t.endsWith(ZWJ) || t.includes(`${ZWJ}…`)) return 'cut after a zero-width joiner'
  if (/^\p{M}/u.test(t)) return 'starts with a combining mark'
  if (t.startsWith(VS16)) return 'starts with a variation selector'

  return null
}

const BAD = ['NaN', 'undefined', '[object Object]', 'Infinity']

/** A token no input holds that only a bug draws, or null. */
export function badText(t: string, input: string): string | null {
  return BAD.find(b => t.includes(b) && !input.includes(b)) ?? null
}

/** Whether a terminal line holds an escape the panel's own style did not write. The fuzzer draws with a plain style. */
/** The reset omp's `cutText` puts after its ellipsis, so a style cut mid-line ends there. */
const RESET = `${ESC}[0m`

/** Whether a line drawn with plain styles holds an escape the panel did not write. */
export const hasRawEscape = (line: string): boolean => line.split(RESET).join('').includes(ESC)
