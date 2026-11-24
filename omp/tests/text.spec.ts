import { expect, test } from 'bun:test'
import * as withSegmenter from '../../core/domain/text'

const SAMPLES = [
  'Fix the login flow',
  'Café résumé',
  'é̀ then ä',
  '👨‍👩‍👧 joined the call',
  '👩🏽‍💻 at work, 👍🏿 done',
  '❤️ and ✔︎ marks',
  '漢字のタイトル',
  '🇯🇵 and 🇺🇸🇬🇧',
  '🇺🇸🇬🇧🇫 odd run',
  '🏴󠁧󠁢󠁳󠁣󠁴󠁿 Scotland',
  '한국어 제목'.normalize('NFD'),
  '한 하ᅡ 한ᅡ',
  'ᅡᆫ and ꥠힰퟋ',
  'می‌خواهم',
  'ｶﾞｷﾞ ﾊﾟ',
  'น้ำ ຄຳ',
]

test('drawable text drops every terminal control and escape sequence, and keeps tabs, newlines and every character a reader sees', () => {
  const cases: [string, string][] = [
    ['Red \x1b[31mtext\x1b[0m', 'Red text'],
    ['copy\x1b]52;c;aGk=\x07 this', 'copy this'],
    ['a \x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\ here', 'a link here'],
    ['\x1bPq#0;2;0;0;0\x1b\\sixel', 'sixel'],
    ['\x9b2Jcleared \x9d0;title\x9c', 'cleared '],
    ['reset\x1bc and \x1b(Bcharset', 'reset and charset'],
    ['stray\x1b', 'stray'],
    ['bell\x07, back\x08space, del\x7f', 'bell, backspace, del'],
    ['line\r\nnext\rover', 'line\nnextover'],
    ['keep\tthe tab\nand line', 'keep\tthe tab\nand line'],
    [SAMPLES.join(' '), SAMPLES.join(' ')],
  ]
  for (const [text, drawn] of cases) expect(withSegmenter.drawableText(text)).toBe(drawn)
})

async function loadWithoutIntl(): Promise<typeof withSegmenter> {
  const intl = globalThis.Intl
  Reflect.deleteProperty(globalThis, 'Intl')
  try {
    // @ts-expect-error
    return (await import('../../core/domain/text.ts?without-intl')) as typeof withSegmenter
  } finally {
    globalThis.Intl = intl
  }
}

test('without Intl, text cuts where Intl.Segmenter cuts it, for combining marks, joined emoji, flags and Hangul jamo', async () => {
  const fallback = await loadWithoutIntl()
  for (const text of SAMPLES) {
    const cells = withSegmenter.cellWidth(text)
    expect(fallback.cellWidth(text)).toBe(cells)
    for (let n = 0; n <= cells; n += 1) expect(fallback.cutToCells(text, n)).toBe(withSegmenter.cutToCells(text, n))
    for (let max = 1; max <= text.length + 1; max += 1) {
      const fits = (line: string) => line.length <= max
      expect(fallback.cutForEllipsis(text, fits)).toBe(withSegmenter.cutForEllipsis(text, fits))
    }
  }
})
