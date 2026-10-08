import { describe, expect, test } from 'claude-code/testing'

import type { Check, Checks } from '../types'
import { checkName, checkRuns, checksIn, claimsIn, failureLines, failureSummary, readResults } from '../hooks/checks'
import { contradictedClaim, markStale, recordCheck } from '../hooks/check-tracking'
import { candidates, changedPaths, readChanged, readLsTree } from '../hooks/git'

describe('checksIn', () => {
  test('finds each check in a compound command, once', () => {
    const command =
      'cd mods/x && claude plugin test . > t.log 2>&1; echo "test exit $?"; npx -y -p typescript tsc --noEmit -p . > c.log 2>&1; echo "tsc exit $?"'
    expect(checksIn(command).map(c => c.name)).toEqual(['plugin tests', 'tsc'])
  })

  test('ignores commands that only read or print, and checks named inside quotes', () => {
    expect(checksIn('cat t.log | grep pass')).toEqual([])
    expect(checksIn('echo "run bun test later"')).toEqual([])
    expect(checksIn('git commit -m "Fix tsc errors and jest setup"')).toEqual([])
    expect(checksIn('until ! pgrep -x xcodebuild >/dev/null; do sleep 5; done')).toEqual([])
    expect(checksIn('if ! pgrep -x xcodebuild >/dev/null; then echo idle; fi')).toEqual([])
    expect(checksIn('for f in a b; do grep tsc $f; done')).toEqual([])
    expect(checksIn('kill $(pgrep -x xcodebuild)')).toEqual([])
  })

  test('names a package-manager script by its full script name', () => {
    expect(checksIn('npm run lint:css')).toEqual([{ name: 'lint:css', kind: 'lint' }])
    expect(checksIn('pnpm -C app run lint')).toEqual([{ name: 'lint', kind: 'lint' }])
    expect(checksIn('npm run test:unit -- a.test.ts')).toEqual([{ name: 'npm test:unit', kind: 'tests' }])
    expect(checksIn('yarn build:prod')).toEqual([{ name: 'yarn build:prod', kind: 'build' }])
    expect(checksIn('npm run typecheck:app')).toEqual([{ name: 'typecheck:app', kind: 'types' }])
  })

  test('names common runners by kind, behind a package manager’s options', () => {
    expect(checksIn('npm run build')).toEqual([{ name: 'npm build', kind: 'build' }])
    expect(checksIn('./scripts/validate.sh')).toEqual([{ name: 'validate.sh', kind: 'validate' }])
    expect(checksIn('./scripts/check.sh')).toEqual([{ name: 'check.sh', kind: 'all' }])
    expect(checksIn('npm --prefix /work/app test > t.log 2>&1')).toEqual([{ name: 'npm test', kind: 'tests' }])
    expect(checksIn('pnpm -C app run lint')).toEqual([{ name: 'lint', kind: 'lint' }])
  })
})

