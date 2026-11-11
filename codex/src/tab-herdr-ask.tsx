import { answeringOf, HERDR_ASK_BUTTONS, herdrAskBanner } from '../../hooks/herdr-ask'
import { SETTLED_MS } from '../../hooks/timing'
import type { HerdrAsk, OpenHerdrAsk } from '../../hooks/herdr-ask'
import type { TabView as View } from './core'
import { callTool, later } from './tab-host'
import { read } from './tab-read'
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

/** The question before the tab installs the inbox's Herdr mod, with Install and Don't install while it asks. */
export function HerdrAskBanner({ v }: { v: View }) {
  const ask = tabState.herdrAsk ?? v.herdrAsk ?? null
  const banner = herdrAskBanner(ask)
  if (!banner) return null
  const asked = ask?.is === 'asking' ? ask : null

  return (
    <Banner
      banner={banner}
      actions={
        asked
          ? HERDR_ASK_BUTTONS.map(a => ({
              label: a.label,
              isPrimary: a.isYes,
              press: () => void answerHerdrAsk(asked, a.isYes),
            }))
          : []
      }
    />
  )
}
