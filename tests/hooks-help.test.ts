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

test('Timeline Help names task selection and branch keys, and the supported looks list the tab in a normal build', () => {
  for (const look of ['terminal', 'codex', 'omp'] as const) {
    const keys = helpKeys(look, false, 'timeline', false, true)
    expect(keys.map(key => key.keys)).toContain('h l')
    expect(keys.some(key => /task/.test(key.does))).toBe(true)
  }
})
