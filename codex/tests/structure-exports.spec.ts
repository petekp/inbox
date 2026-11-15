import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'

import { tempDir } from './helpers'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function exportsFixture(t: TestContext, files: Record<string, string>) {
  const root = tempDir()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  spawnSync('git', ['init', '-q'], { cwd: root })
  cpSync(join(ROOT, 'scripts'), join(root, 'scripts'), { recursive: true })
  mkdirSync(join(root, 'codex'))
  symlinkSync(join(ROOT, 'codex/node_modules'), join(root, 'codex/node_modules'), 'dir')
  for (const [path, text] of Object.entries({ 'hooks/hooks.json': '{ "modules": ["./register.tsx"] }', ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  const result = spawnSync(process.execPath, [join(root, 'scripts/check-exports.mjs')], { cwd: root, encoding: 'utf8' })
  const unused = [...result.stdout.matchAll(/x (\S+) exports (\S+),/g)].map(m => `${m[1]} ${m[2]}`)

  return { status: result.status, unused, output: result.stdout + result.stderr }
}

test('the exports gate counts every kind of import, so a used export never fails it', t => {
  const result = exportsFixture(t, {
    'hooks/register.tsx': `import { named as renamed, type Shape } from './lib.ts'
import fallback from './lib'
import * as all from './spread.js'
export { forwarded } from './lib.ts'
type Later = import('./lib').Typed
const later = import('./dynamic')
const view = <Client module="./row-client.tsx" />
export const register = [renamed, fallback, all, later, view] as unknown as Shape | Later
`,
    'hooks/lib.ts': `export const named = 1
export type Shape = number
export interface Typed {}
export const forwarded = 2
export default 3
`,
    'hooks/spread.ts': 'export const anything = 4\n',
    'hooks/dynamic.ts': 'export const loaded = 5\n',
    'hooks/row-client.tsx': 'export default function Row() {}\n',
  })

  assert.deepEqual(result.unused, [], result.output)
  assert.equal(result.status, 0, result.output)
})

test('the exports gate fails on an export nothing imports, even in a file another export of which is an entry point', t => {
  const result = exportsFixture(t, {
    'hooks/register.tsx':
      "import { used } from './lib'\nconst { picked } = await import('./late')\nexport const register = [used, picked]\n",
    'hooks/late.ts': 'export const picked = 1\nexport const ignored = 2\n',
    'hooks/lib.ts':
      'export const used = 1\nexport function leftover() {}\nexport const { a, b: [c] } = { a: 1, b: [2] }\n',
    'omp/src/host.ts': 'export default function () {}\nexport const extra = 1\n',
    'videos/src/videos.ts': 'export const TIMELINES = {}\nexport type Video = string\n',
  })

  assert.deepEqual(result.unused, [
    'hooks/late.ts ignored',
    'hooks/lib.ts leftover',
    'hooks/lib.ts a',
    'hooks/lib.ts c',
    'omp/src/host.ts extra',
    'videos/src/videos.ts Video',
  ])
  assert.equal(result.status, 1, result.output)
})
