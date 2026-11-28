import { HOOKS_TRUST_TEXT } from './hook-trust-text'
import { ago } from '../../core/domain/text'
import { HELP_COPY, helpKeys, MARK_LEGEND } from '../../core/view/help'
import { bannerOf, tabBarBanners } from '../../core/view/banners'
import { DOT, ROW_COPY } from '../../core/view/rows'
import { isRowTab, shownTabs, tabBadge } from '../../core/view/tabs'
import { footerError } from '../../core/view/view'
import { noticeOf } from '../../core/view/ui-controller'
import type { ShownTab } from '../../core/view/tabs'
import type { Tab } from '../../types'
import type { TabView as View } from './core'
import { tabState } from './tab-state'
import { dispatch, drawnTab, read, resetView } from './tab-ui'
import { swapPage } from './tab-swap'
import { pulseInStep, MarkGlyph, markClassOf, GroupTitle, Banner } from './tab-parts'
import { HerdrAskBanner, herdrAskBannerOf } from './tab-herdr-ask'
import { bannerMotion, lineMotion } from './tab-line-steps'
import type { BannerLine } from './tab-line-steps'
import { countMotion } from './tab-count-motion'
import type { CountLine } from './tab-count-motion'

/** The Help tab's icon: a question mark in a circle, in the tab's text color. */
function HelpIcon() {
  return (
    <svg class="help-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.8" fill="none" stroke="currentColor" stroke-width="1.2" />
      <text x="8" y="8.4" text-anchor="middle" dominant-baseline="central" fill="currentColor">
        {HELP_COPY.icon}
      </text>
    </svg>
  )
}

/** Help in place of the tab's body: the keys this tab takes, then what each mark means. Which inbox build this is sits at the right end of the Keys title. */
export function HelpPage({ version }: { version: string }) {
  const keys = helpKeys('codex')

  return (
    <main class="status-page help">
      <section>
        <GroupTitle title={HELP_COPY.keys} count={0} aside={version} />
        <div class="help-keys">
          {keys.flatMap(k => [
            <b key={`${k.keys}-keys`}>{k.keys}</b>,
            <span key={`${k.keys}-does`} class="muted">
              {k.does}
            </span>,
          ])}
        </div>
      </section>
      <section>
        <GroupTitle title={HELP_COPY.indicators} count={0} />
        <div class="help-marks">
          {MARK_LEGEND.flatMap(m => [
            <span
              key={`${m.mark}-mark`}
              class={markClassOf(m.tone, m.isRunning)}
              ref={m.isRunning ? pulseInStep : undefined}
            >
              <MarkGlyph text={m.mark} />
            </span>,
            <span key={`${m.mark}-words`} class="muted">
              {m.words}
            </span>,
          ])}
        </div>
      </section>
    </main>
  )
}

const LATE_READ_MS = 60_000

/** The banners under the tab bar, each keyed by its kind. */
export function tabBanners(v: View): BannerLine[] {
  return tabBarBanners(
    [
      ...(tabState.serverNote ? [bannerOf(tabState.serverNote.kind, tabState.serverNote.text)] : []),
      ...(v.hooksTrust ? [bannerOf('hooks-trust', HOOKS_TRUST_TEXT[v.hooksTrust])] : []),
      ...(tabState.updateError ? [bannerOf('tab-update-failed', tabState.updateError.text)] : []),
      ...(tabState.herdrFailure ? [bannerOf('herdr-mod-failed', tabState.herdrFailure)] : []),
      ...[herdrAskBannerOf(v)].filter(b => b !== null),
    ],
    footerErrorOf(v),
    noticeOf(tabState.ui, Date.now()),
  ).map(banner => ({ id: banner.kind, banner }))
}

/** Each row tab's count, for the tabs that have one. */
export function tabCountLines(v: View): CountLine[] {
  const counts: Record<Tab, number> = { needsYou: v.needsYou.count, findings: v.findings.count, prs: v.prs.count }

  return shownTabs().flatMap(t => {
    const badge = isRowTab(t.id) ? tabBadge(t.id, counts) : null

    return isRowTab(t.id) && badge !== null ? [{ id: t.id, badge }] : []
  })
}

function footerErrorOf(v: View) {
  return footerError(drawnTab(), v.status, v.statusPage ?? null)
}

export function Status() {
  const sinceRead = Date.now() - tabState.readAt
  if (tabState.pollFailures < 2) return <div class="status" />

  return (
    <div class="status">
      <span class={sinceRead > LATE_READ_MS ? 'tone-error' : undefined}>
        Last read {ago(sinceRead)}
        {DOT}retrying
      </span>
    </div>
  )
}

/** A tab's count, in a box whose width glides as the count comes and goes. */
function TabCount({ line }: { line: CountLine | null }) {
  if (!line) return null

  return (
    <span class="count-box" data-count={countMotion(line.id)}>
      <span class={`count tone-${line.id}`}>{line.badge}</span>
    </span>
  )
}

export function TabBar({ v }: { v: View }) {
  const countOf = (id: ShownTab) => tabState.lastCounts?.find(c => c.id === id) ?? null
  const shown = drawnTab()

  return (
    <nav>
      <div class="tabs">
        {shownTabs().map(t => (
          <button
            type="button"
            class={`tab ${shown === t.id && !tabState.ui.isHelpShown ? 'shown' : ''}`}
            title={t.label}
            data-tab={t.id}
            onClick={() => dispatch([{ type: 'show-tab', tab: t.id }])}
          >
            <span class="tab-symbol" aria-hidden="true">
              {t.symbol}
            </span>
            <span class="tab-word" data-label={t.label}>
              {t.label}
            </span>
            <TabCount line={countOf(t.id)} />
          </button>
        ))}
      </div>
      <button
        type="button"
        class={`tab help-tab ${tabState.ui.isHelpShown ? 'shown' : ''}`}
        title={`${HELP_COPY.name} (?)`}
        aria-label={HELP_COPY.name}
        aria-pressed={tabState.ui.isHelpShown}
        onClick={() => dispatch([{ type: 'show-help', isShown: !tabState.ui.isHelpShown }])}
      >
        <HelpIcon />
      </button>
      <div class="banner-stack" data-motion="banners">
        {(tabState.lastBanners ?? []).map(({ id, banner: b }) => (
          <div key={id} {...lineMotion(bannerMotion(id))}>
            {b.kind === 'server-builds-differ' ? (
              <Banner banner={b} label="Reload" press={() => location.reload()} />
            ) : b.kind === 'tab-update-failed' ? (
              <Banner
                banner={b}
                label={ROW_COPY.retry}
                press={() => {
                  const page = tabState.updateError?.page
                  tabState.updateError = null
                  tabState.draw()
                  if (page) void swapPage(page)
                }}
              />
            ) : b.kind === 'herdr-mod-ask' ? (
              <HerdrAskBanner v={v} banner={b} />
            ) : (
              <Banner banner={b} />
            )}
          </div>
        ))}
      </div>
    </nav>
  )
}

export async function toggleDemo() {
  resetView()
  tabState.isDemo = !tabState.isDemo
  tabState.readError = null
  tabState.pollFailures = 0
  tabState.draw()
  await read()
}
