// Copies the Herdr app's own type files into herdr/.herdr-types, which Git ignores, so `tsc` checks src/main.ts
// against the Herdr app installed here. The app rewrites `herdr.d.ts` and `gpui-kit.d.ts` in its home folder on every
// start, and gpui-kit's file asks not to be committed, so the repo keeps no copy.
//
//   bun herdr-types.ts    the app home is $HERDR_APP_HOME, else ~/.config/herdr-app

import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TYPE_FILES = ['herdr.d.ts', 'gpui-kit.d.ts']

const appHome = process.env.HERDR_APP_HOME || join(homedir(), '.config', 'herdr-app')
const out = join(dirname(fileURLToPath(import.meta.url)), '.herdr-types')
mkdirSync(out, { recursive: true })
for (const name of TYPE_FILES) {
  const file = Bun.file(join(appHome, name))
  if (!(await file.exists())) {
    console.error(`No ${name} in ${appHome}. Start the Herdr app once, or set HERDR_APP_HOME to its home folder.`)
    process.exit(1)
  }
  await Bun.write(join(out, name), file)
}
