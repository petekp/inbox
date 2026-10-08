import { describe, expect, test } from 'claude-code/testing'

import type { Check, Checks } from '../types'
import { addRepo, bandLines, changed, claimAgainst, needsYou, upgradeChecks } from '../hooks/check-tracking'

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
    isSentBack: false,
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
      expect(claimAgainst(checks, 'The tests pass.', root).claim !== null).toBe(isCounted)
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

  test('a dismissed failure leaves the band, and a new run shows again', () => {
    const dismissed = makeCheck({ isDismissed: true })
    expect(bandLines(checksOf([dismissed]), root)).toEqual({ failing: [], summary: [] })
    const rerun = makeCheck({ isDismissed: false })
    expect(bandLines(checksOf([rerun]), root).failing).toEqual([rerun])
  })
})

describe('stale results', () => {
  const stale = (check: Partial<Check>, paths: string[] | null) =>
    changed(checksOf([makeCheck({ result: 'pass', ...check })]), '/work/app', paths, root).results[0]?.isStale

  const cases: [string, Partial<Check>, string[] | null, boolean][] = [
    ['git could not tell', {}, null, true],
    ['a file in the check’s folder changed', { folder: '/work/app/pkg' }, ['pkg/src/a.ts'], true],
    ['the check ran in the session’s folder and any file changed', { folder: null }, ['src/a.ts'], true],
    ['a file elsewhere in the repo changed', { folder: '/work/app/pkg' }, ['other/a.ts'], false],
    ['a folder with the same prefix changed', { folder: '/work/app/pkg' }, ['pkg2/a.ts'], false],
    ['only Markdown changed and the check is tests', { kind: 'tests' }, ['README.md'], false],
    ['only Markdown changed and the check is types', { kind: 'types' }, ['docs/a.MD'], false],
    ['only Markdown changed and the check is a build', { kind: 'build' }, ['README.md'], false],
    ['only Markdown changed and the check is lint', { kind: 'lint' }, ['README.md'], true],
    ['only Markdown changed and the check is validate', { kind: 'validate' }, ['README.md'], true],
    ['only Markdown changed and the check is a check script', { kind: 'all' }, ['README.md'], true],
    ['no file changed', {}, [], false],
    ['another repo changed', { repo: '/work/lib' }, ['a.ts'], false],
  ]

  for (const [label, overrides, paths, isStale] of cases) {
    test(`${label}: ${isStale ? 'stale' : 'current'}`, () => {
      expect(stale(overrides, paths)).toBe(isStale)
    })
  }
})

describe('sending Claude back', () => {
  const reply = 'The tests pass.'

  test('sends back over a failed result once, then lets the reply through', () => {
    const first = claimAgainst(checksOf([makeCheck()]), reply, root)
    expect(first.claim?.problem).toBe('npm test failed when it last ran (1 fail)')
    expect(first.checks.results[0]?.isSentBack).toBe(true)
    expect(claimAgainst(first.checks, reply, root).claim).toBe(null)
  })

  test('sends back over a stale result once', () => {
    const first = claimAgainst(checksOf([makeCheck({ result: 'pass', isStale: true })]), reply, root)
    expect(first.claim?.problem).toBe('the files changed after npm test last ran')
    expect(claimAgainst(first.checks, reply, root).claim).toBe(null)
  })

  test('a new run of the check is sent back again', () => {
    const sent = claimAgainst(checksOf([makeCheck()]), reply, root).checks
    const rerun = { ...sent, results: [makeCheck({ ranAt: 2 })] }
    expect(claimAgainst(rerun, reply, root).claim).not.toBe(null)
  })

  test('skips a result already sent back for the next contradiction', () => {
    const checks = checksOf([
      makeCheck({ name: 'npm test', isSentBack: true }),
      makeCheck({ name: 'tsc', kind: 'types', summary: '2 errors' }),
    ])
    const found = claimAgainst(checks, 'The tests pass. Types are clean.', root)
    expect(found.claim?.problem).toBe('tsc failed when it last ran (2 errors)')
    expect(found.checks.results.map(c => c.isSentBack)).toEqual([true, true])
  })

  test('upgradeChecks gives a saved result no send-back', () => {
    const saved = { results: [{ ...makeCheck(), isSentBack: undefined }], repos: [] } as unknown as Checks
    expect(upgradeChecks(saved).results[0]?.isSentBack).toBe(false)
  })
})
