import { ENTER_FADE_MS, LEAVE_FADE_MS, SLIDE_PX } from '../../../core/view/row-motion'
import { HEIGHT_SPRING } from '../../../core/view/springs'
import {
  DARK_TONES,
  fadedOver,
  faintOver,
  LIGHT_TONES,
  MUTED_TEXT,
  supportingOver,
  THEME_BACKGROUND,
  THEME_TEXT,
} from '../../../core/view/tones'
import { resolve } from 'node:path'

const lightDark = (light: string, dark: string) => `light-dark(${light}, ${dark})`

function buildForma(): string {
  const lightBg = '#ffffff'
  const darkBg = THEME_BACKGROUND.dark
  const lightInk = '#1f1f1f'
  const darkInk = THEME_TEXT.dark
  const lightMuted = MUTED_TEXT.light
  const darkMuted = MUTED_TEXT.dark
  const mix = (lShare: number, dShare: number, lUnder = lightBg, dUnder = darkBg) =>
    lightDark(fadedOver(lightInk, lUnder, lShare), fadedOver(darkInk, dUnder, dShare))
  const lightSelected = fadedOver(lightInk, lightBg, 0.06)
  const darkSelected = fadedOver(darkInk, darkBg, 0.08)

  const toneTokens = (
    [
      'needsYou',
      'issue',
      'findings',
      'tasks',
      'prs',
      'done',
      'success',
      'opportunity',
      'working',
      'error',
      'errorMark',
      'key',
    ] as const
  ).map(name => `  tone.${name} = ${lightDark(LIGHT_TONES[name], DARK_TONES[name])}`)

  const bannerTokens = (
    [
      ['error', LIGHT_TONES.error, DARK_TONES.error],
      ['warning', LIGHT_TONES.needsYou, DARK_TONES.needsYou],
      ['notice', LIGHT_TONES.key, DARK_TONES.key],
      ['ask', LIGHT_TONES.key, DARK_TONES.key],
    ] as const
  ).flatMap(([name, lightTone, darkTone]) => [
    `  banner.${name}.fill = ${lightDark(fadedOver(lightTone, lightBg, 0.09), fadedOver(darkTone, darkBg, 0.09))}`,
    `  banner.${name}.line = ${lightDark(fadedOver(lightTone, lightBg, 0.3), fadedOver(darkTone, darkBg, 0.3))}`,
  ])

  return [
    'forma brand',
    '',
    'theme',
    `  surface.bg = ${lightDark(lightBg, darkBg)}`,
    `  surface.rail = ${lightDark('#f7f7f8', '#1c1c1e')}`,
    `  surface.raised = ${mix(0.09, 0.11)}`,
    `  surface.selected = ${lightDark(lightSelected, darkSelected)}`,
    `  surface.soft = ${mix(0.08, 0.12)}`,
    `  surface.hover = ${mix(0.04, 0.06)}`,
    `  border.key = ${mix(0.28, 0.28)}`,
    `  border.input = ${mix(0.15, 0.15)}`,
    `  tree.row = ${mix(0.32, 0.32, lightSelected, darkSelected)}`,
    `  tree.status = ${mix(0.2, 0.2)}`,
    `  ink.primary = ${lightDark(lightInk, darkInk)}`,
    `  ink.supporting = ${lightDark(supportingOver(lightMuted, lightInk), supportingOver(darkMuted, darkInk))}`,
    `  ink.muted = ${lightDark(lightMuted, darkMuted)}`,
    `  ink.faint = ${lightDark(faintOver(lightMuted, lightBg), faintOver(darkMuted, darkBg))}`,
    `  ink.age = ${lightDark(fadedOver(lightMuted, lightBg, 0.9), fadedOver(darkMuted, darkBg, 0.85))}`,
    `  ink.on-primary = ${lightDark(lightBg, darkBg)}`,
    ...toneTokens,
    ...bannerTokens,
    '',
  ].join('\n')
}

export async function prepareClient(): Promise<void> {
  const layout = `${HEIGHT_SPRING.response}ms cubic-bezier(0.22, 1, 0.36, 1)`
  const motion = [
    'keyframes inboxEnter',
    `  from opacity=0 translate="0px -${SLIDE_PX}px"`,
    '  to opacity=1 translate="0px 0px"',
    '',
    'keyframes inboxLeave',
    '  to opacity=0',
    '',
    'keyframes runningPulse',
    '  50% opacity=0.3',
    '',
    `fn rowLayout(still: bool): string = still ? "none" : "${layout}"`,
    `fn rowPanelFade(still: bool): string = still ? "none" : "opacity ${ENTER_FADE_MS}ms ease-out"`,
    `fn rowBgFade(still: bool): string = still ? "none" : "background-color ${LEAVE_FADE_MS}ms ease-out"`,
    `fn rowEntry(still: bool, arriving: bool): string = still or not arriving ? "none" : "inboxEnter ${ENTER_FADE_MS}ms ease-out both"`,
    `fn rowExit(still: bool): string = still ? "none" : "inboxLeave ${LEAVE_FADE_MS}ms ease-out both"`,
    `fn rowSlide(hidden: bool): string = hidden ? "0px -${SLIDE_PX}px" : "0px 0px"`,
    'fn markPulse(still: bool, running: bool): string = still or not running ? "none" : "runningPulse 1800ms ease-in-out infinite"',
    '',
  ].join('\n')
  const formaPath = resolve(import.meta.dir, '../app.forma')
  const forma = buildForma()
  if (
    (await Bun.file(formaPath)
      .text()
      .catch(() => null)) !== forma
  )
    await Bun.write(formaPath, forma)
  const motionPath = resolve(import.meta.dir, '../motion.contract')
  if (
    (await Bun.file(motionPath)
      .text()
      .catch(() => null)) !== motion
  )
    await Bun.write(motionPath, motion)
  const built = await Bun.build({
    entrypoints: [resolve(import.meta.dir, 'client-rules.ts')],
    target: 'browser',
    format: 'esm',
  })
  if (!built.success || built.outputs.length !== 1)
    throw new Error(`Client rules could not be built: ${built.logs.join('\n')}`)
  const path = resolve(import.meta.dir, '../client-shared.js')
  const text = await built.outputs[0]!.text()
  const previous = await Bun.file(path)
    .text()
    .catch(() => null)
  if (previous !== text) await Bun.write(path, text)
}

if (import.meta.main) await prepareClient()
