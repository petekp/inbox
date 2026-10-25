// The drawn thread in beats 1 to 6: the lines an agent writes while it works, and when each one appears.
//
// The text is written for the video. Its questions, idea and unmentioned insight are the ones the real session in
// beats 7 to 10 brings to the inbox.

export type LineKind = 'user' | 'say' | 'tool' | 'out' | 'add' | 'del' | 'think' | 'blank'

/**
 * What the video marks on a line: a question to you, a side note, a promising idea, or something the agent noticed and
 * never said.
 */
export type Mark = 'question' | 'note' | 'idea' | 'unsaid'

export type Line = { kind: LineKind; text: string; mark?: Mark }

const line = (kind: LineKind, text = '', mark?: Mark): Line => ({ kind, text, ...(mark ? { mark } : {}) })
const blank = line('blank')

export const FIRST_PROMPT = 'Add pinch-to-dismiss to glances.'

const OPENING: Line[] = [
  line('user', FIRST_PROMPT),
  blank,
  line('say', "I'll make a pinch dismiss the glance you're looking at, and fade it out."),
  blank,
]

const FLOOD: Line[] = [
  line('tool', 'Read(src/glances.js)'),
  line('out', 'Read 41 lines'),
  line('tool', 'Read(src/gestures.js)'),
  line('out', 'Read 22 lines'),
  blank,
  line('say', 'glances.js keeps the glances in view and sorts them nearest first. gestures.js'),
  line('say', 'turns hand tracking into taps. I will add pinchToDismiss() beside createView().'),
  blank,
  line('tool', 'Update(src/glances.js)'),
  line('out', 'Added 7 lines'),
  line('add', '38 + export function pinchToDismiss(view, lookedAt) {'),
  line('add', '39 +   return onTap(() => {'),
  line('add', '40 +     const glance = lookedAt()'),
  line('add', '41 +     if (glance) view.dismiss(glance.id)'),
  line('add', '42 +   })'),
  line('add', '43 + }'),
  blank,
  line('say', 'A glance can follow your head or stay where you left it. Should glances follow', 'question'),
  line('say', 'your head, or stay pinned where you leave them? I kept them pinned for now.', 'question'),
  blank,
  line('tool', 'Bash(npm test)'),
  line('out', '> visor@0.3.0 test'),
  line('out', '✔ the view lists the glances in front of you, nearest first (1.8ms)'),
  line('out', '✖ a pinch dismisses the glance you look at (2.1ms)'),
  line('out', "  expected [ 'weather' ] to equal []"),
  line('tool', 'Update(src/glances.js)'),
  line('del', '19 -      if (i > 0) glances.splice(i, 1)'),
  line('add', '19 +      if (i >= 0) glances.splice(i, 1)'),
  line('tool', 'Bash(npm test)'),
  line('out', '✔ 2 tests passed'),
  blank,
  line('think', '∴ Thinking…'),
  line('think', 'gaze.js keeps the dwell timer when your gaze leaves a glance, so looking back', 'unsaid'),
  line('think', "selects it at once. That's not part of this task. I'll leave it.", 'unsaid'),
  blank,
  line('tool', 'Read(src/gaze.js)'),
  line('out', 'Read 24 lines'),
  line('tool', 'Read(src/space.js)'),
  line('out', 'Read 18 lines'),
  blank,
  line('say', 'onTap() fires on the start of any pinch, so the name no longer fits. I will'),
  line('say', 'rename it to onPinch() and update its callers.'),
  blank,
  line('tool', 'Update(src/gestures.js)'),
  line('out', 'Added 3 lines, removed 1 line'),
  line('del', '12 - export function onTap(handler) {'),
  line('add', '12 + export function onPinch(handler) {'),
  line('add', '20 + // Old name for onPinch, kept for one release.'),
  line('add', '21 + export const onTap = onPinch'),
  line('tool', 'Update(src/glances.js)'),
  line('out', 'Added 1 line, removed 1 line'),
  line('del', "1 - import { onTap } from './gestures.js'"),
  line('add', "1 + import { onPinch } from './gestures.js'"),
  line('tool', 'Bash(grep -rn "onTap" src test)'),
  line('out', 'src/gestures.js:21: export const onTap = onPinch'),
  blank,
  line('say', 'I kept onTap as an alias at the bottom of gestures.js. Keep the onTap alias', 'question'),
  line('say', 'for one release, or remove it now?', 'question'),
  blank,
  line('tool', 'Read(src/view/fade.js)'),
  line('out', 'Read 33 lines'),
  line('tool', 'Bash(npm test)'),
  line('out', '✔ 2 tests passed'),
  blank,
  line('say', 'Side note: the fade runs on a 60 Hz timer, and the glasses draw at 90 Hz, so', 'note'),
  line('say', 'a fading glance steps a little instead of fading smoothly.', 'note'),
  blank,
  line('tool', 'Update(src/view/fade.js)'),
  line('out', 'Added 9 lines'),
  line('add', '14 + export function fadeOut(glance, ms = 180) {'),
  line('add', '15 +   const start = performance.now()'),
  line('add', '16 +   return now => {'),
  line('add', '17 +     const p = Math.min(1, (now - start) / ms)'),
  line('add', '18 +     glance.opacity = 1 - p * p'),
  line('add', '19 +     return p < 1'),
  line('add', '20 +   }'),
  line('add', '21 + }'),
  blank,
  line('say', 'Idea: frame() re-sorts every glance 90 times a second. Sorting only when one', 'idea'),
  line('say', 'moves would save battery on long sessions.', 'idea'),
  blank,
  line('tool', 'Bash(ls src/haptics)'),
  line('out', 'ls: src/haptics: No such file or directory'),
  blank,
  line('say', 'There is no haptics module yet. Should a dismiss buzz the wristband, or stay', 'question'),
  line('say', 'silent?', 'question'),
  blank,
  line('tool', 'Read(src/voice.js)'),
  line('out', 'Read 52 lines'),
  line('tool', 'Read(src/anchors.js)'),
  line('out', 'Read 61 lines'),
  line('say', 'Voice commands go through say() in voice.js, which already knows the glance in view.'),
  line('tool', 'Update(src/voice.js)'),
  line('out', 'Added 6 lines'),
  line('add', "31 +    case 'dismiss':"),
  line('add', '32 +      view.dismiss(lookedAt()?.id)'),
  line('add', '33 +      break'),
  line('add', "34 +    case 'dismiss all':"),
  line('add', '35 +      view.clear()'),
  line('add', '36 +      break'),
  blank,
  line('say', 'Saying "dismiss all" now clears every glance. Should it ask first, or can you', 'question'),
  line('say', 'bring them back from history?', 'question'),
  blank,
  line('tool', 'Bash(npm test)'),
  line('out', '✔ the view lists the glances in front of you, nearest first (1.6ms)'),
  line('out', '✔ a pinch dismisses the glance you look at (1.9ms)'),
  line('out', '✔ saying dismiss clears the glance in view (2.4ms)'),
  line('out', '✔ saying dismiss all clears every glance (2.2ms)'),
  line('out', '✔ 4 tests passed'),
  blank,
  line('tool', 'Update(README.md)'),
  line('out', 'Added 4 lines'),
  line('add', '12 + ## Dismissing a glance'),
  line('add', '13 + Look at a glance and pinch, or say "dismiss".'),
  line('add', '14 + Say "dismiss all" to clear every glance.'),
  blank,
  line('say', 'Done. A pinch or "dismiss" now fades out the glance you look at, the tests pass,'),
  line('say', "and the README says how. I haven't committed anything."),
  blank,
]

