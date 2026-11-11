/**
 * The second line of the bundle `herdr/build.ts` writes: when it was built, as an ISO time, and how many characters
 * follow the line, so a host can tell a whole copy from one cut off mid-write.
 */
export const builtAtLine = (builtAt: string, length: number): string =>
  `// Built at ${builtAt}. ${length} characters follow.`

const BUILD_BANNER = '// Built by herdr/build.ts '
const BUILT_AT = /^\/\/ Built at (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)\. (\d+) characters follow\.$/

/** Whether `mainJs` is a build of the inbox's Herdr mod. */
const isInboxMod = (mainJs: string): boolean => mainJs.startsWith(BUILD_BANNER)

/**
 * When the inbox's Herdr mod in `mainJs` was built, or null when its second line names no time or the text after it
 * is not as long as that line says.
 */
export function modBuiltAt(mainJs: string): string | null {
  const firstEnd = mainJs.indexOf('\n')
  const secondEnd = firstEnd === -1 ? -1 : mainJs.indexOf('\n', firstEnd + 1)
  if (secondEnd === -1) return null
  const stamp = BUILT_AT.exec(mainJs.slice(firstEnd + 1, secondEnd))

  return stamp && mainJs.length - secondEnd - 1 === Number(stamp[2]) ? stamp[1]! : null
}

/**
 * The file calls a host installs the mod with. `kind` says what a path is itself, without following a link, and null
 * when nothing is there. `write` creates the folders it needs. `move` fails when `from` is gone, and a folder moved
 * onto an existing one may land inside it.
 */
export type ModFiles = {
  kind: (path: string) => Promise<'file' | 'folder' | 'link' | 'other' | null>
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  makeFolder: (path: string) => Promise<void>
  move: (from: string, to: string) => Promise<void>
  removeFolder: (path: string) => Promise<void>
}

/** The mod a host carries: the files of `herdr/mod/inbox` and when they were built. */
type BundledMod = { mainJs: string; modJson: string; builtAt: string }

/** The mod a host carries in `folder`, or null when it cannot be read, names no build time or is cut off. */
async function bundledMod(read: ModFiles['read'], folder: string): Promise<BundledMod | null> {
  const [mainJs, modJson] = await Promise.all([read(`${folder}/main.js`), read(`${folder}/mod.json`)]).catch(() => [])
  const builtAt = mainJs === undefined ? null : modBuiltAt(mainJs)

  return mainJs !== undefined && modJson !== undefined && builtAt ? { mainJs, modJson, builtAt } : null
}

/**
 * The mod in the Herdr app's mods folder. `own` is a link, or a folder or file that is not a build of the inbox's
 * mod: the person's own, which no host writes over. An `inbox` build that names no time, or is cut off, has a null
 * `builtAt`.
 */
type InstalledMod = { is: 'missing' } | { is: 'own' } | { is: 'inbox'; builtAt: string | null }

const modFolder = (appHome: string) => `${appHome}/mods/inbox`

async function installedMod(files: ModFiles, appHome: string): Promise<InstalledMod> {
  const kind = await files.kind(modFolder(appHome))
  if (kind === null) return { is: 'missing' }
  if (kind !== 'folder') return { is: 'own' }
  const mainJs = await files.read(`${modFolder(appHome)}/main.js`).catch(() => null)
  if (mainJs === null || !isInboxMod(mainJs)) return { is: 'own' }

  return { is: 'inbox', builtAt: modBuiltAt(mainJs) }
}

/**
 * The person's answer to whether hosts may install the mod, which every host reads. `installed` replaces a yes once
 * a host has installed it, so a mod the person removes afterwards stays removed.
 */
type ModAnswer = 'yes' | 'no' | 'installed'

const ANSWER_FORMAT = 1
const answerPath = (appHome: string) => `${appHome}/inbox/herdr-mod.json`

async function savedAnswer(files: ModFiles, appHome: string): Promise<ModAnswer | null> {
  try {
    const saved = JSON.parse(await files.read(answerPath(appHome))) as { format?: unknown; answer?: unknown } | null
    const answer = saved?.format === ANSWER_FORMAT ? saved.answer : null

    return answer === 'yes' || answer === 'no' || answer === 'installed' ? answer : null
  } catch {
    return null
  }
}

const temporaryName = (name: string) => `${name}.${Math.random().toString(36).slice(2)}.tmp`

