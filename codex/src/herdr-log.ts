import { appendFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** The most `herdr.log` holds before the next line starts it over. */
const HERDR_LOG_BYTES = 64 * 1024

/**
 * Appends a line to `herdr.log` in the data folder, which says why Herdr's labels or published file did not change, as
 * when no `hc` started. Over `HERDR_LOG_BYTES`, the line starts the file over.
 */
export function herdrLog(dir: string): (text: string) => void {
  const path = join(dir, 'herdr.log')

  return text =>
    void (async () => {
      const size = await stat(path).then(
        s => s.size,
        () => 0,
      )
      const line = `${new Date().toISOString()} ${text}\n`
      await mkdir(dir, { recursive: true })
      await (size > HERDR_LOG_BYTES ? writeFile(path, line) : appendFile(path, line))
    })().catch(() => undefined)
}