describe('checkRuns', () => {
  const runs = (command: string) => checkRuns(command, '/work/repo', '/home/me')
  const folder = (command: string) => runs(command)[0]?.folder

  test('follows cd, variables the command set, and the folder a check names', () => {
    expect(folder('npm test')).toBe('/work/repo')
    expect(folder('cd mods/x && claude plugin test . > t.log 2>&1')).toBe('/work/repo/mods/x')
    expect(folder('S=/tmp/copy; cp -R . "$S" && claude plugin test $S > $S.log 2>&1')).toBe('/tmp/copy')
    expect(folder('npm --prefix ../app test')).toBe('/work/app')
    expect(folder('npx -y -p typescript tsc --noEmit -p ~/app/tsconfig.json')).toBe('/home/me/app')
  })

  test('is null when the command hides the folder', () => {
    expect(folder('cd - && npm test')).toBe(null)
    expect(folder('claude plugin test $COPY')).toBe(null)
    expect(folder('cd "$(git rev-parse --show-toplevel)" && npm test')).toBe(null)
  })

  describe('target', () => {
    const none = { paths: [], filters: [] }
    const cases: [string, { paths?: string[]; filters?: string[] }][] = [
      ['npm test', none],
      ['vitest run', none],
      ['vitest run a.test.ts', { paths: ['/work/repo/a.test.ts'] }],
      [
        'npx vitest run src/a.test.ts src/b.test.ts --reporter dot',
        { paths: ['/work/repo/src/a.test.ts', '/work/repo/src/b.test.ts'] },
      ],
      ['vitest run -t "parses dates"', { filters: ['-t=parses dates'] }],
      ['vitest --testNamePattern=parses', { filters: ['--testNamePattern=parses'] }],
      ['jest --testPathPattern auth', { filters: ['--testPathPattern=auth'] }],
      ['pytest tests/ -k date -x -q', { paths: ['/work/repo/tests'], filters: ['-k=date'] }],
      ['pytest -v --tb short --color=yes', none],
      ['jest --bail --ci --coverage --silent', none],
      ['npm test -- --coverage', none],
      ['npm test -- a.test.ts > t.log 2>&1', { paths: ['/work/repo/a.test.ts'] }],
      ['npm run test:unit -- -t foo', { filters: ['-t=foo'] }],
      ['bun test src/a.test.ts', { paths: ['/work/repo/src/a.test.ts'] }],
      ['go test ./...', none],
      ['go test ./pkg/... -run TestX', { paths: ['/work/repo/pkg'], filters: ['-run=TestX'] }],
      ['cargo test parses_dates', { filters: ['parses_dates'] }],
      ['cargo test --manifest-path app/Cargo.toml foo', { filters: ['foo'] }],
      ['npm --prefix app test src/a.test.ts', { paths: ['/work/repo/app/src/a.test.ts'] }],
      ['claude plugin test mods/x', none],
      ['claude plugin test mods/x > t.log 2>&1', none],
      ['npx tsc --noEmit -p tsconfig.json', none],
      ['tsc --noEmit --strict', { filters: ['--strict'] }],
      ['prettier --check .', none],
      ['prettier --check src', { filters: ['src'] }],
      ['eslint src/ --max-warnings 0', { paths: ['/work/repo/src'], filters: ['--max-warnings', '0'] }],
      ['ruff check .', none],
      ['golangci-lint run ./...', none],
      ['cd app && vitest run a.test.ts', { paths: ['/work/repo/app/a.test.ts'] }],
      ['vitest run /work/repo ./', none],
      ['vitest run ../other/a.test.ts', { paths: ['/work/other/a.test.ts'] }],
      ['vitest run ~/b.test.ts', { paths: ['/home/me/b.test.ts'] }],
      ['vitest run a.test.ts < in.txt', { paths: ['/work/repo/a.test.ts'] }],
      // A path the mod cannot resolve is kept as written, so the run never clears a failure by mistake.
      ['vitest run $X/a.test.ts', { filters: ['$X/a.test.ts'] }],
      ['cd - && vitest run a.test.ts', { filters: ['a.test.ts'] }],
    ]

    for (const [command, expected] of cases) {
      test(command, () => {
        expect(runs(command)[0]?.target).toEqual({ ...none, ...expected })
      })
    }
  })

  test('gives each run of a check its own folder', () => {
    expect(runs('claude plugin test . ; claude plugin test /tmp/copy').map(r => r.folder)).toEqual([
      '/work/repo',
      '/tmp/copy',
    ])
  })

  test('a result replaces only the same check in the same folder', () => {
    const at = (folder: string | null, result: Check['result']): Check => ({
      name: 'plugin tests',
      kind: 'tests',
      folder,
      target: { paths: [], filters: [] },
      result,
      summary: '',
      ranAt: 1,
      repo: '/work/repo',
      isStale: false,
      command: '',
      failures: [],
      isLeftFailing: false,
      isDismissed: false,
      isSentBack: false,
      fixSentAt: null,
    })
    expect(recordCheck([at(null, 'pass')], at('/work/copy', 'fail'))).toHaveLength(2)
    expect(recordCheck([at(null, 'fail')], at(null, 'pass'))).toEqual([at(null, 'pass')])
  })

  test('a passing check script replaces every earlier result in its folder', () => {
    const tsc: Check = {
      name: 'tsc',
      kind: 'types',
      folder: null,
      target: { paths: [], filters: [] },
      result: 'fail',
      summary: '',
      ranAt: 1,
      repo: null,
      isStale: false,
      command: '',
      failures: [],
      isLeftFailing: false,
      isDismissed: false,
      isSentBack: false,
      fixSentAt: null,
    }
    const copy: Check = { ...tsc, folder: '/work/copy' }
    const script = (result: Check['result']): Check => ({ ...tsc, name: 'check.sh', kind: 'all', result })
    expect(recordCheck([tsc, copy], script('pass'))).toEqual([copy, script('pass')])
    expect(recordCheck([tsc], script('fail'))).toEqual([tsc, script('fail')])
  })
})

