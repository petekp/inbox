// The launch video's beats, from the shot list in docs/plans/launch-video.md: each beat's length, its caption,
// and what the screen shows from which second.

import { EXIT_MS } from '../../../codex/src/rows'
import { SETTLED_MS } from '../../../hooks/timing'
import type { RowLines } from '../shared/EndCard'
import type { CameraMove, Point, Rect } from '../shared/geometry'
import type { Segment } from '../shared/Footage'
import type { MusicCue } from '../shared/Music'
import type { State } from '../shared/states'
import { captionMarks, FPS, HEIGHT, place, totalFrames, WIDTH } from '../shared/video'
import type { CaptionSpan, Cut, VideoSpec } from '../shared/video'

/** How long a closed row stays in place, and Undo drains, in all three apps, in seconds. */
const SETTLE = SETTLED_MS / 1000
/** How long a settled row then takes to leave in Codex, in seconds. */
const CODEX_EXIT = EXIT_MS / 1000

/** `launch-captions-off` is `launch` with no captions, to check that the pictures carry the story. */
export const VARIANTS = ['launch', 'launch-captions-off'] as const
export type Variant = (typeof VARIANTS)[number]

export type Look = 'terminal' | 'desktop' | 'codex'
export const LOOKS: Look[] = ['terminal', 'desktop', 'codex']
export const LOOK_NAMES: Record<Look, string> = {
  terminal: 'Claude Code in Terminal',
  desktop: 'Claude app',
  codex: 'Codex in the ChatGPT app',
}
/** An app's icon in public/icons/. */
export const appIcon = (look: Look) => `icons/${look}.png`

/**
 * Each app's window still, in pixels, and where its inbox sits in it. `rows` runs from the left edge of the tabs to
 * the right edge of an open row, and from the top of the tabs, measured from the side-by-side takes. Beat 11 pushes
 * in from the whole window to the rows. The sizes are those of the takes' clips, and the stills in public/stills/ are
 * frames from them.
 */
export const WINDOWS: Record<Look, { width: number; height: number; inbox: Rect; rows: Rect }> = {
  terminal: {
    width: 2620,
    height: 1760,
    inbox: { x: 1458, y: 79, w: 1096, h: 1471 },
    rows: { x: 1488, y: 165, w: 1042, h: 1385 },
  },
  desktop: {
    width: 2620,
    height: 1548,
    inbox: { x: 1426, y: 21, w: 1172, h: 1504 },
    rows: { x: 1476, y: 137, w: 1042, h: 1388 },
  },
  codex: {
    width: 2620,
    height: 1552,
    inbox: { x: 1516, y: 17, w: 1092, h: 1524 },
    rows: { x: 1548, y: 147, w: 1026, h: 1394 },
  },
}

/** A still captured from the app's demo, in public/. */
const still = (look: Look, state: string) => `launch/stills/${look}/${state}.png`

/** A recorded take's clip in public/, which cut.py writes. */
export const takeClip = (take: string) => `launch/takes/${take}.mp4`

/** Beats 1 to 6: the drawn thread, which src/thread.ts holds. */
export type ThreadBeat = { kind: 'thread'; id: ThreadBeatId; number: number; length: number; caption: string }
export type ThreadBeatId = 'starts-simple' | 'replies-pile-up' | 'buried' | 'never-said' | 'by-hand' | 'again'

/** A beat that shows one app across the whole frame. */
export type SoloBeat = {
  kind: 'solo'
  id: string
  number: number
  look: Look
  length: number
  caption: string
  states: State[]
  /** Recorded footage, which replaces the states' placeholders. The states then name the clicks. */
  footage?: Segment[]
  /** Where the pointer rests before its first click, in VM screen points. */
  pointerFrom: Point
  /** Camera moves on the footage. Before the first, and between moves, the camera holds on the last framing. */
  camera?: CameraMove[]
  /** Beat 7 only: how the inbox is shown the first time. */
  introduction?: Introduction
}

/**
 * The inbox's first appearance. The docked pane slides in and is named, the question is marked in the reply, then
 * the mark moves to the row the question becomes, and the camera pushes in on the pane. Rects are in the take's clip
 * pixels, read from its frames.
 */
