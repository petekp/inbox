import type { HerdrTarget } from '../../hooks/herdr'
import { PRESS_POLL_MS } from '../../hooks/herdr-app'
import { answerHerdrAsk, askHerdrAgain, herdrAskOf, isHerdrAskOpen } from '../../hooks/herdr-ask'
import type { HerdrAsk } from '../../hooks/herdr-ask'
import type { HerdrModResult } from '../../hooks/herdr-install'
import { SETTLED_MS } from '../../hooks/timing'
import type { Memory } from './host-context'
import { bundledHerdrMod, startFiles } from './host-presses'

/** How omp shows the question before it installs the inbox's Herdr mod, and answers its presses. */
export type OmpHerdrAsk = {
  /** Takes what omp's start did about the mod: a failure to show, or the question to ask. */
  started(result: HerdrModResult | null): void
  answer(isYes: boolean): Promise<void>
  /** For `/inbox herdr`: shows the question again, even after a no, and says so, or says why it cannot. */
  again(): Promise<string>
}

/**
 * Keeps the question in `memory` and calls `changed` after each change. While it asks, it checks every
 * `PRESS_POLL_MS` whether another session answered it, and an answer's result leaves after `SETTLED_MS`.
 */
export function ompHerdrAsk(
  target: HerdrTarget | null,
  memory: Pick<Memory, 'herdrAsk' | 'herdrModFailure'>,
  changed: () => void,
): OmpHerdrAsk {
  const appHome = target?.kind === 'terminal' ? (target.appHome ?? null) : null
  let check: ReturnType<typeof setInterval> | null = null
  const show = (ask: HerdrAsk | null) => {
    memory.herdrAsk = ask
    if (check) clearInterval(check)
    check = null
    const isShown = () => memory.herdrAsk === ask
    if (ask?.is === 'asking') {
      check = setInterval(() => {
        void isHerdrAskOpen(startFiles, ask).then(isOpen => !isOpen && isShown() && show(null))
      }, PRESS_POLL_MS)
      check.unref()
    }
    if (ask?.is === 'answered') setTimeout(() => isShown() && show(null), SETTLED_MS).unref()
    changed()
  }

  return {
    started: result => {
      memory.herdrModFailure = result?.is === 'failed' ? result.text : null
      if (result?.is === 'ask' && appHome) show(herdrAskOf(appHome, process.env.HOME, null))
      else changed()
    },
    answer: async isYes => {
      const ask = memory.herdrAsk
      if (ask?.is !== 'asking') return
      if (isYes) show({ ...ask, is: 'installing' })
      const answered = await answerHerdrAsk(startFiles, ask, bundledHerdrMod(), isYes, Date.now(), 'Run /inbox herdr')
      memory.herdrModFailure = answered.failure
      show(answered.ask)
    },
    again: async () => {
      const ask = await askHerdrAgain(startFiles, appHome, process.env.HOME)
      if (typeof ask === 'string') return ask
      show(ask)

      return 'Showing the question about the inbox mod for Herdr in the inbox.'
    },
  }
}
