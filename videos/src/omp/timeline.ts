// The omp promo's beats, from docs/plans/promo-omp.md: each beat's length, its caption, the stretches of the session
// take it shows, the keys pressed in it and which part of the screen stays bright.

import type { Rect } from '../shared/geometry'
import type { KeyPress } from '../shared/KeyCaps'
import { CAPTION_BAND, TITLE_BAR } from '../shared/layout'
import type { MusicCue } from '../shared/Music'
import type { TerminalFont } from '../shared/TerminalTake'
import type { TerminalSegment } from '../shared/terminal-time'
import { captionMarks, END_CARD_LEAD, FPS, HEIGHT, place, totalFrames, WIDTH } from '../shared/video'
import type { CaptionSpan, VideoSpec } from '../shared/video'

export const CUTS = ['omp'] as const
export type Cut = (typeof CUTS)[number]

/** The session take, recorded headless with record/term.py at 100 by 20 cells, and its clip in public/. */
export const TAKE = { src: 'omp/takes/session.json', cols: 100, rows: 20 }

/** Menlo, Terminal.app's default. The whole window fits the picture at about 29 px. */
export const FONT: TerminalFont = { family: 'Menlo, monospace', size: 20, lineHeight: 1.25 }
/** Menlo's advance is 1233 of its 2048 units, so a cell's width is this share of the font size. */
const CELL_SHARE = 1233 / 2048
export const CELL = { w: FONT.size * CELL_SHARE, h: FONT.size * FONT.lineHeight }

/** The drawn window around the take: its title bar and the take's grid. */
export const WINDOW = { width: TAKE.cols * CELL.w, height: TAKE.rows * CELL.h + TITLE_BAR }

/** The title bar's text, as Terminal.app names a window by its folder and process. */
export const WINDOW_TITLE = 'visor — omp'

/** The one framing: the whole window and a margin, held still for the whole video. */
const MARGIN = 24
export const WHOLE: Rect = { x: -MARGIN, y: -MARGIN, w: WINDOW.width + 2 * MARGIN, h: WINDOW.height + 2 * MARGIN }

/** Keycaps sit at the right end of the caption band, beside the caption, so they never cover the panel. */
export const KEYCAPS = { right: 72, bottom: (CAPTION_BAND - 62) / 2 }
/** How far a caption in a beat with keycaps stays from each side of the frame, so it wraps before it reaches them. */
export const CAPTION_INSET = 320

/** How far the rows outside the focus dim, as the share of the terminal's background laid over them. */
export const FOCUS = { dim: 0.78, ease: 0.35 }

/**
 * The part of the screen that stays bright while the rest dims, from `from` to `to` seconds into the video. `band` is
 * the inbox's line above omp's prompt, and `panel` the open panel. A span that starts where another ends, without
 * `easeIn`, keeps the dim at full strength and moves only what stays bright.
 */
export type FocusSpan = { on: 'band' | 'panel'; from: number; to: number; easeIn: boolean; easeOut: boolean }

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
  /** The focus spans that touch the beat, in seconds into the beat. */
  focus: FocusSpan[]
}

export type EndBeat = { kind: 'end'; id: string; number: number; length: number }
export type Beat = TerminalBeat | EndBeat
export type Placed = Beat & { start: number }

/**
 * "Focus Flow", the launch video's track, from where its full groove comes in, 31 s into the launch video and 31.4 s
 * into the track. The two videos then sound like one series.
 */
export const MUSIC: MusicCue = { src: 'music/focus-flow.mp3', startsAt: 0, trimBefore: 31.4, fadeOut: 4 }

/**
 * The launch video's pace, which every beat here holds to or exceeds. All in seconds.
 * The launch video starts typing 1.6 s into its first beat, after its caption has been read, and sends 0.47 s after
 * the last letter. Its pointer rests on each target 0.9 s before the click, and each result stays 1.4 s or longer.
 */
