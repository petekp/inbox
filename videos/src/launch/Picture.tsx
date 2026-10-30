import { Img, staticFile } from 'remotion'
import { isCaptured } from '../shared/captures'
import type { Rect } from '../shared/geometry'
import type { State } from '../shared/states'
import { appIcon, LOOK_NAMES } from './timeline'
import type { Look } from './timeline'

/** An app's label: its icon and name. */
export const label = (look: Look) => ({ name: LOOK_NAMES[look], icon: appIcon(look) })

const LOOK_COLORS: Record<Look, string> = { terminal: '#16241a', desktop: '#2a1f16', codex: '#161e2c' }

/** A captured still when the state has one, else a placeholder that names the app and what it shows. */
export function Picture(props: {
  look: Look
  state: State | undefined
  t: number
  width: number
  height: number
  inbox?: Rect
}) {
  const { look, state, t, width, height, inbox } = props
  if (state?.still && isCaptured(state.still))
    return <Img src={staticFile(state.still)} style={{ width, height, objectFit: 'contain', display: 'block' }} />

  const label = state?.label ?? ''
  if (!inbox && state?.pane)
    return (
      <div style={{ width, height, backgroundColor: LOOK_COLORS[look], position: 'relative', display: 'flex' }}>
        <div style={{ flex: 3, padding: '120px 80px 0 120px' }}>
          <div style={{ fontSize: 32, color: '#b9b9c0' }}>{LOOK_NAMES[look]} · conversation</div>
          <div style={{ marginTop: 200, fontSize: 56, fontWeight: 600, lineHeight: 1.2 }}>{label}</div>
        </div>
        <div style={{ flex: 2, padding: '120px 80px 0 64px', borderLeft: '3px solid #3a3a42' }}>
          <div style={{ fontSize: 32, color: '#b9b9c0' }}>Inbox, docked</div>
          <div style={{ marginTop: 200, fontSize: 48, fontWeight: 600, lineHeight: 1.2 }}>{state.pane}</div>
          <Drain state={state} t={t} />
        </div>
      </div>
    )

  if (!inbox)
    return (
      <div style={{ width, height, backgroundColor: LOOK_COLORS[look], position: 'relative' }}>
        <div style={{ position: 'absolute', left: 120, top: 120, fontSize: 32, color: '#b9b9c0' }}>
          {LOOK_NAMES[look]}
        </div>
        <div
          style={{
            position: 'absolute',
            left: 120,
            right: 120,
            top: 360,
            fontSize: 64,
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          {label}
          {state && <Drain state={state} t={t} />}
        </div>
      </div>
    )

  return (
    <div
      style={{ width, height, backgroundColor: '#18181c', borderRadius: 24, overflow: 'hidden', position: 'relative' }}
    >
      <div
        style={{
          height: 72,
          backgroundColor: '#25252b',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 40,
          gap: 16,
          fontSize: 30,
          color: '#c9c9d0',
        }}
      >
        {['#ff5f57', '#febc2e', '#28c840'].map(color => (
          <div key={color} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color }} />
        ))}
        <div style={{ marginLeft: 24 }}>{LOOK_NAMES[look]}</div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: inbox.x,
          top: inbox.y,
          width: inbox.w,
          height: inbox.h,
          backgroundColor: LOOK_COLORS[look],
          border: '3px solid #3a3a42',
          borderRadius: 16,
          padding: 40,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: 28, color: '#9a9aa2', marginBottom: 24 }}>Inbox · {LOOK_NAMES[look]}</div>
        <div style={{ fontSize: 48, fontWeight: 600, lineHeight: 1.2 }}>{label}</div>
        {state && <Drain state={state} t={t} />}
      </div>
    </div>
  )
}

function Drain({ state, t }: { state: State; t: number }) {
  if (!state.drain) return null

  const left = Math.max(0, state.drain.seconds - (t - state.at))
  return (
    <div style={{ marginTop: 40, fontSize: 32, fontWeight: 400, color: '#c9c9d0' }}>
      {state.drain.label} · {left.toFixed(1)} s
      <div style={{ marginTop: 12, height: 16, borderRadius: 8, backgroundColor: '#3a3a42' }}>
        <div
          style={{
            width: `${(left / state.drain.seconds) * 100}%`,
            height: '100%',
            borderRadius: 8,
            backgroundColor: '#e8e8ee',
          }}
        />
      </div>
    </div>
  )
}