async function saveAnswer(files: ModFiles, appHome: string, answer: ModAnswer, at: number) {
  const path = answerPath(appHome)
  const temporary = temporaryName(path)
  await files.write(temporary, `${JSON.stringify({ format: ANSWER_FORMAT, answer, at })}\n`)
  await files.move(temporary, path)
}

type ModStep = 'ask' | 'install' | 'update' | null

/** What a host does about the mod: ask the person, install it, replace an older build, or nothing. */
function modStep(installed: InstalledMod, answer: ModAnswer | null, bundled: BundledMod): ModStep {
  if (installed.is === 'missing') return answer === 'yes' ? 'install' : answer === null ? 'ask' : null
  if (installed.is === 'own') return null

  return bundled.builtAt > (installed.builtAt ?? '') ? 'update' : null
}

/**
 * Writes the bundled mod to a folder beside the app's mods folder, then moves it into place. An install moves the
 * whole folder. An update moves each changed file over the installed one, `main.js` last, so the installed mod is
 * whole after every step and Herdr reloads it in place. Either does nothing when another host got there first,
 * including when that makes the install's move fail.
 */
async function writeMod(files: ModFiles, appHome: string, bundled: BundledMod, step: 'install' | 'update') {
  const name = temporaryName('herdr-mod')
  const temporary = `${appHome}/inbox/${name}`
  const target = modFolder(appHome)
  try {
    await files.write(`${temporary}/mod.json`, bundled.modJson)
    await files.write(`${temporary}/main.js`, bundled.mainJs)
    if (step === 'install') {
      await files.makeFolder(`${appHome}/mods`)
      if ((await files.kind(target)) !== null) return
      const isOtherFirst = await files.move(temporary, target).then(
        () => false,
        async (err: unknown) => {
          if ((await installedMod(files, appHome)).is === 'missing') throw err
          return true
        },
      )
      if (!isOtherFirst) await files.removeFolder(`${target}/${name}`)

      return
    }
    if (modStep(await installedMod(files, appHome), null, bundled) !== 'update') return
    const installedJson = await files.read(`${target}/mod.json`).catch(() => null)
    if (installedJson !== bundled.modJson) await files.move(`${temporary}/mod.json`, `${target}/mod.json`)
    await files.move(`${temporary}/main.js`, `${target}/main.js`)
  } finally {
    await files.removeFolder(temporary).catch(() => undefined)
  }
}

/** What a host did about the mod. `ask` means the person has not said whether hosts may install it. */
export type HerdrModResult = { is: 'ask' | 'current' | 'installed' | 'updated' } | { is: 'failed'; text: string }

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * Keeps the inbox's mod in the app's mods folder current with the one in `bundledFolder`: it installs the mod after
 * the person's yes, and replaces an installed build of the inbox's mod that is older. It never writes through a link
 * or over a mod that is not the inbox's build, and it asks before the first install.
 */
export async function keepHerdrModCurrent(
  files: ModFiles,
  appHome: string,
  bundledFolder: string,
  now: number,
): Promise<HerdrModResult> {
  const bundled = await bundledMod(files.read, bundledFolder)
  if (!bundled) return { is: 'failed', text: `Could not read the inbox mod for Herdr in ${bundledFolder}.` }
  const step = await Promise.all([installedMod(files, appHome), savedAnswer(files, appHome)])
    .then(([installed, answer]) => modStep(installed, answer, bundled))
    .catch((err: unknown) => new Error(message(err)))
  if (step instanceof Error)
    return { is: 'failed', text: `Could not read the Herdr app's mods folder: ${step.message}` }
  if (step === null) return { is: 'current' }
  if (step === 'ask') return { is: 'ask' }
  try {
    await writeMod(files, appHome, bundled, step)
    if (step === 'install') await saveAnswer(files, appHome, 'installed', now)

    return { is: step === 'install' ? 'installed' : 'updated' }
  } catch (err) {
    return { is: 'failed', text: `Could not ${step} the inbox mod in Herdr: ${message(err)}` }
  }
}

/**
 * Saves the person's answer to whether hosts may install the mod, and installs it after a yes. A no stays until the
 * person answers again.
 */
export async function answerHerdrMod(
  files: ModFiles,
  appHome: string,
  bundledFolder: string,
  isYes: boolean,
  now: number,
): Promise<HerdrModResult> {
  try {
    await saveAnswer(files, appHome, isYes ? 'yes' : 'no', now)
  } catch (err) {
    return { is: 'failed', text: `Could not save the answer about the inbox mod in Herdr: ${message(err)}` }
  }

  return isYes ? keepHerdrModCurrent(files, appHome, bundledFolder, now) : { is: 'current' }
}
