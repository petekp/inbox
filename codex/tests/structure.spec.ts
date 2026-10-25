import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'

import { tempDir } from './helpers'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

type Entry = [client: string, feature: string, support: string]

function clientsSource(features = ['catch-up', 'link-open-rule'], entries: Entry[] = []) {
  const supportOf = (client: string, feature: string) =>
    entries.find(e => e[0] === client && e[1] === feature)?.[2] ?? "{ kind: 'full' }"
  const clients = ['claude-code', 'codex', 'omp'].map(
    client => `'${client}': { support: { ${features.map(f => `'${f}': ${supportOf(client, f)}`).join(', ')} } },`,
  )

  return `export type FeatureId = ${features.map(f => `'${f}'`).join(' | ')}
export const CLIENTS = { ${clients.join('\n')} }
`
}

function looksSource(main: string[] = [], omp: string[] = []) {
  const row = (ids: string[]) => `| Topic (${ids.map(id => `\`${id}\``).join(', ')}) | a | b |`
  return `## Differences on purpose

| Topic | Terminal | Why |
| --- | --- | --- |
| Keys | a | b |
${main.map(id => row([id])).join('\n')}

### omp

| Topic | omp | Why |
| --- | --- | --- |
${omp.map(id => row([id])).join('\n')}

## Adding a host
`
}

const unsupported = "{ kind: 'unsupported', reason: 'Not built yet.' }"

function fixture(t: TestContext) {
  const root = tempDir()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  write('scripts/check-structure.mjs', '')
  copyFileSync(join(ROOT, 'scripts/check-structure.mjs'), join(root, 'scripts/check-structure.mjs'))
  for (const file of readdirSync(join(ROOT, 'hooks')).filter(f => f.endsWith('.ts')))
    write(`hooks/${file}`, 'export const value = 1\n')
  write('hooks/register.tsx', 'export const value = 1\n')
  write('hooks/row-client.tsx', 'export const value = 1\n')
  write('types/index.d.ts', 'export interface Value {}\n')
  write('codex/src/host.ts', 'export const value = 1\n')
  write('codex/tests/.keep', '')
  write('codex/package.json', '{"type":"module"}\n')
  symlinkSync(join(ROOT, 'codex/node_modules'), join(root, 'codex/node_modules'), 'dir')
  write('hooks/clients.ts', clientsSource())
  write('docs/looks.md', looksSource())
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: { module: 'esnext', moduleResolution: 'bundler', paths: { '@hooks/*': ['./hooks/*'] } },
      include: ['hooks', 'types', 'codex/src', 'codex/tests'],
    }),
  )

  const withFileRows = (unmapped: string[]) => {
    const files = ['hooks', 'codex/src', 'omp/src']
      .filter(dir => existsSync(join(root, dir)))
      .flatMap(dir => readdirSync(join(root, dir)).map(entry => `${dir}/${entry}`))
      .filter(path => /\.(?:ts|tsx|html)$/.test(path) && !path.endsWith('.d.ts') && !unmapped.includes(path))
    const looks = readFileSync(join(root, 'docs/looks.md'), 'utf8')
    write('docs/looks.md', `## Files\n\n${files.map(path => `| \`${path}\` | a |`).join('\n')}\n\n${looks}`)
  }

  return {
    write,
    check: ({ unmapped = [] }: { unmapped?: string[] } = {}) => {
      withFileRows(unmapped)
      return spawnSync(process.execPath, [join(root, 'scripts/check-structure.mjs')], { cwd: root, encoding: 'utf8' })
    },
  }
}

