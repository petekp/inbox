import { Easing } from 'remotion'

import { SANS } from '../shared/fonts'
import { floodRange, LINE_IN, promptText, threadLines } from './thread'
import type { Mark, ThreadStarts, TimedLine } from './thread'

const MONO = '"SF Mono", Menlo, monospace'
const FONT = 24
/** The width of one character of the thread's monospace text, in pixels. */
const CHAR = FONT * 0.6
const LINE = 34
const WINDOW = { x: 100, y: 36, w: 1720, h: 860 }
const TITLE = 48
const PAD = 32
const VIEW_W = WINDOW.w - 2 * PAD

export const MARKS: Record<Mark, { fill: string; bar: string; label: string }> = {
  question: { fill: 'rgba(245, 180, 40, 0.26)', bar: '#f5b428', label: 'Question' },
  note: { fill: 'rgba(170, 130, 255, 0.28)', bar: '#aa82ff', label: 'Side note' },
  idea: { fill: 'rgba(61, 220, 151, 0.22)', bar: '#3ddc97', label: 'Promising idea' },
  unsaid: { fill: 'rgba(79, 184, 255, 0.2)', bar: '#4fb8ff', label: 'Unmentioned insight' },
}

const ease = (p: number) => Easing.inOut(Easing.cubic)(Math.min(1, Math.max(0, p)))
const easeOut = (p: number) => Easing.out(Easing.cubic)(Math.min(1, Math.max(0, p)))
const progress = (t: number, from: number, length: number) => Math.min(1, Math.max(0, (t - from) / length))

/** A camera on the thread: the content's y at the viewport's top, and how many content pixels fill its height. */
type Camera = { top: number; height: number }
const blend = (a: Camera, b: Camera, p: number): Camera => ({
  top: a.top + (b.top - a.top) * ease(p),
  height: a.height + (b.height - a.height) * ease(p),
})

/**
 * The drawn thread at second `t` of the video, for beats 1 to 6. Its window rises in as beat 1 starts. `leaving`, from
 * 0 to 1, draws it leaving as beat 7 starts.
 */
export function ThreadView({ starts, t, leaving = 0 }: { starts: ThreadStarts; t: number; leaving?: number }) {
  const arriving = easeOut(progress(t, starts['starts-simple'], 0.7))
  const left = ease(leaving)
  const lines = threadLines(starts)
  const shown = lines.reduce((sum, l) => sum + Math.min(1, Math.max(0, (t - l.appear) / LINE_IN)), 0)
  const prompt = promptText(starts, t)
  const promptRows = Math.max(1, prompt.split('\n').length)
  const promptHeight = promptRows * LINE + 40
  const viewHeight = WINDOW.h - TITLE - promptHeight - 16

  const follow: Camera = { top: Math.max(0, shown * LINE - viewHeight), height: viewHeight }
  const flood = floodRange()
  const whole: Camera = { top: -LINE, height: flood.to * LINE + 2 * LINE }
  const unsaid = lines.findIndex(l => l.mark === 'unsaid')
  const unsaidCenter = (unsaid + 1) * LINE
  const pushedIn: Camera = { top: unsaidCenter - viewHeight / 2.5, height: viewHeight / 1.25 }
  const followAtBuried: Camera = {
    top: Math.max(0, lines.filter(l => l.appear <= starts.buried).length * LINE - viewHeight),
    height: viewHeight,
  }
  const camera =
    t < starts.buried
      ? follow
      : t < starts['never-said']
        ? blend(followAtBuried, whole, (t - starts.buried) / 1.4)
        : t < starts['by-hand']
          ? blend(whole, pushedIn, (t - starts['never-said']) / 1.0)
          : blend(pushedIn, follow, (t - starts['by-hand']) / 0.8)
  const scale = viewHeight / camera.height
  const x = scale < 1 ? (VIEW_W - VIEW_W * scale) / 2 : 0

  return (
    <div
      style={{
        position: 'absolute',
        left: WINDOW.x,
        top: WINDOW.y,
        width: WINDOW.w,
        height: WINDOW.h,
        opacity: arriving * (1 - left),
        transform: `translateY(${(1 - arriving) * 40}px) scale(${(0.97 + 0.03 * arriving) * (1 - 0.06 * left)})`,
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: '#1d1d1f',
        boxShadow: '0 30px 80px rgba(0, 0, 0, 0.55)',
        fontFamily: MONO,
        fontSize: FONT,
        color: '#e8e8ea',
      }}
    >
      <TitleBar />
      <div
        style={{
          position: 'absolute',
          left: PAD,
          top: TITLE + 8,
          width: VIEW_W,
          height: viewHeight,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: VIEW_W,
            transformOrigin: '0 0',
            transform: `translate(${x}px, ${-camera.top * scale}px) scale(${scale})`,
          }}
        >
          {lines.map((l, i) => (
            <LineView key={i} line={l} previous={lines[i - 1]} t={t} />
          ))}
        </div>
        <MarkLabels
          lines={lines}
          starts={starts}
          t={t}
          place={i => ({ x: x + VIEW_W * Math.min(scale, 1) + 16, y: (i * LINE - camera.top) * scale })}
          textAt={(i, column) => ({
            x: x + column * CHAR * scale,
            y: (i * LINE - camera.top) * scale,
            height: LINE * scale,
          })}
        />
      </div>
      <Prompt text={prompt} rows={promptRows} height={promptHeight} t={t} />
    </div>
  )
}

