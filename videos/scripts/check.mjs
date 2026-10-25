// Checks each video's timeline and, with --render, a rendered cut.
//
//   node scripts/check.mjs [video]          the caption report, notes and missing stills of every cut, or one video's
//   node scripts/check.mjs --render <cut>   also renders the cut to out/<cut>.mp4, checks its size, rate and frame
//                                           count with ffprobe, and writes stills at the cut's marks, and a contact
//                                           sheet, to out/<cut>/
//
// Exits 1 when a caption breaks a rule or a render check fails.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'out')
/** Caption rules from docs/plans/launch-video.md: on screen at least 2 s, read at no more than 20 characters a second. */
const CAPTION_MIN_S = 2
const CAPTION_MAX_CPS = 20

let failed = false
const fail = message => {
  failed = true
  console.log(`  x ${message}`)
}

// The timelines import the mod's TypeScript without file extensions, so Node can't load them directly. record/drive.py
// reads the same bundle.
mkdirSync(OUT, { recursive: true })
const bundled = join(OUT, 'videos.mjs')
await build({
  entryPoints: [join(ROOT, 'src/videos.ts')],
  bundle: true,
  format: 'esm',
  outfile: bundled,
  logLevel: 'error',
})
const { VIDEOS } = await import(pathToFileURL(bundled).href)
const cuts = VIDEOS.flatMap(video => video.cuts.map(cut => ({ ...cut, video: video.id })))

const args = process.argv.slice(2)
const renderIndex = args.indexOf('--render')
const toRender = renderIndex === -1 ? undefined : cuts.find(c => c.id === args[renderIndex + 1])
if (renderIndex !== -1 && !toRender) {
  console.log(`--render takes one of: ${cuts.map(c => c.id).join(', ')}`)
  process.exit(1)
}
const onlyVideo = renderIndex === -1 ? args[0] : toRender.video
if (onlyVideo && !VIDEOS.some(v => v.id === onlyVideo)) {
  console.log(`No video ${onlyVideo}. The videos are: ${VIDEOS.map(v => v.id).join(', ')}`)
  process.exit(1)
}

for (const cut of cuts.filter(c => !onlyVideo || c.video === onlyVideo)) {
  console.log(`\n${cut.id}: ${(cut.frames / cut.fps).toFixed(2)} s, ${cut.frames} frames, ${cut.width}x${cut.height}`)
  checkCaptions(cut.captions)
  for (const note of cut.notes) console.log(`  - ${note}`)
  reportMissingStills(cut.stills)
}

if (toRender) checkRender(toRender)

process.exit(failed ? 1 : 0)

function checkCaptions(captions) {
  let previousEnd = 0
  for (const c of captions) {
    const seconds = c.to - c.from
    const cps = c.text.length / seconds
    const line = `${c.label}: ${seconds.toFixed(2)} s, ${cps.toFixed(1)} chars/s, "${c.text}"`
    if (seconds < CAPTION_MIN_S) fail(`${line}: shorter than ${CAPTION_MIN_S} s`)
    else if (cps > CAPTION_MAX_CPS) fail(`${line}: faster than ${CAPTION_MAX_CPS} chars/s`)
    else if (c.from < previousEnd) fail(`${line}: overlaps the caption before it`)
    else console.log(`  ok ${line}`)
    previousEnd = c.to
  }
}

/** Stills are captured into public/, which Git ignores. A state whose still is missing draws its placeholder. */
function reportMissingStills(stills) {
  const missing = stills.filter(still => !existsSync(join(ROOT, 'public', still)))
  if (missing.length > 0)
    console.log(`  - ${missing.length} stills missing, drawn as placeholders: ${missing.join(', ')}`)
}

/** Runs a command with its output in a log file, and reports its own exit status. */
function run(command, commandArgs, log) {
  const result = spawnSync(command, commandArgs, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 })
  writeFileSync(log, `${result.stdout ?? ''}${result.stderr ?? ''}`)
  return result
}

function checkRender(cut) {
  const video = join(OUT, `${cut.id}.mp4`)
  const dir = join(OUT, cut.id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })

  console.log(`\nRendering ${cut.id}`)
  const render = run('npx', ['remotion', 'render', 'src/index.ts', cut.id, video], join(dir, 'render.log'))
  if (render.status !== 0) {
    fail(`remotion render exited ${render.status}. See ${join(dir, 'render.log')}`)
    return
  }

  const probe = run(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-count_frames',
      '-show_entries',
      'stream=width,height,r_frame_rate,nb_read_frames',
      '-of',
      'json',
      video,
    ],
    join(dir, 'ffprobe.json'),
  )
  const stream = probe.status === 0 ? JSON.parse(probe.stdout).streams?.[0] : undefined
  const expected = {
    width: cut.width,
    height: cut.height,
    r_frame_rate: `${cut.fps}/1`,
    nb_read_frames: String(cut.frames),
  }
  for (const [key, value] of Object.entries(expected))
    if (String(stream?.[key]) === String(value)) console.log(`  ok ${key} ${value}`)
    else fail(`${key} is ${stream?.[key]}, expected ${value}`)

  const marks = new Map()
  // Rounded up, so a still lands on or after the frame where its moment starts.
  for (const { at, name } of cut.marks) {
    const frame = Math.min(Math.ceil(at * cut.fps - 1e-6), cut.frames - 1)
    if (!marks.has(frame)) marks.set(frame, name)
  }

  const ordered = [...marks.entries()].sort((a, b) => a[0] - b[0])
  const select = ordered.map(([frame]) => `eq(n\\,${frame})`).join('+')
  const stills = run(
    'ffmpeg',
    ['-v', 'error', '-i', video, '-vf', `select='${select}'`, '-fps_mode', 'passthrough', join(dir, 'still-%03d.png')],
    join(dir, 'stills.log'),
  )
  if (stills.status !== 0) fail(`ffmpeg stills exited ${stills.status}`)
  else {
    const written = readdirSync(dir)
      .filter(f => f.startsWith('still-'))
      .sort()
    written.forEach((file, i) => {
      const [frame, name] = ordered[i]
      renameSync(join(dir, file), join(dir, `${String(frame).padStart(5, '0')}-${name.replace(/[^\w-]/g, '_')}.png`))
    })
    if (written.length === ordered.length) console.log(`  ok ${written.length} stills`)
    else fail(`${written.length} stills written, expected ${ordered.length}`)
  }

  const sheet = run(
    'ffmpeg',
    ['-v', 'error', '-i', video, '-vf', 'fps=1,scale=192:-1,tile=10x8', '-frames:v', '1', join(dir, 'contact.png')],
    join(dir, 'contact.log'),
  )
  if (sheet.status === 0) console.log(`  ok contact sheet, one frame a second`)
  else fail(`ffmpeg contact sheet exited ${sheet.status}`)
}
