// Bundles src/main.ts and the shared modules it imports into mod/inbox/main.js, the Herdr app mod a host copies into
// the app's mods folder. The bundle is committed, since an install runs no build. The Herdr app supplies gpui-kit,
// gpui-base and herdr to a mod, so they stay external.
//
// The Codex and omp installs hold only codex/plugin and omp, so the build writes the same files into
// codex/plugin/dist/herdr-mod and omp/dist/herdr-mod as well. The bundle's second line says when it was built. A host
// replaces an installed mod built earlier. A build whose code matches the committed bundle keeps that bundle's time.
//
//   bun build.ts          writes main.js and mod.json in mod/inbox and in both copies
//   bun build.ts --check  exits 1 when any of them does not match the sources
//
// The mod runtime has no Node modules. For a browser build Bun swaps a Node module for an empty stand-in, which loads
// and then fails where the code first calls it. So the build fails on any import that is not a file of the repo or one
// of the app's three modules.
//
// Bun's bundler writes different output for the same sources in different Bun versions, so the build runs the Bun
// that package.json pins as a platform package in devDependencies, whichever Bun started it.

import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { builtAtLine, modBuiltAt } from '../hooks/herdr-install'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'mod', 'inbox')
const isCheck = process.argv[2] === '--check'
const APP_MODULES = ['gpui-kit', 'gpui-base', 'herdr']
const MOD_JSON = `${JSON.stringify({ place: 'none' })}\n`
const COPIES = [join(here, '..', 'codex', 'plugin', 'dist', 'herdr-mod'), join(here, '..', 'omp', 'dist', 'herdr-mod')]
const BUILT_AT_LINE = builtAtLine('BUILT_AT')
const stamped = (unstamped: string, builtAt: string) => unstamped.replace(BUILT_AT_LINE, builtAtLine(builtAt))

const { devDependencies } = (await Bun.file(join(here, 'package.json')).json()) as {
  devDependencies: Record<string, string>
}
const pinnedBun = Object.entries(devDependencies).find(([name]) => name.startsWith('@oven/bun-'))![1]
if (Bun.version !== pinnedBun) {
  const platformPackage = `@oven/bun-${process.platform}-${process.arch === 'arm64' ? 'aarch64' : process.arch}`
  const installed = join(here, 'node_modules', platformPackage)
  const installedVersion = await Bun.file(join(installed, 'package.json'))
    .json()
    .then((p: { version: string }) => p.version)
    .catch(() => null)
  if (!(platformPackage in devDependencies) || installedVersion !== pinnedBun) {
    console.error(
      `Bun ${pinnedBun} for ${process.platform} ${process.arch} is not installed in herdr/node_modules. Run: bun install --cwd ${here} --frozen-lockfile --ignore-scripts`,
    )
    process.exit(1)
  }
  const pinned = Bun.spawnSync([join(installed, 'bin', 'bun'), ...process.argv.slice(1)], {
    stdio: ['inherit', 'inherit', 'inherit'],
  })
  process.exit(pinned.exitCode ?? 1)
}

// The bundle's source-path comments are relative to the working folder.
process.chdir(here)

const refused: string[] = []
const result = await Bun.build({
  entrypoints: [join(here, 'src', 'main.ts')],
  target: 'browser',
  format: 'esm',
  external: APP_MODULES,
  banner: `// Built by herdr/build.ts with Bun ${Bun.version} from herdr/src and hooks/. Do not edit.\n${BUILT_AT_LINE}`,
  plugins: [
    {
      name: 'app modules only',
      setup(build) {
        build.onResolve({ filter: /.*/ }, args => {
          const isFile = args.path.startsWith('.') || args.path.startsWith('/')
          if (!isFile && !APP_MODULES.includes(args.path)) refused.push(`${args.path}, imported by ${args.importer}`)
          return undefined
        })
      },
    },
  ],
})
if (refused.length > 0) {
  console.error(`The Herdr app's mod runtime has none of these modules:\n${refused.map(r => `  ${r}`).join('\n')}`)
  process.exit(1)
}
if (!result.success) {
  for (const log of result.logs) console.error(String(log))
  process.exit(1)
}
const unstamped = await result.outputs[0]!.text()
const read = (path: string) =>
  Bun.file(path)
    .text()
    .catch(() => null)
const current = await read(join(out, 'main.js'))
const currentBuiltAt = current ? modBuiltAt(current) : null
const isSameCode = currentBuiltAt !== null && current === stamped(unstamped, currentBuiltAt)
const bundle = stamped(unstamped, isSameCode ? currentBuiltAt : new Date().toISOString())
const files = { 'main.js': bundle, 'mod.json': MOD_JSON }

if (isCheck) {
  const stale: string[] = []
  for (const folder of [out, ...COPIES])
    for (const [name, text] of Object.entries(files))
      if ((await read(join(folder, name))) !== text) stale.push(relative(join(here, '..'), join(folder, name)))
  if (stale.length > 0) {
    console.error(`Out of date: ${stale.join(', ')}. Run: npm --prefix ${here} run build`)
    process.exit(1)
  }
} else {
  for (const folder of [out, ...COPIES])
    for (const [name, text] of Object.entries(files)) await Bun.write(join(folder, name), text)
}
