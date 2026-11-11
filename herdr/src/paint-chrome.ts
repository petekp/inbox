import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { h_flex, v_flex } from 'gpui-base'
import type { BannerView } from '../../hooks/banners'
import { HELP_COPY } from '../../hooks/help'
import { BANNER_GAP_PT, BANNER_PAD_Y_PT } from '../../hooks/layout'
import type { Button } from './blocks'
import type { TabCell } from './draw'
import type { Message } from './screen'
import { EDGE_X, SMALL_TEXT, colorOf, tint } from './paint-theme'
import type { Paint, Theme } from './paint-theme'

const helpButton = (isHelpShown: boolean): Button => ({
  id: 'help',
  label: isHelpShown ? HELP_COPY.close : HELP_COPY.open,
  emphasis: 'quiet',
  isOut: false,
  hotkey: null,
  does: { is: 'view', change: { toggleHelp: true } },
})

/**
 * The tab row: the tabs with their counts, then the status line and Help at its right end. Herdr's pane header names
 * the pane, so the look draws no title of its own.
 */
export function tabsEl(tabs: TabCell[], status: string | null, isHelpShown: boolean, p: Paint): Element {
  const { t } = p
  const help = helpButton(isHelpShown)

  return h_flex()
    .flex_none()
    .flex_wrap()
    .px(12)
    .pt(12)
    .gap(4)
    .items_center()
    .children(
      tabs.map(tab =>
        h_flex()
          .id(`tab ${tab.id}`)
          .px(12)
          .py(6)
          .items_center()
          .rounded(6)
          .cursor_pointer()
          .accessibility_label(tab.badge ? `${tab.label}, ${tab.badge}` : tab.label)
          .when(tab.isSelected, e => e.bg(t.raised).text_color(t.foreground).font_semibold())
          .when(!tab.isSelected, e => e.text_color(t.muted).hover(s => s.text_color(t.foreground)))
          .on_click((_e, cx) => p.pick(tab.id, cx))
          .child(tab.label)
          .when(tab.badge !== null, e =>
            e.child(
              div()
                .ml(6)
                .font_semibold()
                .text_color(colorOf(t, tab.id === 'overview' ? null : tab.id))
                .child(tab.badge ?? ''),
            ),
          ),
      ),
    )
    .child(div().flex_1())
    .when(status !== null, e =>
      e.child(
        div()
          .px(4)
          .text_size(SMALL_TEXT)
          .text_color(t.muted)
          .child(status ?? ''),
      ),
    )
    .child(
      h_flex()
        .id('help')
        .px(6)
        .rounded(5)
        .text_color(t.muted)
        .cursor_pointer()
        .hover(s => s.bg(t.hover).text_color(t.foreground))
        .accessibility_label(help.label)
        .on_click((_e, cx) => p.press(help, cx))
        .child(help.label),
    )
}

/** A message about the inbox's own state, in a box tinted with the tone of what it says. */
export function bannerEl(b: BannerView, t: Theme): Element {
  const tone = b.tone === 'error' ? t.ansi1 : b.tone === 'warning' ? t.blocked : t.foreground

  return v_flex()
    .mx(12)
    .mt(BANNER_GAP_PT)
    .px(12)
    .py(BANNER_PAD_Y_PT)
    .rounded(10)
    .border_1()
    .border_color(tint(tone, 0.3))
    .bg(tint(tone, 0.09))
    .whitespace_normal()
    .child(div().font_semibold().text_color(tone).child(b.lead))
    .when(b.body !== null, e => e.child(div().child(b.body ?? '')))
}

/** A line under the tabs that says something about the whole session, such as that the host trimmed it. */
export const sessionNoteEl = (text: string, t: Theme): Element =>
  div()
    .px(EDGE_X + 2)
    .pt(10)
    .whitespace_normal()
    .text_color(t.muted)
    .child(text)

/** What the look shows in place of an inbox, centred in the pane as the Codex tab's empty page. */
export function messageEl(m: Message, t: Theme): Element {
  return v_flex()
    .flex_1()
    .justify_center()
    .items_center()
    .p(32)
    .gap(4)
    .child(
      div()
        .font_semibold()
        .text_center()
        .text_color(m.isError ? t.ansi1 : t.foreground)
        .child(m.title),
    )
    .when(m.hint !== null, e =>
      e.child(
        div()
          .whitespace_normal()
          .text_center()
          .text_color(t.muted)
          .child(m.hint ?? ''),
      ),
    )
}