export type Introduction = {
  pane: Rect
  /** When the pane slides in. */
  paneAt: number
  /** The question's paragraph in the reply, marked once it stops scrolling. */
  asked: Rect
  askedAt: number
  /** The question's row in the inbox, and when it lands there, read frame by frame from the take. */
  row: Rect
  rowAt: number
}

/** Beat 11: the three apps side by side, each click on the same frame in all three. */
export type SideBySideBeat = {
  kind: 'side-by-side'
  id: string
  number: number
  length: number
  caption: string
  /** When the caption appears: the hold on the three settled lists. */
  captionFrom: number
  /** When the first column starts to push in from its whole window to its inbox. */
  pushInAt: number
  pushInLength: number
  /**
   * When each column has arrived in its place, in seconds into the beat. The terminal shrinks into its column from
   * beat 10's full frame. The other two then slide in, landing on the music's beats before the groove returns at 2.7 s.
   */
  landAt: Record<Look, number>
  /** How far apart, left to right, the columns start to push in. */
  stagger: number
  states: Record<Look, State[]>
  /** Each app's recorded take of this beat, which replaces its stills. drive.py records it on these states' times. */
  takes?: Record<Look, string>
  /** Where each app's pointer rests before its first click, in VM screen points. */
  pointerFrom: Record<Look, Point>
}

export type EndCard = { kind: 'end'; id: string; number: number; length: number }

export type Beat = ThreadBeat | SoloBeat | SideBySideBeat | EndCard

/** A beat and where it starts in the video, in seconds. */
export type Placed = Beat & { start: number }

/**
 * The lines of text in each app's column as beat 11 ends, left to right: the span they cover across the frame, and the
 * height of each line, in pixels. Measured from the footage's frame at 74.5 s. Each of the end card's streams leaves
 * one of these lines.
 */
export const ROW_LINES: RowLines = [
  { from: 90, to: 568, ys: [239, 264, 313, 338, 384, 410, 601, 674, 745] },
  { from: 704, to: 1104, ys: [243, 295, 346, 467, 522, 566, 626, 653, 705] },
  { from: 1360, to: 1768, ys: [242, 294, 345, 459, 506, 552, 613, 642, 694] },
]

/**
 * The music, made in Suno, about 123 BPM. It starts `startsAt` seconds into the video, from `trimBefore` seconds into
 * the track. Its strong hits then land at 0.6 s and at 4.45 s, as the agent replies. Its
 * full groove comes in at 31 s, as the inbox first appears, and it comes back from its breakdown at 62.2 s, as beat 11 pushes in. It fades out over the
 * video's last `fadeOut` seconds.
 */
export const MUSIC: MusicCue = { src: 'music/focus-flow.mp3', startsAt: 0, trimBefore: 0.4, fadeOut: 4 }

/** The beats of one variant, each placed after the one before. */
export function timeline(_variant: Variant): Placed[] {
  return place(beats())
}

const thread = (number: number, id: ThreadBeatId, length: number, caption: string): ThreadBeat => ({
  kind: 'thread',
  id,
  number,
  length,
  caption,
})

/**
 * Beats 7 to 10 come from one take of a real Claude Code session in a sample project, an agent you wear in AR glasses.
 * Each click's time and point are the ones act.py logged as it clicked in the take, and `settle` is how long before the
 * click it moved the VM's pointer onto the target. The recording leaves out the VM's pointer, so the video draws one.
 */