const PACE = {
  /** From a beat's start, where its caption rises in, to its first key, so caption and screen never change at once. */
  captionFirst: 1.45,
  /** How long a key's result stays before the next beat's caption rises in. */
  afterResult: 1.55,
  /** omp's start screen, before the prompt is typed: long enough for the band's spotlight and the caption. */
  startHold: 2.7,
  /** After the prompt is sent, before the agent's work starts its beat. */
  afterSend: 1,
  /** After Esc closes the panel: the band's spotlight, then the agent at work, before the jump to its fix. */
  afterClose: 2.5,
  /** The agent's close of the fixed finding, from the jump to the end card's start and the last moments under it. */
  closedHold: 3.5,
}

/** Times in the session take, read from its log, for the keys and the screens they lead to. */
const TAKE_TIMES = {
  startShows: 1.7,
  promptTyping: 3.1804,
  promptSent: 9.6593,
  /**
   * The agent has read both files, and the band has moved to its place above the prompt for the rest of the turn.
   * Only the spinner changes from here until its thinking streams in.
   */
  readsFiles: 15.55,
  /** omp draws the agent's two record calls, before their lines show. */
  recordCalls: 25.86,
  recordsBoth: 26.7629,
  replyEnds: 28.7763,
  /** From the reply's end until /inbox, nothing on the screen changes. */
  stillUntil: 62.2371,
  inboxTyped: 63.8371,
  panelOpened: 65.4404,
  panelShows: 65.4785,
  answered: 73.996,
  answerShows: 74.0498,
  answerHeld: 74.1,
  finds: 76.1072,
  fixed: 81.716,
  queuedShows: 82.7497,
  /** The agent's edit, dimmed above the panel, stops streaming. */
  queuedHeld: 82.96,
  closed: 83.9758,
  closedShows: 84.0885,
  /**
   * The queued Fix has run, and the agent closes the finding: "Closed: …" shows under its check's output. Only the
   * spinner changes after it.
   */
  closedLine: 109.1,
}

/**
 * The take's stretches in the order the video plays them: each runs from take time `from` to `to`, over `length`
 * seconds of video, or at the take's own speed when it is left out. A stretch that starts where the one before it
 * ended carries on with no cut. One that starts later dissolves in. A stretch whose screen does not change can play
 * faster or slower than the take, and shows no change.
 */
type Stretch = { from: number; to: number; length?: number }

function stretches(): Stretch[] {
  const T = TAKE_TIMES
  return [
    // omp's start screen holds while the caption rises in and the band's spotlight comes and goes.
    { from: T.startShows, to: T.promptTyping, length: PACE.startHold },
    // The prompt is typed at the take's own pace and sent, and the agent starts reading.
    { from: T.promptTyping, to: T.readsFiles },
    // The first jump: past the agent's thinking, to its two records and the reply.
    { from: T.recordCalls, to: T.replyEnds + PACE.afterResult + 0.05 },
    // Nothing changes until /inbox, so the take runs through that stretch at once.
    { from: T.replyEnds + PACE.afterResult + 0.05, to: T.stillUntil, length: 0.05 },
    // /inbox, the question panel, Enter, and the answered row.
    { from: T.stillUntil, to: T.answerHeld },
    // The still panel holds the answered row long enough to read, and the next caption before Tab.
    { from: T.answerHeld, to: T.finds, length: PACE.afterResult + PACE.captionFirst },
    // Tab, the issue, Enter on Fix, and Queued.
    { from: T.finds, to: T.queuedHeld },
    // The still panel holds Queued, shown while the agent's edit streamed above it, and the next caption before Esc.
    { from: T.queuedHeld, to: T.closed, length: PACE.afterResult + PACE.captionFirst - 0.16 },
    // Esc, the band, and the agent at work on the fade.
    { from: T.closed, to: T.closedShows + PACE.afterClose },
    // The second jump: to the agent closing the finding it fixed. The spinner changes twice while it holds.
    { from: T.closedLine, to: T.closedLine + 0.15, length: PACE.closedHold },
  ]
}

type Placement = { at: number; from: number; to: number; rate: number }

/** Each stretch with the second of the video it starts at and its speed. */
function placements(): Placement[] {
  let at = 0
  return stretches().map(s => {
    const length = s.length ?? s.to - s.from
    const placed = { at, from: s.from, to: s.to, rate: (s.to - s.from) / length }
    at += length
    return placed
  })
}

