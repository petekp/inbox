import { resolve } from 'node:path'
import { prepareClient } from './prepare-client'
import { appRoot, command } from './paths'

await prepareClient()
await command([process.execPath, resolve(appRoot, 'exact.mjs'), ...process.argv.slice(2)])
