// Fails when the three plugin manifests give different versions, or when the
// Claude Code version range in .claude-plugin/plugin.json differs from the one the
// README names. A release sets the version in each, and the Codex and omp bundles
// take it from their own.
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

const declared = JSON.parse(readFileSync(join(ROOT, '.claude-plugin/plugin.json'), 'utf8')).engines?.['claude-code']
const readmeMinimum = /It needs Claude Code (\d+\.\d+\.\d+) or later/.exec(
  readFileSync(join(ROOT, 'README.md'), 'utf8'),
)?.[1]

if (readmeMinimum === undefined || declared !== `>=${readmeMinimum}`) {
  console.error(
    `.claude-plugin/plugin.json has engines["claude-code"] ${JSON.stringify(declared)}, and README.md says ${readmeMinimum === undefined ? 'no minimum Claude Code version' : `Claude Code ${readmeMinimum} or later`}.`,
  )
  console.error('Make the README line "It needs Claude Code X or later" and the range ">=X" agree.')
  process.exit(1)
}
