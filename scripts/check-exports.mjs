import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkExports } from './structure/exports.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const errors = []
checkExports(ROOT, errors)

for (const e of errors) console.log(`  x ${e}`)
process.exit(errors.length ? 1 : 0)
