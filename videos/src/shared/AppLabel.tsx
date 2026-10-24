import { Img, staticFile } from 'remotion'

import { isCaptured } from './captures'
import { BAND } from './layout'

/**
 * An app's icon and name, centered on `left` to `left + width` with its middle at `middle` px from the top. `icon` is
 * a file in public/icons/, which Git ignores, since each is its maker's trademark. Without the icon file, the name
 * shows alone.
 */
export function AppLabel(props: {
  name: string
  icon: string
  left: number
  width: number
  middle?: number
  opacity?: number
}) {
  const { name, icon, left, width, middle = BAND / 2, opacity = 1 } = props
  if (opacity <= 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        left,
        width,
        top: middle - 30,
        height: 60,
        opacity,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        color: 'white',
        fontSize: 32,
        fontWeight: 600,
        letterSpacing: -0.3,
        whiteSpace: 'nowrap',
      }}
    >
      {isCaptured(icon) && <Img src={staticFile(icon)} style={{ width: 46, height: 46 }} />}
      {name}
    </div>
  )
}
