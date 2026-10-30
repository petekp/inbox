import { ago } from '../../hooks/text'
import {
  HELP_COPY,
  helpKeys,
  MARK_LEGEND,
  bannerOf,
  tabBarBanners,
  DOT,
  isRowTab,
  shownTabs,
  tabBadge,
  footerStatus,
  ROW_COPY,
  SETTLED_MS,
} from '../../hooks/view'
import type { ShownTab } from '../../hooks/view'
import type { Tab } from '../../types'
import type { TabView as View } from './core'
import { tabState, selection, drawnRows } from './tab-state'
import { switchTab, drawnTab } from './tab-selection'
import { swapPage } from './tab-swap'
import { read } from './tab-read'
import { pulseInStep, MarkGlyph, legendMarkClass, GroupTitle, Banner } from './tab-parts'

/** Help in place of the tab's body: the keys this tab takes, then what each mark means. */
export function HelpPage({ v }: { v: View }) {
  const keys = helpKeys('codex', v.isNextBuild === true, drawnTab(), false)

  return (
    <main class="status-page help">
      <section>
        <GroupTitle title={HELP_COPY.keys} count={0} />
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
        <GroupTitle title={HELP_COPY.marks} count={0} />
        <div class="list">
          {MARK_LEGEND.map(m => (
            <div key={m.mark} class="row">
              <span class={legendMarkClass(m)} ref={m.isRunning ? pulseInStep : undefined}>
                <MarkGlyph text={m.mark} />
              </span>
              <div class="content tight muted">{m.words}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

const HOOKS_TRUST_TEXT: Record<NonNullable<View['hooksTrust']>, string> = {
  untrusted:
    'Codex is not running the inbox’s hooks, so the inbox is not reading Codex’s replies. Click the hook icon beside the approval setting, then Allow all. If the icon isn’t there, open Settings, then Hooks, then Inbox, then Trust all.',
  modified:
    'Codex stopped the inbox’s hooks when the inbox updated, so the inbox is not reading Codex’s replies. To trust them again, click the hook icon beside the approval setting, then Allow all. If the icon isn’t there, open Settings, then Hooks, then Inbox, then Trust all.',
}

const LATE_READ_MS = 60_000

function footerOf(v: View) {
  return footerStatus(
    drawnTab(),
    v.status,
    { isFetching: v.isFetchingPrs, hasPrs: v.prs.drawn.length > 0 },
    v.statusPage?.error ?? null,
  )
}

export function Status({ v }: { v: View }) {
  const sinceRead = Date.now() - tabState.readAt
  const status =
    tabState.pollFailures >= 2 ? (
      <span class={sinceRead > LATE_READ_MS ? 'tone-error' : undefined}>
        Last read {ago(sinceRead)}
        {DOT}retrying
      </span>
    ) : (
      footerOf(v).text
    )

  return <div class="status">{status}</div>
}

export function TabBar({ v }: { v: View }) {
  const counts: Record<Tab, number> = { needsYou: v.needsYou.count, findings: v.findings.count, prs: v.prs.count }
  const badgeOf = (id: ShownTab) => tabBadge(id, counts)
  const { error } = footerOf(v)
  const shown = drawnTab()

  return (
    <nav>
      <div class="tabs">
        {shownTabs(v.isNextBuild === true).map(t => (
          <button
            type="button"
            class={`tab ${shown === t.id ? 'shown' : ''}`}
            title={t.label}
            onClick={() => {
              switchTab(t.id)
              tabState.draw()
            }}
          >
            <span class="tab-symbol" aria-hidden="true">
              {t.symbol}
            </span>
            <span class="tab-word">{t.label}</span>
            {badgeOf(t.id) === null ? null : (
              <span class={isRowTab(t.id) ? `count tone-${t.id}` : 'count'}>{badgeOf(t.id)}</span>
            )}
          </button>
        ))}
      </div>
      {tabBarBanners(
        [
          ...(tabState.serverNote ? [bannerOf(tabState.serverNote.kind, tabState.serverNote.text)] : []),
          ...(v.hooksTrust ? [bannerOf('hooks-trust', HOOKS_TRUST_TEXT[v.hooksTrust])] : []),
          ...(tabState.updateError ? [bannerOf('tab-update-failed', tabState.updateError.text)] : []),
        ],
        error,
        tabState.lineNote && Date.now() - tabState.lineNote.at < SETTLED_MS
          ? { text: tabState.lineNote.text, isError: tabState.lineNote.isError === true }
          : null,
      ).map(b =>
        b.kind === 'server-builds-differ' ? (
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
        ) : (
          <Banner banner={b} />
        ),
      )}
    </nav>
  )
}

export async function toggleDemo() {
  tabState.viewGeneration++
  tabState.isDemo = !tabState.isDemo
  // A new showing. The server makes the sample at its first read after this, so the row it closes as it starts stays.
  tabState.shownSince = Date.now()
  tabState.readError = null
  tabState.pollFailures = 0
  tabState.view = null
  tabState.seen = new Map()
  tabState.rowsSeen = {}
  drawnRows.clear()
  tabState.lastLists = null
  selection.needsYou = null
  selection.findings = null
  selection.prs = null
  tabState.typing = null
  tabState.draw()
  await read()
}