function beats(): Beat[] {
  const session = (at: number, from: number): Segment => ({ at, take: 'session', from })
  const asked = 'Keep the onTap alias for one release, or remove it now?'
  const pinned = 'Should glances follow your head, or stay pinned where you leave them?'
  /** Where the pointer rests in beats 7 and 8: on the reply, inside the close-up on the inbox. */
  const reply: Point = [560, 300]
  return [
    thread(1, 'starts-simple', 6.5, 'A chat session starts simple enough.'),
    thread(2, 'replies-pile-up', 5.5, 'Then things begin to pile up.'),
    thread(3, 'buried', 5, 'Questions and ideas get buried.'),
    thread(4, 'never-said', 4, "Some aren't even surfaced."),
    thread(5, 'by-hand', 6, 'You diligently respond, point by point.'),
    thread(6, 'again', 4, 'Again, and again...'),
    {
      kind: 'solo',
      id: 'question-arrives',
      number: 7,
      look: 'terminal',
      length: 5.5,
      caption: 'Inbox gives the agent one place to ask you.',
      footage: [session(0, 21.99)],
      pointerFrom: reply,
      camera: [{ at: 3.6, length: 1, to: INBOX_CLOSE_UP }],
      introduction: {
        pane: { x: 1458, y: 79, w: 1096, h: 1471 },
        paneAt: 0.6,
        asked: { x: 30, y: 1100, w: 1410, h: 150 },
        askedAt: 1.9,
        row: { x: 1530, y: 378, w: 1000, h: 92 },
        rowAt: 3.33,
      },
      states: [
        { at: 0, label: `The reply ends by asking "${asked}"`, pane: `Needs you: "${pinned}"` },
        { at: 3.33, label: 'The line above the prompt reads "Needs you 2"', pane: `A new row arrives: "${asked}"` },
      ],
    },
    {
      kind: 'solo',
      id: 'one-click',
      number: 8,
      look: 'terminal',
      length: 8,
      caption: 'The agent anticipates your answers, as it should.',
      footage: [session(0, 41.09), session(4, 65.41)],
      pointerFrom: reply,
      camera: [{ at: 4.9, length: 0.8, from: INBOX_CLOSE_UP, to: TOP }],
      states: [
        { at: 0, label: 'Needs you, with two questions' },
        { at: 2.9, click: [760, 190], settle: 0.93, label: `"${asked}" opens with its answers` },
        {
          at: 4.3,
          click: [718, 251],
          settle: 0.93,
          label: 'The row reads ✓ Remove now, and Claude removes the alias',
        },
      ],
    },
    {
      kind: 'solo',
      id: 'findings',
      number: 9,
      look: 'terminal',
      length: 8.5,
      caption: 'Your agent has somewhere it can surface issues and opportunities, with next steps.',
      footage: [session(0, 86.16), session(2.7, 112.57), session(6.6, 151.95)],
      pointerFrom: [718, 251],
      camera: [{ at: 0, length: 0.5, from: TOP, to: MIDDLE }],
      states: [
        { at: 0, label: 'Needs you, after the answer' },
        {
          at: 0.8,
          click: [764, 98],
          settle: 0.92,
          label: 'Findings: the issue "Dwell timer survives looking away, so re-looks select early" is open',
        },
        {
          at: 3.7,
          click: [679, 421],
          settle: 0.93,
          label:
            'Fix hands the issue to Claude, and the opportunity "frame() re-sorts the glance list in place 90 times a second" opens',
        },
        { at: 7.4, click: [640, 98], settle: 0.91, label: `Back on Needs you, with "${pinned}" open` },
      ],
    },
    {
      kind: 'solo',
      id: 'answer-in-chat',
      number: 10,
      look: 'terminal',
      length: 6.5,
      caption: "Your agent keeps track of what's been completed so it doesn't hang around.",
      footage: [session(0, 157.22), session(4.6, 165.7)],
      pointerFrom: [640, 98],
      camera: [
        { at: 0.05, length: 0.55, from: MIDDLE, to: BOTTOM },
        { at: 2.0, length: 0.8, from: BOTTOM, to: MIDDLE },
        { at: 5.5, length: 1, from: MIDDLE },
      ],
      states: [
        { at: 0, label: 'The prompt', pane: `"${pinned}" open` },
        { at: 0.6, click: [154, 659], settle: 0.9, label: 'A click in the prompt' },
        { at: 1.58, label: 'You type your answer at the prompt, and send it' },
        { at: 3.8, label: 'Claude closes the row with your answer', pane: '✓ and your answer' },
        { at: 5.2, label: 'The row leaves', pane: 'No open questions' },
      ],
    },
    sideBySide(),
    { kind: 'end', id: 'end-card', number: 12, length: 6 },
  ]
}

/**
 * Framings of the session take, in clip pixels, each as wide as the picture above the caption band. The close-up holds
 * the inbox and the reply's right edge. TOP and MIDDLE hold the inbox's rows and the reply beside them, and BOTTOM the
 * prompt and the end of the reply.
 */
