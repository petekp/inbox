import { useEffect, useRef } from 'react'
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'

import { GEIST_MONO, SANS, useFonts } from './fonts'

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

/** The frame the card draws in, and where its word sits. */
type Frame = { width: number; height: number; fps: number; centerY: number; repoY: number }

const STREAMS = 27
const STRANDS = 3
const FLASH_AT = 2.5
const WORD_SIZE = 220
const wordFont = `600 ${WORD_SIZE}px ${GEIST_MONO}`
const WORD_SPACING = '-6px'
const BLOOM_LEVELS = 6

/** The word's middle sits at 520 px of a 1080 px frame, and the address under it. */
function frameOf(width: number, height: number, fps: number): Frame {
  const centerY = Math.round((height * 520) / 1080)
  return { width, height, fps, centerY, repoY: Math.round(centerY + WORD_SIZE * 0.55 + 90) }
}

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
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
function streamData(f: Frame, rowLines: RowLines, lead: number) {
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

/** The light of every stream, in linear HDR, with the frame's top left at (0, 0) in pixels. */
const scene = (f: Frame) => `#version 300 es
precision highp float;
#define N ${STREAMS}
#define PI 3.14159265
uniform vec2 res;
uniform float t;
uniform float flash;
uniform vec4 sA[N];
uniform vec4 sB[N];
uniform vec4 sC[N];
uniform vec3 sD[N];
out vec4 color;

float ss(float a, float b, float x) {
  float u = clamp((x - a) / (b - a), 0.0, 1.0);
  return u * u * (3.0 - 2.0 * u);
}
float easeInOutQuad(float x) {
  x = clamp(x, 0.0, 1.0);
  return x < 0.5 ? 2.0 * x * x : 1.0 - pow(-2.0 * x + 2.0, 2.0) / 2.0;
}
float easeInOutCubic(float x) {
  x = clamp(x, 0.0, 1.0);
  return x < 0.5 ? 4.0 * x * x * x : 1.0 - pow(-2.0 * x + 2.0, 3.0) / 2.0;
}

/* Where the noise has turned into braid: off the right edge at first, then sweeping left to the word's middle. */
float edgeAt(float t) { return mix(res.x + 700.0, res.x / 2.0, easeInOutCubic((t - 0.5) / 2.0)); }

/* A stream's height at x, how far into the braid it is, and its depth from -1 (back) to 1 (front). */
vec3 path(int i, float x, float t, float edge) {
  vec4 a = sA[i]; vec4 b = sB[i]; vec4 c = sC[i];
  float xs = x + c.w * (t + 0.8) * 70.0;
  float along = (xs - a.w) / a.z;
  float wander = a.x + a.y * sin(PI * ss(0.0, 1.0, along)) + 80.0 * sin(xs * b.x + b.y + t * 1.6);
  // Along its line of text a stream starts flat, so the line itself lights up, and it lets go as it flows.
  float held = (1.0 - ss(150.0, 700.0, abs(x - c.x))) * (1.0 - ss(0.1, 1.0, t - c.z));
  float noise = mix(wander, c.y, held);
  float angle = x * 0.0105 - t * 3.2 + b.z * 2.0 * PI / 3.0;
  float braid = ${f.centerY}.0 + 42.0 * sin(angle) + b.w;
  float k = ss(edge - 380.0, edge + 380.0, x);
  return vec3(mix(noise, braid, k), k, mix(c.w, cos(angle) * 0.6, k));
}

/* Magenta, violet, blue, cyan and a warm amber, with a stream's twist sliding it toward its neighbor. */
vec3 film(float hue, float twist) {
  vec3 stops[5] = vec3[5](vec3(1.0, 0.18, 0.53), vec3(0.48, 0.36, 1.0), vec3(0.18, 0.48, 1.0), vec3(0.0, 0.83, 1.0),
    vec3(1.0, 0.54, 0.24));
  float h = fract(hue + 0.12 * cos(twist)) * 5.0;
  int i = int(floor(h));
  return mix(stops[i], stops[(i + 1) % 5], smoothstep(0.0, 1.0, fract(h)));
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 7.1) + 0.2 * vnoise(p * 4.1 + 3.3); }

vec3 light(vec2 p, float t) {
  float edge = edgeAt(t);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < N; i++) {
    vec4 c = sC[i]; vec3 d = sD[i];
    // A stream grows slowly out of its row at first, so the rows read as turning into light.
    float age = t - c.z;
    float reach = (res.x + 400.0) * easeInOutQuad(age / 2.0) + 240.0 * ss(0.0, 0.4, age);
    float fade = ss(0.0, clamp(reach * 0.5, 1.0, 220.0), reach - abs(p.x - c.x));
    if (fade <= 0.0) continue;
    vec3 q = path(i, p.x, t, edge);
    float slope = (path(i, p.x + 1.0, t, edge).x - q.x);
    float norm = inversesqrt(1.0 + slope * slope);
    float k = q.y;
    // A stream leaves its row in focus, on the rows' plane, and drifts to its own depth.
    float depth = q.z * ss(0.0, 1.3, age);
    // Out-of-focus streams spread their light wider and dimmer. In the braid every strand comes into focus.
    float blur = 0.7 + mix(30.0 * pow(abs(depth), 2.2), 1.2 * (1.0 - depth), k);
    float near = mix(depth < 0.0 ? 0.35 + 0.65 * (1.0 + depth) : 1.0, 0.6 + 0.4 * (depth + 1.0) / 2.0, k);
    float twist = p.x * d.y + t * 1.1 + sB[i].y * 3.0;
    // Light runs along the braid in waves, and swells when the braid reaches the word.
    float wave = 1.0 + k * (0.9 * pow(0.5 + 0.5 * sin(p.x * 0.011 - t * 9.0 + sB[i].y), 10.0) + 1.1 * flash);
    float ignite = 1.0 + 4.0 * exp(-max(age, 0.0) * 2.0) * (1.0 - ss(0.0, 500.0, abs(p.x - c.x)));
    float energy = d.z * fade * near * wave * ignite * mix(0.7, 1.0, k);
    float dy = p.y - q.x;
    vec3 tint = film(d.x, twist * 0.3);
    // Each stream is three threads that spread and close as it twists.
    float spread = 4.0 + 3.0 * sin(twist);
    for (int s = -1; s <= 1; s++) {
      // Each color channel sits a little apart, as light through a prism does.
      vec3 dist = abs(dy - float(s) * spread - vec3(1.4, 0.0, -1.4) * (1.0 + abs(slope))) * norm;
      float w = 0.55 + blur;
      vec3 core = exp(-(dist * dist) / (w * w)) * (0.9 / w);
      vec3 halo = 0.05 / (1.0 + (dist * dist) / ((4.0 + blur) * (4.0 + blur)));
      sum += (tint * 0.8 + 0.35) * energy * (core * 1.6 + halo);
    }
  }
  return sum;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  // A 180 degree shutter: three moments across half a frame.
  vec3 sum = vec3(0.0);
  for (int j = 0; j < 3; j++) sum += light(p, t - float(j) * (0.5 / ${f.fps}.0) / 2.0);
  sum /= 3.0;
  // A faint haze around the braid, lit by it.
  float formed = ss(0.7, 2.5, t);
  float haze = fbm(p * 0.0022 + vec2(t * 0.05, -t * 0.02)) * exp(-pow((p.y - ${f.centerY}.0) / 300.0, 2.0));
  sum += vec3(0.32, 0.22, 0.6) * haze * 0.22 * formed * (1.0 + flash);
  color = vec4(sum, 1.0);
}`

/** One step down a 13-tap downsample, as in Jimenez's bloom for Call of Duty: Advanced Warfare. */
const DOWN = `#version 300 es
precision highp float;
uniform sampler2D src;
uniform vec2 texel;
uniform vec2 size;
out vec4 color;
void main() {
  vec2 uv = gl_FragCoord.xy / size;
  vec3 a = texture(src, uv + texel * vec2(-2, 2)).rgb;
  vec3 b = texture(src, uv + texel * vec2(0, 2)).rgb;
  vec3 c = texture(src, uv + texel * vec2(2, 2)).rgb;
  vec3 d = texture(src, uv + texel * vec2(-2, 0)).rgb;
  vec3 e = texture(src, uv).rgb;
  vec3 f = texture(src, uv + texel * vec2(2, 0)).rgb;
  vec3 g = texture(src, uv + texel * vec2(-2, -2)).rgb;
  vec3 h = texture(src, uv + texel * vec2(0, -2)).rgb;
  vec3 i = texture(src, uv + texel * vec2(2, -2)).rgb;
  vec3 j = texture(src, uv + texel * vec2(-1, 1)).rgb;
  vec3 k = texture(src, uv + texel * vec2(1, 1)).rgb;
  vec3 l = texture(src, uv + texel * vec2(-1, -1)).rgb;
  vec3 m = texture(src, uv + texel * vec2(1, -1)).rgb;
  vec3 sum = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  color = vec4(sum, 1.0);
}`

/** One step back up: a 3x3 tent filter, added onto the larger level below. */
const UP = `#version 300 es
precision highp float;
uniform sampler2D src;
uniform vec2 texel;
uniform vec2 size;
out vec4 color;
void main() {
  vec2 uv = gl_FragCoord.xy / size;
  vec3 s = texture(src, uv + texel * vec2(-1, 1)).rgb + 2.0 * texture(src, uv + texel * vec2(0, 1)).rgb
    + texture(src, uv + texel * vec2(1, 1)).rgb + 2.0 * texture(src, uv + texel * vec2(-1, 0)).rgb
    + 4.0 * texture(src, uv).rgb + 2.0 * texture(src, uv + texel * vec2(1, 0)).rgb
    + texture(src, uv + texel * vec2(-1, -1)).rgb + 2.0 * texture(src, uv + texel * vec2(0, -1)).rgb
    + texture(src, uv + texel * vec2(1, -1)).rgb;
  color = vec4(s / 16.0, 1.0);
}`

/**
 * The frame: the light with its bloom and a horizontal lens streak, a slight color fringe toward the edges, tone mapped,
 * then the word, its cursor and the repo's address, grain and a vignette. Over beat 11, the background is transparent
 * and the light adds onto the footage.
 */
const composite = (f: Frame) => `#version 300 es
precision highp float;
uniform vec2 res;
uniform sampler2D scene;
uniform sampler2D bloom;
uniform sampler2D streakSrc;
uniform sampler2D text;
uniform float t;
uniform float frame;
uniform float backed;
uniform float zoom;
uniform float wordA;
uniform float wordShift;
uniform float lit;
uniform float flash;
uniform vec4 caret;
uniform float caretA;
uniform float repoA;
out vec4 color;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 hdrAt(vec2 uv) {
  vec2 off = (uv - 0.5) * dot(uv - 0.5, uv - 0.5) * 0.012;
  vec3 s = vec3(texture(scene, uv + off).r, texture(scene, uv).g, texture(scene, uv - off).b);
  return s + texture(bloom, uv).rgb * 0.16;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  vec2 center = vec2(res.x / 2.0, ${f.centerY}.0);
  vec2 q = center + (p - center) / zoom;
  vec2 uv = vec2(q.x, res.y - q.y) / res;
  vec2 tuv = vec2(q.x, res.y - q.y + wordShift) / res;
  vec4 tx = texture(text, tuv);
  float word = tx.r * wordA;
  float wordSoft = tx.g * wordA;

  vec3 hdr = hdrAt(uv);
  // The lens streak: the light at a coarse level, spread far to each side.
  vec3 streak = vec3(0.0);
  for (int i = -12; i <= 12; i++) {
    float w = exp(-abs(float(i)) / 4.0);
    streak += texture(streakSrc, uv + vec2(float(i) * 0.028, 0.0)).rgb * w;
  }
  hdr += streak * vec3(0.45, 0.6, 1.0) * (0.02 + 0.07 * flash);

  // The light dims around each letter, and the braid dims behind the whole word, so the word reads.
  hdr *= 1.0 - 0.92 * wordSoft * (1.0 - word);
  vec2 wq = (q - vec2(res.x / 2.0, ${f.centerY}.0 - wordShift)) / vec2(560.0, 130.0);
  hdr *= 1.0 - 0.6 * wordA * exp(-dot(wq, wq));
  // The light dims behind the repo's address, so it reads.
  vec2 r = (q - vec2(res.x / 2.0, ${f.repoY}.0)) / vec2(380.0, 46.0);
  hdr *= 1.0 - 0.85 * repoA * exp(-dot(r, r));
  // The word gives off light once the braid lights it.
  hdr += vec3(0.7, 0.66, 1.0) * wordSoft * lit * 0.25;

  vec3 col = aces(hdr * 1.15);
  // The light behind each letter spills over its edges.
  float inner = clamp(word - tx.g * wordA * 0.85, 0.0, 1.0);
  vec3 wrapped = mix(vec3(1.0), 0.55 + aces(hdr * 2.5) * 0.9, inner);
  col = mix(col, wrapped, word);

  // The cursor, a block after the word.
  vec2 cq = vec2(q.x, q.y - wordShift);
  float inCaret = step(caret.x, cq.x) * step(cq.x, caret.x + caret.z) * step(caret.y, cq.y) * step(cq.y, caret.y + caret.w);
  col = mix(col, vec3(1.0), inCaret * caretA);

  float repo = texture(text, uv).b * repoA;
  col = mix(col, vec3(0.82, 0.82, 0.86), repo);

  float v = smoothstep(res.y * 0.45, res.x * 0.75, length(p - res / 2.0));
  col *= 1.0 - 0.55 * v * backed;
  col += (hash(p + frame * 17.0) - 0.5) * 0.035 * backed;

  color = vec4(col + vec3(0.016, 0.016, 0.02) * backed, backed);
}`

type Gl = WebGL2RenderingContext
type Target = { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }

function compile(gl: Gl, frag: string) {
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

function target(gl: Gl, w: number, h: number): Target {
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
function textCanvas(f: Frame, word: string, repo: string) {
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