describe('checkName', () => {
  const named = (overrides: Partial<Check>) =>
    checkName(
      {
        name: 'vitest',
        kind: 'tests',
        folder: null,
        target: { paths: [], filters: [] },
        result: 'fail',
        summary: '',
        ranAt: 1,
        repo: null,
        isStale: false,
        command: '',
        failures: [],
        isLeftFailing: false,
        isDismissed: false,
        isSentBack: false,
        fixSentAt: null,
        ...overrides,
      },
      '/work/repo',
    )

  test('shows the target after the name, with paths relative to the check’s folder', () => {
    expect(named({})).toBe('vitest')
    expect(named({ target: { paths: ['/work/repo/a.test.ts'], filters: [] } })).toBe('vitest a.test.ts')
    expect(named({ target: { paths: ['/work/repo/src/a.test.ts'], filters: ['-t=parses dates'] } })).toBe(
      'vitest src/a.test.ts -t=parses dates',
    )
    expect(named({ folder: '/work/app', target: { paths: ['/work/app/a.test.ts'], filters: [] } })).toBe(
      'vitest a.test.ts in app',
    )
    expect(named({ target: { paths: ['/work/other/a.test.ts'], filters: [] } })).toBe('vitest /work/other/a.test.ts')
  })
})

describe('failureLines', () => {
  test('keeps the lines that name a failing test or an error, at most three', () => {
    const bun = [
      '(pass) parses dates',
      '(fail) parses times [2ms]',
      '  AssertionError: expected 3 to be 4',
      ' 1 fail',
    ].join('\n')
    expect(failureLines(bun)).toEqual(['(fail) parses times [2ms]', 'AssertionError: expected 3 to be 4'])
    const tsc = [1, 2, 3, 4].map(n => `src/a.ts(${n},1): error TS2322: Type 'x' is not assignable.`).join('\n')
    expect(failureLines(tsc)).toHaveLength(3)
    expect(failureLines('Done in 2s')).toEqual([])
  })

  test('a failure in one line names the file, even from another of its lines, and what failed', () => {
    const failed = (failures: string[]): Check => ({
      name: 'tests',
      kind: 'tests',
      folder: null,
      target: { paths: [], filters: [] },
      result: 'fail',
      summary: 'exit 1',
      ranAt: 1,
      repo: null,
      isStale: false,
      command: '',
      failures,
      isLeftFailing: true,
      isDismissed: false,
      isSentBack: false,
      fixSentAt: null,
    })
    expect(
      failureSummary(
        failed(["hooks/register.tsx(2310,7): error TS2322: Type 'string' is not assignable to 'number'."]),
      ),
    ).toEqual({ file: 'register.tsx:2310', text: "Type 'string' is not assignable to 'number'." })
    const vitest = [
      '× parses a dated heading 3ms',
      'FAIL  |node| tests/markdown/parse.test.ts > headings > parses a dated heading',
    ]
    expect(failureSummary(failed(vitest))).toEqual({ file: 'parse.test.ts', text: 'parses a dated heading' })
    // Go names a package, not a file, and its first line is a bare FAIL.
    expect(failureSummary(failed(['FAIL', 'FAIL\texample.com/app/message\t0.698s']))).toEqual({
      file: null,
      text: 'example.com/app/message',
    })
    expect(failureSummary(failed([]))).toEqual({ file: null, text: 'exit 1' })
  })
})