const INBOX_CLOSE_UP: Rect = { x: 700, y: 40, w: 1920, h: 838 }
const TOP: Rect = { x: 0, y: 40, w: 2620, h: 1144 }
const MIDDLE: Rect = { x: 0, y: 110, w: 2620, h: 1144 }
const BOTTOM: Rect = { x: 0, y: 616, w: 2620, h: 1144 }

/** Where each app's click lands in beat 11, in VM screen points, by the still the click leads to. */
const CLICKS: Record<Look, Record<string, Point>> = {
  terminal: { answered: [726, 251], findings: [764, 98], back: [640, 98], 'task-open': [781, 574], done: [851, 541] },
  desktop: { answered: [677, 207], findings: [758, 93], back: [636, 93], 'task-open': [734, 491], done: [622, 458] },
  codex: { answered: [718, 227], findings: [757, 98], back: [656, 98], 'task-open': [734, 507], done: [818, 448] },
}

/** Where each app's pointer goes after Done, in VM screen points: the conversation, outside the pushed-in rows. */
const AWAY: Record<Look, Point> = { terminal: [300, 500], desktop: [300, 480], codex: [400, 480] }

/** Seconds from a click until each app shows its result in the VM, by the still it leads to, measured from takes. */
const LEADS: Record<Look, Record<string, number>> = {
  terminal: { answered: 0.24, findings: 0.21, back: 0.22, 'task-open': 0.24, done: 0.16 },
  desktop: { answered: 0.29, findings: 0.17, back: 0.19, 'task-open': 0.17, done: 0.3 },
  codex: { answered: 0.2, findings: 0.35, back: 0.2, 'task-open': 0.2, done: 0.2 },
}
const DEFAULT_LEAD = 0.1

/**
 * drive.py clicks each app at these times. Done comes 0.9 s after the task opens, because an open row ignores
 * presses for PRESS_GUARD_MS in hooks/view.ts. It also comes before the answered row leaves, at answer + SETTLE, so
 * the rows don't move under the click, and the finished task leaves before the end card starts.
 */
function sideBySide(): SideBySideBeat {
  const [answer, findings, back, task, done] = [4.3, 5.8, 7.2, 8.0, 8.9]
  const leave = done + SETTLE
  const holdFrom = 13
  const drawn: Record<Look, { answered: string; undo: string; leaving: State[] }> = {
    terminal: {
      answered: 'The row reads ✓ in monospace, and the next row opens',
      undo: 'Undo drains, in cells',
      leaving: [{ at: leave, label: 'The row leaves', still: still('terminal', 'gone') }],
    },
    desktop: {
      answered: 'The row reads ✓ beside native buttons, and the next row opens',
      undo: "Undo's fill drains",
      leaving: [{ at: leave, label: 'The row leaves', still: still('desktop', 'gone') }],
    },
    codex: {
      answered: 'The row animates closed to ✓, and the next row opens',
      undo: "Undo's fill drains",
      leaving: [
        { at: leave, label: 'The row fades and collapses', still: still('codex', 'done') },
        { at: leave + CODEX_EXIT, label: 'The row is gone', still: still('codex', 'gone') },
      ],
    },
  }
  const clicked = (look: Look, name: string, at: number) => ({
    at,
    click: CLICKS[look][name] as Point,
    lead: LEADS[look][name] ?? DEFAULT_LEAD,
    still: still(look, name),
  })
  const states = (look: Look): State[] => [
    {
      at: 0,
      label: 'Needs you, with "Dismiss a glance with a pinch, or a flick of the wrist?" open',
      still: still(look, 'question'),
    },
    { ...clicked(look, 'answered', answer), label: drawn[look].answered },
    { ...clicked(look, 'findings', findings), label: 'Findings, which opens "Pinned glances drift in a dim room"' },
    {
      ...clicked(look, 'back', back),
      label: 'Back on Needs you, where the question opened after the answer is open again',
    },
    { ...clicked(look, 'task-open', task), label: 'The task "Put on the glasses and pair them with this Mac" opens' },
    {
      ...clicked(look, 'done', done),
      label: `The task settles. ${drawn[look].undo}.`,
      drain: { label: 'Undo', seconds: SETTLE },
    },
    {
      at: done + 0.6,
      move: AWAY[look],
      label: 'The pointer leaves the rows, so the next task does not light under it',
      still: still(look, 'done'),
    },
    ...drawn[look].leaving,
  ]
  return {
    kind: 'side-by-side',
    id: 'side-by-side',
    number: 11,
    length: 16,
    caption: 'Same inbox. At home in each app.',
    captionFrom: holdFrom,
    landAt: { terminal: 0.9, desktop: 1.23, codex: 1.72 },
    pushInAt: 2,
    pushInLength: 1.4,
    stagger: 0.3,
    states: { terminal: states('terminal'), desktop: states('desktop'), codex: states('codex') },
    takes: { terminal: 'side-by-side-terminal', desktop: 'side-by-side-desktop', codex: 'side-by-side-codex' },
    pointerFrom: { terminal: [800, 620], desktop: [800, 640], codex: [850, 640] },
  }
}

