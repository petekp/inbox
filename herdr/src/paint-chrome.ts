import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { h_flex, v_flex } from 'gpui-base'
import type { BannerView } from '../../hooks/banners'
import { HELP_COPY } from '../../hooks/help'
import type { Button } from './blocks'
import type { TabCell } from './draw'
import type { Message } from './screen'
import type { Paint, Theme } from './paint-theme'

/** The pane's top line: the inbox and its agent, the status line, and Help. */
export function headerEl(agent: string | null, status: string | null, isHelpShown: boolean | null, p: Paint): Element {
  const { t } = p
  const help: Button = {
    id: 'help',
    label: isHelpShown ? HELP_COPY.close : HELP_COPY.open,
    emphasis: 'quiet',
    isOut: false,
    hotkey: null,
    does: { is: 'view', change: { toggleHelp: true } },
  }

  return h_flex()
    .h(42)
    .flex_none()
    .px(14)
    .gap(8)
    .items_center()
    .border_b(1)
    .border_color(t.border)
    .child(div().font_semibold().child('Inbox'))
    .when(agent !== null, e =>
      e.child(
        div()
          .text_size(12)
          .text_color(t.muted)
          .child(agent ?? ''),
      ),
    )
    .child(div().flex_1())
    .when(status !== null, e =>
      e.child(
        div()
          .text_size(11)
          .text_color(t.dim)
          .child(status ?? ''),
      ),
    )
    .when(isHelpShown !== null, e =>
      e.child(
        h_flex()
          .id('help')
          .h(26)
          .px(8)
          .items_center()
          .rounded(7)
          .text_size(12)
          .text_color(t.muted)
          .cursor_pointer()
          .hover(s => s.bg(t.hover))
          .accessibility_label(help.label)
          .on_click((_e, cx) => p.press(help, cx))
          .child(help.label),
      ),
    )
}

export function bannerEl(b: BannerView, t: Theme): Element {
  const color = b.tone === 'error' ? t.ansi1 : b.tone === 'warning' ? t.blocked : t.muted

  return v_flex()
    .px(14)
    .py(8)
    .border_b(1)
    .border_color(t.border)
    .bg(t.raised)
    .text_size(12)
    .child(div().font_semibold().text_color(color).child(b.lead))
    .when(b.body !== null, e =>
      e.child(
        div()
          .whitespace_normal()
          .text_color(t.muted)
          .child(b.body ?? ''),
      ),
    )
}

/** A line under the tabs that says something about the whole session, such as that the host trimmed it. */
export const sessionNoteEl = (text: string, t: Theme): Element =>
  div()
    .px(14)
    .py(6)
    .border_b(1)
    .border_color(t.border)
    .text_size(12)
    .whitespace_normal()
    .text_color(t.muted)
    .child(text)

export function tabsEl(tabs: TabCell[], p: Paint): Element {
  const { t } = p

  return h_flex()
    .h(40)
    .flex_none()
    .px(8)
    .gap(4)
    .items_center()
    .border_b(1)
    .border_color(t.border)
    .children(
      tabs.map(tab =>
        h_flex()
          .id(`tab ${tab.id}`)
          .h(28)
          .px(10)
          .gap(6)
          .items_center()
          .rounded(7)
          .cursor_pointer()
          .accessibility_label(tab.badge ? `${tab.label}, ${tab.badge}` : tab.label)
          .when(tab.isSelected, e => e.bg(t.selected).font_semibold())
          .when(!tab.isSelected, e => e.text_color(t.muted).hover(s => s.bg(t.hover)))
          .on_click((_e, cx) => p.pick(tab.id, cx))
          .child(tab.label)
          .when(tab.badge !== null, e =>
            e.child(
              div()
                .text_size(11)
                .text_color(t.blocked)
                .child(tab.badge ?? ''),
            ),
          ),
      ),
    )
}

export function messageEl(m: Message, t: Theme): Element {
  return v_flex()
    .p(16)
    .gap(4)
    .child(
      div()
        .font_semibold()
        .text_color(m.isError ? t.ansi1 : t.foreground)
        .child(m.title),
    )
    .when(m.hint !== null, e =>
      e.child(
        div()
          .whitespace_normal()
          .text_color(t.muted)
          .child(m.hint ?? ''),
      ),
    )
}
