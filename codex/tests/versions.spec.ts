import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'

import { tempDir } from './helpers'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function checkVersions(t: TestContext, versions: { claude: string; codex: string; omp: string }) {
  const root = tempDir()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (path: string, json: object) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), JSON.stringify(json))
  }
  write('.claude-plugin/plugin.json', { name: 'inbox', version: versions.claude })
  write('codex/plugin/.codex-plugin/plugin.json', { name: 'inbox', version: versions.codex })
  write('omp/package.json', { name: 'inbox', version: versions.omp })
  mkdirSync(join(root, 'scripts'))
  copyFileSync(join(ROOT, 'scripts/check-versions.mjs'), join(root, 'scripts/check-versions.mjs'))

  return spawnSync(process.execPath, [join(root, 'scripts/check-versions.mjs')], { encoding: 'utf8' })
}

test('the version check passes when the three manifests agree, and names each manifest that differs', t => {
  assert.equal(checkVersions(t, { claude: '1.2.3', codex: '1.2.3', omp: '1.2.3' }).status, 0)

  const differing = checkVersions(t, { claude: '1.2.3', codex: '1.2.4', omp: '1.2.3' })
  assert.equal(differing.status, 1)
  assert.match(
    differing.stderr,
    /codex\/plugin\/\.codex-plugin\/plugin\.json has version 1\.2\.4, and \.claude-plugin\/plugin\.json has 1\.2\.3\./,
  )
  assert.doesNotMatch(differing.stderr, /omp\/package\.json/)
})
