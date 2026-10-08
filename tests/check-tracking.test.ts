import { describe, expect, test } from 'claude-code/testing'

import type { Check, Checks } from '../types'
import {
  addRepo,
  bandLines,
  changed,
  checkKey,
  claimAgainst,
  dismissed,
  fixSent,
  needsYou,
  recorded,
  upgradeChecks,
} from '../hooks/check-tracking'

function makeCheck(overrides: Partial<Check> = {}): Check {
  return {
    name: 'npm test',
    kind: 'tests',
    folder: null,
    target: { paths: [], filters: [] },
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

  test('upgradeChecks counts the repos of results saved before repos were kept', () => {
    const saved = { results: [makeCheck({ repo: '/work/lib' }), makeCheck({ repo: null })] } as unknown as Checks
    expect(upgradeChecks(saved, root, '/home/me').repos).toEqual(['/work/lib'])
    expect(upgradeChecks({ results: [], repos: ['/work/app'] }, root, '/home/me').repos).toEqual(['/work/app'])
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

describe('stale results across several checks', () => {
  const ran = (kind: Check['kind'], repo: string | null): Check =>
    makeCheck({ name: kind, kind, result: 'pass', repo, folder: repo === null ? null : repo })
  const staleness = (results: Check[], paths: string[]) =>
    changed(checksOf(results), '/work/app', paths, root).results.map(c => c.isStale)

  test('a code change makes the checks in its repo stale, and no others', () => {
    const results = [ran('tests', '/work/app'), ran('lint', '/work/app'), ran('tests', '/work/lib'), ran('tests', null)]
    expect(staleness(results, ['src/a.ts'])).toEqual([true, true, false, false])
  })

  test('a result outside git never goes stale, since no repo owns it', () => {
    const outside = makeCheck({ result: 'pass', repo: null, folder: '/tmp/x' })
    expect(changed(checksOf([outside]), '/work/app', ['src/a.ts'], root).results[0]?.isStale).toBe(false)
  })

  test('a Markdown-only change leaves tests, types and builds current', () => {
    const results = [
      ran('tests', '/work/app'),
      ran('types', '/work/app'),
      ran('lint', '/work/app'),
      ran('all', '/work/app'),
    ]
    expect(staleness(results, ['README.md'])).toEqual([false, false, true, true])
  })
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
    expect(upgradeChecks(saved, root, '/home/me').results[0]?.isSentBack).toBe(false)
  })
})

describe('targets', () => {
  const target = (paths: string[] = [], filters: string[] = []) => ({ paths, filters })
  const a = '/work/app/src/a.ts'
  const src = '/work/app/src'
  const run = (overrides: Partial<Parameters<typeof recorded>[1][number]> = {}) => ({
    name: 'vitest',
    kind: 'tests' as const,
    folder: root,
    result: 'pass' as const,
    summary: '',
    command: 'vitest',
    failures: [],
    repo: root,
    target: target(),
    ...overrides,
  })
  const existing = (result: Check['result'], t = target(), overrides: Partial<Check> = {}) =>
    makeCheck({ name: 'vitest', result, target: t, ...overrides })
  /** Each result as "pass:" for the whole suite, or "fail:<paths and filters>". */
  const after = (results: Check[], ...runs: ReturnType<typeof run>[]) =>
    recorded(checksOf(results), runs, 5, root).results.map(
      c => `${c.result}:${[...c.target.paths, ...c.target.filters].join(',')}`,
    )

  const cases: [string, Check[], ReturnType<typeof run>, string[]][] = [
    ['a whole-suite pass replaces a failure of one file', [existing('fail', target([a]))], run(), ['pass:']],
    [
      'a whole-suite fail replaces a pass of one file',
      [existing('pass', target([a]))],
      run({ result: 'fail' }),
      ['fail:'],
    ],
    [
      'a pass of a file replaces a failure of that file',
      [existing('fail', target([a]))],
      run({ target: target([a]) }),
      [`pass:${a}`],
    ],
    [
      'a pass of a folder replaces a failure of a file below it',
      [existing('fail', target([a]))],
      run({ target: target([src]) }),
      [`pass:${src}`],
    ],
    [
      'a pass of a file leaves a whole-suite failure',
      [existing('fail')],
      run({ target: target([a]) }),
      ['fail:', `pass:${a}`],
    ],
    [
      'a pass of a file leaves a failure of the folder above',
      [existing('fail', target([src]))],
      run({ target: target([a]) }),
      [`fail:${src}`, `pass:${a}`],
    ],
    [
      'a pass of a folder does not cover a sibling with the same prefix',
      [existing('fail', target([`${src}2/b.ts`]))],
      run({ target: target([src]) }),
      [`fail:${src}2/b.ts`, `pass:${src}`],
    ],
    [
      'a pass of one file leaves a failure of another',
      [existing('fail', target([a]))],
      run({ target: target(['/work/app/src/b.ts']) }),
      [`fail:${a}`, 'pass:/work/app/src/b.ts'],
    ],
    [
      'a pass with a filter leaves a failure of the whole file',
      [existing('fail', target([a]))],
      run({ target: target([a], ['-t=x']) }),
      [`fail:${a}`, `pass:${a},-t=x`],
    ],
    [
      'a pass of a file replaces a failure of one test in it',
      [existing('fail', target([a], ['-t=x']))],
      run({ target: target([a]) }),
      [`pass:${a}`],
    ],
    [
      'a pass with the same filters replaces a failure with them',
      [existing('fail', target([], ['-t=x', '-k=y']))],
      run({ target: target([], ['-k=y', '-t=x']) }),
      ['pass:-k=y,-t=x'],
    ],
    [
      'a pass with other filters leaves a failure',
      [existing('fail', target([], ['-t=x']))],
      run({ target: target([], ['-t=y']) }),
      ['fail:-t=x', 'pass:-t=y'],
    ],
    [
      'a filter alone covers the same filter on a file',
      [existing('fail', target([a], ['-t=x']))],
      run({ target: target([], ['-t=x']) }),
      ['pass:-t=x'],
    ],
    [
      'a run with paths never covers a result with none',
      [existing('fail')],
      run({ target: target([a]) }),
      ['fail:', `pass:${a}`],
    ],
    ['another check is left alone', [existing('fail', target(), { name: 'tsc' })], run(), ['fail:', 'pass:']],
    [
      'the same check in another folder is left alone',
      [existing('fail', target(), { folder: '/work/copy' })],
      run(),
      ['fail:', 'pass:'],
    ],
    [
      'a passing check script replaces every result in its folder',
      [existing('fail', target([a]))],
      run({ name: 'check.sh', kind: 'all' }),
      ['pass:'],
    ],
    [
      'an unknown replaces an unknown it covers',
      [existing('unknown', target([a]))],
      run({ result: 'unknown' }),
      ['unknown:'],
    ],
    [
      'an unknown leaves a pass or fail of a broader target',
      [existing('fail')],
      run({ result: 'unknown', target: target([a]) }),
      ['fail:', `unknown:${a}`],
    ],
    [
      'an unknown leaves a pass or fail of a narrower target',
      [existing('pass', target([a]))],
      run({ result: 'unknown' }),
      [`pass:${a}`, 'unknown:'],
    ],
    [
      'an unknown with the target of a known result is not recorded',
      [existing('fail', target([a]))],
      run({ result: 'unknown', target: target([a]) }),
      [`fail:${a}`],
    ],
  ]

  for (const [label, results, ran, expected] of cases) {
    test(label, () => {
      expect(after(results, ran)).toEqual(expected)
    })
  }

  test('a result replaces only the same check in the same folder', () => {
    const plugin = (result: Check['result'], folder: string | null = null) =>
      makeCheck({ name: 'plugin tests', result, folder })
    const ran = (result: Check['result'], folder: string) => run({ name: 'plugin tests', result, folder })
    const state = (results: Check[], ...runs: ReturnType<typeof run>[]) =>
      recorded(checksOf(results), runs, 5, root).results.map(c => [c.folder, c.result])
    expect(state([plugin('pass')], ran('fail', '/work/copy'))).toEqual([
      [null, 'pass'],
      ['/work/copy', 'fail'],
    ])
    expect(state([plugin('fail')], ran('pass', root))).toEqual([[null, 'pass']])
  })

  test('a passing check script replaces every earlier result in its folder, and a failing one none', () => {
    const tsc = makeCheck({ name: 'tsc', kind: 'types', result: 'fail' })
    const copy = makeCheck({ name: 'tsc', kind: 'types', result: 'fail', folder: '/work/copy' })
    const script = (result: Check['result']) => run({ name: 'check.sh', kind: 'all', result })
    const names = (...runs: ReturnType<typeof run>[]) =>
      recorded(checksOf([tsc, copy]), runs, 5, root).results.map(c => `${c.name}:${c.folder}:${c.result}`)
    expect(names(script('pass'))).toEqual(['tsc:/work/copy:fail', 'check.sh:null:pass'])
    expect(names(script('fail'))).toEqual(['tsc:null:fail', 'tsc:/work/copy:fail', 'check.sh:null:fail'])
  })

  test('a result is known by its target, and a whole-suite key is name and folder', () => {
    expect(checkKey(makeCheck())).toBe('.:npm test')
    expect(checkKey(makeCheck({ target: target([a]) }))).not.toBe(checkKey(makeCheck()))
    expect(checkKey(makeCheck({ target: target([], ['x', 'y']) }))).toBe(
      checkKey(makeCheck({ target: target([], ['y', 'x']) })),
    )
  })

  test('dismissing or fixing a result leaves the same check’s other targets alone', () => {
    const whole = makeCheck({ ranAt: 1 })
    const narrow = makeCheck({ ranAt: 1, target: target([a]) })
    const checks = checksOf([whole, narrow])
    expect(dismissed(checks, narrow).results.map(c => c.isDismissed)).toEqual([false, true])
    expect(fixSent(checks, whole, 9).results.map(c => c.fixSentAt)).toEqual([9, null])
  })

  test('upgradeChecks reads a saved result’s target from its command', () => {
    const saved = (command: string, folder: string | null = null) =>
      ({ results: [{ ...makeCheck({ command, folder }), target: undefined }], repos: [] }) as unknown as Checks
    const upgraded = (command: string, folder?: string | null) =>
      upgradeChecks(saved(command, folder), root, '/home/me').results[0]?.target
    expect(upgraded('npx vitest run a.test.ts')).toEqual(target(['/work/app/a.test.ts']))
    expect(upgraded('npx vitest run a.test.ts -t foo', '/work/app/pkg')).toEqual(
      target(['/work/app/pkg/a.test.ts'], ['-t=foo']),
    )
    expect(upgraded('npm test')).toEqual(target())
    expect(upgraded('')).toEqual(target())
    const kept = { results: [makeCheck({ command: 'vitest b.ts', target: target([a]) })], repos: [] }
    expect(upgradeChecks(kept, root, '/home/me').results[0]?.target).toEqual(target([a]))
  })
})

describe('which results contradict a claim', () => {
  const a = { paths: ['/work/app/a.test.ts'], filters: [] }
  const b = { paths: ['/work/app/b.test.ts'], filters: [] }
  /** The problems the Stop hook finds in turn, each result sent back once. */
  const problems = (results: Check[], reply = 'The tests pass.') => {
    const found: string[] = []
    let checks = checksOf(results)
    for (let n = 0; n < 10; n++) {
      const next = claimAgainst(checks, reply, root)
      if (!next.claim) break
      found.push(next.claim.problem)
      checks = next.checks
    }

    return found
  }

  const cases: [string, Check[], string[]][] = [
    [
      'every failure still recorded, latest first',
      [
        makeCheck({ ranAt: 1, target: a, summary: '1 fail' }),
        makeCheck({ ranAt: 3, target: b, summary: '2 fail' }),
        makeCheck({ ranAt: 2, name: 'jest', summary: '3 fail' }),
      ],
      [
        'npm test b.test.ts failed when it last ran (2 fail)',
        'jest failed when it last ran (3 fail)',
        'npm test a.test.ts failed when it last ran (1 fail)',
      ],
    ],
    [
      'an older failure that a later pass of another target did not clear',
      [makeCheck({ ranAt: 1, target: a }), makeCheck({ ranAt: 2, target: b, result: 'pass' })],
      ['npm test a.test.ts failed when it last ran (1 fail)'],
    ],
    [
      'the failures, then the latest result if it is stale',
      [makeCheck({ ranAt: 1, target: a }), makeCheck({ ranAt: 2, target: b, result: 'pass', isStale: true })],
      ['npm test a.test.ts failed when it last ran (1 fail)', 'the files changed after npm test b.test.ts last ran'],
    ],
    [
      'a stale result that is not the latest',
      [
        makeCheck({ ranAt: 1, target: a, result: 'pass', isStale: true }),
        makeCheck({ ranAt: 2, target: b, result: 'pass' }),
      ],
      [],
    ],
    [
      'a latest result that failed and is stale, once',
      [makeCheck({ isStale: true })],
      ['npm test failed when it last ran (1 fail)'],
    ],
    [
      'a failed check script, for a claim of any kind',
      [makeCheck({ name: 'check.sh', kind: 'all', summary: 'x' })],
      ['check.sh failed when it last ran (x)'],
    ],
    ['a failure of another kind', [makeCheck({ name: 'tsc', kind: 'types' })], []],
  ]

  for (const [label, results, expected] of cases) {
    test(label, () => {
      expect(problems(results)).toEqual(expected)
    })
  }
})