describe('readResults', () => {
  const runs = (command: string) => checkRuns(command, '/work/repo', '/home/me')
  const results = (command: string, output: string) =>
    readResults(command, runs(command), output, false).map(r => r.result)
  const result = (command: string, output: string) => results(command, output)[0]
  test('a check run twice in one command is unknown, since its output mixes both runs', () => {
    const command = 'claude plugin test . | grep pass; claude plugin test /tmp/copy | grep pass'
    expect(readResults(command, runs(command), ' 48 pass\n 0 fail\n 47 pass\n 1 fail\n', false)).toEqual([
      { call: { name: 'plugin tests', kind: 'tests' }, result: 'unknown', summary: 'ran 2 times in one command' },
    ])
  })

  test('a labeled exit line decides each check', () => {
    const command = 'bun test > t.log; echo "test exit $?"; tsc > c.log; echo "tsc exit $?"'
    expect(results(command, 'test exit 0\ntsc exit 2\n')).toEqual(['pass', 'fail'])
    // The runner's own line wins over another runner's line that also says "test".
    const both = 'python3 -m unittest > u.log; echo "unittest exit $?"; bun test | tail -4; echo "bun exit $?"'
    expect(result(both, 'unittest exit 1\nbun exit 0\n 7 pass\n 0 fail\n')).toBe('pass')
    // A label names its check by whole words, so "go" is not in "golangci-lint".
    const go = 'golangci-lint run > l.log; echo "golangci-lint exit $?"; go test ./... > t.log; echo "go test exit $?"'
    expect(results(go, 'golangci-lint exit 1\ngo test exit 0\n')).toEqual(['fail', 'pass'])
    // A runner's name can end in what the check does, as eslint's does for the lint script.
    const lint = 'pnpm run typecheck > tc.log; echo "TSC EXIT=$?"; pnpm run lint > es.log; echo "ESLINT EXIT=$?"'
    expect(results(lint, 'TSC EXIT=0\nESLINT EXIT=1\n')).toEqual(['pass', 'fail'])
    const build = 'go build ./... > b.log 2>&1; echo "build exit=$?"'
    expect(result(build, 'build exit=0\n')).toBe('pass')
    // A continued line and a pipe inside $(...) stay in the check's piece, so its echo is the next one.
    const xcode =
      'xcodebuild test-without-building \\\n  -xctestrun $(ls *.xctestrun | head -1) > x.log; echo "test exit $?"'
    expect(result(xcode, 'test exit 65\n')).toBe('fail')
  })

  test('a lone check that ends the command is decided by its exit status; counts describe it', () => {
    const [failed] = readResults('bun test', runs('bun test'), ' 24 pass\n 1 fail\nRan 25 tests across 3 files.', true)
    expect(failed).toMatchObject({ result: 'fail', summary: '24 pass, 1 fail' })
    // A test named after errors does not fail a clean run.
    const [passed] = readResults('bun test', runs('bun test'), '(pass) reports 2 errors\n 25 pass\n 0 fail\n', false)
    expect(passed).toMatchObject({ result: 'pass', summary: '25 pass, 0 fail' })
  })

  test('reads an exit status printed as exit=N or by a bare echo', () => {
    const command = 'npm test > /tmp/t.log 2>&1; echo "exit=$?"'
    expect(result(command, 'exit=1')).toBe('fail')
    const bare = 'npm test > /tmp/t.log 2>&1; echo $?'
    expect(result(bare, '1\n')).toBe('fail')
  })

  test('output sent to a file with no exit status shown is unknown', () => {
    const command = 'npm test > /tmp/t.log 2>&1; echo done'
    expect(result(command, 'done')).toBe('unknown')
  })

  test('a filtered command without counts is unknown, since the exit status is the filter’s', () => {
    const [r] = readResults('npm run build | tail -3', runs('npm run build | tail -3'), 'done in 2s', false)
    expect(r?.result).toBe('unknown')
    expect(result('npm run build | tail -3; echo "exit $?"', 'done in 2s\nexit 0\n')).toBe('unknown')
    expect(result('set -o pipefail; npm run build | tail -3; echo "exit $?"', 'done in 2s\nexit 1\n')).toBe('fail')
  })

  test('failure words another command printed do not fail a lone check', () => {
    // The runner's own tally decides it.
    const node = 'node --test 2>&1 | grep "^ℹ"; node verify.mjs | grep FAIL'
    expect(result(node, 'ℹ pass 40\nℹ fail 0\nFAIL demo asset missing\n')).toBe('pass')
    // tsc fails only on its own "error TS" lines.
    const tsc = 'npx tsc --noEmit && echo OK; npm run check:all 2>&1 | tail -3'
    expect(result(tsc, 'FAIL — 1 guidance claim does not resolve\n7 passed\n')).toBe('unknown')
    expect(result(tsc, ' 40 pass\n 2 fail\n')).toBe('unknown')
    expect(result(tsc, "src/a.ts(1,1): error TS2322: Type 'x' is not assignable.\n")).toBe('fail')
    // ESLint's "problems" include warnings, which fail only past --max-warnings.
    const lint = 'npx eslint src | tail -3'
    expect(result(lint, '✖ 316 problems (0 errors, 316 warnings)\n')).toBe('pass')
    expect(result(lint, '✖ 2 problems (0 errors, 2 warnings)\nESLint found too many warnings (maximum: 0).\n')).toBe(
      'fail',
    )
  })
})

