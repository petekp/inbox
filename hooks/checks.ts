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
export function resolvePath(from: string, path: string): string {
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
  '--timeout',
  '--testTimeout',
  '-s',
  '-vv',
])
/** The output flags that take their value as the next word. */
const VALUE_FLAGS = new Set(['--reporter', '--tb', '--maxWorkers', '-j', '--format', '--timeout', '--testTimeout'])
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
  return checkRun(command, folder, home)?.target ?? NO_TARGET
}

/** A check a command runs: the check, the part of its suite the run covered, the command as written, and the folder it ran in. */
export type CheckRun = {
  call: CheckCall
  target: Target
  command: string
  folder: string | null
}

/**
 * The first check a command runs, with its folder, absolute: where the shell
 * started, or the folder the check names, as in `claude plugin test <folder>`
 * or `npm --prefix <folder> test`. The folder is null when the command hides
 * it, as with a variable other than HOME or `$(...)`.
 */
export function checkRun(command: string, cwd: string, home: string): CheckRun | null {
  const dir = resolvePath('/', cwd)
  const expand = (word: string): string | null => {
    if (/\$\(|`/.test(word)) return null
    const out = word.replace(/^~(?=\/|$)/, home).replace(/\$\{?HOME\}?/g, home)

    return out.includes('$') ? null : out
  }
  const blank = segments(command)
  const kept = segments(command, true)
  for (const [i, { text: segment }] of kept.entries()) {
    const found = checkIn(blank[i]?.text ?? '')
    if (!found) continue
    const { call, runner, consumed } = found
    const words = wordsOf(commandOf(segment))
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
    let folder: string | null = dir
    if (named !== undefined) {
      const path = expand(named)
      folder = path === null ? null : resolvePath(dir, path)
    }
    const resolve = (word: string): string | null => {
      const path = expand(word)

      return path === null || folder === null ? null : resolvePath(folder, path)
    }
    const target = readTarget(
      after.filter((_, j) => j >= consumed && !folderWords.has(j)),
      runner,
      folder,
      resolve,
    )

    return { call, target, command: segment, folder }
  }

  return null
}

/** Whether a folder is a temporary one, where a throwaway copy of a project lives. */
export function isTemporary(folder: string): boolean {
  return /^(?:\/private)?\/(?:tmp|var\/tmp|var\/folders)(?:\/|$)/.test(folder)
}

const SUMMARY = [
  /^.*\b\d+\s+(?:pass(?:ed|ing)?|fail(?:ed|ing)?)\b.*$/im,
  /^.*\bRan \d+ tests?\b.*$/im,
  /^.*\bTests?:\s+.*$/im,
  /^.*\bFound \d+ (?:errors?|problems?)\b.*$/im,
  /^.*\b\d+ (?:errors?|warnings?|problems?)\b.*$/im,
]

/** The marks a test runner puts before a failing test. node's "✖ failing tests:" heading names none. */
const FAIL_MARK = String.raw`\(fail\)|FAIL(?:ED)?\b|✗|✖(?! failing tests:)|×|✘`

/** A line that names what failed: a failing test, a compiler error, or an error message. */
const FAILURE_LINE = new RegExp(
  String.raw`^\s*(?:${FAIL_MARK})|\berror\s+TS\d+\b|^\s*(?:[A-Z]\w*Error|error)(?:\[\w+\])?:`,
)

/** Up to three lines of a check's output that name what failed, each cut to 160 characters. */
export function failureLines(output: string): string[] {
  return output
    .split('\n')
    .filter(line => FAILURE_LINE.test(line))
    .map(line => line.trim().slice(0, 160))
    .filter((line, i, all) => all.indexOf(line) === i)
    .slice(0, 3)
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

/** How a check ended, from the engine's exit status, with a summary read from its output. */
export function readResult(output: string, isError: boolean): { result: Check['result']; summary: string } {
  const tally = counts(output)
  // failCount reads this back for the pane's "2 of 176 failed".
  const summary = tally ? `${tally.pass} pass, ${tally.fail} fail` : summaryLine(output)

  return { result: isError ? 'fail' : 'pass', summary: summary || (isError ? 'exited with an error' : '') }
}

function summaryLine(output: string): string {
  for (const p of SUMMARY) {
    const m = output.match(p)
    if (m) return m[0].trim().slice(0, 120)
  }
  const firstError = output.split('\n').find(line => /\berror\b/i.test(line))

  return (firstError ?? '').trim().slice(0, 120)
}

/** A check's result as one mark: ✓ passed, ✗ failed. */
function checkMark(check: Check): string {
  return check.result === 'pass' ? '✓' : '✗'
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

/** The output's summary line, unless it repeats a failure line, as tsc's first error does. */
export function distinctSummary(check: Check): string | null {
  const isRepeated = check.failures.some(f => f.includes(check.summary) || check.summary.includes(f))

  return check.summary && !isRepeated ? check.summary : null
}

/** What a failed check's output says: the lines that name the failure, then the summary unless it repeats one. */
export function outputLines(check: Check): string[] {
  const summary = distinctSummary(check)

  return [...check.failures, ...(summary ? [summary] : [])]
}

/** A path with an extension, then the line it names, if any: `src/a.ts(12,5)`, `/src/a.swift:30:27`, `src/a.test.ts`. */
const LOCATION = /((?:[\w@.~-]*\/)*[\w@~-][\w@.~-]*\.[A-Za-z]\w{0,5})(?:\((\d+),\d+\)|:(\d+)(?::\d+)?)?(?![\w/])/g

/** A failure mark, or vitest's ❯, at the start of a failure line. */
const LEADING_MARK = new RegExp(String.raw`^\s*(?:${FAIL_MARK}|❯)\s*`)

/**
 * What a failed check's failure lines say, one entry per failure: the file a
 * line names, as its base name and line, and its text without marker,
 * location and timing. A line whose text ends with an earlier one's, as
 * vitest's FAIL line repeats its × line, only adds its file to that entry.
 */
export function failureList(check: Check): { file: string | null; text: string }[] {
  const list: { file: string | null; text: string }[] = []
  for (const failure of check.failures) {
    // A token counts as a file when it names a line or a folder, so a word like "foo.bar" does not.
    const found = [...failure.matchAll(LOCATION)].find(m => m[2] ?? m[3] ?? m[1]?.includes('/'))
    const line = found?.[2] ?? found?.[3]
    const file = found?.[1] ? `${found[1].replace(/^.*\//, '')}${line ? `:${line}` : ''}` : null
    const text = failure
      .replace(found?.[0] ?? '', '')
      .replace(LEADING_MARK, '')
      .replace(/^\|[\w-]+\|\s*/, '')
      .replace(/^[\s:>-]*(?:error(?:\s+TS\d+|\[\w+\])?:\s*)?/i, '')
      .replace(/\s*[[(]?\d+(?:\.\d+)?\s?m?s[\])]?$/, '')
      .trim()
    const earlier = list.find(f => text.endsWith(f.text))
    if (earlier) earlier.file ??= file
    else if (text) list.push({ file, text })
  }

  return list
}

/** How many of a check's tests failed, read from its "N pass, M fail" summary; null when the output gave no counts. */
export function failCount(check: Check): { fail: number; total: number } | null {
  const m = check.summary.match(/^(\d+) pass, (\d+) fail$/)

  return m ? { fail: Number(m[2]), total: Number(m[1]) + Number(m[2]) } : null
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
