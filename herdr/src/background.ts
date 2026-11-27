import { publishedSessionsFolder } from '../../core/remote/herdr'
import { isSessionChange } from './files'
import { AGE_TICK_MS, LOOK_TICK_MS, REREAD_MS } from './status-look'

/** The parts of the look's context that its work between draws and its view cache use. */
type LookContext = {
  spawn(body: (cx: LookContext) => unknown): unknown
  sleep(ms?: number): Promise<void>
  timer: {
    every(ms: number, fn: (cx: LookContext) => void): unknown
    after(ms: number, fn: (cx: LookContext) => void): { cancel(): void }
  }
  notify(): void
}

type Look = {
  sessionId: string | null
  load(sessionId: string, cx: LookContext): void
  viewCache: { prepare(cx: LookContext, isFresh?: boolean): void }
  checkLook(): Promise<void>
}

/** The Herdr app calls the work uses, which only `herdr/src/main.ts` imports. */
type App = {
  isChecking(): boolean
  appHome(): string
  watchFolder(path: string): Promise<readonly string[]>
}

/**
 * Starts the look's work between draws: reading its session again when the folder changes, and each `REREAD_MS`
 * without a change; drawing again each `AGE_TICK_MS` for ages; and checking each `LOOK_TICK_MS` whether its
 * Status is shown. `herdr-app check` loads the mod once and ends, so a check starts none of them.
 */
export function startBackground(look: Look, app: App, cx: LookContext): void {
  if (app.isChecking()) return
  cx.spawn(async cx => {
    for (;;) {
      const changed = await app.watchFolder(publishedSessionsFolder(app.appHome())).catch(() => null)
      if (changed === null) await cx.sleep(REREAD_MS)
      else if (look.sessionId && isSessionChange(changed, app.appHome(), look.sessionId)) look.load(look.sessionId, cx)
    }
  })
  cx.timer.every(REREAD_MS, cx => look.sessionId && look.load(look.sessionId, cx))
  cx.timer.every(AGE_TICK_MS, cx => {
    look.viewCache.prepare(cx, true)
    cx.notify()
  })
  cx.timer.every(LOOK_TICK_MS, cx => cx.spawn(() => look.checkLook()))
}
