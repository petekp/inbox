// Runs in the VM. Reads one command per line on stdin, posts it as input events at once, and
// replies "ok <command>" on stdout. One long-lived process keeps each press within a few
// milliseconds of the driver's log, which starting osascript per press would not.
//
//   osascript -l JavaScript hand.js
//
// Commands, in screen points from the top left:
//   key <name>          a key press: a letter, a digit, return, tab, escape, space, up, down, left, right,
//                       with modifiers first, as in cmd+k or ctrl+x
//   click <x> <y>       moves the pointer there and clicks
//   move <x> <y>        moves the pointer there
//   type <text>         types the text
//   scroll <x> <y> <n>  moves the pointer there and turns the wheel n lines, up when n is positive
//   drag <x> <y> <x2> <y2>  presses at x y, moves to x2 y2 in steps and lets go there, as in resizing a pane
ObjC.import('CoreGraphics')
ObjC.import('Foundation')

const KEYCODES = {
  a: 0,
  s: 1,
  d: 2,
  f: 3,
  h: 4,
  g: 5,
  z: 6,
  x: 7,
  c: 8,
  v: 9,
  b: 11,
  q: 12,
  w: 13,
  e: 14,
  r: 15,
  y: 16,
  t: 17,
  1: 18,
  2: 19,
  3: 20,
  4: 21,
  6: 22,
  5: 23,
  9: 25,
  7: 26,
  8: 28,
  0: 29,
  o: 31,
  u: 32,
  i: 34,
  p: 35,
  return: 36,
  l: 37,
  j: 38,
  k: 40,
  n: 45,
  m: 46,
  tab: 48,
  space: 49,
  delete: 51,
  escape: 53,
  home: 115,
  pageup: 116,
  end: 119,
  pagedown: 121,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
}

function mouse(type, x, y) {
  const e = $.CGEventCreateMouseEvent(null, type, $.CGPointMake(x, y), $.kCGMouseButtonLeft)
  // Some apps read a press without a click count as no click at all.
  if (type !== $.kCGEventMouseMoved) $.CGEventSetIntegerValueField(e, $.kCGMouseEventClickState, 1)
  $.CGEventPost($.kCGHIDEventTap, e)
}

const MODIFIERS = {
  cmd: { flag: 0x100000, code: 55 },
  shift: { flag: 0x20000, code: 56 },
  option: { flag: 0x80000, code: 58 },
  ctrl: { flag: 0x40000, code: 59 },
}

function post(code, isDown, flags) {
  const e = $.CGEventCreateKeyboardEvent(null, code, isDown)
  $.CGEventSetFlags(e, flags)
  $.CGEventPost($.kCGHIDEventTap, e)
}

/**
 * A key press, with modifiers before it, as in cmd+k. The modifier keys go down and up around it, since a flag on
 * the key alone leaves the modifier held for the events after it.
 */
function key(chord) {
  const parts = chord.split('+')
  const name = parts.pop()
  const code = KEYCODES[name]
  if (code === undefined) throw new Error(`no key ${name}`)
  const modifiers = parts.map(m => {
    if (!MODIFIERS[m]) throw new Error(`no modifier ${m}`)
    return MODIFIERS[m]
  })
  let flags = 0
  for (const m of modifiers) post(m.code, true, (flags |= m.flag))
  post(code, true, flags)
  post(code, false, flags)
  for (const m of modifiers.reverse()) post(m.code, false, (flags &= ~m.flag))
}

function type(text) {
  Application('System Events').keystroke(text)
}

function perform(line) {
  const [verb, ...rest] = line.split(' ')
  if (verb === 'key') return key(rest[0])
  if (verb === 'type') return type(rest.join(' '))
  const [x, y, lines] = rest.map(Number)
  mouse($.kCGEventMouseMoved, x, y)
  if (verb === 'move') return
  if (verb === 'drag') {
    const [, , x2, y2] = rest.map(Number)
    delay(0.08)
    mouse($.kCGEventLeftMouseDown, x, y)
    const steps = 20
    for (let i = 1; i <= steps; i++) {
      delay(0.02)
      mouse($.kCGEventLeftMouseDragged, x + ((x2 - x) * i) / steps, y + ((y2 - y) * i) / steps)
    }
    delay(0.08)
    mouse($.kCGEventLeftMouseUp, x2, y2)
    return
  }
  if (verb === 'scroll') {
    delay(0.05)
    $.CGEventPost($.kCGHIDEventTap, $.CGEventCreateScrollWheelEvent(null, $.kCGScrollEventUnitLine, 1, lines))
    return
  }
  if (verb !== 'click') throw new Error(`no command ${verb}`)
  delay(0.08)
  mouse($.kCGEventLeftMouseDown, x, y)
  delay(0.05)
  mouse($.kCGEventLeftMouseUp, x, y)
}

function reply(text) {
  $.NSFileHandle.fileHandleWithStandardOutput.writeData($(text + '\n').dataUsingEncoding($.NSUTF8StringEncoding))
}

function run() {
  const input = $.NSFileHandle.fileHandleWithStandardInput
  let pending = ''
  for (;;) {
    const data = input.availableData
    if (Number(data.length) === 0) return
    pending += $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js
    let end
    while ((end = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, end).trim()
      pending = pending.slice(end + 1)
      if (!line) continue
      try {
        perform(line)
        reply(`ok ${line}`)
      } catch (e) {
        reply(`error ${line}: ${e.message}`)
      }
    }
  }
}
