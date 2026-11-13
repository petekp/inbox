import type { Element, MouseButtonEvent, MouseMoveEvent } from 'gpui-kit'
import type { Block } from './blocks'
import type { ListPlace } from './look'

/** The element's top in the window. The app's types do not resolve the bounds' `y`, though the app reports it. */
function placeOf(ev: MouseMoveEvent | MouseButtonEvent, now: number) {
  const bounds: { y?: unknown; height: number } | undefined = ev.bounds
  const top = bounds?.y

  return typeof top === 'number' ? { top, x: ev.position.x, y: ev.position.y, at: now } : null
}

/** Listens on the Status list for the pointer, the wheel and its size, and never stops an event. */
export function watchList<E extends Element>(el: E, place: ListPlace): E {
  const pointer = (ev: MouseMoveEvent | MouseButtonEvent) => {
    const p = placeOf(ev, Date.now())
    if (p) place.listPointer(p)
  }

  return el
    .on_mouse_move(pointer)
    .on_mouse_down('left', pointer)
    .on_scroll_wheel(() => place.wheel(Date.now()))
    .on_size_change(size => place.listSized(size.width, size.height))
}

/** Listens on the area that holds the list and its scrollbar for the pointer, and never stops an event. */
export function watchArea<E extends Element>(el: E, place: ListPlace): E {
  const pointer = (ev: MouseMoveEvent | MouseButtonEvent) => {
    const p = placeOf(ev, Date.now())
    if (p) place.areaPointer(p)
  }

  return el.on_mouse_move(pointer).on_mouse_down('left', pointer)
}

/** Listens for one Status block's height. A size listener needs an element id, so a block without its own gets one. */
export function watchBlock<E extends Element>(el: E, b: Block, place: ListPlace): E {
  const hasOwnId = b.kind === 'row' || b.kind === 'fold' || b.kind === 'more'

  return (hasOwnId ? el : el.id(`block ${b.id}`)).on_size_change(size => place.blockSized(b.id, size.height))
}
