// Bundles the plugin's entry points, with the mod's shared modules, into
// plugin/dist. The bundles are committed, since a Git marketplace install
// copies the plugin folder and runs no build. The tab's script is bundled for
// the browser first and inlined into tab.html, which the server carries as text.
//
// Usage:
//   node build.mjs          writes plugin/dist
//   node build.mjs --check  exits 1 when plugin/dist differs from a fresh build
//   node build.mjs --tests  bundles tests/*.spec.ts into test-dist for `node --test`. They aren't
//                          *.test.ts, which `claude plugin test` would run as the mod's.

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as esbuild from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const mode = process.argv[2] ?? ''

const tab = await esbuild.build({
  absWorkingDir: here,
  entryPoints: ['src/tab.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'chrome120',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
  write: false,
})
const tabScript = tab.outputFiles[0].text
// The script sits inside a <script> element, which the first "</script" in it would end.
if (/<\/script/i.test(tabScript))
  throw new Error('The tab script contains "</script", which would end its element early.')

/** Loads tab.html with the tab's script inlined. */
const inlineTab = {
  name: 'inline-tab',
  setup(build) {
    build.onLoad({ filter: /[/\\]tab\.html$/ }, args => ({
      contents: readFileSync(args.path, 'utf8').replace('/*TAB_SCRIPT*/', () => tabScript),
      loader: 'text',
    }))
  },
}

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  loader: { '.html': 'text' },
  plugins: [inlineTab],
  legalComments: 'none',
  logLevel: 'warning',
}

const entries = {
  hook: 'src/hook-main.ts',
  server: 'src/server-main.ts',
  update: 'src/update-main.ts',
}

if (mode === '--tests') {
  const tests = readdirSync(join(here, 'tests')).filter(f => f.endsWith('.spec.ts'))
  await esbuild.build({
    ...common,
    absWorkingDir: here,
    entryPoints: tests.map(f => `tests/${f}`),
    outdir: 'test-dist',
    outExtension: { '.js': '.mjs' },
  })
} else {
  const result = await esbuild.build({
    ...common,
    absWorkingDir: here,
    entryPoints: entries,
    outdir: 'plugin/dist',
    outExtension: { '.js': '.mjs' },
    banner: { js: '// Built by codex/build.mjs from codex/src and hooks/. Do not edit.' },
    write: mode !== '--check',
  })
  if (mode === '--check') {
    const stale = result.outputFiles.filter(f => {
      try {
        return readFileSync(f.path, 'utf8') !== f.text
      } catch {
        return true
      }
    })
    if (stale.length > 0) {
      console.error(
        `Out of date: ${stale.map(f => f.path.slice(here.length + 1)).join(', ')}. Run: npm --prefix codex run build`,
      )
      process.exit(1)
    }
  }
}
