import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { h_flex, v_flex } from 'gpui-base'
import type { BannerView } from '../../hooks/banners'
import { HELP_COPY } from '../../hooks/help'
import { BANNER_GAP_PT, BANNER_PAD_Y_PT } from '../../hooks/layout'
import type { Button } from './blocks'
import type { TabCell } from './draw'
import type { Message } from './screen'
import { BUTTON_GAP, EDGE_X, SMALL_TEXT, SPINE, colorOf, tint } from './paint-theme'
import type { Paint, Theme } from './paint-theme'

/** A tab's side padding, so its label sits on the spine. */
const TAB_X = 12

const helpButton = (isHelpShown: boolean): Button => ({
  id: 'help',
  label: isHelpShown ? HELP_COPY.close : HELP_COPY.open,
  emphasis: 'quiet',
  isOut: false,
  hotkey: null,
  does: { is: 'view', change: { toggleHelp: true } },
})

/**
 * The tab row: the tabs with their counts, then the status line and Help at its right end. A tab's label sits on the
 * spine, and only the selected tab's label is bold. Herdr's pane header names the pane, so the look draws no title.
 */
export function tabsEl(tabs: TabCell[], status: string | null, isHelpShown: boolean, p: Paint): Element {
  const { t } = p
  const help = helpButton(isHelpShown)

  return h_flex()
    .flex_none()
    .flex_wrap()
    .pl(SPINE - TAB_X)
    .pr(EDGE_X)
    .pt(12)
    .gap(4)
    .items_center()
    .children(
      tabs.map(tab =>
        h_flex()
          .id(`tab ${tab.id}`)
          .px(TAB_X)
          .py(6)
          .items_center()
          .rounded(6)
          .accessibility_label(tab.badge ? `${tab.label}, ${tab.badge}` : tab.label)
          .when(tab.isSelected, e => e.bg(t.raised).text_color(t.foreground).font_semibold())
          .when(!tab.isSelected, e => e.text_color(t.muted).hover(s => s.text_color(t.foreground)))
          .on_click((_e, cx) => p.pick(tab.id, cx))
          .child(tab.label)
          .when(tab.badge !== null, e =>
            e.child(
              div()
                .ml(6)
                .font_normal()
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
        .text_color(t.muted)
        .hover(s => s.text_color(t.foreground))
        .accessibility_label(help.label)
        .on_click((_e, cx) => p.press(help, cx))
        .child(help.label),
    )
}

/**
 * A message in a box tinted with the tone of what it says. The buttons that act on its problem draw at its right end,
 * as the Codex tab's banner draws its key, and `under` follows its text.
 */
export function bannerEl(b: BannerView, t: Theme, buttons: Element[] = [], under: Element | null = null): Element {
  const tone = colorOf(t, b.tone)
  const text = v_flex()
    .flex_1()
    .min_w(0)
    .whitespace_normal()
    .child(div().font_semibold().text_color(tone).child(b.lead))
    .when(b.body !== null, e => e.child(div().child(b.body ?? '')))
    .children(under ? [under] : [])

  return h_flex()
    .mx(BANNER_X)
    .mt(BANNER_GAP_PT)
    .pl(SPINE - BANNER_X - 1)
    .pr(EDGE_X - BANNER_X - 1)
    .py(BANNER_PAD_Y_PT)
    .gap(12)
    .items_center()
    .rounded(10)
    .border_1()
    .border_color(tint(tone, 0.3))
    .bg(tint(tone, 0.09))
    .child(text)
    .when(buttons.length > 0, e => e.child(h_flex().flex_none().gap(BUTTON_GAP).children(buttons)))
}

/** A banner's box starts this far in. Inside its 1 px border, its text starts on the spine and its buttons end on the right edge. */
const BANNER_X = 12

/** A line under the tabs that says something about the whole session, such as that the host trimmed it. */
export const sessionNoteEl = (text: string, t: Theme): Element =>
  div().pl(SPINE).pr(EDGE_X).pt(8).whitespace_normal().text_color(t.muted).child(text)

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
