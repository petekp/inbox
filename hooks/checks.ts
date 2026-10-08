// Checks measured from Claude's commands: which commands were tests, type
// checks, lints, builds or validations, how each ended, whether the files
// changed after it, and which successes Claude's reply claims. Nothing here
// asks a model.

import type { Check, CheckKind, Target } from '../types'

/** One recognized check inside a command, such as `bun test` or `tsc`. */
export type CheckCall = { name: string; kind: CheckKind }

/** A package manager's options before its script, such as `--prefix app` or `-w pkg`. */
const PM_OPTIONS = String.raw`(?:-{1,2}[\w-]+(?:=\S+|\s+(?!-|(?:run|test|build|lint)\b)\S+)?\s+)*`
/** A script such as `test` or `lint:css`; the match's group 2 is its `:css` part, so `lint` and `lint:css` are different checks. */
const pm = (managers: string, script: string) =>
  new RegExp(String.raw`\b(${managers})\s+${PM_OPTIONS}(?:run\s+)?(?:${script})(:[\w.:-]*\w)?\b`)

const CHECKS: { kind: CheckKind; pattern: RegExp; name: (m: RegExpMatchArray) => string }[] = [
  { kind: 'tests', pattern: /\bclaude\s+plugin\s+test\b/, name: () => 'plugin tests' },
  { kind: 'validate', pattern: /\bclaude\s+plugin\s+validate\b/, name: () => 'plugin validate' },
  { kind: 'tests', pattern: pm('bun|npm|pnpm|yarn|deno', 'test'), name: m => `${m[1]} test${m[2] ?? ''}` },
  { kind: 'tests', pattern: /\bnode\s+(?:-{1,2}[\w-]+(?:=\S+)?\s+)*--test\b/, name: () => 'node --test' },
  { kind: 'tests', pattern: /\b(vitest|jest|pytest|rspec|mocha|phpunit|ava|tap)\b/, name: m => m[1] ?? 'tests' },
  { kind: 'tests', pattern: /\b(go|cargo|swift|mix|dotnet)\s+test\b/, name: m => `${m[1]} test` },
  { kind: 'tests', pattern: /\bplaywright\s+test\b/, name: () => 'playwright' },
  { kind: 'tests', pattern: /\bxcodebuild\b[^|;&]*\btest\b/, name: () => 'xcodebuild test' },
  { kind: 'tests', pattern: /\bmake\s+(?:check|test)\b/, name: m => m[0] },
  { kind: 'types', pattern: /\btsc\b/, name: () => 'tsc' },
  { kind: 'types', pattern: /\b(mypy|pyright)\b/, name: m => m[1] ?? 'types' },
  {
    kind: 'types',
    pattern: pm('bun|npm|pnpm|yarn', 'typecheck|type-check|check-types'),
    name: m => `typecheck${m[2] ?? ''}`,
  },
  { kind: 'types', pattern: /\bcargo\s+check\b/, name: () => 'cargo check' },
  {
    kind: 'lint',
    pattern: /\b(eslint|biome|ruff|shellcheck|swiftlint|clippy|golangci-lint|stylelint)\b/,
    name: m => m[1] ?? 'lint',
  },
  { kind: 'lint', pattern: pm('bun|npm|pnpm|yarn', 'lint'), name: m => `lint${m[2] ?? ''}` },
  { kind: 'lint', pattern: /\bprettier\b[^|;&]*--check\b/, name: () => 'prettier' },
  { kind: 'build', pattern: pm('bun|npm|pnpm|yarn', 'build'), name: m => `${m[1]} build${m[2] ?? ''}` },
  { kind: 'build', pattern: /\b(cargo|go|swift)\s+build\b/, name: m => `${m[1]} build` },
  { kind: 'build', pattern: /\bxcodebuild\b(?![^|;&]*\btest\b)/, name: () => 'xcodebuild' },
  { kind: 'build', pattern: /\b(?:next|vite)\s+build\b/, name: m => m[0] },
  {
    kind: 'validate',
    pattern: /(?:^|\s)(?:\S*\/)?[\w.-]*(?:validate|doctor)[\w.-]*\.sh\b/,
    name: m => m[0].trim().replace(/^.*\//, ''),
  },
  { kind: 'all', pattern: /(?:^|\s)(?:\S*\/)?checks?\.sh\b/, name: m => m[0].trim().replace(/^.*\//, '') },
]

/** A piece of a shell command and the operator after it: `&&`, `||`, `;`, a newline, `|`, or '' at the end. */
type Segment = { text: string; next: string }

/**
 * The pieces of a shell command that run one after another or in a pipe, with
 * heredoc bodies removed and continued lines joined. A command substitution
 * stays inside its piece, so `-xctestrun $(ls *.xctestrun | head -1)` is not a
 * pipe. Quoted strings and substitutions are blanked, so `git commit -m "fix tsc"`
 * runs no tsc, unless `keepQuotes`, for reading the paths a command names.
 */
function segments(command: string, keepQuotes = false): Segment[] {
  const quoted: string[] = []
  const substituted: string[] = []
  let masked = command
    .replace(/<<-?\s*(["']?)(\w+)\1[^\n]*\n[\s\S]*?\n\2\b/g, ' ')
    .replace(/(["'])(?:\\.|(?!\1)[\s\S])*\1/g, q => `\0${quoted.push(q) - 1}\0`)
    .replace(/\\\n/g, ' ')
  // Innermost first, so a substitution inside another one is masked too.
  for (let before = ''; before !== masked;) {
    before = masked
    masked = masked.replace(/\$\([^()]*\)|`[^`]*`/g, s => `\x01${substituted.push(s) - 1}\x01`)
  }
  const unmask = (text: string): string => {
    let out = text
    while (/\x01\d+\x01/.test(out))
      out = out.replace(/\x01(\d+)\x01/g, (_, n: string) => (keepQuotes ? (substituted[Number(n)] ?? '') : '""'))

    return out.replace(/\0(\d+)\0/g, (_, n: string) => (keepQuotes ? (quoted[Number(n)] ?? '') : '""'))
  }
  const parts = masked.split(/(&&|\|\||;|\n|\|)/)
  const found: Segment[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const text = unmask(parts[i] ?? '').trim()
    if (text) found.push({ text, next: parts[i + 1] ?? '' })
  }

  return found
}

/** A segment without the shell syntax before its command, such as `if !` in `if ! pgrep -x xcodebuild` or `do`. */
function commandOf(segment: string): string {
  return segment.replace(/^(?:[({]\s*|!\s+|(?:if|then|elif|else|do|while|until|time)\s+)+/, '')
}

/**
 * Commands that only show text, move around or look for a process; a check
 * named in one of them is not run, as in `pgrep -x xcodebuild`.
 */
const NOT_A_CHECK =
  /^(?:echo|printf|cat|grep|rg|tail|head|less|ls|cd|git|gh|brew|man|which|type|open|pgrep|pkill|killall|ps|lsof)\b/

/** The check one segment runs, the word that starts it, such as `npm` or `tsc`, and how many words after it the match used, such as `run lint` after `npm`. */
function checkIn(segment: string): { call: CheckCall; runner: string; consumed: number } | null {
  const command = commandOf(segment)
  if (NOT_A_CHECK.test(command)) return null
  for (const c of CHECKS) {
    const m = command.match(c.pattern)
    if (m) {
      const [runner = '', ...used] = m[0].trim().split(/\s+/)

      return { call: { name: c.name(m), kind: c.kind }, runner, consumed: used.length }
    }
  }

  return null
}

/** The checks a command runs, in order, at most one per segment. */
export function checksIn(command: string): CheckCall[] {
  const found: CheckCall[] = []
  for (const segment of segments(command)) {
    const call = checkIn(segment.text)?.call
    if (call && !found.some(f => f.name === call.name)) found.push(call)
  }

  return found
}

/** Options that name the folder a check runs in, as in `npm --prefix app test`. */
const FOLDER_OPTIONS = new Set(['--prefix', '-C', '--cwd', '--dir', '--directory', '--package-path', '--manifest-path'])
/** tsc's `-p` names its project; other runners use `-p` for a package or plugin. */
const TSC_FOLDER_OPTIONS = new Set([...FOLDER_OPTIONS, '-p', '--project'])

/** A segment's words, with their quotes removed. */
function wordsOf(segment: string): string[] {
  return (segment.match(/(?:"(?:\\.|[^"\\])*"|'[^']*'|[^\s"']+)+/g) ?? []).map(w =>
    w.replace(/"((?:\\.|[^"\\])*)"|'([^']*)'/g, (_, double?: string, single?: string) => double ?? single ?? ''),
  )
}

/** `path` resolved against the folder `from`, with `.` and `..` worked out. */
function resolvePath(from: string, path: string): string {
  const parts: string[] = []
  for (const part of `${path.startsWith('/') ? '' : from}/${path}`.split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }

  return `/${parts.join('/')}`
}

/** The target of a run of the whole suite. */
export const NO_TARGET: Target = { paths: [], filters: [] }

/** Flags that change how a run reports or how fast it goes, not what it runs. */
const OUTPUT_FLAGS = new Set([
  '--reporter',
  '--verbose',
  '-v',
  '--silent',
  '--quiet',
  '-q',
  '--color',
  '--no-color',
  '--ci',
  '--bail',
  '-x',
  '--coverage',
  '--pretty',
  '--noEmit',
  '--passWithNoTests',
  '--tb',
  '--maxWorkers',
  '-j',
  '--run',
  '--no-coverage',
  '--runInBand',
  '--watch',
  '--watchAll',
  '--no-watch',
  '--forceExit',
  '--detectOpenHandles',
  '--no-cache',
  '--format',
  '-s',
  '-vv',
])
/** The output flags that take their value as the next word. */
const VALUE_FLAGS = new Set(['--reporter', '--tb', '--maxWorkers', '-j', '--format'])
/** Flags that pick tests by name or by path pattern. */
const FILTER_FLAGS = new Set(['-t', '--testNamePattern', '--grep', '-g', '-k', '--filter', '-run', '--testPathPattern'])
/** A word a runner takes as its command, not as a target, as in `vitest run`. */
const COMMAND_WORDS: Record<string, string[]> = {
  vitest: ['run'],
  'golangci-lint': ['run'],
  ruff: ['check'],
  biome: ['check', 'lint', 'ci'],
}
const REDIRECT = /^(?:\d*|&)[<>]|^&$/
const isPath = (word: string) => word === '.' || word.includes('/') || /\.[A-Za-z0-9]+$/.test(word)

/**
 * The part of a suite a run covered, read from the words after its runner
 * and script. A file or folder narrows it, as does a test-name filter. A flag
 * that only changes output or speed does not. Any other argument counts as a
 * filter, so a run read wrongly never clears a failure. `resolve` gives a
 * path's absolute form, null when it cannot; `folder` is the run's folder.
 */
function readTarget(
  words: string[],
  runner: string,
  folder: string | null,
  resolve: (word: string) => string | null,
): Target {
  const paths: string[] = []
  const filters: string[] = []
  const add = (list: string[], item: string) => void (list.includes(item) || list.push(item))
  const rest = words[0] === '--' ? words.slice(1) : words
  for (let i = 0; i < rest.length; i++) {
    const word = rest[i] ?? ''
    if (REDIRECT.test(word)) break
    const isFlag = word.startsWith('-')
    const [flag = '', inline] = isFlag && word.includes('=') ? word.split(/=(.*)/s) : [word, undefined]
    if (OUTPUT_FLAGS.has(flag)) {
      if (inline === undefined && VALUE_FLAGS.has(flag)) i++
    } else if (FILTER_FLAGS.has(flag)) {
      const value = inline ?? rest[++i]
      add(filters, value === undefined ? flag : `${flag}=${value}`)
    } else if (COMMAND_WORDS[runner]?.includes(word)) {
      continue
    } else if (!isFlag && isPath(word)) {
      // Go's `./pkg/...` means the folder and everything below it.
      const path = folder === null ? null : resolve(word.replace(/\/\.\.\.$/, '') || '.')
      if (path === null) add(filters, word)
      else if (path !== folder) add(paths, path)
    } else {
      add(filters, word)
    }
  }

  return { paths, filters }
}

/** The target of the check run a saved command, run in `folder`, describes; the whole suite when it reads as none. */
export function targetOfCommand(command: string, folder: string, home: string): Target {
  return checkRuns(command, folder, home)[0]?.target ?? NO_TARGET
}

/**
 * The `echo "<label> exit $?"` right after a check's pipeline: the label it
 * prints, how many echoes before it in the command print the same label, and
 * whether `$?` is the check's own status. After `check | tail` it is tail's,
 * unless the command sets pipefail.
 */
export type ExitEcho = { label: string; nth: number; isOwn: boolean }

/**
 * One time a command runs a check: the check, the part of its suite the run
 * covered, the piece of the command that runs it (`segment` with quoted text blanked, `command` as written), whether
 * that piece ends the command, the folder it ran in, and the echo that prints
 * its status.
 */
export type CheckRun = {
  call: CheckCall
  target: Target
  segment: string
  command: string
  isLast: boolean
  folder: string | null
  exitEcho: ExitEcho | null
}

/** The label an `echo "<label> exit $?"` prints, '' for `echo "exit=$?"`, or null for a segment that prints no status. */
function echoedLabel(segment: string): string | null {
  const [first, ...printed] = wordsOf(commandOf(segment))
  if (first !== 'echo' || !printed.some(w => w.includes('$?'))) return null
  const text = printed
    .filter(w => !/^-[neE]+$/.test(w))
    .join(' ')
    .replace(/\$\?/g, '0')

  return exitLines(text)[0]?.label ?? null
}

/**
 * Each check a command runs, in order, with its folder, absolute: where the
 * shell started, moved by each `cd`, or the folder the check names, as in
 * `claude plugin test <folder>` or `npm --prefix <folder> test`. The folder is
 * null when the command hides it, as with `cd -`, `$(...)` or a variable the
 * command did not set.
 */
export function checkRuns(command: string, cwd: string, home: string): CheckRun[] {
  const runs: CheckRun[] = []
  const vars = new Map([['HOME', home]])
  let dir: string | null = resolvePath('/', cwd)
  const expand = (word: string): string | null => {
    if (/\$\(|`/.test(word)) return null
    let isKnown = true
    const out = word
      .replace(/^~(?=\/|$)/, home)
      .replace(/\$\{?(\w+)\}?/g, (_, name: string) => vars.get(name) ?? ((isKnown = false), ''))

    return isKnown ? out : null
  }
  const at = (path: string): string | null => {
    const p = expand(path)

    return p === null || dir === null ? null : resolvePath(dir, p)
  }

  const blank = segments(command)
  const kept = segments(command, true)
  const echoes = kept.map(s => echoedLabel(s.text))
  const isPipefail = /\bset\s+(?:-\w+\s+)*-\w*o\s+pipefail\b/.test(command)
  // The echo after a pipeline prints the status of the pipeline's last command.
  const exitEchoAfter = (i: number): ExitEcho | null => {
    let end = i
    while (kept[end]?.next === '|') end++
    const label = echoes[end + 1]

    return label === null || label === undefined
      ? null
      : { label, nth: echoes.slice(0, end + 1).filter(l => l === label).length, isOwn: end === i || isPipefail }
  }
  kept.forEach(({ text: segment }, i) => {
    const words = wordsOf(commandOf(segment))
    const [first = '', ...rest] = words
    const assigned = first === 'export' ? rest : words
    const assignment = assigned.length === 1 ? assigned[0]?.match(/^(\w+)=(.*)$/s) : null
    if (assignment) {
      const [, name = '', value = ''] = assignment
      const expanded = expand(value)
      if (expanded === null) vars.delete(name)
      else vars.set(name, expanded)
    } else if (first === 'cd' || first === 'pushd') {
      const target = rest.find(w => w === '-' || !w.startsWith('-'))
      dir = target === '-' ? null : target === undefined ? home : at(target)
    } else if (first === 'popd') {
      dir = null
    } else {
      const piece = blank[i]?.text ?? ''
      const found = checkIn(piece)
      if (!found) return
      const { call, runner, consumed } = found
      const after = words.slice(words.findIndex(w => w === runner || w.endsWith(`/${runner}`)) + 1)
      const options = runner === 'tsc' ? TSC_FOLDER_OPTIONS : FOLDER_OPTIONS
      // The words that name the folder are not target words.
      const folderWords = new Set<number>()
      let named: string | undefined
      if (runner === 'claude') {
        // `claude plugin test <folder>`: the first word after `plugin test` that is not an option or a redirect.
        const j = after.findIndex((w, k) => k >= 2 && !/^-|^\d*[<>&]/.test(w))
        if (j >= 0) {
          named = after[j]
          folderWords.add(j)
        }
      }
      after.forEach((w, j) => {
        const isInline = w.startsWith('--') && w.includes('=')
        const [option = '', value] = isInline ? w.split(/=(.*)/s) : [w, after[j + 1]]
        if (options.has(option) && value !== undefined) {
          named = value
          folderWords.add(j)
          if (!isInline) folderWords.add(j + 1)
        }
      })
      // A project file, such as tsconfig.build.json or Cargo.toml, names its folder.
      if (named && /\.(?:json|toml)$/.test(named)) named = named.replace(/\/?[^/]*$/, '') || '.'
      const folder = named === undefined ? dir : at(named)
      const resolve = (word: string): string | null => {
        const path = expand(word)

        return path === null || folder === null ? null : resolvePath(folder, path)
      }
      runs.push({
        call,
        target: readTarget(
          after.filter((_, j) => j >= consumed && !folderWords.has(j)),
          runner,
          folder,
          resolve,
        ),
        segment: piece,
        command: segment,
        isLast: i === blank.length - 1,
        folder,
        exitEcho: exitEchoAfter(i),
      })
    }
  })

  return runs
}

/** Whether a folder is a temporary one, where a throwaway copy of a project lives. */
export function isTemporary(folder: string): boolean {
  return /^(?:\/private)?\/(?:tmp|var\/tmp|var\/folders)(?:\/|$)/.test(folder)
}

// Not "problems": ESLint counts warnings in them, as in "316 problems (0 errors, 316 warnings)".
const FAIL_COUNT = /\b([1-9]\d*)\s+(?:fail(?:ed|ing|ures?|s)?|errors?)\b|^[ℹ#]\s*fail\s+[1-9]\d*\s*$/im
const ZERO_FAIL = /\b0\s+(?:fail(?:ed|ing|ures?|s)?|errors?)\b|^[ℹ#]\s*fail\s+0\s*$/im
const PASS_COUNT = /\b(\d+)\s+(?:pass(?:ed|ing|es)?|tests? passed|ok)\b/i
const TS_ERROR = /\berror\s+TS\d+\b/
const FAIL_WORD =
  /^\s*(?:FAIL|FAILED|✗|×|✘)\b|\bTests?:\s+\d+\s+failed\b|^error(?:\[E\d+\])?:|\bESLint found too many warnings\b/im
const SUMMARY = [
  /^.*\b\d+\s+(?:pass(?:ed|ing)?|fail(?:ed|ing)?)\b.*$/im,
  /^.*\bRan \d+ tests?\b.*$/im,
  /^.*\bTests?:\s+.*$/im,
  /^.*\bFound \d+ (?:errors?|problems?)\b.*$/im,
  /^.*\b\d+ (?:errors?|warnings?|problems?)\b.*$/im,
]

/** A line that names what failed: a failing test, a compiler error, or an error message. */
const FAILURE_LINE = /^\s*(?:\(fail\)|FAIL\b|✗|×|✘)|\berror\s+TS\d+\b|^\s*(?:[A-Z]\w*Error|error)(?:\[\w+\])?:/

/** Up to three lines of a check's output that name what failed, each cut to 160 characters. */
export function failureLines(output: string): string[] {
  return output
    .split('\n')
    .filter(line => FAILURE_LINE.test(line))
    .map(line => line.trim().slice(0, 160))
    .filter((line, i, all) => all.indexOf(line) === i)
    .slice(0, 3)
}

/** "<label> exit N" lines a command printed, such as `echo "tsc exit $?"`, `exit: 1` or `exit=1`. */
function exitLines(output: string): { label: string; code: number }[] {
  return [
    ...output.matchAll(/^[ \t]*(?:(\S[^\n]*?)[ \t]+)?exit(?:[ \t]+code)?(?:[ \t]*[:=][ \t]*|[ \t]+)(\d+)[ \t]*$/gim),
  ].map(m => ({
    label: (m[1] ?? '').toLowerCase(),
    code: Number(m[2]),
  }))
}

/** The status a bare `echo $?` printed, the only line of its kind. */
function bareExit(command: string, output: string): number | null {
  if (!/\becho\s+["']?\$\?["']?\s*(?:$|[;&|\n])/.test(command)) return null
  const lines = output.match(/^\s*\d+\s*$/gm) ?? []

  return lines.length === 1 ? Number(lines[0]) : null
}

/** Words in check names that say what a check does, not which runner ran it. */
const GENERIC_WORDS = new Set(['test', 'build', 'check', 'run', 'lint'])

/** The words of a check name or a label, split at punctuation, with a final "s" dropped so "tests" reads as "test". */
function labelWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(w => w.replace(/s$/, ''))
    .filter(Boolean)
}

/** Whether a segment sends its output to a file, so the output here is not its own. */
function isRedirected(segment: string): boolean {
  return /(?:^|[^\d&])>>?\s*[^&\s]/.test(segment)
}

/** Pass and fail counts on lines of their own: bun's " 24 pass", node's "ℹ pass 24", TAP's "# pass 24". */
function counts(output: string): { pass: number; fail: number } | null {
  const count = (word: string) => {
    const m = output.match(new RegExp(`^\\s*(\\d+)\\s+${word}\\s*$|^[ℹ#]\\s*${word}\\s+(\\d+)\\s*$`, 'm'))

    return m ? Number(m[1] ?? m[2]) : null
  }
  const pass = count('pass')
  const fail = count('fail')

  return pass === null || fail === null ? null : { pass, fail }
}

function summaryOf(output: string, tally: ReturnType<typeof counts>): string {
  if (tally) return `${tally.pass} pass, ${tally.fail} fail`
  for (const p of SUMMARY) {
    const m = output.match(p)
    if (m) return m[0].trim().slice(0, 120)
  }
  const firstError = output.split('\n').find(line => /\berror\b/i.test(line))

  return (firstError ?? '').trim().slice(0, 120)
}

/**
 * How each check in a command ended, from its runs (`checkRuns`). A check the
 * command runs more than once is unknown, since the output does not say which
 * lines are which run's. Otherwise the exit line its own `echo "... exit $?"`
 * printed wins, then an exit line that names it, as a script may print. Then
 * the command's own exit status, when a lone check ends the command and
 * nothing filters it. Then the runner's own pass and fail tally, then failure
 * or pass words in the output, which other commands in it may have printed.
 */
export function readResults(
  command: string,
  runs: CheckRun[],
  output: string,
  isError: boolean,
): { call: CheckCall; result: Check['result']; summary: string }[] {
  const exits = exitLines(output)
  // Each `echo "<label> exit $?"` prints one exit line. When the output has as many lines of a label as the
  // command has echoes of it, each line belongs to the pipeline before its echo, and no other check reads it.
  const echoed = segments(command, true).map(s => echoedLabel(s.text))
  const ofLabel = (label: string) => exits.filter(x => x.label === label)
  const isPlaced = (label: string) => ofLabel(label).length === echoed.filter(l => l === label).length
  const unplaced = exits.filter(x => !isPlaced(x.label))
  const isFiltered = /\|\s*(tail|head|grep|rg|sed|awk|cut|wc|tee|less)\b/.test(command)
  const tally = counts(output)
  const summary = summaryOf(output, tally)
  const calls = runs.map(r => r.call).filter((c, i, all) => all.findIndex(x => x.name === c.name) === i)

  return calls.map(call => {
    const own = runs.filter(r => r.call.name === call.name)
    if (own.length > 1) return { call, result: 'unknown', summary: `ran ${own.length} times in one command` }
    const words = labelWords(call.name.replace(/\.sh$/, ''))
    // A label names a check by whole words, so "go" is not in "golangci-lint exit 1", but a runner's
    // name can end in what it does, as "eslint" ends in "lint". The runner's word ("bun") names its
    // line before a word another runner's line can share, as in "unit test exit 1".
    const named = words.filter(w => !GENERIC_WORDS.has(w))
    const names = (label: string, w: string) => (GENERIC_WORDS.has(w) ? label.endsWith(w) : label === w)
    const labelFor = (ws: string[]) => unplaced.find(x => labelWords(x.label).some(l => ws.some(w => names(l, w))))
    const echo = own[0]?.exitEcho
    const placed = echo?.isOwn && isPlaced(echo.label) ? ofLabel(echo.label)[echo.nth] : undefined
    const labeled = placed ?? labelFor(named) ?? labelFor(call.kind === 'tests' ? [...words, 'test'] : words)
    const bare = calls.length === 1 && exits.length === 0 ? bareExit(command, output) : null
    const only =
      calls.length === 1 && unplaced.length === 1 ? unplaced[0] : bare === null ? undefined : { label: '', code: bare }
    const exit = labeled ?? only
    if (exit) return { call, result: exit.code === 0 ? 'pass' : 'fail', summary: summary || `exit ${exit.code}` }
    if (calls.length === 1 && !isFiltered && own[0]?.isLast) {
      return { call, result: isError ? 'fail' : 'pass', summary: summary || (isError ? 'exited with an error' : '') }
    }
    // tsc reports a failure only as "error TSnnnn" lines, so a tally or a failure word is another command's.
    if (calls.length === 1 && call.name === 'tsc') {
      if (TS_ERROR.test(output)) return { call, result: 'fail', summary }
    } else if (calls.length === 1) {
      if (tally) return { call, result: tally.fail > 0 ? 'fail' : 'pass', summary }
      if (FAIL_COUNT.test(output) || TS_ERROR.test(output) || FAIL_WORD.test(output))
        return { call, result: 'fail', summary }
      if (ZERO_FAIL.test(output) || PASS_COUNT.test(output)) return { call, result: 'pass', summary }
    }
    if (isError) return { call, result: 'fail', summary: summary || 'exited with an error' }
    if (isFiltered || isRedirected(own[0]?.segment ?? '')) return { call, result: 'unknown', summary }

    return { call, result: 'pass', summary }
  })
}

/** A check's result as one mark: ✓ passed, ✗ failed, · unknown. */
function checkMark(check: Check): string {
  return check.result === 'pass' ? '✓' : check.result === 'fail' ? '✗' : '·'
}

/** What follows a check's name: ", 24 pass", then ", before the last edit" when the files changed after it ran. */
function checkDetail(check: Check): string {
  return `${check.summary ? `, ${check.summary}` : ''}${check.isStale ? ', before the last edit' : ''}`
}

/** What a check's target adds to its name: its paths relative to the check's folder (`root` for the session's own), then its filters. */
function targetText(check: Check, root: string): string {
  const base = check.folder ?? root
  const paths = check.target.paths.map(p => (p.startsWith(`${base}/`) ? p.slice(base.length + 1) : p))

  return [...paths, ...check.target.filters].join(' ')
}

/** "npm test", "vitest a.test.ts" for a narrower run, and "npm test in app" for one that ran outside the session's folder `root`. */
export function checkName(check: Check, root: string): string {
  const target = targetText(check, root)
  const name = target ? `${check.name} ${target}` : check.name

  return check.folder ? `${name} in ${check.folder.replace(/^.*\//, '')}` : name
}

/** "✓ npm test, 24 pass, before the last edit". */
export function checkLine(check: Check, root: string): string {
  return `${checkMark(check)} ${checkName(check, root)}${checkDetail(check)}`
}

/** The reply's prose, as its sentences, without code blocks and inline code. */
function sentences(reply: string): string[] {
  return reply
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .split(/\n+|(?<=[.!?])\s+/)
    .map(s =>
      s
        .replace(/^[\s>#*-]*(?:\d+[.)]\s*)?/, '')
        .replace(/[*_]+/g, '')
        .trim(),
    )
    .filter(Boolean)
}

const CLAIMS: { kind: CheckKind; pattern: RegExp }[] = [
  {
    kind: 'tests',
    pattern:
      /\b(?:all\s+)?(?:\d+\s+)?(?:the\s+|unit\s+)?tests?\s+(?:now\s+|all\s+|still\s+)*(?:pass(?:es|ed|ing)?|are passing|are green|succeed(?:s|ed)?)\b/i,
  },
  {
    kind: 'types',
    pattern:
      /\b(?:tsc|type[- ]?check(?:s|ing)?|types?)\s+(?:is\s+|are\s+|now\s+)*(?:pass(?:es|ed)?|clean|green|succeed(?:s|ed)?)\b|\bno type errors\b/i,
  },
  { kind: 'lint', pattern: /\blint(?:ing|er)?\s+(?:is\s+|now\s+)*(?:pass(?:es|ed)?|clean|green)\b/i },
  {
    kind: 'build',
    pattern: /\bbuild\s+(?:is\s+|now\s+)*(?:pass(?:es|ed)?|succeed(?:s|ed)?|green|works)\b|\bbuilds cleanly\b/i,
  },
]

/** A sentence of Claude's reply that claims a success, and what the check results say against it. */
export type Contradiction = { claim: string; problem: string }

/** Words that make a claim conditional, negative or about the future. */
const HEDGE = /\b(?:not|fail\w*|if|should|would|will|until|unless|once|might|may|expect\w*|untested)\b|n't\b/i

/** Text in double quotes, curly double quotes or backticks: a phrase the reply mentions, not one it says. */
const QUOTED = /"[^"]*"|“[^”]*”|`[^`]*`/g

/**
 * The successes the reply claims, in sentence order and then `CLAIMS` order.
 * A hedged sentence claims nothing, and neither does a check phrase in quotes.
 * Single quotes stay, since they are also apostrophes.
 */
export function claimsIn(reply: string): { sentence: string; kind: CheckKind }[] {
  return sentences(reply).flatMap(sentence => {
    const said = sentence.replace(QUOTED, ' ')

    return HEDGE.test(said) ? [] : CLAIMS.filter(c => c.pattern.test(said)).map(c => ({ sentence, kind: c.kind }))
  })
}

/** What a failed check's output says: the lines that name the failure, then the summary unless it repeats one. */
export function outputLines(check: Check): string[] {
  const isRepeated = check.failures.some(f => f.includes(check.summary) || check.summary.includes(f))

  return [...check.failures, ...(check.summary && !isRepeated ? [check.summary] : [])]
}

/** A path with an extension, then the line it names, if any: `src/a.ts(12,5)`, `/src/a.swift:30:27`, `src/a.test.ts`. */
const LOCATION = /((?:[\w@.~-]*\/)*[\w@~-][\w@.~-]*\.[A-Za-z]\w{0,5})(?:\((\d+),\d+\)|:(\d+)(?::\d+)?)?(?![\w/])/g

/**
 * A failed check in one line: the file the failure lines name, as its base
 * name and line, and what the first informative one says, without its
 * marker, location and timing. Without failure lines, the summary.
 */
export function failureSummary(check: Check): { file: string | null; text: string } {
  // A token counts as a file when it names a line or a folder, so a word like "foo.bar" does not.
  const locations = check.failures.map(
    line => [...line.matchAll(LOCATION)].find(m => m[2] ?? m[3] ?? m[1]?.includes('/')) ?? null,
  )
  const found = locations.find(Boolean)
  const path = found?.[1]
  const line = found?.[2] ?? found?.[3]
  const said = check.failures
    .map((failure, n) =>
      failure
        .replace(locations[n]?.[0] ?? '', '')
        .replace(/^\s*(?:\(fail\)|FAIL(?:ED)?\b|✗|×|✘|❯)\s*/, '')
        .replace(/^\|[\w-]+\|\s*/, '')
        .replace(/^[\s:>-]*(?:error(?:\s+TS\d+|\[\w+\])?:\s*)?/i, '')
        .replace(/\s*\[?\d+(?:\.\d+)?\s?m?s\]?$/, '')
        .trim(),
    )
    .find(Boolean)

  return {
    file: path ? `${path.replace(/^.*\//, '')}${line ? `:${line}` : ''}` : null,
    text: said ?? check.summary,
  }
}

/** What `a: Fix` on a failing check sends Claude. */
export function fixMessage(check: Check, root: string): string {
  const output = outputLines(check)
  const target = targetText(check, root)

  return [
    `${check.name}${target ? ` ${target}` : ''} failed when you last ran it${check.folder ? ` in ${check.folder}` : ''}.`,
    ...(check.command ? [`Command: ${check.command}`] : []),
    ...(output.length > 0 ? ['Output:', ...output] : []),
    'Find the cause, fix it, and run it again to verify.',
  ].join('\n')
}

/** What sends Claude back to correct a claim before its turn ends. */
export function claimMessage(c: Contradiction): string {
  return `inbox: your reply says "${c.claim}", but ${c.problem}. Before you end your turn, run the check and report what it shows, or say plainly that the latest change is untested.`
}
