import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { filesUnder } from './imports.mjs'

const SOURCE_DIRS = ['core', 'hooks', 'codex/src', 'omp/src', 'herdr/src']
const OTHER_CHEVRONS = /[▸▾▴▿▹⌄˅]/

/** Every fold draws one chevron, so a source file names no other disclosure glyph. `core/view/fold-chevron.ts` owns the text looks' glyphs. */
export function checkChevrons(root, errors) {
  for (const dir of SOURCE_DIRS) {
    if (!existsSync(join(root, dir))) continue
    for (const path of filesUnder(root, dir).filter(path => /\.tsx?$/.test(path)))
      readFileSync(join(root, path), 'utf8')
        .split('\n')
        .forEach((line, n) => {
          if (OTHER_CHEVRONS.test(line))
            errors.push(
              `${path}:${n + 1} draws a disclosure glyph. Folds draw \`foldGlyph\` in the text looks and the chevron icon elsewhere.`,
            )
        })
  }
}
