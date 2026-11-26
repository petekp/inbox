import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { previewPages } from '../../core/runtime/preview-pages'
import type { PreviewFiles, PreviewPages } from '../../core/runtime/preview-pages'
import { missingAsNull } from '../../core/view/session-files'

const files: PreviewFiles = {
  list: async folder => {
    const names = await readdir(folder).catch(() => [])
    const found = await Promise.all(
      names.map(name =>
        stat(`${folder}/${name}`).then(
          s => [{ name, mtimeMs: s.mtimeMs }],
          () => [],
        ),
      ),
    )
    return found.flat()
  },
  read: path => readFile(path, 'utf8').catch(missingAsNull),
  write: async (path, text) => {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    await writeFile(path, text, { mode: 0o600 })
  },
  remove: path => rm(path, { force: true }),
}

/** omp's previews pages, written with Node's file calls. */
export function ompPreviewPages(
  env: Readonly<Record<string, string | undefined>>,
  template: string,
  log: (text: string) => void,
): PreviewPages {
  return previewPages(files, env, 'omp', template, log)
}
