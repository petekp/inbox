// Fails when the three plugin manifests give different versions. A release sets
// the version in each, and the Codex and omp bundles take it from their own.
//
// Usage: node scripts/check-versions.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFESTS = ['.claude-plugin/plugin.json', 'codex/plugin/.codex-plugin/plugin.json', 'omp/package.json']

const manifests = MANIFESTS.map(path => ({ path, version: JSON.parse(readFileSync(join(ROOT, path), 'utf8')).version }))
const [first] = manifests
const differing = manifests.filter(m => m.version !== first.version)

if (differing.length > 0) {
  for (const m of differing)
    console.error(`${m.path} has version ${m.version}, and ${first.path} has ${first.version}.`)
  console.error('Give all three the same version.')
  process.exit(1)
}
