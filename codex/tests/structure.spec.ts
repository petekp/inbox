import assert from 'node:assert/strict'
import { test } from 'node:test'

import { clientsSource, fixture, type Fixture, unsupported } from './structure-fixtures'

test('the structure gate accepts core imports by their resolved target, including renamed bindings, aliases and types', t => {
  const f = fixture(t)
  f.write(
    'core/view/view.ts',
    `import { value as renamed } from '../domain/ledger.ts'
export { value as exported } from './folder/../../domain/presses.js'
import type { Value } from '../../types/index.d.ts'
const loaded = import('../domain/ledger')
const text = 'import("../../hooks/register")'
export const value = renamed
`,
  )
  f.write(
    'codex/src/nested/consumer.ts',
    `import { value } from '../../../core/view/view.ts'
export { value as other } from '@core/domain/presses'
const loaded = import('../../../core/view/tones.js')
export type Value = import('../../../types').Value
`,
  )
  const result = f.check()
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

test('the structure gate accepts a type-only import from a later core layer', t => {
  const f = fixture(t)
  f.write(
    'core/domain/ledger.ts',
    `import type { Value } from '../view/view'
import type { Other } from '../remote/herdr'
export type { Third } from '../runtime/tools'
export type Shape = import('../view/tones').Value
export const value = 1
`,
  )
  const result = f.check()
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

test('the structure gate rejects a source file directly in core/', t => {
  const f = fixture(t)
  f.write('core/loose.ts', 'export const value = 1\n')
  const result = f.check()
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(result.stdout.includes('core/loose.ts is in no layer'), result.stdout + result.stderr)
})

const forbidden = [
  { path: 'core/view/view.ts', text: "import { value } from '../../hooks/register'", target: './register' },
  { path: 'core/view/view.ts', text: "const host = import('../../hooks/register.tsx')", target: './register.tsx' },
  { path: 'core/view/view.ts', text: 'const target = "./register"; const host = import(target)', target: 'computed' },
  {
    path: 'core/view/view.ts',
    text: "export { value as other } from '../../codex/src/host'",
    target: '../codex/src/host',
  },
  { path: 'core/view/tones.ts', text: "import { value } from '../../hooks/register'", target: './register' },
  { path: 'hooks/mod/claude.ts', text: "import { value } from '../../codex/src/host'", target: '../codex/src/host' },
  {
    path: 'codex/src/consumer.ts',
    text: "import { value } from '../../hooks/register.tsx'",
    target: '../../hooks/register.tsx',
  },
  { path: 'codex/src/consumer.ts', text: "export * from '../../hooks/register'", target: '../../hooks/register' },
  {
    path: 'codex/src/consumer.ts',
    text: 'const host = import(`../../hooks/register`)',
    target: '../../hooks/register',
  },
  {
    path: 'codex/src/consumer.ts',
    text: "export type Host = import('../../hooks/register').value",
    target: '../../hooks/register',
  },
  {
    path: 'codex/src/consumer.ts',
    text: "const host = require('../../hooks/register')",
    target: '../../hooks/register',
  },
  {
    path: 'codex/src/nested/consumer.ts',
    text: "const host = import('../../../hooks/register')",
    target: '../../../hooks/register',
  },
  {
    path: 'codex/tests/nested/consumer.ts',
    text: "export { value } from '../../../hooks/pane/row-client.tsx'",
    target: '../../../hooks/pane/row-client.tsx',
  },
  {
    path: 'codex/src/consumer.ts',
    text: 'const target = "../../hooks/register.tsx"; const host = import(target)',
    target: 'computed',
  },
  {
    path: 'codex/tests/nested/consumer.ts',
    text: 'const target = "../../../hooks/register.tsx"; const host = require(target)',
    target: 'computed',
  },
  {
    path: 'codex/src/server-main.ts',
    text: 'export function other(url: string) { return import(url) }',
    target: 'computed',
  },
  {
    path: 'codex/src/server-main.ts',
    text: 'export function outer() { function load(url: string) { return import(url) } }',
    target: 'computed',
  },
  {
    path: 'codex/src/server-main.ts',
    text: 'export function load(url: string) { return require(url) }',
    target: 'computed',
  },
  { path: 'codex/src/consumer.ts', text: "import { value } from '@hooks/register'", target: '@hooks/register' },
  { path: 'core/view/view.ts', text: "import type { SessionMessage } from 'claude-code'", target: 'claude-code' },
  { path: 'core/domain/ledger.ts', text: "import type { SessionMessage } from 'claude-code'", target: 'claude-code' },
  {
    path: 'codex/src/consumer.ts',
    text: "import { value } from '../../hooks/mod/claude'",
    target: '../../hooks/mod/claude',
  },
  {
    path: 'exact/bridge/consumer.ts',
    text: "import { value } from '../../hooks/mod/claude'",
    target: '../../hooks/mod/claude',
  },
  {
    path: 'exact/bridge/consumer.ts',
    text: "import { value } from '../../codex/src/host'",
    target: '../../codex/src/host',
  },
  {
    path: 'exact/bridge/consumer.ts',
    text: "import { value } from '../../herdr/src/main'",
    target: '../../herdr/src/main',
  },
  {
    path: 'exact/bridge/consumer.ts',
    text: "import { value } from '../../omp/src/host'",
    target: '../../omp/src/host',
  },
]

for (const { path, text, target } of forbidden)
  test(`the structure gate rejects ${text} in ${path}`, t => {
    const f = fixture(t)
    f.write(path, `${text}\n`)
    const result = f.check()
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.ok(result.stdout.includes(path), result.stdout + result.stderr)
    const name =
      target
        .split('/')
        .at(-1)
        ?.replace(/\.tsx?$/, '') ?? target
    assert.ok(result.stdout.includes(name), result.stdout + result.stderr)
  })

const laterLayerLoads = [
  { path: 'core/domain/ledger.ts', text: "import { value } from '../view/view'", layer: 'core/view' },
  { path: 'core/domain/ledger.ts', text: "import { value, type Value } from '../view/view'", layer: 'core/view' },
  { path: 'core/domain/ledger.ts', text: "import { type Value } from '../view/view'", layer: 'core/view' },
  { path: 'core/domain/ledger.ts', text: "export { type Value } from '../view/view'", layer: 'core/view' },
  { path: 'core/view/view.ts', text: "export { value } from '../runtime/tools'", layer: 'core/runtime' },
  { path: 'core/runtime/tools.ts', text: "const remote = import('../remote/herdr')", layer: 'core/remote' },
]

for (const { path, text, layer } of laterLayerLoads)
  test(`the structure gate rejects ${text} in ${path} as a load from ${layer}`, t => {
    const f = fixture(t)
    f.write(path, `${text}\n`)
    const result = f.check()
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.ok(result.stdout.includes(`${path} loads '`), result.stdout + result.stderr)
    assert.ok(result.stdout.includes(`from ${layer}.`), result.stdout + result.stderr)
  })

test('the structure gate rejects a core file that loads a later layer through a file in types/', t => {
  const f = fixture(t)
  f.write('types/bridge.ts', "export { value } from '../core/remote/herdr'\n")
  f.write('core/domain/ledger.ts', "import { value } from '../../types/bridge'\nexport const used = value\n")
  const result = f.check()
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(
    result.stdout.includes("types/bridge.ts, which core/domain loads, loads '../core/remote/herdr' from core/remote."),
    result.stdout + result.stderr,
  )
})

test('the structure gate accepts a core file that names a type through a file in types/ that loads a later layer', t => {
  const f = fixture(t)
  f.write('types/bridge.ts', "export { value } from '../core/remote/herdr'\nexport type Value = number\n")
  f.write('core/domain/ledger.ts', "import type { Value } from '../../types/bridge'\nexport type Used = Value\n")
  const result = f.check()
  assert.ok(!result.stdout.includes('types/bridge.ts'), result.stdout + result.stderr)
})

test('the structure gate checks an existing JavaScript file that shadows a core TypeScript module as core code', t => {
  const f = fixture(t)
  f.write('core/view/view.js', "export { value } from '../../hooks/register.tsx'\n")
  f.write('codex/src/consumer.ts', "import { value } from '../../core/view/view.js'\n")
  const result = f.check()
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(result.stdout.includes('core/view/view.js'), result.stdout + result.stderr)
  assert.ok(result.stdout.includes('../../hooks/register.tsx'), result.stdout + result.stderr)
})

test('the structure gate follows local bridges from Codex and core type imports', t => {
  for (const [entry, bridge, imported, mode, expected] of [
    ['codex/src/consumer.ts', 'evals/bridge.ts', "import '../hooks/mod/claude'", 'Codex', 'hooks/mod/claude'],
    [
      'core/view/view.ts',
      'types/bridge.d.ts',
      "import type { Host } from '../hooks/mod/claude'",
      'core type',
      'hooks/mod/claude',
    ],
    [
      'core/view/view.ts',
      'types/bridge.ts',
      "export type Host = import('../codex/src/host').Value",
      'core source',
      'codex/src/host',
    ],
  ] as const) {
    const f = fixture(t)
    f.write(
      entry,
      entry.startsWith('codex/') ? "import '../../evals/bridge'\n" : "import type { Host } from '../../types/bridge'\n",
    )
    f.write(bridge, imported + '\n')
    f.write('hooks/mod/claude.ts', 'export interface Host {}\n')
    const result = f.check()
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.ok(result.stdout.includes(expected), `${mode}: ${result.stdout}`)
  }
})

test('the structure gate accepts transitive core imports through local source and type bridges', t => {
  const f = fixture(t)
  f.write('core/view/view.ts', "import type { Value } from '../../types/bridge'\n")
  f.write('types/bridge.d.ts', "import type { Value } from '../core/domain/ledger'\nexport type Bridge = Value\n")
  f.write('evals/bridge.ts', "export { value } from '../core/view/view'\n")
  f.write('codex/src/nested/consumer.ts', "import { value } from '../../../evals/bridge'\n")
  const result = f.check()
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

test('the structure gate permits the runtime loader to import its hot-reload handler URL', t => {
  const f = fixture(t)
  f.write('codex/src/server-main.ts', 'export function load(url: string) { return import(url) }\n')
  const result = f.check()
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

test('the structure gate rejects a source file that has no Files row in docs/looks/', t => {
  const f = fixture(t)
  f.write('codex/src/consumer.ts', 'export const value = 1\n')
  const result = f.check({ unmapped: ['codex/src/consumer.ts'] })
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(result.stdout.includes('no Files row for codex/src/consumer.ts'), result.stdout + result.stderr)
})

test('the structure gate rejects an unmapped exact/bridge/ file in docs/looks/', t => {
  const f = fixture(t)
  f.write('exact/bridge/consumer.ts', 'export const value = 1\n')
  const result = f.check({ unmapped: ['exact/bridge/consumer.ts'] })
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(result.stdout.includes('no Files row for exact/bridge/consumer.ts'), result.stdout + result.stderr)
})

test('the structure gate accepts a feature that is not full when each table that covers the host names it', t => {
  const f = fixture(t)
  f.write(
    'core/domain/clients.ts',
    clientsSource(undefined, [
      ['codex', 'catch-up', unsupported],
      ['omp', 'catch-up', unsupported],
    ]),
  )
  f.looks(['catch-up'], ['catch-up'])
  const result = f.check()
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

test('the structure gate rejects a feature that is not full and has no row', t => {
  const f = fixture(t)
  f.write('core/domain/clients.ts', clientsSource(undefined, [['codex', 'catch-up', unsupported]]))
  const result = f.check()
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(result.stdout.includes('`catch-up`'), result.stdout + result.stderr)
  assert.ok(result.stdout.includes("'codex'"), result.stdout + result.stderr)
})

test('the structure gate rejects an omp gap that only the main table names', t => {
  const f = fixture(t)
  f.write('core/domain/clients.ts', clientsSource(undefined, [['omp', 'catch-up', unsupported]]))
  f.looks(['catch-up'])
  const result = f.check()
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(result.stdout.includes("'omp'"), result.stdout + result.stderr)
})

test('the structure gate rejects a row that names an unknown feature id', t => {
  const f = fixture(t)
  f.looks(['no-such-feature'])
  const result = f.check()
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(result.stdout.includes("'no-such-feature'"), result.stdout + result.stderr)
})

test('the structure gate rejects an entry that is not full and gives no reason', t => {
  const f = fixture(t)
  f.write(
    'core/domain/clients.ts',
    clientsSource(undefined, [['codex', 'catch-up', "{ kind: 'different', reason: '' }"]]),
  )
  f.looks(['catch-up'])
  const result = f.check()
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(result.stdout.includes('no reason'), result.stdout + result.stderr)
})

for (const id of ['catchUp', 'catch_up', 'Catch-up', 'catch--up', 'catch-up-2'])
  test(`the structure gate rejects the feature id ${id}`, t => {
    const f = fixture(t)
    f.write('core/domain/clients.ts', clientsSource([id]))
    const result = f.check()
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.ok(result.stdout.includes(`'${id}'`), result.stdout + result.stderr)
  })

function hooksModule(body: string, top = '') {
  return `import { read, update } from 'claude-code'
import { value } from '../core/view/view'
${top}
function save($: unknown) {
  return update($, value)
}
export const register = (on: any) => {
${body}
}
`
}

function writeHooksModule(f: Fixture, text: string) {
  f.write('hooks/hooks.json', '{ "modules": ["./register.tsx"] }\n')
  f.write('hooks/register.tsx', text)
}

test('the structure gate accepts the hooks module shapes the plugin directory accepts', t => {
  const f = fixture(t)
  writeHooksModule(
    f,
    hooksModule(`  on('tool.check', async ($, e, next) => {
    await save($)
    await read($, 'key')
    if (e.tool === 'Bash') return { decision: 'deny', reason: 'No shell.' }
    return next(e)
  })
  on('tool.check', ($, e, next) => ({ decision: 'ask' }))
  on('classic.PermissionRequest', async ($, e, next) => {
    if (e.x) return { decision: { behavior: 'deny' } }
    return next(e)
  })
  on('tool.call', async ($, e, next) => {
    const width = [1].map(effect => effect)
    return next(e)
  })`),
  )
  const result = f.check()
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

const refusedHooksModules = [
  {
    name: '$ passed to an imported function',
    text: hooksModule(`  on('tool.call', async ($, e, next) => {
    value($)
    return next(e)
  })`),
    at: 'value($)',
    code: 'MOD_CAPABILITY_USE_NOT_PLAIN',
  },
  {
    name: '$ passed to a top-level arrow',
    text: hooksModule(
      `  on('tool.call', async ($, e, next) => {
    await saveLater($)
    return next(e)
  })`,
      'const saveLater = async ($: unknown) => $',
    ),
    at: 'await saveLater($)',
    code: 'MOD_CAPABILITY_USE_NOT_PLAIN',
  },
  {
    name: '$ passed to a function whose signature indexes into EngineInterface',
    text: hooksModule(
      `  on('tool.call', async ($, e, next) => {
    await ask($)
    return next(e)
  })`,
      `import type { EngineInterface } from 'claude-code'
type Answer = Awaited<ReturnType<EngineInterface['model']['complete']>>
function ask($: EngineInterface): Promise<Answer> {
  return $.model.complete({ model: 'haiku', prompt: '' })
}`,
    ),
    at: 'await ask($)',
    code: 'MOD_CAPABILITY_USE_NOT_PLAIN',
  },
  {
    name: 'a tool.check hook that returns the verdict by name',
    text: hooksModule(`  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    return verdict
  })`),
    at: 'return verdict',
    code: 'MOD_PERMISSION_ANSWER_UNREAD',
  },
  {
    name: 'a PermissionRequest hook with a fixed allow',
    text: hooksModule(`  on('classic.PermissionRequest', async ($, e, next) => ({ decision: { behavior: 'allow' } }))`),
    at: "behavior: 'allow'",
    code: 'MOD_PERMISSION_ANSWER_UNREAD',
  },
  {
    name: 'another binding of a permission hook parameter',
    text: hooksModule(`  on('tool.check', async ($, e, next) => next(e))
  on('tool.call', async ($, event, pass) => {
    const ids = [1].map(e => e)
    return pass(event)
  })`),
    at: 'const ids',
    code: 'MOD_PERMISSION_ANSWER_UNREAD',
  },
  {
    name: "a .catch on a permission hook's registration",
    text: hooksModule(
      `  on('classic.PermissionRequest', async ($, e, next) => next(e)).catch(($, e, next) => next(e))`,
    ),
    at: '.catch',
    code: 'MOD_PERMISSION_ANSWER_UNREAD',
  },
  {
    name: 'a binding named h',
    text: hooksModule(`  on('tool.call', async ($, e, next) => {
    const h = 1
    return next(e)
  })`),
    at: 'const h',
    code: 'MOD_CAPABILITY_USE_NOT_PLAIN',
  },
]

for (const { name, text, at, code } of refusedHooksModules)
  test(`the structure gate rejects ${name} in the hooks module`, t => {
    const f = fixture(t)
    writeHooksModule(f, text)
    const line = text.split('\n').findIndex(l => l.includes(at)) + 1
    const result = f.check()
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.ok(result.stdout.includes(`hooks/register.tsx:${line} ${code}`), result.stdout + result.stderr)
  })
