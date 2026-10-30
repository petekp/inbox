import { useEffect, useRef } from 'react'
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { clamp, compile, streamData, target, textCanvas, WORD_SIZE } from './end-card-gl'
import type { Frame, Target } from './end-card-gl'
import { composite, DOWN, scene, UP } from './end-card-scene'
import { useFonts } from './fonts'

/**
 * Lines of text in the frame as the end card starts, each column's span across the frame and the height of each line,
 * in pixels. Each stream leaves one of these lines, so the picture before the card reads as turning into light.
 */
export type RowLines = { from: number; to: number; ys: number[] }[]

/** What an end card shows, and how it starts. */
export type EndCardProps = {
  /** The word typed at the middle, lowercase. */
  word: string
  /** The address under the word. */
  repo: string
  rowLines: RowLines
  /** How long the card starts before its beat, over the beat before it, in seconds. */
  lead: number
  /** The card's beat, in seconds, over which the camera eases in. */
  length: number
}

const FLASH_AT = 2.5

const BLOOM_LEVELS = 6

/** The word's middle sits at 520 px of a 1080 px frame, and the address under it. */
function frameOf(width: number, height: number, fps: number): Frame {
  const centerY = Math.round((height * 520) / 1080)
  return { width, height, fps, centerY, repoY: Math.round(centerY + WORD_SIZE * 0.55 + 90) }
}

function setup(canvas: HTMLCanvasElement, f: Frame, card: EndCardProps) {
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: true, alpha: true })
  if (!gl) throw new Error('No WebGL2. Render with --gl=angle.')
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('No EXT_color_buffer_float')
  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  const sceneProgram = compile(gl, scene(f))
  const down = compile(gl, DOWN)
  const up = compile(gl, UP)
  const compositeProgram = compile(gl, composite(f))
  const sceneTarget = target(gl, f.width, f.height)
  const levels = Array.from({ length: BLOOM_LEVELS }, (_, i) =>
    target(gl, Math.ceil(f.width / 2 ** (i + 1)), Math.ceil(f.height / 2 ** (i + 1))),
  )

  const { canvas: textSource, caret } = textCanvas(f, card.word, card.repo)
  const text = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, text)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textSource)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  const streams = streamData(f, card.rowLines, card.lead)

  const bind = (unit: number, tex: WebGLTexture) => {
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, tex)
  }
  const pass = (to: Target | null) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, to ? to.fb : null)
    gl.viewport(0, 0, to ? to.w : f.width, to ? to.h : f.height)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  return function draw(t: number, frame: number) {
    const flash = interpolate(t, [FLASH_AT - 0.1, FLASH_AT + 0.15, FLASH_AT + 1.4], [0, 1, 0], clamp)
    gl.disable(gl.BLEND)

    gl.useProgram(sceneProgram.p)
    gl.uniform2f(sceneProgram.u('res'), f.width, f.height)
    gl.uniform1f(sceneProgram.u('t'), t)
    gl.uniform1f(sceneProgram.u('flash'), flash)
    gl.uniform4fv(sceneProgram.u('sA'), streams.a)
    gl.uniform4fv(sceneProgram.u('sB'), streams.b)
    gl.uniform4fv(sceneProgram.u('sC'), streams.c)
    gl.uniform3fv(sceneProgram.u('sD'), streams.d)
    pass(sceneTarget)

    gl.useProgram(down.p)
    gl.uniform1i(down.u('src'), 0)
    let from = sceneTarget
    for (const level of levels) {
      bind(0, from.tex)
      gl.uniform2f(down.u('texel'), 1 / from.w, 1 / from.h)
      gl.uniform2f(down.u('size'), level.w, level.h)
      pass(level)
      from = level
    }
    gl.useProgram(up.p)
    gl.uniform1i(up.u('src'), 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    for (let i = levels.length - 2; i >= 0; i--) {
      const small = levels[i + 1]!
      const large = levels[i]!
      bind(0, small.tex)
      gl.uniform2f(up.u('texel'), 1 / small.w, 1 / small.h)
      gl.uniform2f(up.u('size'), large.w, large.h)
      pass(large)
    }
    gl.disable(gl.BLEND)

    const backed = interpolate(t, [-card.lead + 0.15, 0.4], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) })
    const word = interpolate(t, [0.9, 1.7], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })
    const isCaretOn = t < FLASH_AT || Math.floor(t * 2) % 2 === 0
    gl.useProgram(compositeProgram.p)
    bind(0, sceneTarget.tex)
    bind(1, levels[0]!.tex)
    bind(2, levels[3]!.tex)
    bind(3, text)
    gl.uniform1i(compositeProgram.u('scene'), 0)
    gl.uniform1i(compositeProgram.u('bloom'), 1)
    gl.uniform1i(compositeProgram.u('streakSrc'), 2)
    gl.uniform1i(compositeProgram.u('text'), 3)
    gl.uniform2f(compositeProgram.u('res'), f.width, f.height)
    gl.uniform1f(compositeProgram.u('t'), t)
    gl.uniform1f(compositeProgram.u('frame'), frame)
    gl.uniform1f(compositeProgram.u('backed'), backed)
    gl.uniform1f(
      compositeProgram.u('zoom'),
      1 + 0.045 * Easing.inOut(Easing.quad)(Math.min(1, Math.max(0, t) / card.length)),
    )
    gl.uniform1f(compositeProgram.u('wordA'), word)
    gl.uniform1f(compositeProgram.u('wordShift'), (1 - word) * 30)
    gl.uniform1f(compositeProgram.u('lit'), interpolate(t, [FLASH_AT - 0.1, FLASH_AT + 0.5], [0, 1], clamp))
    gl.uniform1f(compositeProgram.u('flash'), flash)
    gl.uniform4f(compositeProgram.u('caret'), ...caret)
    gl.uniform1f(compositeProgram.u('caretA'), word * (isCaretOn ? 1 : 0.15))
    gl.uniform1f(compositeProgram.u('repoA'), interpolate(t, [2.7, 3.2], [0, 1], clamp))
    pass(null)
    gl.finish()
  }
}

/**
 * The end card. As the picture before it fades, streams of light pull out of its lines of text, flow across the frame
 * and braid together through the word, typed in mono with a block cursor. The repo's address appears under it. The
 * card starts `lead` seconds before its beat, over the beat before it, and its background fades in under the light.
 */
export function EndCard(card: EndCardProps) {
  const { width, height, fps } = useVideoConfig()
  const frame = useCurrentFrame()
  const t = frame / fps - card.lead
  const canvas = useRef<HTMLCanvasElement>(null)
  const isReady = useFonts()
  const draw = useRef<ReturnType<typeof setup>>(undefined)

  useEffect(() => {
    if (!isReady || !canvas.current) return
    draw.current ??= setup(canvas.current, frameOf(width, height, fps), card)
    draw.current(t, frame)
  }, [frame, t, isReady, width, height, fps, card])

  return (
    <AbsoluteFill>
      <canvas ref={canvas} width={width} height={height} />
    </AbsoluteFill>
  )
}
