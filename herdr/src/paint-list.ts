import { div } from 'gpui-kit'
import type { Context, Element } from 'gpui-kit'
import { ScrollHandle, Scrollbar, v_flex } from 'gpui-base'
import { shownTabs } from '../../core/view/tabs'
import type { ShownTab } from '../../core/view/tabs'
import { scrollFadeEl } from './paint-chrome'
import { EDGE, END_SPACE } from './paint-theme'
import type { Theme } from './paint-theme'

/** What the list shows: a tab, or Help. */
type ListPlace = ShownTab | 'help'

const LIST_ID = 'inbox-list'

/**
 * The list's scroll position on each tab and on Help, so a tab the person goes back to opens where they left it. A tab
 * opens at its top the first time it shows, after a move the look made to it, and after a switch to another session.
 * Help opens at its top each time.
 */
export class ListScroll {
  private readonly handles: ReadonlyMap<ListPlace, ScrollHandle>

  /** Makes every place's position. gpui-kit asks for a scroll handle to be made in the view's `init`. */
  constructor() {
    const places: ListPlace[] = [...shownTabs().map(t => t.id), 'help']
    this.handles = new Map(places.map(place => [place, ScrollHandle.new()]))
  }

  of(place: ListPlace): ScrollHandle | null {
    return this.handles.get(place) ?? null
  }

  /** Scrolls `place` to its top when it next draws. The list's first child is the space above the rows, at its top. */
  startOver(place: ListPlace): void {
    this.handles.get(place)?.scroll_to_item(0)
  }

  startAllOver(): void {
    for (const place of this.handles.keys()) this.startOver(place)
  }
}

type ListParts = {
  t: Theme
  scroll: ScrollHandle | null
  rows: Element[]
  onHeight: (size: { width: number; height: number }, cx: Context) => void
  /** What a wheel or a pointer move over the list runs. */
  onUse: (cx: Context) => void
  onClick: () => void
}

/** The list in the pane's room under the tabs and banners, with its fades and its scroll bar. */
export function listEl({ t, scroll, rows, onHeight, onUse, onClick }: ListParts): Element {
  return div()
    .flex_1()
    .min_h(0)
    .relative()
    .child(
      v_flex()
        .id(LIST_ID)
        .when(scroll !== null, e => (scroll ? e.track_scroll(scroll) : e))
        .absolute()
        .inset_0()
        .overflow_y_scroll()
        .pb(END_SPACE)
        .on_size_change(onHeight)
        .on_scroll_wheel((_e, cx) => onUse(cx))
        .on_mouse_move((_e, cx) => onUse(cx))
        .on_click(() => onClick())
        .child(div().flex_none().h(EDGE))
        .children(rows),
    )
    .child(scrollFadeEl(t, 'top'))
    .child(scrollFadeEl(t, 'bottom'))
    .child(Scrollbar.vertical(LIST_ID).absolute().inset_0())
}
