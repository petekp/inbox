import { expect, test } from 'bun:test'

import { modBuiltAt } from '../../hooks/herdr-install'
import { BUILT_AT_LINE, stampedBundle } from '../stamp'

const unstamped = (code: string) => `// Built by herdr/build.ts\n${BUILT_AT_LINE}\n${code}`
const EARLIER = '2026-11-01T00:00:00.000Z'
const NOW = '2026-11-11T00:00:00.000Z'

test('a build keeps the written bundle’s time when its code is unchanged, and takes the time now otherwise', () => {
  const written = stampedBundle(unstamped('draw()'), null, EARLIER)

  expect(modBuiltAt(written)).toBe(EARLIER)
  expect(stampedBundle(unstamped('draw()'), written, NOW)).toBe(written)
  expect(modBuiltAt(stampedBundle(unstamped('drawMore()'), written, NOW))).toBe(NOW)
  expect(modBuiltAt(stampedBundle(unstamped('draw()'), written.slice(0, -1), NOW))).toBe(NOW)
})
