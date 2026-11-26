import { previewFailure, previewPlace, writePreviewPages } from '../../core/runtime/preview-pages'
import type { PreviewFiles, PreviewPlace } from '../../core/runtime/preview-pages'
import type { Session } from '../../types'
import { comparePagePath } from './mod-plugin-files'
import type { Mod } from './mod-ports'

type PreviewCalls = Pick<Mod, 'commands' | 'history' | 'herdr' | 'pluginRoot'>

const madeFolders = new Set<string>()

/** The engine has no call that removes a file or makes a folder, so those run `rm` and `mkdir`. */
function previewFiles(m: PreviewCalls): PreviewFiles {
  const run = async (argv: string[]) => {
    const r = await m.commands.run(argv, { cwd: '/', timeoutMs: 5000 })
    if (r.exitCode !== 0) throw new Error(`${argv[0]} exited ${r.exitCode}: ${r.stderr.trim()}`)
  }

  return {
    list: async folder => (await m.history.fs.list(folder).catch(() => [])).map(entry => entry.name),
    read: async path => ((await m.commands.exists(path)) ? m.history.fs.read(path) : null),
    write: async (path, text) => {
      const folder = path.slice(0, path.lastIndexOf('/'))
      if (!madeFolders.has(folder)) {
        await run(['mkdir', '-p', '-m', '700', '--', folder])
        madeFolders.add(folder)
      }
      await m.commands.write(path, text)
    },
    remove: path => run(['rm', '-f', '--', path]),
  }
}

/** Where the previews pages of conversation `id` go, or null when no state folder is known. */
export async function modPreviewPlace(m: PreviewCalls, id: string): Promise<PreviewPlace | null> {
  return previewPlace(await m.history.stateEnv(), 'claude-code', id)
}

/** Writes the previews pages `s` names and removes its others. A failure is logged. */
export async function writeModPreviewPages(m: PreviewCalls, place: PreviewPlace, s: Session): Promise<void> {
  await writePreviewPages(previewFiles(m), place, s.ledger, comparePagePath(m.pluginRoot)).catch((error: unknown) =>
    m.herdr.log(previewFailure(error)),
  )
}
