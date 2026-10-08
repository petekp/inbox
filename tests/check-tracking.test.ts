import { describe, expect, test } from 'claude-code/testing'

import type { Check, Checks } from '../types'
import { addRepo, bandLines, claimAgainst, needsYou, upgradeChecks } from '../hooks/check-tracking'

function makeCheck(overrides: Partial<Check> = {}): Check {
  return {
    name: 'npm test',
    kind: 'tests',
    folder: null,
    result: 'fail',
    summary: '1 fail',
    ranAt: 1,
    repo: '/work/app',
    isStale: false,
    command: 'npm test',
    failures: [],
    isLeftFailing: true,
    isDismissed: false,
    fixSentAt: null,
    ...overrides,
  }
}

const root = '/work/app'
const checksOf = (results: Check[], repos: string[] = [root]): Checks => ({ results, repos })

describe('the session’s repos', () => {
  test('addRepo adds a repo once', () => {
    const once = addRepo(checksOf([], []), '/work/app')
    expect(once.repos).toEqual(['/work/app'])
    expect(addRepo(once, '/work/app')).toBe(once)
    expect(addRepo(once, '/work/lib').repos).toEqual(['/work/app', '/work/lib'])
  })

  test('upgradeChecks gives saved state no repos', () => {
    const saved = { results: [] } as unknown as Checks
    expect(upgradeChecks(saved).repos).toEqual([])
  })

  const cases: [string, Partial<Check>, boolean][] = [
    ['a result in the session’s repo', { repo: '/work/app' }, true],
    ['a result in a repo the session edited', { repo: '/work/lib' }, true],
    ['a result in another repo', { repo: '/work/other' }, false],
    ['a result outside git, in the session’s folder', { repo: null, folder: null }, true],
    ['a result outside git, in the session’s folder by path', { repo: null, folder: '/work/app' }, true],
    ['a result outside git, below the session’s folder', { repo: null, folder: '/work/app/sub' }, true],
    ['a result outside git, in a sibling with the same prefix', { repo: null, folder: '/work/app2' }, false],
    ['a result outside git, elsewhere', { repo: null, folder: '/tmp/x' }, false],
  ]

  for (const [label, overrides, isCounted] of cases) {
    test(`${label} ${isCounted ? 'counts' : 'does not count'}`, () => {
      const checks = checksOf([makeCheck(overrides)], ['/work/app', '/work/lib'])
      expect(needsYou(checks, root).rows).toHaveLength(isCounted ? 1 : 0)
      expect(bandLines(checks, root).failing).toHaveLength(isCounted ? 1 : 0)
      expect(claimAgainst(checks, 'The tests pass.', root) !== null).toBe(isCounted)
    })
  }
})

describe('band lines', () => {
  test('a failing result shows on its own line and not in the summary', () => {
    const fail = makeCheck({ name: 'npm test', result: 'fail' })
    const pass = makeCheck({ name: 'tsc', result: 'pass' })
    const unknown = makeCheck({ name: 'lint', result: 'unknown' })
    const lines = bandLines(checksOf([fail, pass, unknown]), root)
    expect(lines.failing.map(c => c.name)).toEqual(['npm test'])
    expect(lines.summary.map(c => c.name)).toEqual(['tsc', 'lint'])
  })
})
