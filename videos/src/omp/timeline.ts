// The omp promo's beats, from docs/plans/promo-omp.md: each beat's length, its caption, the stretches of the session
// take it shows, the keys pressed in it and where the camera frames.

import type { Segment } from '../shared/Footage'
import type { CameraMove, Rect } from '../shared/geometry'
import type { KeyPress } from '../shared/KeyCaps'
import { TITLE_BAR } from '../shared/layout'
import type { MusicCue } from '../shared/Music'
import type { TerminalFont } from '../shared/TerminalTake'
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
  footage: Segment[]
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
 * Times in the session take, read from its log: the prompt's last letters, the agent's reply, and each key. The
 * agent's working time between them is skipped under dissolves.
 */
const TAKE_TIMES = {
  promptSent: 14.9512,
  inboxTyped: 69.2219,
  panelOpened: 69.9416,
  answered: 79.1743,
  findings: 89.8225,
  fixed: 98.7184,
  closed: 107.9464,
}

const take = (at: number, from: number): Segment => ({ at, take: 'session', from })
/** A key pressed at `takeTime` in the take, in seconds into a beat whose segment plays `from` at `at`. */
const key = (label: string, takeTime: number, segment: Segment): KeyPress => ({
  at: segment.at + takeTime - segment.from,
  label,
})

function beats(): Beat[] {
  const typing = take(0, 10.75)
  const opening = take(0, 68.85)
  const answering = take(2, 78.4)
  const switching = take(0, 89.45)
  const fixing = take(2, 97.95)
  const closing = take(0, 107.45)
  return [
    {
      kind: 'terminal',
      id: 'in-omp',
      number: 1,
      length: 5,
      caption: 'Inbox is now in omp.',
      footage: [typing],
      keys: [key('Enter', TAKE_TIMES.promptSent, typing)],
      framing: TOP,
    },
    {
      kind: 'terminal',
      id: 'above-the-prompt',
      number: 2,
      length: 5.6,
      caption: 'Questions are easy to miss in a long reply. Inbox keeps them above your prompt.',
      footage: [take(0, 15.05), take(1, 21.5), take(2, 31)],
      keys: [],
      framing: TOP,
      camera: [
        { at: 0, length: 0.7, from: TOP, to: MIDDLE },
        { at: 2.6, length: 0.9, from: MIDDLE, to: BAND },
      ],
    },
    {
      kind: 'terminal',
      id: 'answer',
      number: 3,
      length: 5.2,
      caption: 'Each comes with answers. Enter sends the selected one.',
      footage: [opening, answering],
      keys: [
        key('/inbox', TAKE_TIMES.inboxTyped, opening),
        key('Enter', TAKE_TIMES.panelOpened, opening),
        key('Enter', TAKE_TIMES.answered, answering),
      ],
      framing: BAND,
      camera: [{ at: 0, length: 0.6, from: BAND, to: LOWER }],
    },
    {
      kind: 'terminal',
      id: 'fix',
      number: 4,
      length: 4.8,
      caption: 'Bugs your agent spots wait there too. One more key asks for the fix.',
      footage: [switching, fixing],
      keys: [key('Tab', TAKE_TIMES.findings, switching), key('Enter', TAKE_TIMES.fixed, fixing)],
      framing: LOWER,
    },
    {
      kind: 'terminal',
      id: 'on-both',
      number: 5,
      length: 3.5,
      caption: 'Nothing waits on you. Your agent is on both.',
      footage: [closing],
      keys: [key('Esc', TAKE_TIMES.closed, closing)],
      framing: LOWER,
      camera: [{ at: 0.8, length: 1, from: LOWER, to: WHOLE }],
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
