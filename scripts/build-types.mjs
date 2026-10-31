// Writes types/index.d.ts from the parts in types/parts/. plugin.json names that file as the mod's state contract.
// `claude plugin validate` refuses a contract that imports from another file or re-exports one. Each part imports the
// types it names from the other parts, so tsc and an editor can read it on its own. The build drops those imports.
//
// Usage: node scripts/build-types.mjs [--check]
//
// With --check, writes nothing and exits 1 when types/index.d.ts differs from what the parts build.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TYPES = join(ROOT, 'types', 'index.d.ts')
const PARTS = join(ROOT, 'types', 'parts')
const IMPORTS = /^(?:import type \{[^}]*\} from '\.\/[\w-]+'\n)+\n/

const body = name => {
  const text = readFileSync(join(PARTS, name), 'utf8').replace(IMPORTS, '')
  if (/^import /m.test(text)) {
    console.error(`types/parts/${name} has an import the build cannot drop. Import only types, from './<part>'.`)
    process.exit(1)
  }
  return text
}

const types = [
  '// Built by scripts/build-types.mjs from types/parts/. Edit a part, then run the script.\n',
  ...['status.d.ts', 'items.d.ts', 'press.d.ts', 'ledger.d.ts', 'session.d.ts', 'claude-code.d.ts'].map(body),
].join('\n')

if (process.argv.includes('--check')) {
  if (readFileSync(TYPES, 'utf8') !== types) {
    console.error('types/index.d.ts differs from its parts. Run: node scripts/build-types.mjs')
    process.exit(1)
  }
} else {
  writeFileSync(TYPES, types)
}
