import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { STATUS_SYSTEM } from '../hooks/model-text'
import { parseStatus } from '../hooks/status'
import { STATUS_RECORD_VERSION } from '../hooks/session-host'
import type { StatusRecord } from '../hooks/session-host'
import type { SessionStatus } from '../types'
import { run } from '../codex/src/run'
import { codexAsk, MODEL } from '../codex/src/update'
import { claude, CLAUDE_MODEL } from './claude-model'
import { codexCli } from './codex-cli'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { run: { type: 'boolean', default: false }, system: { type: 'boolean', default: false } },
})
const given = positionals[0]
if (!given) {
  console.error('Usage: scripts/status-call.sh [--run] [--system] <record file or session folder>')
  process.exit(2)
}
const file = statSync(given).isDirectory()
  ? join(
      given,
      readdirSync(given)
        .filter(n => n.endsWith('.jsonl'))
        .sort()
        .at(-1) ?? '',
    )
  : given
const record = JSON.parse(readFileSync(file, 'utf8')) as StatusRecord
if (record.version !== STATUS_RECORD_VERSION) {
  console.error(`${file} is a version ${record.version} record. This checkout reads version ${STATUS_RECORD_VERSION}.`)
  process.exit(2)
}

const yesNo = (b: boolean) => (b ? 'yes' : 'no')
const when = (at: number) => new Date(at).toISOString().replace('T', ' ').slice(0, 19)

function statusText(o: SessionStatus | null): string {
  if (!o) return '(none)'
  const names = new Map(o.subjects.map(s => [s.id, s.name]))
  const subjects = o.subjects.map(
    s =>
      `  ${s.status.padEnd(14)} ${s.name}: ${s.text}${s.was ? ` (was: ${s.was})` : ''}${s.into ? ` -> ${s.into}` : ''}`,
  )
  const children = o.children.map(
    c =>
      `  ${c.kind.padEnd(14)} ${c.name}${c.subjectId ? ` under ${names.get(c.subjectId) ?? c.subjectId}` : ''}${c.endedAt === null ? ', running' : ''}`,
  )
  const holds = Object.entries(o.askSubjects).map(
    ([ask, subject]) => `  ${ask} holds up ${names.get(subject) ?? subject}`,
  )

  return [
    `Goal: ${o.goal || '(none)'}`,
    ...(subjects.length > 0 ? ['Subjects:', ...subjects] : []),
    ...(children.length > 0 ? ['Children:', ...children] : []),
    ...(holds.length > 0 ? ['Asks:', ...holds] : []),
    `Last look: ${o.lastLookAt === null ? 'never' : when(o.lastLookAt)}`,
  ].join('\n')
}

const isShippedSystem = record.system === STATUS_SYSTEM
console.log(`Status call: ${record.exchange.kind}, from ${record.host}, at ${when(record.at)}`)
console.log(`Session: ${record.session}`)
console.log(`File: ${file}`)
console.log(`Parsed: ${yesNo(record.isParsed)}. Written: ${yesNo(record.isWritten)}.`)
console.log(`System text: ${isShippedSystem ? "this checkout's STATUS_SYSTEM" : "not this checkout's STATUS_SYSTEM"}`)
record.attempts.forEach((a, n) => {
  const by = a.answeredBy ? `, answered by ${a.answeredBy}` : ''
  console.log(`\n== Attempt ${n + 1}: ${a.model ?? 'model not given'}${by}, ${(a.ms / 1000).toFixed(1)} s ==`)
  console.log(a.answer ?? `Error: ${a.error}`)
})
if (values.system || !isShippedSystem) console.log(`\n== System text ==\n${record.system}`)
console.log(`\n== Prompt ==\n${record.prompt}`)
console.log(`\n== Status before ==\n${statusText(record.before)}`)
console.log(`\n== Status after ==\n${statusText(record.after)}`)

/** The record's model as the eval harness calls it, or why it cannot be called from here. */
function sender(): { model: string; send: (onError: (error: string) => void) => Promise<string | null> } | string {
  const asked = record.attempts[0]?.model ?? null
  if (record.host === 'codex') {
    const home = process.env.CODEX_HOME || join(homedir(), '.codex')
    // Without auth.json, codexAsk runs the model in the person's own Codex home, where it reads their AGENTS.md.
    if (!existsSync(join(home, 'auth.json'))) return `--run needs a Codex sign-in in ${join(home, 'auth.json')}`
    const data = mkdtempSync(join(tmpdir(), 'inbox-status-call-'))
    const ask = codexAsk(run, codexCli, data, home)

    return {
      model: MODEL,
      send: onError =>
        ask(record.prompt, record.system, r => r.error && onError(r.error)).finally(() =>
          rmSync(data, { recursive: true, force: true }),
        ),
    }
  }
  const model = record.host === 'claude-code' ? CLAUDE_MODEL : asked?.match(/^anthropic\/(.+)$/)?.[1]
  if (!model) return `--run calls Claude models only, and this record asked for ${asked ?? 'no model'}`

  return { model, send: async () => (await claude(record.prompt, record.system, model)).text }
}

if (values.run) {
  const s = sender()
  if (typeof s === 'string') {
    console.error(`\n${s}`)
    process.exit(2)
  }
  const startedAt = Date.now()
  let error = 'no answer'
  const answer = await s.send(e => (error = e))
  console.log(`\n== Sent again: ${s.model}, ${((Date.now() - startedAt) / 1000).toFixed(1)} s ==`)
  console.log(answer ?? `Error: ${error}`)
  if (answer !== null) console.log(`\nParsed: ${yesNo(parseStatus(answer) !== null)}`)
  process.exit(answer === null ? 1 : 0)
}
