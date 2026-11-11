import type { Run } from './gh'
import type { HerdrTarget } from './herdr'
import { keepHerdrModCurrent } from './herdr-install'
import type { HerdrModResult, ModFiles } from './herdr-install'
import { labelledSessions, sweepPublished } from './herdr-sweep'
import type { SweepFiles } from './herdr-sweep'

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** The line a host logs for what it did about the Herdr mod, or null when it did nothing. */
function modLine(result: HerdrModResult): string | null {
  if (result.is === 'failed') return result.text
  if (result.is === 'installed') return 'Installed the inbox mod in Herdr.'

  return result.is === 'updated' ? 'Updated the inbox mod in Herdr to a newer build.' : null
}

/** Removes the published sessions no live terminal names, and logs what it removed or why it could not look. */
async function sweep(
  run: Run,
  files: SweepFiles,
  appHome: string,
  hcs: readonly string[],
  now: number,
  log: (text: string) => void,
) {
  const labelled = await labelledSessions(run, hcs)
  if (!labelled)
    return log(`Left old inbox session files in place: no hc listed Herdr's terminals. Tried ${hcs.join(', then ')}.`)
  const removed = await sweepPublished(files, appHome, labelled, now)
  if (removed.length > 0)
    log(`Removed ${removed.length} inbox session file${removed.length === 1 ? '' : 's'} that no Herdr terminal shows.`)
}

/**
 * What a host does once when it starts in a Herdr app terminal: keeps the inbox's mod in the app current with the one
 * in `bundledFolder`, and removes the published sessions no live terminal can show. Each logs what it did, and a
 * failure says why. Resolves with what it did about the mod, so a host can ask the person when the result is `ask`,
 * and null when the app has no settings folder.
 */
export async function startInHerdrApp(
  run: Run,
  files: ModFiles & SweepFiles,
  target: Extract<HerdrTarget, { kind: 'terminal' }>,
  bundledFolder: string,
  now: number,
  log: (text: string) => void,
): Promise<HerdrModResult | null> {
  const { appHome } = target
  if (!appHome) return null
  const [mod] = await Promise.all([
    keepHerdrModCurrent(files, appHome, bundledFolder, now),
    sweep(run, files, appHome, target.hc, now, log).catch((err: unknown) =>
      log(`Old inbox session files not removed: ${message(err)}`),
    ),
  ])
  const line = modLine(mod)
  if (line) log(line)

  return mod
}
