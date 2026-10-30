import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkClients } from './structure/clients.mjs'
import { checkDocs, checkLookMap } from './structure/docs.mjs'
import { checkHooksModules } from './structure/hooks-module.mjs'
import { checkImports } from './structure/imports.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const errors = []
for (const check of [checkImports, checkHooksModules, checkDocs, checkLookMap, checkClients]) check(ROOT, errors)

for (const e of errors) console.log(`  x ${e}`)
process.exit(errors.length ? 1 : 0)
