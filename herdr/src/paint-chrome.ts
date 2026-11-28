import { Background, PathBuilder, div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { h_flex, v_flex } from 'gpui-base'
import type { BannerView } from '../../core/view/banners'
import type { BannerTone } from '../../core/view/tones'
import { HELP_COPY } from '../../core/view/help'
import { fitTabs, tabName } from '../../core/view/tabs'
import { BANNER_PAD_Y_PT } from '../../core/view/layout'
import { ENTER_FADE_MS, LEAVE_FADE_MS, enterDelayMs } from '../../core/view/row-motion'
import { HEIGHT_SPRING } from '../../core/view/springs'
import type { Button, Tone } from './blocks'
import type { Message } from './screen'
import { fadeEl } from './paint-parts'
import type { DrawnTab } from './tab-counts'
import {
  BOX_RADIUS,
  BUTTON_H,
  CONTROL_GAP,
  EDGE,
  END_SPACE,
  HELP_ICON,
  HELP_ICON_TEXT,
  INSET,
  INSIDE_GAP,
  SMALL_GAP,
  TAB_RADIUS,
  colorOf,
  tint,
} from './paint-theme'
import type { Paint, Theme } from './paint-theme'

const helpButton: Button = {
  id: 'help',
  label: HELP_COPY.name,
  emphasis: 'quiet',
  isOut: false,
  hotkey: null,
  does: { is: 'view', change: { toggleHelp: true } },
}

/** The Help tab's icon: a question mark in a circle, in the color of the tab's label. */
const helpIconEl = (t: Theme, isSelected: boolean): Element =>
  h_flex()
    .w(HELP_ICON)
    .h(HELP_ICON)
    .flex_none()
    .items_center()
    .justify_center()
    .rounded(HELP_ICON / 2)
    .border_1()
    .border_color(isSelected ? t.foreground : t.muted)
    .when(!isSelected, e => e.hover(s => s.border_color(t.foreground)))
    .text_size(HELP_ICON_TEXT)
    .font_semibold()
    .child(HELP_COPY.icon)

/**
 * The tab row: the tabs with their counts, then the Help tab at its right end, inside the panel's padding.
 * A tab is a pill of a button's size, and only the selected tab's label is bold. While Help shows, the Help tab is the
 * selected one and the others are not. Herdr's pane header names the pane, so the look draws no title.
 * The tabs show their words where the row in words fits on one line, else their symbols, as `fitTabs` decides. The
 * words never wrap, so a draw before the copy's new width reaches the look cuts the row instead of changing its height.
 */
export function tabsEl(tabs: DrawnTab[], isHelpShown: boolean, p: Paint): Element {
  const { t } = p
  const wordsWidth = p.heights.widthOf(TAB_WORDS)
  const isWordsFit = wordsWidth === undefined || wordsWidth <= p.tabRowRoom
  const { naming } = fitTabs([p.tabRowRoom], name => name === 'symbols' || isWordsFit)

  return h_flex()
    .relative()
    .flex_none()
    .when(naming === 'symbols', e => e.flex_wrap())
    .px(EDGE)
    .pt(EDGE)
    .pb(CONTROL_GAP)
    .gap_x(SMALL_GAP)
    .gap_y(CONTROL_GAP)
    .items_center()
    .children(
      tabs.map(tab => {
        const isTabSelected = tab.isSelected && !isHelpShown
        const isCountGone = tab.count === 'fading' || tab.count === 'closing'

        return h_flex()
          .id(`tab ${tab.id}`)
          .h(BUTTON_H)
          .px(INSET)
          .items_center()
          .rounded(TAB_RADIUS)
          .accessibility_label(tab.badge && !isCountGone ? `${tab.label}, ${tab.badge}` : tab.label)
          .when(isTabSelected, e => e.bg(t.raised).text_color(t.foreground).font_semibold())
          .when(!isTabSelected, e => e.text_color(t.muted).hover(s => s.text_color(t.foreground)))
          .when(naming === 'symbols', e => e.tooltip(tab.label))
          .on_click((_e, cx) => p.pick(tab.id, cx))
          .child(tabName(tab, naming))
          .when(tab.badge !== null, e => e.child(countEl(tab, p)))
      }),
    )
    .child(div().flex_1())
    .child(
      h_flex()
        .id('help')
        .h(BUTTON_H)
        .px(INSET)
        .items_center()
        .rounded(TAB_RADIUS)
        .accessibility_label(helpButton.label)
        .when(isHelpShown, e => e.bg(t.raised).text_color(t.foreground))
        .when(!isHelpShown, e => e.text_color(t.muted).hover(s => s.text_color(t.foreground)))
        .on_click((_e, cx) => p.press(helpButton, cx))
        .child(helpIconEl(t, isHelpShown)),
    )
    .child(tabWordsEl(tabs, p))
}

/** The key the tab row in words reports its width under. A session switch keeps it, since it holds no session's rows. */
export const TAB_WORDS = 'tab words'

/**
 * The tab row in words on one line, drawn hidden, whose width says whether the words fit. Every label is bold, as the
 * selected tab's is, so a switch of tab does not change the fit. It measures the words while the row shows symbols.
 */
function tabWordsEl(tabs: DrawnTab[], p: Paint): Element {
  return h_flex()
    .id(TAB_WORDS)
    .absolute()
    .top(0)
    .left(0)
    .opacity(0)
    .whitespace_nowrap()
    .gap_x(SMALL_GAP)
    .font_semibold()
    .on_size_change((size, cx) => p.measure(TAB_WORDS, size, cx, true))
    .children(
      tabs.map(tab =>
        h_flex()
          .flex_none()
          .px(INSET)
          .child(tab.label)
          .when(tab.badge !== null, e =>
            e.child(
              div()
                .pl(SMALL_GAP)
                .font_normal()
                .child(tab.badge ?? ''),
            ),
          ),
      ),
    )
    .child(div())
    .child(
      div()
        .flex_none()
        .w(HELP_ICON + 2 * INSET),
    )
}

/**
 * A tab's count, in a box whose width springs, so the tabs after it never move in one draw. A count that comes fades in
 * once its box has nearly opened, and a count that goes fades out before its box shuts, as a block's space does.
 */
function countEl(tab: DrawnTab, p: Paint): Element {
  const key = `count ${tab.id}`
  const width = p.heights.widthOf(key)
  const boxWidth = { rest: undefined, opening: width ?? 0, fading: width ?? 0, closing: 0 }[tab.count]
  const isShown = tab.count === 'rest' || (tab.count === 'opening' && width !== undefined)
  const delay = tab.count === 'opening' ? enterDelayMs(width ?? 0) : 0
  const glide = { duration: isShown ? ENTER_FADE_MS : LEAVE_FADE_MS, delay }
  const text = div()
    .id(key)
    .font_normal()
    .text_color(colorOf(p.t, tab.id === 'overview' ? null : tab.id))
    .child(tab.badge ?? '')

  return h_flex()
    .id(`count box ${tab.id}`)
    .flex_none()
    .overflow_hidden()
    .spring('width', HEIGHT_SPRING)
    .when(boxWidth !== undefined, e => e.w(boxWidth ?? 0))
    .child(
      div()
        .flex_none()
        .pl(SMALL_GAP)
        .on_size_change((size, cx) => p.measure(key, size, cx, true))
        .child(fadeEl(text, key, isShown ? 1 : 0, glide, p)),
    )
}

/** A question draws in a notice's blue, as in the other looks. */
const BANNER_TONES: Record<BannerTone, Tone> = { error: 'error', warning: 'warning', notice: 'notice', ask: 'notice' }

const toneOf = (b: BannerView, t: Theme) => colorOf(t, BANNER_TONES[b.tone])

/** A banner's fill: its tone at a faint share. */
export const bannerFillOf = (b: BannerView, t: Theme) => tint(toneOf(b, t), 0.09)

/**
 * A message in a box tinted with the tone of what it says, from edge to edge. The buttons that act on its problem draw
 * at its right end, as the Codex tab's banner draws its key. `under`, such as a press's result, goes below the text and
 * the buttons, so the buttons stay still when it appears.
 */
export function bannerEl(
  b: BannerView,
  t: Theme,
  buttons: Element[] = [],
  under: Element | null = null,
  after?: string,
): Element {
  const tone = toneOf(b, t)
  const lead = div().font_semibold().text_color(tone).child(b.lead)
  const text = v_flex()
    .flex_1()
    .min_w(0)
    .whitespace_normal()
    .child(after ? h_flex().child(lead).child(div().text_color(t.muted).child(after)) : lead)
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
    .bg(bannerFillOf(b, t))
    .child(row)
    .children(under ? [under] : [])
}

/** A line under the tabs that says something about the whole session, such as that the host trimmed it. */
export const sessionNoteEl = (text: string, t: Theme): Element =>
  div().px(EDGE).pt(EDGE).whitespace_normal().text_color(t.muted).child(text)

/** What the look shows in place of an inbox, centred in the pane as the Codex tab's empty page. */
export function messageEl(m: Message, t: Theme): Element {
  return v_flex()
    .flex_1()
    .justify_center()
    .items_center()
    .p(END_SPACE)
    .gap(INSIDE_GAP)
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
    .when(!isTop, e => e.bottom(0).h(END_SPACE))
}
