// The omp promo's beats, from docs/plans/promo-omp.md: each beat's length, its caption, the stretches of the session
// take it shows, the keys pressed in it and where the camera frames.

import type { CameraMove, Rect } from '../shared/geometry'
import type { KeyPress } from '../shared/KeyCaps'
import { TITLE_BAR } from '../shared/layout'
import type { MusicCue } from '../shared/Music'
import type { TerminalFont } from '../shared/TerminalTake'
import { beatTimeOf } from '../shared/terminal-time'
import type { TerminalSegment } from '../shared/terminal-time'
import type { CaptionSpan, VideoSpec } from '../shared/video'

export const FPS = 60
export const WIDTH = 1920
export const HEIGHT = 1080

export const CUTS = ['omp'] as const
export type Cut = (typeof CUTS)[number]

/** The session take, recorded headless with record/term.py at 100 by 30 cells, and its clip in public/. */
export const TAKE = { src: 'omp/takes/session.json', cols: 100, rows: 30 }

/** Menlo, Terminal.app's default, at a size where the whole window fits above the caption band. */
export const FONT: TerminalFont = { family: 'Menlo, monospace', size: 20, lineHeight: 1.25 }
/** Menlo's advance is 1233 of its 2048 units, so a cell's width is this share of the font size. */
const CELL_SHARE = 1233 / 2048
export const CELL = { w: FONT.size * CELL_SHARE, h: FONT.size * FONT.lineHeight }

/** The drawn window around the take: its title bar and the take's grid. */
export const WINDOW = { width: TAKE.cols * CELL.w, height: TAKE.rows * CELL.h + TITLE_BAR }

/** The title bar's text, as Terminal.app names a window by its folder and process. */
export const WINDOW_TITLE = 'visor — omp'

/**
 * Framings of the window, in its pixels. WHOLE holds all of it. TOP holds omp's start screen and prompt, and MIDDLE the
 * agent's first steps. LOWER holds rows 13 to 29, where the panel opens. BAND holds the line above the prompt and the
 * reply's end, from the left edge to column 72.
 */
const MARGIN = 24
const rows = (from: number, to: number, cols = TAKE.cols): Rect => ({
  x: -MARGIN,
  y: TITLE_BAR + from * CELL.h - MARGIN / 2,
  w: cols * CELL.w + 2 * MARGIN,
  h: (to - from + 1) * CELL.h + MARGIN,
})
export const WHOLE: Rect = { x: -MARGIN, y: -MARGIN, w: WINDOW.width + 2 * MARGIN, h: WINDOW.height + 2 * MARGIN }
const TOP = rows(0, 16)
const MIDDLE = rows(2, 24)
const LOWER = rows(13, 29)
const BAND = rows(15, 29, 72)

export type TerminalBeat = {
  kind: 'terminal'
  id: string
  number: number
  length: number
  caption: string
  /** Stretches of the session take, in seconds into it. */
  footage: TerminalSegment[]
  /** Keys pressed in the beat, from the take's log, in seconds into the beat. */
  keys: KeyPress[]
  /** The framing before the first camera move. Each move then goes from the framing before it. */
  framing: Rect
  camera?: CameraMove[]
}

export type EndBeat = { kind: 'end'; id: string; number: number; length: number }
export type Beat = TerminalBeat | EndBeat
export type Placed = Beat & { start: number }

/** How long the end card starts before its beat, over beat 5's last moments, as its lines turn into streams. */
export const END_CARD_LEAD = 0.8
export const END_CARD = { word: 'inbox', repo: 'github.com/petekp/inbox', lead: END_CARD_LEAD }

/**
 * "Focus Flow", the launch video's track, from where its full groove comes in, 31 s into the launch video and 31.4 s
 * into the track. The two videos then sound like one series.
 */
export const MUSIC: MusicCue = { src: 'music/focus-flow.mp3', startsAt: 0, trimBefore: 31.4, fadeOut: 4 }

export const frames = (seconds: number) => Math.round(seconds * FPS)

/**
 * The launch video's pace, which every beat here holds to or exceeds. All in seconds.
 * The launch video starts typing 1.6 s into its first beat, after its caption has been read, and sends 0.47 s after
 * the last letter. Its pointer rests on each target 0.9 s before the click, and each result stays 1.4 s or longer.
 */