/** Your reply typed point by point in beat 5. */
export const NUMBERED_REPLY = [
  '1. Keep them pinned',
  '2. Remove the alias now',
  '3. Buzz the wristband, gently',
  '4. Ask before dismissing all',
]

const FOLLOW_UP: Line[] = [
  line('say', '1. Pinned. Should a pinned glance move if you walk into another room?', 'question'),
  line('say', '2. I removed the alias. Two tests in test/legacy/ still import onTap.', 'question'),
  line('say', '   Update them, or delete them?', 'question'),
  line('tool', 'Update(src/haptics.js)'),
  line('out', 'Added 12 lines'),
  line('say', '3. A dismiss buzzes for 20 ms. Use the same buzz for a select?', 'question'),
  line('say', '4. "Dismiss all" now asks "Clear 6 glances?" first. It needs a voice reply too.'),
  blank,
]

/** Where each beat of the thread starts, in seconds of the video, by beat id. */
export type ThreadStarts = {
  'starts-simple': number
  'replies-pile-up': number
  buried: number
  'never-said': number
  'by-hand': number
  again: number
}

/** Seconds per character as you type at the prompt. */
const TYPE_RATE = 1 / 30
/**
 * The first prompt is typed slower, after the caption has been read, all in seconds into beat 1. It is sent so the
 * agent's reply, 0.5 s later, lands on the music's second strong hit.
 */
