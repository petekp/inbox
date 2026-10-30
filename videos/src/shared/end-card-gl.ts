import type { RowLines } from './EndCard'
import { GEIST_MONO, SANS } from './fonts'

/** The frame the card draws in, and where its word sits. */
export type Frame = { width: number; height: number; fps: number; centerY: number; repoY: number }

export const STREAMS = 27
export const STRANDS = 3

export const WORD_SIZE = 220
const wordFont = `600 ${WORD_SIZE}px ${GEIST_MONO}`
const WORD_SPACING = '-6px'

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
const seeded = (i: number, n: number) => {
  const s = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453
  return s - Math.floor(s)
}

/**
 * Most streams sit near the plane in focus. A few pass close to the lens, large and soft, and a few far behind, so the
 * light has depth.
 */
function depthOf(i: number) {
  const r = seeded(i, 7)
  if (r < 0.15) return 0.75 + r
  if (r < 0.35) return -0.6 - r
  return (r - 0.65) * 0.9
}

/** Each stream as two vec4s and a vec3: its path, its braid place and twist, its line of text and depth, and its color. */
export function streamData(f: Frame, rowLines: RowLines, lead: number) {
  const a: number[] = []
  const b: number[] = []
  const c: number[] = []
  const d: number[] = []
  for (let i = 0; i < STREAMS; i++) {
    const bundle = Math.floor(i / STRANDS)
    const column = rowLines[i % rowLines.length]!
    const slot = Math.floor(i / rowLines.length)
    a.push(
      200 + seeded(i, 1) * (f.height - 400),
      (seeded(i, 2) - 0.5) * 560,
      900 + seeded(i, 3) * 1200,
      -300 + seeded(i, 4) * 600,
    )
    b.push(
      0.0018 + seeded(i, 5) * 0.004,
      seeded(i, 6) * Math.PI * 2,
      i % STRANDS,
      (bundle - (STREAMS / STRANDS - 1) / 2) * 3.4,
    )
    c.push(
      column.from + (column.to - column.from) * (0.3 + 0.4 * seeded(i, 8)),
      column.ys[slot % column.ys.length]!,
      -lead + 0.1 + (i % rowLines.length) * 0.12 + seeded(i, 10) * 0.2,
      depthOf(i),
    )
    d.push(seeded(i, 11), 0.003 + seeded(i, 13) * 0.006, 0.33 + seeded(i, 14) * 0.36)
  }
  return { a, b, c, d }
}

const VERT = `#version 300 es
in vec2 corner;
void main() { gl_Position = vec4(corner, 0.0, 1.0); }`

type Gl = WebGL2RenderingContext
export type Target = { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }

export function compile(gl: Gl, frag: string) {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader failed')
    return s
  }
  const p = gl.createProgram()!
  gl.attachShader(p, shader(gl.VERTEX_SHADER, VERT))
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, frag))
  gl.bindAttribLocation(p, 0, 'corner')
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link failed')
  const u = (name: string) => gl.getUniformLocation(p, name)
  return { p, u }
}

export function target(gl: Gl, w: number, h: number): Target {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const fb = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  return { tex, fb, w, h }
}

/** The word, its blurred copy and the repo's address, in the red, green and blue channels of one texture. */
export function textCanvas(f: Frame, word: string, repo: string) {
  const c = document.createElement('canvas')
  c.width = f.width
  c.height = f.height
  const g = c.getContext('2d')!
  g.fillStyle = 'black'
  g.fillRect(0, 0, f.width, f.height)
  g.globalCompositeOperation = 'lighter'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = wordFont
  g.letterSpacing = WORD_SPACING
  g.fillStyle = '#ff0000'
  g.fillText(word, f.width / 2, f.centerY)
  g.filter = 'blur(10px)'
  g.fillStyle = '#00ff00'
  g.fillText(word, f.width / 2, f.centerY)
  g.filter = 'none'
  const width = g.measureText(word).width
  g.letterSpacing = '0px'
  g.font = `400 42px ${SANS}`
  g.fillStyle = '#0000ff'
  g.fillText(repo, f.width / 2, f.repoY)
  const caret = [f.width / 2 + width / 2 + 18, f.centerY - WORD_SIZE * 0.36, WORD_SIZE * 0.5, WORD_SIZE * 0.72] as const
  return { canvas: c, caret }
}
