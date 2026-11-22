import { answeringOf, HERDR_ASK_BUTTONS, herdrAskBanner } from '../../core/remote/herdr-ask'
import { SETTLED_MS } from '../../core/view/timing'
import type { HerdrAsk, OpenHerdrAsk } from '../../core/remote/herdr-ask'
import type { TabView as View } from './core'
import { callTool, later } from './tab-host'
import { read } from './tab-ui'
import { tabState } from './tab-state'
import { Banner } from './tab-parts'

async function answerHerdrAsk(ask: OpenHerdrAsk, isYes: boolean) {
  tabState.herdrAsk = answeringOf(ask, isYes)
  tabState.herdrFailure = null
  tabState.draw()
  const r = await callTool<{ ask: HerdrAsk | null; failure: string | null }>('inbox_press', {
    press: { action: 'herdr-ask', isYes },
  }).catch((err: unknown) => ({ ask: null, failure: err instanceof Error ? err.message : String(err) }))
  if (tabState.isDisposed) return
  tabState.herdrAsk = r.ask
  tabState.herdrFailure = r.failure
  tabState.draw()
  void read()
  later(() => {
    if (tabState.herdrAsk !== r.ask) return
    tabState.herdrAsk = null
    tabState.draw()
  }, SETTLED_MS)
}

/** Presses Install or Don't install when `key` is its hotkey and the question asks. Whether it pressed one. */
export function pressHerdrAskKey(v: View, key: string): boolean {
  const ask = tabState.herdrAsk ?? v.herdrAsk ?? null
  const button = HERDR_ASK_BUTTONS.find(a => a.hotkey === key)
  if (ask?.is !== 'asking' || !button) return false
  void answerHerdrAsk(ask, button.isYes)

  return true
}

/** The question before the tab installs the inbox's Herdr mod, with Install and Don't install while it asks. */
export function HerdrAskBanner({ v }: { v: View }) {
  const ask = tabState.herdrAsk ?? v.herdrAsk ?? null
  const banner = herdrAskBanner(ask)
  if (!banner) return null
  const asked = ask?.is === 'asking' ? ask : null

  return (
    <Banner
      banner={banner}
      keys={
        asked
          ? HERDR_ASK_BUTTONS.map(a => ({
              label: a.label,
              emphasis: a.isYes ? 'primary' : 'normal',
              run: () => void answerHerdrAsk(asked, a.isYes),
            }))
          : []
      }
    />
  )
}