describe('claimsIn', () => {
  const cases: [string, string, boolean][] = [
    ['a plain claim', 'All tests pass', true],
    ['a phrase in double quotes', 'Your reply says "tests pass"', false],
    ['a phrase in curly double quotes', 'Your reply says “tests pass”', false],
    ['a phrase in backticks', 'The line `tests pass` is in the log', false],
    ['a claim beside a quoted phrase', 'The "unit" tests pass', true],
    ['a claim outside the quotes', 'I changed "build" and all tests pass', true],
    ['an apostrophe', "Pete's tests pass", true],
    ['single quotes', "The 'tests pass' line is a claim", true],
  ]

  for (const [label, reply, isClaim] of cases) {
    test(`${label} ${isClaim ? 'is' : 'is not'} a claim`, () => {
      expect(claimsIn(reply).map(c => c.kind)).toEqual(isClaim ? ['tests'] : [])
    })
  }
})

describe('contradictedClaim', () => {
  const ran = (result: Check['result'], isStale = false): Check => ({
    name: 'bun test',
    kind: 'tests',
    folder: null,
    target: { paths: [], filters: [] },
    result,
    summary: result === 'fail' ? '2 fail' : '',
    ranAt: 10,
    repo: '/work/repo',
    isStale,
    command: '',
    failures: [],
    isLeftFailing: false,
    isDismissed: false,
    isSentBack: false,
    fixSentAt: null,
  })
  const checks = (...results: Check[]): Checks => ({ results, repos: [] })

  test('a success claim meets a failed or stale run', () => {
    expect(contradictedClaim('All tests pass now.', checks(ran('fail')))?.problem).toBe(
      'bun test failed when it last ran (2 fail)',
    )
    expect(contradictedClaim('All tests pass.', checks(ran('pass', true)))?.problem).toBe(
      'the files changed after bun test last ran',
    )
    expect(contradictedClaim('All tests pass.', checks(ran('pass')))).toBe(null)
  })

  test('a check script that ran after the last edit answers for every kind', () => {
    const suite: Check = { ...ran('pass'), name: 'check.sh', kind: 'all', ranAt: 30 }
    expect(contradictedClaim('All tests pass.', checks(ran('pass', true), suite))).toBe(null)
  })

  test('leaves hedged claims and claims with no check of their kind alone', () => {
    expect(contradictedClaim('The tests should pass once CI runs.', checks(ran('fail')))).toBe(null)
    expect(contradictedClaim('Types are clean.', checks(ran('fail')))).toBe(null)
    expect(contradictedClaim('Your reply says "tests pass".', checks(ran('fail')))).toBe(null)
  })
})

