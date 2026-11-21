import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'

import { tempDir } from './helpers'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

type Entry = [client: string, feature: string, support: string]

export function clientsSource(features = ['catch-up', 'link-open-rule'], entries: Entry[] = []) {
  const supportOf = (client: string, feature: string) =>
    entries.find(e => e[0] === client && e[1] === feature)?.[2] ?? "{ kind: 'full' }"
  const clients = ['claude-code', 'codex', 'omp'].map(
    client => `'${client}': { support: { ${features.map(f => `'${f}': ${supportOf(client, f)}`).join(', ')} } },`,
  )

  return `export type FeatureId = ${features.map(f => `'${f}'`).join(' | ')}
export const CLIENTS = { ${clients.join('\n')} }
`
}

function differencesSource(column: string, ids: string[]) {
  return `| Topic | ${column} | Why |
| --- | --- | --- |
| Keys | a | b |
${ids.map(id => `| Topic (\`${id}\`) | a | b |`).join('\n')}
`
}

function sourcesIn(root: string, dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? sourcesIn(root, `${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
  )
}

export const unsupported = "{ kind: 'unsupported', reason: 'Not built yet.' }"

export function fixture(t: TestContext) {
  const root = tempDir()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  cpSync(join(ROOT, 'scripts'), join(root, 'scripts'), { recursive: true })
  for (const dir of ['core', 'hooks'])
    for (const path of sourcesIn(ROOT, dir).filter(path => path.endsWith('.ts')))
      write(path, 'export const value = 1\n')
  write('core/view/empty-tab.ts', 'const EMPTY_TITLES = {}\nexport const emptyTab = () => EMPTY_TITLES\n')
  write('hooks/pane/pane-asks.tsx', 'export const emptyState = () => null\n')
  write('codex/src/tab-parts.ts', 'export const EmptyState = () => null\n')
  write('hooks/register.tsx', 'export const value = 1\n')
  write('hooks/pane/row-client.tsx', 'export const value = 1\n')
  write('types/index.d.ts', 'export interface Value {}\n')
  write('codex/src/host.ts', 'export const value = 1\n')
  write('codex/tests/.keep', '')
  write('codex/package.json', '{"type":"module"}\n')
  symlinkSync(join(ROOT, 'codex/node_modules'), join(root, 'codex/node_modules'), 'dir')
  write('core/domain/clients.ts', clientsSource())
  write('docs/looks.md', '# Looks\n')
  const looks = (main: string[] = [], omp: string[] = []) => {
    write('docs/looks/differences-main.md', differencesSource('Terminal', main))
    write('docs/looks/differences-omp.md', differencesSource('omp', omp))
  }
  looks()
  write(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        module: 'esnext',
        moduleResolution: 'bundler',
        paths: { '@core/*': ['./core/*'], '@hooks/*': ['./hooks/*'] },
      },
      include: ['core', 'hooks', 'types', 'codex/src', 'codex/tests'],
    }),
  )

  const withFileRows = (unmapped: string[]) => {
    const files = ['core', 'hooks', 'codex/src', 'omp/src']
      .filter(dir => existsSync(join(root, dir)))
      .flatMap(dir => sourcesIn(root, dir))
      .filter(path => /\.(?:ts|tsx|html)$/.test(path) && !path.endsWith('.d.ts') && !unmapped.includes(path))
    write(
      'docs/looks/files-all.md',
      `| File | Role |\n| --- | --- |\n${files.map(path => `| \`${path}\` | a |`).join('\n')}\n`,
    )
  }

  return {
    write,
    looks,
    check: ({ unmapped = [] }: { unmapped?: string[] } = {}) => {
      withFileRows(unmapped)
      return spawnSync(process.execPath, [join(root, 'scripts/check-structure.mjs')], { cwd: root, encoding: 'utf8' })
    },
  }
}

export type Fixture = ReturnType<typeof fixture>