const PACE = {
  /** From a beat's start, where its caption rises in, to its first key, so caption and screen never change at once. */
  captionFirst: 1.4,
  /** A panel the next key acts on, from the moment it shows to the key, so the viewer reads it and what is selected. */
  panelRead: 4,
  /** After a key's result shows, before the next change. */
  afterResult: 2,
  /** Command text such as /inbox, typed at 8 characters a second instead of the take's 23. */
  commandRate: 0.36,
}

/** Times in the session take, read from its log, for the keys and the screens they lead to. */
const TAKE_TIMES = {
  promptTyping: 8.2225,
  promptSent: 14.9512,
  readsFiles: 18.64,
  recordsBoth: 31.47,
  replyEnds: 33.94,
  inboxTyped: 69.2219,
  inboxTypedEnd: 69.49,
  panelOpened: 69.9416,
  panelShows: 70.0,
  answered: 79.1743,
  answerShows: 79.24,
  findings: 89.8225,
  findingsShow: 89.87,
  fixed: 98.7184,
  queued: 99.76,
  closed: 107.9464,
}

const take = (at: number, from: number, rate?: number): TerminalSegment =>
  rate === undefined ? { at, take: 'session', from } : { at, take: 'session', from, rate }
/** A key pressed at `takeTime` in the take, in seconds into a beat whose segment shows it. */
const key = (label: string, takeTime: number, segment: TerminalSegment, hold?: number): KeyPress => ({
  at: beatTimeOf(segment, takeTime),
  label,
  ...(hold === undefined ? {} : { hold }),
})
/** A segment that starts `lead` seconds before take time `takeTime` shows, at `at` in the beat. */
const before = (at: number, takeTime: number, lead: number): TerminalSegment => take(at, takeTime - lead)
/**
 * A segment from take time `from`, at `at` in the beat, that plays fast enough to reach take time `to` after `length`
 * seconds. The panel stays still while it waits for a key, so the speed change shows no cut.
 */
const reach = (at: number, from: number, to: number, length: number): TerminalSegment =>
  take(at, from, (to - from) / length)

function beats(): Beat[] {
  const T = TAKE_TIMES
  // Beat 1. The window rises in under the caption, the prompt is typed at the take's own 17.8 characters a second,
  // close to the launch video's 17, and the agent starts.
  const typing = before(0, T.promptTyping, 1.6)
  const beat1 = 1.6 + (T.promptSent - T.promptTyping) + 1
  // Beat 2. The agent works, reads both files and records both rows. The camera has settled on the line above the
  // prompt before it changes, and holds after the reply ends.
  const working = take(0, T.promptSent + 1)
  const reading = before(0.8, T.readsFiles, 0.25)
  const recording = before(3, T.recordsBoth, 1.2)
  const beat2 = beatTimeOf(recording, T.replyEnds) + 1.5
  // Beat 3. /inbox is typed slowly enough to read, held with omp's suggestion under it, and sent. The question and its
  // answers hold, then Enter answers and its result holds.
  const prompt = before(0, T.inboxTyped, PACE.captionFirst + 0.2)
  const slashTyping = take(prompt.at + T.inboxTyped - prompt.from, T.inboxTyped, PACE.commandRate)
  const slashHeld = take(beatTimeOf(slashTyping, T.inboxTypedEnd), T.inboxTypedEnd, 0.4)
  const opening = take(beatTimeOf(slashHeld, T.panelOpened), T.panelOpened)
  const asking = reach(beatTimeOf(opening, T.panelShows), T.panelShows, T.answered, PACE.panelRead)
  const answering = take(beatTimeOf(asking, T.answered), T.answered)
  const beat3 = beatTimeOf(answering, T.answerShows) + PACE.afterResult
  // Beat 4. Tab, the issue held long enough to read its title and buttons, Enter on Fix, and both of its results.
  const switching = before(0, T.findings, PACE.captionFirst)
  const issue = reach(beatTimeOf(switching, T.findingsShow), T.findingsShow, T.fixed, PACE.panelRead)
  const fixing = take(beatTimeOf(issue, T.fixed), T.fixed)
  const beat4 = beatTimeOf(fixing, T.queued) + 1.5
  // Beat 5. Esc, the line above the prompt, then the camera pulls back to the agent fixing gaze.js before the end card.
  const closing = before(0, T.closed, PACE.captionFirst)
  const closedAt = beatTimeOf(closing, T.closed)
  return [
    {
      kind: 'terminal',
      id: 'in-omp',
      number: 1,
      length: beat1,
      caption: 'Inbox is now in omp.',
      footage: [typing],
      keys: [key('Enter', T.promptSent, typing)],
      framing: TOP,
    },
    {
      kind: 'terminal',
      id: 'above-the-prompt',
      number: 2,
      length: beat2,
      caption: 'Questions are easy to miss in a long reply. Inbox keeps them above your prompt.',
      footage: [working, reading, recording],
      keys: [],
      framing: TOP,
      camera: [
        { at: 0.1, length: 0.7, from: TOP, to: MIDDLE },
        { at: recording.at + 0.1, length: 0.8, from: MIDDLE, to: BAND },
      ],
    },
    {
      kind: 'terminal',
      id: 'answer',
      number: 3,
      length: beat3,
      caption: 'Each comes with answers. Enter sends the selected one.',
      footage: [prompt, slashTyping, slashHeld, opening, asking, answering],
      keys: [
        key('/inbox', T.inboxTyped, slashTyping, 10),
        key('Enter', T.panelOpened, opening),
        key('Enter', T.answered, answering),
      ],
      framing: BAND,
      camera: [{ at: 0.2, length: 0.7, from: BAND, to: LOWER }],
    },
    {
      kind: 'terminal',
      id: 'fix',
      number: 4,
      length: beat4,
      caption: 'Bugs your agent spots wait there too. One more key asks for the fix.',
      footage: [switching, issue, fixing],
      keys: [key('Tab', T.findings, switching), key('Enter', T.fixed, fixing)],
      framing: LOWER,
    },
    {
      kind: 'terminal',
      id: 'on-both',
      number: 5,
      length: closedAt + 4.4,
      caption: 'Nothing waits on you. Your agent is on both.',
      footage: [closing],
      keys: [key('Esc', T.closed, closing)],
      framing: LOWER,
      camera: [{ at: closedAt + 2, length: 1, from: LOWER, to: WHOLE }],
    },
    { kind: 'end', id: 'end-card', number: 6, length: 6 },
  ]
}

