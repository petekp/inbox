// Fails when a test that starts a host's code waits for the host's background work by counting
// event-loop ticks. Each host tracks the work it starts and does not wait for, and gives its tests
// a call that resolves once that work has ended, so a slow disk cannot make a test read a value
// too early:
//
//   codex/tests  files that import server-fixtures or call makeServer  the server's settled()
//   omp/tests    files that import host-harness                         settle() in host-harness.ts
//
// The Herdr look has no tracker: its work runs through gpui's spawn, so herdr/tests is left out.
// The omp controller tests have none either, and are left out.
//
// Two forms fail: a for, while or do loop whose body awaits a tick, and two or more tick awaits in
// a row. A tick await is an await of a setImmediate or setTimeout promise, of Bun.sleep, or of a
// helper in the same file whose body is one. A tick await broken across lines, process.nextTick,
// and a tick imported from node:timers/promises are not read.
//
// A wait that is not about the host's background work goes in ALLOWED with its reason.
//
// Usage: node scripts/check-tick-waits.mjs

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const SCOPES = [
  { dir: 'codex/tests', isHostTest: /server-fixtures|makeServer/, settled: "the server's settled()" },
  { dir: 'omp/tests', isHostTest: /host-harness/, settled: 'settle() in omp/tests/host-harness.ts' },
]

/** Waits that are not about the host's background work. Each names its file, the text of the line, and why. */
const ALLOWED = [
  {
    file: 'codex/tests/server-herdr.spec.ts',
    text: 'await new Promise(r => setTimeout(r, 10))',
    why: 'polls for a callback of the Herdr file watcher, which the server does not track as background work',
  },
  {
    file: 'codex/tests/tab-row-age.spec.ts',
    text: 'await new Promise<void>(resolve => setTimeout(resolve, 25))',
    why: "polls a page in happy-dom until it draws a row. The page's drawing and its poll timer are outside settled()",
  },
  {
    file: 'codex/tests/tab-collapse.spec.ts',
    text: 'await pause(',
    why: "polls a page in happy-dom until it draws or settles, and holds for a fixed time while the page's own timers run. Both are outside settled()",
  },
  {
    file: 'codex/tests/row-actions-start.spec.ts',
    text: 'await pause(25)',
    why: "polls a page in happy-dom until it draws a control. The page's drawing is outside settled()",
  },
  {
    file: 'omp/tests/host-panel.spec.ts',
    text: 'await tick()',
    why: "polls the panel's rendered text, which the host draws on its own timers, outside settle()",
  },
  {
    file: 'omp/tests/host-presses.spec.ts',
    text: 'await Bun.sleep(10)',
    why: "polls for a session file or a drained queue folder that the host's files appear in outside deps.background",
  },
  {
    file: 'omp/tests/host-presses.spec.ts',
    text: 'await new Promise(r => setTimeout(r, 5))',
    why: 'waits for a send that a timer callback starts. The fake send never resolves, so settle() would never return',
  },
  {
    file: 'omp/tests/host-inbox-calls.spec.ts',
    text: 'await Bun.sleep(5)',
    why: 'polls for the record file of a Status call. A trial that read the file right after settle() failed under load, so the write is outside settle()',
  },
  {
    file: 'omp/tests/host-inbox-calls.spec.ts',
    text: 'await new Promise(resolve => setTimeout(resolve, 10))',
    why: 'waits for Status calls that a test holds open with w.statusHold or that settle() does not cover. A trial with settle() timed out after 5 s in the two tests that wait here',
  },
]

const TICK_PROMISE = /new\s+Promise(<[^>]*>)?\(.*\b(setImmediate|setTimeout)\b|\bBun\.sleep\(/
const LOOP_HEAD = /^\s*(for|while|do)\b/
const indentOf = line => line.length - line.trimStart().length

/** Names of the functions in a file whose body is a tick promise, such as `const pause = ms => new Promise(...)`. */
function tickHelpers(lines) {
  const names = []
  for (const line of lines) {
    const named = /^\s*(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?\(.*\)\s*(?::\s*[^=]+)?=>\s*(.*)$/.exec(line)
    if (named && TICK_PROMISE.test(named[2])) names.push(named[1])
    const declared = /^\s*(?:async\s+)?function\s+(\w+)\(.*\{\s*return\s+(.*)$/.exec(line)
    if (declared && TICK_PROMISE.test(declared[2])) names.push(declared[1])
  }
  return names
}

/** Whether a loop head's own line holds its whole body, as in `for (const x of xs) seen.push(x)`. */
function isLoopWithBodyOnItsLine(line) {
  const open = line.indexOf('(')
  if (open < 0) return false
  let depth = 0
  for (let i = open; i < line.length; i++) {
    if (line[i] === '(') depth++
    if (line[i] === ')' && --depth === 0) return line.slice(i + 1).trim() !== '' && !line.trimEnd().endsWith('{')
  }
  return false
}

/** Whether a line sits in the body of a loop, as its own line, as the line after the head, or in a block. */
function isInLoop(lines, i) {
  if (LOOP_HEAD.test(lines[i])) return true
  if (i > 0 && LOOP_HEAD.test(lines[i - 1]) && !isLoopWithBodyOnItsLine(lines[i - 1])) return true
  for (let j = i - 1, indent = indentOf(lines[i]); j >= 0; j--) {
    if (lines[j].trim() === '' || indentOf(lines[j]) >= indent) continue
    if (LOOP_HEAD.test(lines[j]) && lines[j].trimEnd().endsWith('{')) return true
    if (LOOP_HEAD.test(lines[j]) && !isLoopWithBodyOnItsLine(lines[j])) return true
    indent = indentOf(lines[j])
    if (indent === 0) return false
  }
  return false
}

function hitsIn(lines) {
  const helpers = tickHelpers(lines)
  const isHelperCall = line => helpers.some(name => new RegExp(`await\\s+${name}\\(`).test(line))
  const isTickAwait = line =>
    (/\bawait\b/.test(line) && TICK_PROMISE.test(line) && !/^\s*(const|let)\s+\w+\s*=.*=>/.test(line)) ||
    isHelperCall(line)
  const hits = []
  lines.forEach((line, i) => {
    if (!isTickAwait(line)) return
    if (isInLoop(lines, i)) hits.push({ line: i + 1, why: 'a loop of tick awaits' })
    else if (i > 0 && isTickAwait(lines[i - 1])) hits.push({ line: i + 1, why: 'a run of tick awaits' })
  })
  return hits
}

const failures = []
for (const { dir, isHostTest, settled } of SCOPES) {
  for (const name of readdirSync(join(ROOT, dir)).filter(n => n.endsWith('.ts'))) {
    const text = readFileSync(join(ROOT, dir, name), 'utf8')
    if (!isHostTest.test(text)) continue
    const lines = text.split('\n')
    for (const hit of hitsIn(lines)) {
      const isAllowed = ALLOWED.some(a => a.file === `${dir}/${name}` && lines[hit.line - 1].includes(a.text))
      if (isAllowed) continue
      failures.push(`${dir}/${name}:${hit.line} is ${hit.why}. Await ${settled} instead.`)
    }
  }
}

if (failures.length > 0) {
  for (const f of failures) console.error(f)
  console.error('It resolves once the host has ended its background work. See scripts/check-tick-waits.mjs.')
  process.exit(1)
}