function TitleBar() {
  return (
    <div
      style={{
        height: TITLE,
        backgroundColor: '#2a2a2d',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 22,
        gap: 10,
        fontFamily: SANS,
        fontSize: 20,
        color: '#b9b9c0',
      }}
    >
      {['#ff5f57', '#febc2e', '#28c840'].map(color => (
        <div key={color} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: color }} />
      ))}
      <div style={{ flex: 1, textAlign: 'center', marginRight: 90 }}>visor — claude</div>
    </div>
  )
}

function LineView({ line, previous, t }: { line: TimedLine; previous: TimedLine | undefined; t: number }) {
  const opacity = Math.min(1, Math.max(0, (t - line.appear) / LINE_IN))
  const continues = previous?.kind === line.kind
  const base = {
    height: LINE,
    lineHeight: `${LINE}px`,
    whiteSpace: 'pre' as const,
    opacity,
    position: 'relative' as const,
  }
  const mark = line.mark ? MARKS[line.mark] : undefined
  const markStyle = mark ? { backgroundColor: mark.fill, boxShadow: `inset 6px 0 0 ${mark.bar}` } : {}
  switch (line.kind) {
    case 'blank':
      return <div style={base} />
    case 'user':
      return (
        <div style={{ ...base, backgroundColor: '#333336', color: '#f2f2f4' }}>
          <span style={{ color: '#9a9aa2' }}>{'❯ '}</span>
          {line.text}
        </div>
      )
    case 'say':
      return (
        <div style={{ ...base, ...markStyle }}>
          {continues ? '  ' : '● '}
          {line.text}
        </div>
      )
    case 'tool':
      return (
        <div style={base}>
          <span style={{ color: '#4ec27a' }}>{'● '}</span>
          <span style={{ fontWeight: 700 }}>{line.text}</span>
        </div>
      )
    case 'out':
      return (
        <div style={{ ...base, color: '#9a9aa2' }}>
          {continues ? '     ' : '  ⎿  '}
          {line.text}
        </div>
      )
    case 'add':
      return (
        <div style={{ ...base, color: '#d4f0da' }}>
          <span style={{ backgroundColor: 'rgba(46, 160, 67, 0.32)' }}>{`    ${line.text}`}</span>
        </div>
      )
    case 'del':
      return (
        <div style={{ ...base, color: '#f4d2d2' }}>
          <span style={{ backgroundColor: 'rgba(218, 54, 51, 0.32)' }}>{`    ${line.text}`}</span>
        </div>
      )
    case 'think':
      return <div style={{ ...base, ...markStyle, color: '#8d8d95', fontStyle: 'italic' }}>{`  ${line.text}`}</div>
  }
}

/** The column after "∴ Thinking…" where "Unmentioned insight" settles in beat 4. */
const THINKING_LABEL_COLUMN = 16
/** A label's height in beat 3, and the least space between two labels, in pixels. */
const CHIP_HEIGHT = 42
const CHIP_GAP = 8
/** The height of "Unmentioned insight" once it settles in beat 4, in pixels. */
const SETTLED_LABEL_HEIGHT = 50

/**
 * A label beside each run of marked lines, drawn at screen size. In beat 3 the labels pop in one after another, top to
 * bottom. As beat 4 starts, all but "Unmentioned insight" leave one after another, and that one grows and moves up
 * beside the short "∴ Thinking…" line above its lines as the camera pushes in. It leaves as beat 5 starts.
 */
