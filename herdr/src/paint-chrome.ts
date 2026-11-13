import { Background, PathBuilder, div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { h_flex, v_flex } from 'gpui-base'
import type { BannerView } from '../../hooks/banners'
import type { BannerTone } from '../../hooks/tones'
import { HELP_COPY } from '../../hooks/help'
import { BANNER_PAD_Y_PT } from '../../hooks/layout'
import type { Button, Tone } from './blocks'
import type { TabCell } from './draw'
import type { Message } from './screen'
import {
  BOX_RADIUS,
  BUTTON_H,
  CONTROL_GAP,
  EDGE,
  GROUP_GAP,
  INSET,
  LINE_GAP,
  SMALL_TEXT,
  TAB_RADIUS,
  colorOf,
  tint,
} from './paint-theme'
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
 * The tab row: the tabs with their counts, then the status line and Help at its right end, inside the panel's padding.
 * A tab is a pill of a button's size, and only the selected tab's label is bold. Herdr's pane header names the pane,
 * so the look draws no title.
 */
export function tabsEl(tabs: TabCell[], status: string | null, isHelpShown: boolean, p: Paint): Element {
  const { t } = p
  const help = helpButton(isHelpShown)

  return h_flex()
    .flex_none()
    .flex_wrap()
    .px(EDGE)
    .pt(EDGE)
    .gap_x(LINE_GAP)
    .gap_y(CONTROL_GAP)
    .items_center()
    .children(
      tabs.map(tab =>
        h_flex()
          .id(`tab ${tab.id}`)
          .h(BUTTON_H)
          .px(INSET)
          .items_center()
          .rounded(TAB_RADIUS)
          .accessibility_label(tab.badge ? `${tab.label}, ${tab.badge}` : tab.label)
          .when(tab.isSelected, e => e.bg(t.raised).text_color(t.foreground).font_semibold())
          .when(!tab.isSelected, e => e.text_color(t.muted).hover(s => s.text_color(t.foreground)))
          .on_click((_e, cx) => p.pick(tab.id, cx))
          .child(tab.label)
          .when(tab.badge !== null, e =>
            e.child(
              div()
                .ml(LINE_GAP)
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
          .px(LINE_GAP)
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

/** A question draws in a notice's blue, as in the other looks. */
const BANNER_TONES: Record<BannerTone, Tone> = { error: 'error', warning: 'warning', notice: 'notice', ask: 'notice' }

/**
 * A message in a box tinted with the tone of what it says, from edge to edge. The buttons that act on its problem draw
 * at its right end, as the Codex tab's banner draws its key. `under`, such as a press's result, goes below the text and
 * the buttons, so the buttons stay still when it appears.
 */
export function bannerEl(b: BannerView, t: Theme, buttons: Element[] = [], under: Element | null = null): Element {
  const tone = colorOf(t, BANNER_TONES[b.tone])
  const text = v_flex()
    .flex_1()
    .min_w(0)
    .whitespace_normal()
    .child(div().font_semibold().text_color(tone).child(b.lead))
    .when(b.body !== null, e => e.child(div().child(b.body ?? '')))
  const row = h_flex()
    .gap(INSET)
    .items_center()
    .child(text)
    .when(buttons.length > 0, e => e.child(h_flex().flex_none().gap(CONTROL_GAP).children(buttons)))

  return v_flex()
    .mx(EDGE)
    .px(INSET)
    .py(BANNER_PAD_Y_PT)
    .rounded(BOX_RADIUS)
    .border_1()
    .border_color(tint(tone, 0.3))
    .bg(tint(tone, 0.09))
    .child(row)
    .children(under ? [under] : [])
}

/** A line under the tabs that says something about the whole session, such as that the host trimmed it. */
export const sessionNoteEl = (text: string, t: Theme): Element =>
  div().px(EDGE).pt(CONTROL_GAP).whitespace_normal().text_color(t.muted).child(text)

/** What the look shows in place of an inbox, centred in the pane as the Codex tab's empty page. */
export function messageEl(m: Message, t: Theme): Element {
  return v_flex()
    .flex_1()
    .justify_center()
    .items_center()
    .p(GROUP_GAP)
    .gap(LINE_GAP)
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

const FILL = PathBuilder.fill()
  .add_polygon(
    [
      [0, 0],
      ['100%', 0],
      ['100%', '100%'],
      [0, '100%'],
    ],
    true,
  )
  .build()

/**
 * A fade from the pane's background to clear, over the list's padding at one edge. The look cannot read where the list
 * has scrolled, so the fade always draws. At rest it lies over empty padding and shows nothing. Rows that scroll under
 * the edge fade out there, so it shows only where the list goes on past the edge.
 */
export function scrollFadeEl(t: Theme, edge: 'top' | 'bottom'): Element {
  const isTop = edge === 'top'
  const fade = Background.linear_gradient(isTop ? 180 : 0, tint(t.background, 1), tint(t.background, 0))

  return window
    .paint_path(FILL, fade)
    .absolute()
    .left(0)
    .right(0)
    .when(isTop, e => e.top(0).h(EDGE))
    .when(!isTop, e => e.bottom(0).h(GROUP_GAP))
}
