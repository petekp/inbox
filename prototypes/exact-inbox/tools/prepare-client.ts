import { ENTER_FADE_MS, FADE_MS, SLIDE_PX } from '../../../core/view/row-motion'
import { HEIGHT_SPRING } from '../../../core/view/springs'
import { resolve } from 'node:path'

export async function prepareClient(): Promise<void> {
  const frequency = (2 * Math.PI) / (HEIGHT_SPRING.response / 1000)
  const spring = `-exact-spring(${frequency * frequency}, ${2 * HEIGHT_SPRING.damping * frequency}, 1)`
  const motion = `keyframes inboxEnter\n  from opacity=0 translate="0px -${SLIDE_PX}px"\n  to opacity=1 translate="0px 0px"\n\nkeyframes inboxLeave\n  to opacity=0\n\nfn rowLayout(still: bool): string = still ? "none" : "${spring}"\nfn rowFade(still: bool): string = still ? "none" : "opacity ${FADE_MS}ms ease-out, translate ${FADE_MS}ms ease-out"\nfn rowEntry(still: bool, arriving: bool): string = still or not arriving ? "none" : "inboxEnter ${ENTER_FADE_MS}ms ease-out both"\nfn rowExit(still: bool): string = still ? "none" : "inboxLeave ${FADE_MS}ms ease-out both"\nfn rowSlide(hidden: bool): string = hidden ? "0px -${SLIDE_PX}px" : "0px 0px"\n`
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
