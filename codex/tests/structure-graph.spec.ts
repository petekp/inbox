import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fixture, type Fixture } from './structure-fixtures'

test('the structure gate rejects value imports that form a cycle', t => {
  const f = fixture(t)
  f.write('codex/src/cycle-b.ts', "export { a as b } from '@hooks/cycle-a'\n")
  f.write('hooks/cycle-a.ts', "import { b } from '../codex/src/cycle-b'\nexport const a = () => b\n")
  const result = f.check()
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(
    result.stdout.includes(
      'Value imports form a cycle: codex/src/cycle-b.ts -> hooks/cycle-a.ts -> codex/src/cycle-b.ts',
    ),
    result.stdout + result.stderr,
  )
})

function writeToolLists(f: Fixture, lengths: { claudeClose: number; codexView: number }) {
  f.write(
    'core/domain/model-text.ts',
    `export const CLAUDE_CODE = { guidance: 'g'.repeat(${lengths.claudeClose - 5}) }
export const MAX_TOOL_DESCRIPTION = 4096
export const guidedCloseDescription = (host: { guidance?: string }, description: string) => description + (host.guidance ?? '')
`,
  )
  f.write(
    'core/runtime/tools.ts',
    "export const agentTools = (host: object) => [{ name: 'close', description: 'close' }]\n",
  )
  f.write(
    'codex/src/server-tools.ts',
    `export const TOOLS = [{ name: 'inbox_view', description: 'v'.repeat(${lengths.codexView}) }]\n`,
  )
  f.write('omp/src/texts.ts', 'export const OMP = {}\nexport const emptyEntries = () => null\n')
  f.write('omp/tests/.keep', '')
}

test('the structure gate accepts tool descriptions that fit what Claude Code passes to the model', t => {
  const f = fixture(t)
  writeToolLists(f, { claudeClose: 4096, codexView: 4096 })
  const result = f.check()
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

test('the structure gate rejects a tool description longer than Claude Code passes to the model', t => {
  const f = fixture(t)
  writeToolLists(f, { claudeClose: 4097, codexView: 5000 })
  const result = f.check()
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(
    result.stdout.includes("Claude Code's close tool description is 4097 characters"),
    result.stdout + result.stderr,
  )
  assert.ok(
    result.stdout.includes("Codex's inbox_view tool description is 5000 characters"),
    result.stdout + result.stderr,
  )
  assert.ok(!result.stdout.includes("omp's close"), result.stdout + result.stderr)
})

test('the structure gate accepts a cycle closed only by type imports or import() calls', t => {
  const f = fixture(t)
  f.write('hooks/cycle-a.ts', "import { b } from './cycle-b'\nexport type A = number\nexport const a = () => b\n")
  f.write(
    'hooks/cycle-b.ts',
    `import type { A } from './cycle-a'
import { type A as Same } from './cycle-a'
export type { A as Again } from './cycle-a'
const later = import('./cycle-a')
export const b = (value: A, same: Same) => [value, same, later]
`,
  )
  const result = f.check()
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

test('the structure gate rejects a look-map event the named file does not subscribe to', t => {
  const f = fixture(t)
  f.write('core/view/view.ts', "export const wire = (on: (event: string) => void) => on('turn.end')\n")
  f.write(
    'docs/looks/owners-events.md',
    "`core/view/view.ts:on('turn.end')` and `core/view/view.ts:on('turn.start')`\n",
  )
  const result = f.check()
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(
    result.stdout.includes(
      "core/view/view.ts:on('turn.start'), and core/view/view.ts subscribes to no 'turn.start' event",
    ),
    result.stdout + result.stderr,
  )
  assert.ok(!result.stdout.includes("'turn.end' event"), result.stdout + result.stderr)
})
