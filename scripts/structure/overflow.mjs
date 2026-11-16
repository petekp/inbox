import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const CODEX_CSS = 'codex/src/tab-css'

const HIDDEN_OVERFLOW = /overflow(-[xy])?\s*:\s*hidden/
const ALLOWED = /\/\*\s*allow-overflow-hidden:\s*\S.*\*\//

/**
 * A box with `overflow: hidden` is a scroll container, and an animated fold's labels in one were not painted until the
 * fold's fade-in ended. `overflow: clip` clips the same way and ellipsis and line clamps still cut. A line that needs a
 * scroll container says why in an `allow-overflow-hidden` comment.
 */
export function checkOverflow(root, errors) {
  if (!existsSync(join(root, CODEX_CSS))) return
  for (const name of readdirSync(join(root, CODEX_CSS)).filter(n => n.endsWith('.css')))
    readFileSync(join(root, CODEX_CSS, name), 'utf8')
      .split('\n')
      .forEach((line, n) => {
        if (HIDDEN_OVERFLOW.test(line) && !ALLOWED.test(line))
          errors.push(
            `${CODEX_CSS}/${name}:${n + 1} sets \`overflow: hidden\`. Use \`overflow: clip\`, or add \`/* allow-overflow-hidden: <why it must scroll> */\` to the line.`,
          )
      })
}