function MarkLabels(props: {
  lines: TimedLine[]
  starts: ThreadStarts
  t: number
  place: (lineIndex: number) => { x: number; y: number }
  /** Where a column of a line's text starts on screen, and the line's height. */
  textAt: (lineIndex: number, column: number) => { x: number; y: number; height: number }
}) {
  const { lines, starts, t, place, textAt } = props
  if (t < starts.buried + 1.2 || t > starts['by-hand'] + 0.5) return null

  const runs: { mark: Mark; from: number; to: number }[] = []
  lines.forEach((l, i) => {
    if (!l.mark) return
    const last = runs[runs.length - 1]
    if (last && last.mark === l.mark && last.to === i - 1) last.to = i
    else runs.push({ mark: l.mark, from: i, to: i })
  })
  const shown = runs.filter(r => r.to < floodRange().to)
  const moving = ease(progress(t, starts['never-said'], 1))
  // Each label sits level with its lines, pushed down past the one above when they would overlap.
  let below = -Infinity
  const sides = shown.map(r => {
    const top = place(r.from)
    const middle = (top.y + place(r.to + 1).y) / 2
    const y = Math.max(middle - CHIP_HEIGHT / 2, below + CHIP_GAP)
    below = y + CHIP_HEIGHT
    return { from: { x: top.x - 14, y: middle }, chip: { x: top.x + 34, y } }
  })
  return (
    <>
      <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', overflow: 'visible' }}>
        {shown.map((r, n) => {
          const { from, chip } = sides[n]!
          const shownAt = starts.buried + 1.2 + 0.09 * n
          const drawn = ease(progress(t, shownAt, 0.35))
          const gone = r.mark === 'unsaid' ? moving : ease(progress(t, starts['never-said'] + 0.05 * n, 0.3))
          const to = { x: chip.x, y: chip.y + CHIP_HEIGHT / 2 }
          const path = `M ${from.x} ${from.y} C ${from.x + 24} ${from.y}, ${to.x - 24} ${to.y}, ${to.x} ${to.y}`
          const color = MARKS[r.mark].bar
          return (
            <g key={r.from} opacity={1 - gone}>
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - drawn}
              />
              <circle cx={from.x} cy={from.y} r={4 * drawn} fill={color} />
            </g>
          )
        })}
      </svg>
      {shown.map((r, n) => {
        const mark = MARKS[r.mark]
        const stays = r.mark === 'unsaid'
        const shownAt = starts.buried + 1.2 + 0.09 * n + 0.12
        const popped = Easing.out(Easing.back(1.8))(progress(t, shownAt, 0.36))
        const fadedIn = progress(t, shownAt, 0.18)
        const leaving = stays
          ? ease(progress(t, starts['by-hand'], 0.4))
          : ease(progress(t, starts['never-said'] + 0.05 * n, 0.3))
        const side = sides[n]!.chip
        const size = stays ? 24 + 6 * moving : 24
        const height = stays ? CHIP_HEIGHT + (SETTLED_LABEL_HEIGHT - CHIP_HEIGHT) * moving : CHIP_HEIGHT
        const thinking = textAt(r.from - 1, THINKING_LABEL_COLUMN)
        const settled = { x: thinking.x, y: thinking.y + (thinking.height - SETTLED_LABEL_HEIGHT) / 2 }
        const at = stays
          ? { x: side.x + (settled.x - side.x) * moving, y: side.y + (settled.y - side.y) * moving }
          : side
        return (
          <div
            key={r.from}
            style={{
              position: 'absolute',
              left: at.x,
              top: at.y,
              height,
              opacity: fadedIn * (1 - leaving),
              transformOrigin: '0 50%',
              transform: `translateX(${stays ? 0 : leaving * 30}px) translateY(${stays ? leaving * 12 : 0}px) scale(${0.6 + 0.4 * popped})`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: `0 ${height * 0.42}px 0 ${height * 0.16}px`,
              boxSizing: 'border-box',
              borderRadius: height / 2,
              background: '#1b1b20',
              border: `1.5px solid ${withAlpha(mark.bar, 0.7)}`,
              boxShadow: '0 6px 16px rgba(0, 0, 0, 0.5)',
              color: '#f5f5f7',
              fontFamily: SANS,
              fontSize: size,
              fontWeight: 600,
              letterSpacing: -0.2,
              whiteSpace: 'nowrap',
            }}
          >
            <MarkIcon mark={r.mark} size={height * 0.55} />
            {mark.label}
          </div>
        )
      })}
    </>
  )
}

/** Stroke paths for each mark's icon, on a 24-unit grid, from Lucide (ISC license): circle-help, pencil, lightbulb and eye-off. */
const ICONS: Record<Mark, string> = {
  question: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0 M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01',
  note: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z M15 5l4 4',
  idea: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5 M9 18h6 M10 22h4',
  unsaid:
    'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49 M14.084 14.158a3 3 0 0 1-4.242-4.242 M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143 M2 2l20 20',
}

/** A mark's icon: a line glyph in the mark's color. */
function MarkIcon({ mark, size }: { mark: Mark; size: number }) {
  const color = MARKS[mark].bar
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0, overflow: 'visible' }}>
      <path d={ICONS[mark]} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** A #rrggbb color at opacity `a`. */
function withAlpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

function Prompt({ text, rows, height, t }: { text: string; rows: number; height: number; t: number }) {
  const isBlinkOn = Math.floor(t * 2) % 2 === 0
  const lines = text.split('\n')
  return (
    <div
      style={{
        position: 'absolute',
        left: PAD,
        right: PAD,
        bottom: 0,
        height,
        borderTop: '2px solid #3a3a3e',
        paddingTop: 16,
        boxSizing: 'border-box',
      }}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ height: LINE, lineHeight: `${LINE}px`, whiteSpace: 'pre' }}>
          <span style={{ color: '#9a9aa2' }}>{i === 0 ? '❯ ' : '  '}</span>
          {lines[i] ?? ''}
          {i === rows - 1 && (
            <span style={{ backgroundColor: isBlinkOn ? '#e8e8ea' : 'transparent', color: 'transparent' }}>_</span>
          )}
        </div>
      ))}
    </div>
  )
}
