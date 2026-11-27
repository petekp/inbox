import type { RowTrack } from '../../core/view/row-motion'
import type { Block, RowBlock } from './blocks'
import type { Glide } from './block-glide'
import type { FieldWait } from './field-wait'
import type { FormSwap } from './form-swap'
import type { BlockSwap } from './block-swap'
import type { CountLeft } from './heading-count'
import type { PanelSpace, PanelStep } from './panel-steps'
import type { PrLine, PrTail } from './pr-status'
import type { TitleGlide } from './title-motion'
import type { UnderLine } from './under-line'

/**
 * A block's track, the block as last drawn, the open form a row last drew while it keeps its panel, and the box glide
 * its last enter or leave set, which runs on until `endsAt` even if the block's state moves on. `title` is the glide of
 * a row's title between its one-line and wrapped forms. `springId` names the boxes of a block that moved to another
 * place, which are new so that they start from no height, and is null for a block that never moved. `isInputMove` says
 * the block's move started in a draw that followed the person's input. `under` is the status under a row's buttons as
 * it comes and goes, `status` a PR block's status line, `prTail` the lines under it, and `warning` the stopped warning.
 * `panelSpace` is the spring of the row's panel space, and `panelSteps` the steps an opening row's panel fades in, each
 * with its start, when the open turned a close back, or the steps a closing row's panel fades out in when the close
 * started while that panel was still faint (`faintCloseFades`), or the steps a press set, which `isPanelPressed` marks
 * (`panelPressOf`). `panelHeldUntil` is when a closing row's panel has faded out, so its box lets go of the panel's
 * height. `restSpace` is the spring of the part of a row's box under its title. `fieldWait` is a row's reply field as
 * its press brings it in, `blockSwap` the block's change of form, and `countLeft` a group heading's count that went.
 */
export type Tracked = {
  track: RowTrack
  block: Block
  opened: RowBlock | null
  glide: Glide | null
  title: TitleGlide | null
  springId: string | null
  isInputMove: boolean
  under: UnderLine | null
  status: UnderLine<PrLine> | null
  prTail: PrTail | null
  warning: UnderLine<string> | null
  panelSpace: PanelSpace | null
  panelSteps: PanelStep[] | null
  isPanelPressed: boolean
  panelHeldUntil: number
  swap: FormSwap | null
  restSpace: PanelSpace | null
  fieldWait: FieldWait | null
  blockSwap: BlockSwap | null
  countLeft: CountLeft | null
}

/**
 * Each block's track and the block as last drawn, the ids of every block the last draw showed, in order, until when
 * a block that leaves holds its space while its content fades, so nothing grows until that space starts to close,
 * and when the last draw was.
 */
export type Tracks = {
  rows: ReadonlyMap<string, Tracked>
  order: readonly string[]
  holdsUntil: number
  drawnAt: number
}
export const NO_TRACKS: Tracks = { rows: new Map(), order: [], holdsUntil: 0, drawnAt: 0 }
