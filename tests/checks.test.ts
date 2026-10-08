import { describe, expect, test } from 'claude-code/testing'

import type { Check, Checks } from '../types'
import { checkName, checkRun, checksIn, claimsIn, failureLines, failureList, readResult } from '../hooks/checks'
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

describe('checkRun', () => {
  const run = (command: string) => checkRun(command, '/work/repo', '/home/me')
  const folder = (command: string) => run(command)?.folder

  test('runs in the shell’s folder, or the one the check names', () => {
    expect(folder('npm test')).toBe('/work/repo')
    expect(folder('claude plugin test mods/x')).toBe('/work/repo/mods/x')
    expect(folder('claude plugin test $HOME/x')).toBe('/home/me/x')
    expect(folder('npm --prefix ../app test')).toBe('/work/app')
    expect(folder('npx -y -p typescript tsc --noEmit -p ~/app/tsconfig.json')).toBe('/home/me/app')
  })

  test('is null when the command hides the folder', () => {
    expect(folder('claude plugin test $COPY')).toBe(null)
    expect(folder('npm --prefix "$(mktemp -d)" test')).toBe(null)
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
      ['vitest --run --no-coverage', none],
      ['jest --runInBand --watchAll=false --forceExit', none],
      ['eslint --format stylish', none],
      ['bun test --timeout 5000', none],
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
      ['vitest run /work/repo ./', none],
      ['vitest run ../other/a.test.ts', { paths: ['/work/other/a.test.ts'] }],
      ['vitest run ~/b.test.ts', { paths: ['/home/me/b.test.ts'] }],
      ['vitest run a.test.ts < in.txt', { paths: ['/work/repo/a.test.ts'] }],
      // A path the mod cannot resolve is kept as written, so the run never clears a failure by mistake.
      ['vitest run $X/a.test.ts', { filters: ['$X/a.test.ts'] }],
    ]

    for (const [command, expected] of cases) {
      test(command, () => {
        expect(run(command)?.target).toEqual({ ...none, ...expected })
      })
    }
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
    // node --test lists each failure again under a "✖ failing tests:" heading.
    const node = [
      '✖ parses times (1.2ms)',
      'ℹ fail 1',
      '✖ failing tests:',
      'test at a.test.js:5:1',
      '✖ parses times (1.2ms)',
    ].join('\n')
    expect(failureLines(node)).toEqual(['✖ parses times (1.2ms)'])
    expect(failureLines('Done in 2s')).toEqual([])
  })

  test('each failure names its file, even from a later line that repeats it, and what failed', () => {
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
      failureList(failed(["hooks/register.tsx(2310,7): error TS2322: Type 'string' is not assignable to 'number'."])),
    ).toEqual([{ file: 'register.tsx:2310', text: "Type 'string' is not assignable to 'number'." }])
    const vitest = [
      '× parses a dated heading 3ms',
      'FAIL  |node| tests/markdown/parse.test.ts > headings > parses a dated heading',
    ]
    expect(failureList(failed(vitest))).toEqual([{ file: 'parse.test.ts', text: 'parses a dated heading' }])
    expect(failureList(failed(['✖ sums every value (0.9ms)', '✖ averages the values (0.1ms)']))).toEqual([
      { file: null, text: 'sums every value' },
      { file: null, text: 'averages the values' },
    ])
    // Go names a package, not a file, and its first line is a bare FAIL.
    expect(failureList(failed(['FAIL', 'FAIL\texample.com/app/message\t0.698s']))).toEqual([
      { file: null, text: 'example.com/app/message' },
    ])
  })
})

describe('readResult', () => {
  test('the exit status decides; the runner’s counts describe it', () => {
    expect(readResult(' 24 pass\n 1 fail\nRan 25 tests across 3 files.', true)).toEqual({
      result: 'fail',
      summary: '24 pass, 1 fail',
    })
    // A test named after errors does not fail a clean run.
    expect(readResult('(pass) reports 2 errors\n 25 pass\n 0 fail\n', false)).toEqual({
      result: 'pass',
      summary: '25 pass, 0 fail',
    })
  })

  test('a failing check with no recognizable summary still says so', () => {
    expect(readResult('Exit code 2\nboom', true)).toEqual({ result: 'fail', summary: 'exited with an error' })
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
    ['a hedged claim', 'The tests should pass once CI runs', false],
  ]

  for (const [label, reply, isClaim] of cases) {
    test(`${label} ${isClaim ? 'is' : 'is not'} a claim`, () => {
      expect(claimsIn(reply).map(c => c.kind)).toEqual(isClaim ? ['tests'] : [])
    })
  }
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