export function timeline(_cut: Cut): Placed[] {
  let start = 0
  return beats().map(beat => {
    const placed = { ...beat, start }
    start += beat.length
    return placed
  })
}

export function totalFrames(placed: Placed[]): number {
  const last = placed[placed.length - 1]
  return last ? frames(last.start + last.length) : 0
}

/** When a terminal beat's caption leaves: before the end card starts over the last beat. */
export function captionEnd(placed: Placed[], beat: Placed & TerminalBeat): number {
  const next = placed[placed.indexOf(beat) + 1]
  return next?.kind === 'end' ? beat.length - END_CARD_LEAD + 0.3 : beat.length
}

function captionsOf(placed: Placed[]): CaptionSpan[] {
  return placed.flatMap(beat =>
    beat.kind === 'terminal'
      ? [
          {
            label: `beat ${beat.number}`,
            text: beat.caption,
            from: beat.start,
            to: beat.start + captionEnd(placed, beat),
          },
        ]
      : [],
  )
}

export const VIDEO: VideoSpec = {
  id: 'omp',
  cuts: CUTS.map(cut => {
    const placed = timeline(cut)
    const captions = captionsOf(placed)
    const marks = placed.flatMap(beat => [
      { at: beat.start, name: `b${beat.number}-start` },
      ...(beat.kind === 'terminal'
        ? [
            ...beat.keys.map(k => ({ at: beat.start + k.at + 0.3, name: `b${beat.number}-key` })),
            ...beat.footage.slice(1).map(s => ({ at: beat.start + s.at + 0.6, name: `b${beat.number}-jump` })),
          ]
        : [{ at: beat.start + 3.5, name: `b${beat.number}-address` }]),
    ])
    for (const c of captions) {
      marks.push({ at: c.from + 0.6, name: `${c.label.replace('beat ', 'b')}-caption-first` })
      marks.push({ at: c.to - 1 / FPS, name: `${c.label.replace('beat ', 'b')}-caption-last` })
    }
    return {
      id: cut,
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      frames: totalFrames(placed),
      captions,
      marks,
      stills: [],
      notes: [],
    }
  }),
}