/** The captions of one variant, in seconds into the video. `launch-captions-off` has none. */
function captionsOf(variant: Variant, placed: Placed[]): CaptionSpan[] {
  if (variant === 'launch-captions-off') return []
  return placed.flatMap(beat => {
    const label = `beat ${beat.number}`
    if (beat.kind === 'solo' || beat.kind === 'thread')
      return [{ label, text: beat.caption, from: beat.start, to: beat.start + beat.length }]
    if (beat.kind === 'side-by-side')
      return [{ label, text: beat.caption, from: beat.start + beat.captionFrom, to: beat.start + beat.length }]
    return []
  })
}

/** Each beat's states, with a prefix naming the app when the beat shows several. */
function stateLists(beat: Placed): [string, State[]][] {
  if (beat.kind === 'solo') return [['', beat.states]]
  if (beat.kind === 'side-by-side') return Object.entries(beat.states).map(([look, states]) => [`${look}: `, states])
  return []
}

/** States that start after their beat ends never reach the screen, such as a settle running past the side-by-side beat. */
function cutOff(placed: Placed[]): string[] {
  return placed.flatMap(beat =>
    stateLists(beat).flatMap(([prefix, states]) =>
      states
        .filter(s => s.at >= beat.length)
        .map(
          s =>
            `beat ${beat.number}, ${prefix}"${s.label}" at ${s.at.toFixed(2)} s is cut off: the beat ends at ${beat.length} s`,
        ),
    ),
  )
}

/** Stills at every state change and push-in, and at each caption's first and last moments. */
function marksOf(placed: Placed[], captions: CaptionSpan[]): Cut['marks'] {
  const marks: Cut['marks'] = []
  for (const beat of placed) {
    const lists =
      beat.kind === 'solo' ? [beat.states] : beat.kind === 'side-by-side' ? [beat.states.terminal] : [[{ at: 0 }]]
    for (const states of lists)
      for (const s of states.filter(s => s.at < beat.length))
        marks.push({ at: beat.start + s.at, name: `b${beat.number}-${'click' in s && s.click ? 'click' : 'state'}` })
  }
  for (const beat of placed)
    if (beat.kind === 'side-by-side') {
      marks.push({ at: beat.start + beat.pushInAt + beat.pushInLength / 2, name: `b${beat.number}-pushing-in` })
      marks.push({
        at: beat.start + beat.pushInAt + 2 * beat.stagger + beat.pushInLength,
        name: `b${beat.number}-pushed-in`,
      })
    }
  return [...marks, ...captionMarks(captions, FPS)]
}

export const VIDEO: VideoSpec = {
  id: 'launch',
  cuts: VARIANTS.map(variant => {
    const placed = timeline(variant)
    const captions = captionsOf(variant, placed)
    const stills = placed.flatMap(beat => stateLists(beat).flatMap(([, states]) => states.flatMap(s => s.still ?? [])))
    return {
      id: variant,
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      frames: totalFrames(placed, FPS),
      captions,
      marks: marksOf(placed, captions),
      stills: [...new Set(stills)],
      notes: [...(captions.length === 0 ? ['captions hidden'] : []), ...cutOff(placed)],
    }
  }),
}