const FIRST_PROMPT_TYPING = { from: 1.6, rate: 1 / 17, sentAt: 3.95 }
/** How long a line takes to fade in and push the thread up. */
export const LINE_IN = 0.12
/** Lines a second at the start of the flood, which then grows so the flood ends 0.2 s before beat 3. */
const FLOOD_START_RATE = 3

export type TimedLine = Line & { appear: number }

/** Every line of the thread, with the second it appears. */
export function threadLines(s: ThreadStarts): TimedLine[] {
  const sentAt = s['starts-simple'] + FIRST_PROMPT_TYPING.sentAt
  const opening = OPENING.map((l, i) => ({ ...l, appear: i < 2 ? sentAt : sentAt + 0.5 + 0.4 * (i - 2) }))

  const floodFrom = s['replies-pile-up']
  const floodLength = s.buried - 0.2 - floodFrom
  const growth = growthFor(FLOOD.length, floodLength)
  // The flood's rate grows as e^(growth·t), so line i appears when the lines streamed so far reach i + 1.
  const flood = FLOOD.map((l, i) => ({
    ...l,
    appear: floodFrom + Math.log(1 + ((i + 1) * growth) / FLOOD_START_RATE) / growth,
  }))

  const replySent = numberedReplyTyping(s).sentAt
  const reply = NUMBERED_REPLY.map(text => ({ kind: 'user' as const, text, appear: replySent }))
  const followFrom = Math.max(replySent + 0.5, s.again + 0.2)
  const followUp = [blank, ...FOLLOW_UP].map((l, i) => ({ ...l, appear: followFrom + 0.14 * i }))

  return [...opening, ...flood, ...reply, ...followUp]
}

/** The growth rate at which a flood starting at FLOOD_START_RATE lines a second streams `count` lines in `seconds`. */
function growthFor(count: number, seconds: number): number {
  const streamed = (k: number) => (FLOOD_START_RATE / k) * (Math.exp(k * seconds) - 1)
  let low = 1e-6
  let high = 5
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2
    if (streamed(mid) < count) low = mid
    else high = mid
  }
  return (low + high) / 2
}

/** The flood's lines, as indexes into threadLines, which beat 3 fits on screen. */
export const floodRange = () => ({ from: OPENING.length, to: OPENING.length + FLOOD.length })

function numberedReplyTyping(s: ThreadStarts) {
  const text = NUMBERED_REPLY.join('\n')
  const from = s['by-hand'] + 0.6
  const doneAt = from + text.length * TYPE_RATE
  return { text, from, doneAt, sentAt: doneAt + 0.4 }
}

/** What the prompt holds at second `t`: typed text, cleared when it is sent. */
export function promptText(s: ThreadStarts, t: number): string {
  const typed = (text: string, from: number, rate = TYPE_RATE) =>
    text.slice(0, Math.max(0, Math.floor((t - from) / rate)))
  const first = FIRST_PROMPT_TYPING
  if (t < s['starts-simple'] + first.sentAt) return typed(FIRST_PROMPT, s['starts-simple'] + first.from, first.rate)
  const reply = numberedReplyTyping(s)
  if (t >= reply.from && t < reply.sentAt) return typed(reply.text, reply.from)
  const againFrom = s.again + 2.6
  if (t >= againFrom) return typed('1. ', againFrom)
  return ''
}
