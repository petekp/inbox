import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkClients } from './structure/clients.mjs'
import { checkClassNames } from './structure/class-names.mjs'
import { checkChevrons } from './structure/chevrons.mjs'
import { checkCursors } from './structure/cursors.mjs'
import { checkCycles } from './structure/cycles.mjs'
import { checkDocs, checkLookMap } from './structure/docs.mjs'
import { checkElementAsserts } from './structure/element-asserts.mjs'
import { checkEmptyTab } from './structure/empty-tab.mjs'
import { checkHooksModules } from './structure/hooks-module.mjs'
import { checkImports } from './structure/imports.mjs'
import { checkOverflow } from './structure/overflow.mjs'
import { checkToolDescriptions } from './structure/tool-descriptions.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const errors = []
for (const check of [
  checkImports,
  checkCycles,
  checkHooksModules,
  checkDocs,
  checkLookMap,
  checkClients,
  checkEmptyTab,
  checkClassNames,
  checkChevrons,
  checkCursors,
  checkOverflow,
  checkElementAsserts,
  checkToolDescriptions,
])
  await check(ROOT, errors)

for (const e of errors) console.log(`  x ${e}`)
process.exit(errors.length ? 1 : 0)