/** The second of the video that shows take time `takeTime`. */
function videoTimeOf(takeTime: number): number {
  const p = placements().find(p => p.from <= takeTime && takeTime < p.to)
  if (!p) throw new Error(`The video skips take time ${takeTime}`)
  return p.at + (takeTime - p.from) / p.rate
}

/** The stretches of take between two seconds of the video, as segments that start from the first of them. */
function footageBetween(start: number, end: number): TerminalSegment[] {
  return placements()
    .filter(p => p.at < end && p.at + (p.to - p.from) / p.rate > start)
    .map(p => {
      const at = Math.max(p.at, start)
      return { at: at - start, take: 'session', from: p.from + (at - p.at) * p.rate, rate: p.rate }
    })
}

function beats(): Beat[] {
  const T = TAKE_TIMES
  const V = videoTimeOf
  const presses: KeyPress[] = [
    { at: V(T.promptSent), label: 'Enter' },
    { at: V(T.inboxTyped), label: '/inbox', hold: V(T.panelOpened) - V(T.inboxTyped) },
    { at: V(T.panelOpened), label: 'Enter' },
    { at: V(T.answered), label: 'Enter' },
    { at: V(T.finds), label: 'Tab' },
    { at: V(T.fixed), label: 'Enter' },
    { at: V(T.closed), label: 'Esc' },
  ]
  // The band holds the eye while the first caption reads, when the agent records both rows, and after Esc. The panel
  // holds it while it is open.
  const focus: FocusSpan[] = [
    { on: 'band', from: 0.7, to: PACE.startHold - 0.15, easeIn: true, easeOut: true },
    { on: 'band', from: V(T.recordsBoth) - 0.15, to: V(T.recordsBoth) + 2.7, easeIn: true, easeOut: true },
    { on: 'panel', from: V(T.panelShows), to: V(T.closedShows), easeIn: true, easeOut: false },
    { on: 'band', from: V(T.closedShows), to: V(T.closedShows) + PACE.afterClose - 0.2, easeIn: false, easeOut: true },
  ]
  const ends = [
    V(T.promptSent) + PACE.afterSend,
    V(T.replyEnds) + PACE.afterResult,
    V(T.finds) - PACE.captionFirst,
    V(T.closed) - PACE.captionFirst,
    V(T.closedLine) + PACE.closedHold,
  ]
  const captions = [
    ['in-omp', 'Inbox now supports omp (oh-my-pi)!'],
    ['above-the-prompt', "Inbox surfaces what's easy to miss in a long, noisy thread."],
    ['answer', "It anticipates what you'll want to do with each item."],
    ['fix', 'It also catches issues and opportunities your agent notices along the way.'],
    ['on-both', "Your agent manages Inbox so it's always up to date."],
  ] as const
  const terminal = captions.map(([id, caption], i): TerminalBeat => {
    const start = i === 0 ? 0 : ends[i - 1]!
    const end = ends[i]!
    return {
      kind: 'terminal',
      id,
      number: i + 1,
      length: end - start,
      caption,
      footage: footageBetween(start, end),
      keys: presses.filter(k => k.at >= start && k.at < end).map(k => ({ ...k, at: k.at - start })),
      focus: focus
        .filter(f => f.from < end && f.to > start)
        .map(f => ({ ...f, from: f.from - start, to: f.to - start })),
    }
  })
  return [...terminal, { kind: 'end', id: 'end-card', number: 6, length: 6 }]
}

export function timeline(_cut: Cut): Placed[] {
  return place(beats())
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
            ...beat.focus.map(f => ({ at: beat.start + Math.max(0, f.from) + 0.8, name: `b${beat.number}-${f.on}` })),
          ]
        : [{ at: beat.start + 3.5, name: `b${beat.number}-address` }]),
    ])
    marks.push(...captionMarks(captions, FPS))
    return {
      id: cut,
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      frames: totalFrames(placed, FPS),
      captions,
      marks,
      stills: [],
      notes: [],
    }
  }),
}
