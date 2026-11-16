import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const CODEX_CSS = 'codex/src/tab-css'
const HERDR_SRC = 'herdr/src'

const POINTER_CSS = /cursor\s*:\s*pointer/
const POINTER_HERDR = /cursor_pointer\s*\(/

/** Every inbox control uses the default cursor, and hover states show what is clickable. */
export function checkCursors(root, errors) {
  const scan = (dir, extension, pattern, found) => {
    for (const name of readdirSync(join(root, dir)).filter(n => n.endsWith(extension)))
      readFileSync(join(root, dir, name), 'utf8')
        .split('\n')
        .forEach((line, n) => {
          if (pattern.test(line)) errors.push(`${dir}/${name}:${n + 1} ${found}`)
        })
  }
  scan(CODEX_CSS, '.css', POINTER_CSS, 'sets `cursor: pointer`. Every inbox control keeps the default cursor.')
  scan(HERDR_SRC, '.ts', POINTER_HERDR, 'calls `cursor_pointer()`. Every inbox control keeps the default cursor.')
}
