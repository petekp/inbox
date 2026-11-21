import type { Session } from '../../types'
import type { AnswerDoc } from '../../core/domain/earlier-answers'
import { historyStep, isHistoryStepNeeded, recordMatches } from '../../core/runtime/history-store'
import type { HistoryPlace } from '../../core/runtime/history-store'
import { historyFolder } from '../../core/domain/question-history'
import { upgradeSession } from '../../core/view/session-files'
import type { SavedSession } from '../../core/view/session-files'
import type { SaveEngine } from './mod-saves'

const SESSION_KEY = /^s:(.+)$/

/** The engine calls the mod's question history makes: the store and clock a save uses, `$.fs`, and the two variables that place the history folder. */
export type HistoryEngine = Pick<SaveEngine, 'store' | 'now'> & {
  stateEnv: () => Promise<{ XDG_STATE_HOME: string | undefined; HOME: string | undefined }>
  fs: {
    list: (folder: string) => Promise<readonly { name: string; kind: string; mtimeMs: number }[]>
    read: (path: string) => Promise<string>
    write: (path: string, text: string) => Promise<void>
  }
}

let place: Promise<HistoryPlace | null> | null = null

function historyPlace(e: HistoryEngine): Promise<HistoryPlace | null> {
  place ??= (async () => {
    const folder = historyFolder(await e.stateEnv().catch(() => ({ XDG_STATE_HOME: undefined, HOME: undefined })))
    if (!folder) return null
    return {
      folder,
      host: 'claude-code' as const,
      fs: {
        list: async dir =>
          (await e.fs.list(dir).catch(() => []))
            .filter(e => e.kind === 'file')
            .map(e => ({ name: e.name, mtimeMs: e.mtimeMs })),
        read: path => e.fs.read(path),
        write: (path, text) => e.fs.write(path, text),
      },
      keptSessions: async () => {
        const ids = (await e.store.keys()).flatMap(k => SESSION_KEY.exec(k)?.slice(1, 2) ?? [])
        const read = await Promise.all(
          ids.map(async id => {
            const saved = (await e.store.get(`s:${id}`).catch(() => undefined)) as SavedSession | undefined
            return saved ? { id, session: upgradeSession(saved) } : null
          }),
        )
        return read.filter(x => x !== null)
      },
    }
  })()

  return place
}

/**
 * `change` followed by the question history's step for the session of conversation `id`, as `historyStep` says. A
 * change that gives the step nothing to do makes no engine call, and a change that returns at once still does.
 */
export function withHistory(
  e: HistoryEngine,
  id: string,
  change: (s: Session) => Session | Promise<Session>,
): (s: Session) => Session | Promise<Session> {
  return s => {
    const step = (after: Session) =>
      isHistoryStepNeeded(s, after)
        ? (async () => historyStep(await historyPlace(e), id, s, after, await e.now()))().catch(() => after)
        : after
    const changed = change(s)

    return changed instanceof Promise ? changed.then(step) : step(changed)
  }
}

/** The earlier answers the `record` answer lists for a call, as `recordMatches` finds them. */
export async function modRecordMatches(e: HistoryEngine, input: Record<string, unknown>): Promise<AnswerDoc[]> {
  return recordMatches(await historyPlace(e), input, await e.now()).catch(() => [])
}
