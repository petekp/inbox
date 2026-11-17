import { resolve } from 'node:path'
import { appRoot, command } from './paths'

await command([process.execPath, resolve(appRoot, 'exact.mjs'), ...process.argv.slice(2)])