describe('markStale', () => {
  const ran = (kind: Check['kind'], repo: string | null): Check => ({
    name: kind,
    kind,
    folder: null,
    target: { paths: [], filters: [] },
    result: 'pass',
    summary: '',
    ranAt: 10,
    repo,
    isStale: false,
    command: '',
    failures: [],
    isLeftFailing: false,
    isDismissed: false,
    isSentBack: false,
    fixSentAt: null,
  })
  const staleness = (results: Check[]) => results.map(c => c.isStale)

  test('a code change makes the checks in its repo stale, and no others', () => {
    const results = [ran('tests', '/a'), ran('lint', '/a'), ran('tests', '/b'), ran('tests', null)]
    expect(staleness(markStale(results, '/a', true))).toEqual([true, true, false, false])
  })

  test('a Markdown-only change leaves tests, types and builds current', () => {
    const results = [ran('tests', '/a'), ran('types', '/a'), ran('lint', '/a'), ran('all', '/a')]
    expect(staleness(markStale(results, '/a', false))).toEqual([false, false, true, true])
  })
})

const z = (...fields: string[]) => `${fields.join('\0')}\0`

describe('git', () => {
  test('reads changed paths, with a rename’s old path as deleted', () => {
    expect(readChanged(z(' M hooks/a.ts', '?? docs/new.md', 'R  new.ts', 'old.ts', ' D gone.ts'))).toEqual([
      { path: 'hooks/a.ts', isDeleted: false },
      { path: 'docs/new.md', isDeleted: false },
      { path: 'new.ts', isDeleted: false },
      { path: 'old.ts', isDeleted: true },
      { path: 'gone.ts', isDeleted: true },
    ])
    expect(readLsTree(z('100644 blob abc123\ta.ts', '100644 blob def456\tdir/b c.ts'))).toEqual({
      'a.ts': 'abc123',
      'dir/b c.ts': 'def456',
    })
  })

  test('a commit only moves content into HEAD, so nothing changed', () => {
    const head = { 'a.ts': 'A1', 'b.ts': 'B1' }
    const edited = { head: 'h1', dirty: { 'a.ts': 'A2' } }
    const committed = { head: 'h2', dirty: {} }
    expect(
      changedPaths(edited, committed, candidates(edited, committed, ['a.ts']), head, { ...head, 'a.ts': 'A2' }),
    ).toEqual([])
  })

  test('an edit, a new file, a deletion and an undone edit each change the content', () => {
    const head = { 'a.ts': 'A1', 'b.ts': 'B1' }
    const clean = { head: 'h1', dirty: {} }
    expect(changedPaths(clean, { head: 'h1', dirty: { 'a.ts': 'A2' } }, ['a.ts'], head, head)).toEqual(['a.ts'])
    expect(changedPaths(clean, { head: 'h1', dirty: { 'new.ts': 'N1' } }, ['new.ts'], head, head)).toEqual(['new.ts'])
    expect(changedPaths(clean, { head: 'h1', dirty: { 'b.ts': '' } }, ['b.ts'], head, head)).toEqual(['b.ts'])
    expect(changedPaths({ head: 'h1', dirty: { 'a.ts': 'A2' } }, clean, ['a.ts'], head, head)).toEqual(['a.ts'])
  })
})
