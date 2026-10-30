// The bundles are committed, since a Git marketplace install
// copies the plugin folder and runs no build.
//
//   node build.mjs --tests  bundles tests/*.spec.ts into test-dist for `node --test`. They aren't
//                          *.test.ts, which `claude plugin test` would run as the mod's.
//
// The tab shows its Show demo button only in --dev builds, or when INBOX_DEMO_BUTTON=1 is set for a build to try in
// another install. INBOX_DEMO_RECORDING=1 shows the button too, and the demo then leaves out the notices that mark its
// entries as samples, for recording a video, as `/inbox demo recording` does in Claude Code. Don't commit plugin/dist
// from either build: --check would fail it.

import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, watch, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as esbuild from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const mode = process.argv[2] ?? ''
const { version } = JSON.parse(readFileSync(join(here, 'plugin', '.codex-plugin', 'plugin.json'), 'utf8'))

async function serverBuild() {
  const result = await esbuild.build({
    absWorkingDir: here,
    entryPoints: ['src/server-handler.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    loader: { '.html': 'text' },
    metafile: true,
    write: false,
    logLevel: 'silent',
  })
  const hash = createHash('sha256')
  for (const path of Object.keys(result.metafile.inputs)
    .filter(p => !p.endsWith('tab.html'))
    .sort())
    hash.update(path).update(readFileSync(join(here, path)))
  hash.update(version)

  return hash.digest('hex').slice(0, 12)
}

const isDemoRecording = process.env.INBOX_DEMO_RECORDING === '1'
const isDemoButton = mode === '--dev' || process.env.INBOX_DEMO_BUTTON === '1' || isDemoRecording

async function buildTabScript(build) {
  const tab = await esbuild.build({
    absWorkingDir: here,
    define: {
      SERVER_BUILD: JSON.stringify(build),
      VERSION: JSON.stringify(version),
      DEMO_BUTTON: JSON.stringify(isDemoButton),
      DEMO_RECORDING: JSON.stringify(isDemoRecording),
    },
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
  const script = tab.outputFiles[0].text
  // The script sits inside a <script> element, which the first "</script" in it would end.
  if (/<\/script/i.test(script))
    throw new Error('The tab script contains "</script", which would end its element early.')

  return script
}

async function toneVars() {
  const out = await esbuild.build({
    absWorkingDir: here,
    entryPoints: ['../hooks/tones.ts'],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    logLevel: 'warning',
  })
  const tones = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`)
  const vars = t =>
    [
      `--key: ${t.key};`,
      `--amber: ${t.needsYou};`,
      `--findings: ${t.findings};`,
      `--prs: ${t.prs};`,
      `--done: ${t.done};`,
      `--error: ${t.error};`,
      `--error-mark: ${t.errorMark};`,
    ].join(' ')

  return { light: vars(tones.LIGHT_TONES), dark: vars(tones.DARK_TONES) }
}

const tabPage = (html, script, tones) =>
  html
    .replaceAll('/*TONES:light*/', () => tones.light)
    .replaceAll('/*TONES:dark*/', () => tones.dark)
    .replace('/*TAB_SCRIPT*/', () => script)

const build = await serverBuild()
const tones = await toneVars()
const tabScript = mode === '--dev' ? '' : await buildTabScript(build)

const inlineTab = (script, pageTones = tones) => ({
  name: 'inline-tab',
  setup(build) {
    build.onLoad({ filter: /[/\\]tab\.html$/ }, args => ({
      contents: tabPage(readFileSync(args.path, 'utf8'), script, pageTones),
      loader: 'text',
    }))
  },
})

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  loader: { '.html': 'text' },
  define: { SERVER_BUILD: JSON.stringify(build), VERSION: JSON.stringify(version) },
  plugins: [inlineTab(tabScript)],
  legalComments: 'none',
  logLevel: 'warning',
}

// The page template for a comparison. The handler names the copy beside its own bundle in the Compare message.
const comparePage = () => readFileSync(join(here, '..', 'hooks', 'compare-page.html'), 'utf8')

const entries = {
  hook: 'src/hook-main.ts',
  server: 'src/server-main.ts',
  'server-handler': 'src/server-handler.ts',
  update: 'src/update-main.ts',
}

if (mode === '--dev') {
  const page = join(here, '.dev', 'tab.html')
  const handler = join(here, '.dev', 'server-handler.mjs')
  // The data folder Codex gives the installed plugin, as dataDir in src/data-dir.ts maps it.
  const pointer = join(
    process.env.CODEX_HOME || join(homedir(), '.codex'),
    'plugins',
    'data',
    'inbox-inbox',
    'dev.json',
  )
  const write = async () => {
    try {
      const build = await serverBuild()
      const script = await buildTabScript(build)
      const pageTones = await toneVars()
      writeFileSync(`${page}.tmp`, tabPage(readFileSync(join(here, 'src', 'tab.html'), 'utf8'), script, pageTones))
      renameSync(`${page}.tmp`, page)
      const server = await esbuild.build({
        ...common,
        absWorkingDir: here,
        entryPoints: ['src/server-handler.ts'],
        define: { SERVER_BUILD: JSON.stringify(build), VERSION: JSON.stringify(version) },
        plugins: [inlineTab(script, pageTones)],
        write: false,
      })
      writeFileSync(join(here, '.dev', 'compare-page.html'), comparePage())
      // The server imports the file once its time changes, so it must never see it half written.
      writeFileSync(`${handler}.tmp`, server.outputFiles[0].text)
      renameSync(`${handler}.tmp`, handler)
      console.log(`${new Date().toLocaleTimeString()} Built the tab page and the server's handler`)
    } catch (err) {
      console.error(err instanceof Error ? err.message : err)
    }
  }
  mkdirSync(dirname(page), { recursive: true })
  mkdirSync(dirname(pointer), { recursive: true })
  await write()
  writeFileSync(pointer, JSON.stringify({ tab: page, server: handler, pid: process.pid }))
  const stop = () => {
    rmSync(pointer, { force: true })
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  let timer
  for (const dir of [join(here, 'src'), join(here, '..', 'hooks')])
    watch(dir, { recursive: true }, () => {
      clearTimeout(timer)
      timer = setTimeout(write, 100)
    })
  console.log('Watching codex/src and hooks. Open Inbox tabs and the server update after each save. Ctrl-C stops.')
} else if (mode === '--tests') {
  const tests = readdirSync(join(here, 'tests')).filter(f => f.endsWith('.spec.ts'))
  await esbuild.build({
    ...common,
    absWorkingDir: here,
    entryPoints: tests.map(f => `tests/${f}`),
    packages: 'external',
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
  const page = { path: join(here, 'plugin', 'dist', 'compare-page.html'), text: comparePage() }
  if (mode !== '--check') writeFileSync(page.path, page.text)
  if (mode === '--check') {
    const stale = [...result.outputFiles, page].filter(f => {
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