test('the structure gate accepts shared imports by their resolved target, including renamed bindings, aliases and types', t => {
  const f = fixture(t)
  f.write(
    'hooks/view.ts',
    `import { value as renamed } from './ledger.ts'
export { value as exported } from './folder/../presses.js'
import type { Value } from '../types/index.d.ts'
const loaded = import('./ledger')
const text = 'import("./register")'
export const value = renamed
`,
  )
  f.write(
    'codex/src/nested/consumer.ts',
    `import { value } from '../../../hooks/view.ts'
export { value as other } from '@hooks/presses'
const loaded = import('../../../hooks/tones.js')
export type Value = import('../../../types').Value
`,
  )
  const result = f.check()
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

const forbidden = [
  { path: 'hooks/view.ts', text: "import { value } from './register'", target: './register' },
  { path: 'hooks/view.ts', text: "const host = import('./register.tsx')", target: './register.tsx' },
  { path: 'hooks/view.ts', text: 'const target = "./register"; const host = import(target)', target: 'computed' },
  { path: 'hooks/view.ts', text: "export { value as other } from '../codex/src/host'", target: '../codex/src/host' },
  { path: 'hooks/tones.ts', text: "import { value } from './register'", target: './register' },
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
    text: "export { value } from '../../../hooks/row-client.tsx'",
    target: '../../../hooks/row-client.tsx',
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
  { path: 'hooks/view.ts', text: "import type { SessionMessage } from 'claude-code'", target: 'claude-code' },
  { path: 'hooks/ledger.ts', text: "import type { SessionMessage } from 'claude-code'", target: 'claude-code' },
  { path: 'codex/src/consumer.ts', text: "import { value } from '../../hooks/claude'", target: '../../hooks/claude' },
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

test('the structure gate rejects an existing JavaScript file that shadows a shared TypeScript module', t => {
  const f = fixture(t)
  f.write('hooks/view.js', 'export const value = 1\n')
  f.write('codex/src/consumer.ts', "import { value } from '../../hooks/view.js'\n")
  const result = f.check()
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(result.stdout.includes('codex/src/consumer.ts'), result.stdout + result.stderr)
  assert.ok(result.stdout.includes('../../hooks/view.js'), result.stdout + result.stderr)
})

test('the structure gate follows local bridges from Codex and shared type imports', t => {
  for (const [entry, bridge, imported, mode, expected] of [
    ['codex/src/consumer.ts', 'evals/bridge.ts', "import '../hooks/claude'", 'Codex', 'hooks/claude'],
    [
      'hooks/view.ts',
      'types/bridge.d.ts',
      "import type { Host } from '../hooks/claude'",
      'shared type',
      'hooks/claude',
    ],
    [
      'hooks/view.ts',
      'types/bridge.ts',
      "export type Host = import('../codex/src/host').Value",
      'shared source',
      'codex/src/host',
    ],
  ] as const) {
    const f = fixture(t)
    f.write(
      entry,
      entry.startsWith('codex/') ? "import '../../evals/bridge'\n" : "import type { Host } from '../types/bridge'\n",
    )
    f.write(bridge, imported + '\n')
    f.write('hooks/claude.ts', 'export interface Host {}\n')
    const result = f.check()
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.ok(result.stdout.includes(expected), `${mode}: ${result.stdout}`)
  }
})

test('the structure gate accepts transitive shared imports through local source and type bridges', t => {
  const f = fixture(t)
  f.write('hooks/view.ts', "import type { Value } from '../types/bridge'\n")
  f.write('types/bridge.d.ts', "import type { Value } from '../hooks/ledger'\nexport type Bridge = Value\n")
  f.write('evals/bridge.ts', "export { value } from '../hooks/view'\n")
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

test('the structure gate rejects a source file that has no Files row in docs/looks.md', t => {
  const f = fixture(t)
  f.write('codex/src/consumer.ts', 'export const value = 1\n')
  const result = f.check({ unmapped: ['codex/src/consumer.ts'] })
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(result.stdout.includes('no Files row for codex/src/consumer.ts'), result.stdout + result.stderr)
})

test('the structure gate accepts a feature that is not full when each table that covers the host names it', t => {
  const f = fixture(t)
  f.write(
    'hooks/clients.ts',
    clientsSource(undefined, [
      ['codex', 'catch-up', unsupported],
      ['omp', 'catch-up', unsupported],
    ]),
  )
  f.write('docs/looks.md', looksSource(['catch-up'], ['catch-up']))
  const result = f.check()
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

test('the structure gate rejects a feature that is not full and has no row', t => {
  const f = fixture(t)
  f.write('hooks/clients.ts', clientsSource(undefined, [['codex', 'catch-up', unsupported]]))
  const result = f.check()
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(result.stdout.includes('`catch-up`'), result.stdout + result.stderr)
  assert.ok(result.stdout.includes("'codex'"), result.stdout + result.stderr)
})

test('the structure gate rejects an omp gap that only the main table names', t => {
  const f = fixture(t)
  f.write('hooks/clients.ts', clientsSource(undefined, [['omp', 'catch-up', unsupported]]))
  f.write('docs/looks.md', looksSource(['catch-up'], []))
  const result = f.check()
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(result.stdout.includes("'omp'"), result.stdout + result.stderr)
})

test('the structure gate rejects a row that names an unknown feature id', t => {
  const f = fixture(t)
  f.write('docs/looks.md', looksSource(['no-such-feature']))
  const result = f.check()
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(result.stdout.includes("'no-such-feature'"), result.stdout + result.stderr)
})

test('the structure gate rejects an entry that is not full and gives no reason', t => {
  const f = fixture(t)
  f.write('hooks/clients.ts', clientsSource(undefined, [['codex', 'catch-up', "{ kind: 'different', reason: '' }"]]))
  f.write('docs/looks.md', looksSource(['catch-up']))
  const result = f.check()
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(result.stdout.includes('no reason'), result.stdout + result.stderr)
})

for (const id of ['catchUp', 'catch_up', 'Catch-up', 'catch--up', 'catch-up-2'])
  test(`the structure gate rejects the feature id ${id}`, t => {
    const f = fixture(t)
    f.write('hooks/clients.ts', clientsSource([id]))
    const result = f.check()
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.ok(result.stdout.includes(`'${id}'`), result.stdout + result.stderr)
  })
