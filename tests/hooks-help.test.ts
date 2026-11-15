import { expect, test } from 'claude-code/testing'
import { helpKeys } from '../hooks/help'

test('document reader keys appear in Help where the host takes keys', () => {
  for (const look of ['terminal', 'codex', 'omp'] as const) {
    const keys = helpKeys(look, false, 'findings', false)
    expect(keys.map(key => key.keys)).toContain('v')
    expect(keys.map(key => key.keys)).toContain('b')
    expect(keys.some(key => /j k.*↑ ↓|↑ ↓ j k/.test(key.keys))).toBe(true)
  }
  for (const look of ['codex', 'omp'] as const)
    expect(helpKeys(look, false, 'findings', false).find(key => key.keys === 'esc')?.does).toContain(
      'return from a report',
    )
  expect(helpKeys('desktop', false, 'findings', false)).toEqual([])
})
