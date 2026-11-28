// Fails when a Codex test that starts the server waits for the server's background work by
// counting event-loop ticks. Two forms fail: a for or while loop whose body awaits a
// setImmediate or setTimeout promise, and two or more of those awaits in a row. The server's
// settled() resolves once all its background work has ended, so a slow disk cannot make
// the test read a value too early.
//
// Only codex/tests has an equivalent of settled(): the omp controller and the Herdr look
// have no background-work tracker. A file counts when it imports from server-fixtures or
// calls makeServer.
//
// A wait that is not about server work goes in ALLOWED with its reason.
//
// Usage: node scripts/check-tick-waits.mjs

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TESTS = 'codex/tests'

/** Waits that are not about the server's background work. Each names its file, the text of the line, and why. */
const ALLOWED = [
  {
    file: 'codex/tests/server-herdr.spec.ts',
    text: 'await new Promise(r => setTimeout(r, 10))',
    why: 'polls for a callback of the Herdr file watcher, which the server does not track as background work',
  },
  {
    file: 'codex/tests/tab-row-age.spec.ts',
    text: 'await new Promise<void>(resolve => setTimeout(resolve, 25))',
    why: 'polls a page in happy-dom until it draws a row, which no server work decides',
  },
]

const TICK_AWAIT = /await\s+new\s+Promise(<[^>]*>)?\(.*\b(setImmediate|setTimeout)\b/
const LOOP_HEAD = /^\s*(for|while)\b/
const isTickAwait = line => TICK_AWAIT.test(line)
const isLoopHead = line => LOOP_HEAD.test(line)

const indentOf = line => line.length - line.trimStart().length

/** Whether a line sits in the body of a for or while loop, whether the body is the loop's own line, the next line, or a block. */
function isInLoop(lines, i) {
  if (isLoopHead(lines[i])) return true
  if (i > 0 && isLoopHead(lines[i - 1])) return true
  for (let j = i - 1, indent = indentOf(lines[i]); j >= 0; j--) {
    if (lines[j].trim() === '' || indentOf(lines[j]) >= indent) continue
    if (isLoopHead(lines[j])) return true
    indent = indentOf(lines[j])
    if (indent === 0) return false
  }
  return false
}

function hitsIn(lines) {
  const hits = []
  lines.forEach((line, i) => {
    if (!isTickAwait(line)) return
    if (isInLoop(lines, i)) hits.push({ line: i + 1, why: 'a loop of tick awaits' })
    else if (i > 0 && isTickAwait(lines[i - 1])) hits.push({ line: i + 1, why: 'a run of tick awaits' })
  })
  return hits
}

const failures = []
for (const name of readdirSync(join(ROOT, TESTS)).filter(n => n.endsWith('.ts'))) {
  const text = readFileSync(join(ROOT, TESTS, name), 'utf8')
  if (!/server-fixtures|makeServer/.test(text)) continue
  const lines = text.split('\n')
  for (const hit of hitsIn(lines)) {
    const isAllowed = ALLOWED.some(a => a.file === `${TESTS}/${name}` && lines[hit.line - 1].includes(a.text))
    if (!isAllowed) failures.push(`${TESTS}/${name}:${hit.line} is ${hit.why}.`)
  }
}

if (failures.length > 0) {
  for (const f of failures) console.error(f)
  console.error(
    "Await the server's settled() instead: it resolves once its background work has ended. See codex/src/background.ts.",
  )
  process.exit(1)
}
