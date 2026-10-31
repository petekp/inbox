import { expect, test } from 'bun:test'
import * as withSegmenter from '../../hooks/text'

const SAMPLES = [
  'Fix the login flow',
  'Café résumé',
  'é̀ then ä',
  '👨‍👩‍👧 joined the call',
  '👩🏽‍💻 at work, 👍🏿 done',
  '❤️ and ✔︎ marks',
  '漢字のタイトル',
]

async function loadWithoutIntl(): Promise<typeof withSegmenter> {
  const intl = globalThis.Intl
  Reflect.deleteProperty(globalThis, 'Intl')
  try {
    // @ts-expect-error A query makes Bun load a fresh copy, which TypeScript cannot resolve.
    return (await import('../../hooks/text.ts?without-intl')) as typeof withSegmenter
  } finally {
    globalThis.Intl = intl
  }
}

test('without Intl, text cuts where Intl.Segmenter cuts it, for combining marks and joined emoji', async () => {
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
