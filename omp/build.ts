// Bundles src/host.ts and the shared modules it imports into dist/host.js, which package.json lists under
// omp.extensions. omp installs a marketplace plugin by copying only this folder, so the extension cannot import
// ../hooks at runtime. The bundle is committed, since an install runs no build. omp's own packages stay external,
// because omp supplies them to the extension.
//
//   bun build.ts          writes dist/host.js
//   bun build.ts --check  exits 1 when dist/host.js does not match the sources
//
// Bun's bundler writes different output for the same sources in different Bun versions, so the build runs the Bun
// that package.json pins as a platform package in devDependencies, whichever Bun started it. A package manager does not
// install a package's devDependencies along with it, so the pinned Bun stays out of a plugin install.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const output = join(here, 'dist', 'host.js')
const isCheck = process.argv[2] === '--check'

const { devDependencies } = (await Bun.file(join(here, 'package.json')).json()) as {
  devDependencies: Record<string, string>
}
const bunPins = Object.entries(devDependencies).filter(([name]) => name.startsWith('@oven/bun-'))
const pinnedBun = bunPins[0]![1]
if (Bun.version !== pinnedBun) {
  const platformPackage = `@oven/bun-${process.platform}-${process.arch === 'arm64' ? 'aarch64' : process.arch}`
  const installed = join(here, 'node_modules', platformPackage)
  const installedVersion = await Bun.file(join(installed, 'package.json'))
    .json()
    .then((p: { version: string }) => p.version)
    .catch(() => null)
  const isPinnedHere = platformPackage in devDependencies
  if (!isPinnedHere || installedVersion !== pinnedBun) {
    console.error(
      isPinnedHere
        ? `Bun ${pinnedBun} is not installed in omp/node_modules. Run: bun install --cwd ${here} --frozen-lockfile --ignore-scripts`
        : `omp/package.json pins Bun ${pinnedBun} only for ${bunPins.map(([name]) => name).join(', ')}, and this Bun ${Bun.version} runs on ${process.platform} ${process.arch}. Add ${platformPackage} at ${pinnedBun} to its devDependencies, or run the build with Bun ${pinnedBun}.`,
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

const result = await Bun.build({
  entrypoints: [join(here, 'src', 'host.ts')],
  target: 'bun',
  format: 'esm',
  external: ['@oh-my-pi/*'],
  banner: `// Built by omp/build.ts with Bun ${Bun.version} from omp/src and hooks/. Do not edit.`,
})
if (!result.success) {
  for (const log of result.logs) console.error(String(log))
  process.exit(1)
}
const bundle = await result.outputs[0]!.text()

if (isCheck) {
  const current = await Bun.file(output)
    .text()
    .catch(() => null)
  if (current !== bundle) {
    const builtWith = current?.match(/^\/\/ Built by omp\/build\.ts with Bun (\S+) /m)?.[1]
    const isOtherBun = current !== null && builtWith !== Bun.version
    const versions = isOtherBun
      ? ` It was built with ${builtWith ? `Bun ${builtWith}` : 'a Bun it does not name'}, and the build now uses Bun ${Bun.version}.`
      : ''
    console.error(`Out of date: omp/dist/host.js.${versions} Run: npm --prefix ${here} run build`)
    process.exit(1)
  }
} else {
  await Bun.write(output, bundle)
}
