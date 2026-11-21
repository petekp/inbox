import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_DIRS = [
  'core/domain',
  'core/view',
  'core/runtime',
  'core/remote',
  'hooks',
  'hooks/mod',
  'hooks/pane',
  'codex/src',
  'omp/src',
  'herdr/src',
]
const OTHER_CHEVRONS = /[▸▾▴▿▹⌄˅]/

/** Every fold draws one chevron, so a source file names no other disclosure glyph. `core/view/fold-chevron.ts` owns the text looks' glyphs. */
export function checkChevrons(root, errors) {
  for (const dir of SOURCE_DIRS) {
    if (!existsSync(join(root, dir))) continue
    for (const name of readdirSync(join(root, dir)).filter(n => /\.tsx?$/.test(n)))
      readFileSync(join(root, dir, name), 'utf8')
        .split('\n')
        .forEach((line, n) => {
          if (OTHER_CHEVRONS.test(line))
            errors.push(
              `${dir}/${name}:${n + 1} draws a disclosure glyph. Folds draw \`foldGlyph\` in the text looks and the chevron icon elsewhere.`,
            )
        })
  }
}
