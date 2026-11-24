import { Icon } from './row-actions'
import { STATUS_TEXT_LINES } from '../../core/view/status-page'
import { textLevelOf } from '../../core/view/status-page-parts'
import { milestoneKeyPlan } from '../../core/view/status-keys'
import type { MilestoneRow } from '../../core/view/status-goal-page'
import { isOneLineMilestone } from '../../core/view/status-gaps'
import { tabState } from './tab-state'
import { clickFold, foldMotion, toggleStatusFold } from './tab-fold-all'
import { milestoneNameClass, NameLine, WasLine } from './tab-status-name'
import { chevronOf, ParentName } from './tab-status-fold'
import { markClassOf, MarkGlyph, pulseInStep } from './tab-parts'
import { SUBJECTS_ATTRIBUTE } from './tab-shown'
import { connectorClass, lineMotion, type ConnectorMotion } from './tab-line-steps'
import { fitMergedLine, Keys } from './tab-status-line'

/** A milestone's line. A subject drawn in its place adds what a subject's row draws. */
export function MilestoneLine({
  m,
  motion,
  connector,
}: {
  m: MilestoneRow
  motion: string
  connector: { motion: ConnectorMotion } | null
}) {
  const fold = m.foldId
  const x = m.subject
  const isRunning = x?.isRunning ?? false
  const merged = x?.merged ?? null
  const classes = [
    'row milestone',
    isOneLineMilestone(m) ? '' : 'long',
    connector === null ? '' : 'connector-down',
    connectorClass(connector?.motion ?? null),
  ]
  const nameClass = milestoneNameClass(m)

  return (
    <div
      class={classes.filter(Boolean).join(' ')}
      {...(x ? { [SUBJECTS_ATTRIBUTE]: x.id } : {})}
      {...lineMotion(motion)}
    >
      <span class={markClassOf(m.tone, isRunning)} ref={isRunning ? pulseInStep : undefined}>
        <MarkGlyph text={m.mark} />
      </span>
      <div class="content tight">
        {fold === null ? (
          <div class="milestone-name">
            <ParentName id={m.id} foldCount={m.foldCount} class={nameClass}>
              <NameLine name={m.name} stall={x?.stall ?? null} chevron={chevronOf(m)} />
            </ParentName>
          </div>
        ) : (
          <button
            type="button"
            class="fold milestone-fold name-fold"
            data-fold={foldMotion(fold)}
            onClick={e => clickFold(e, tabState.ui.statusUnfolded.includes(fold), () => toggleStatusFold(fold))}
          >
            <span class="faint">{m.name}</span>
            <Icon name={tabState.ui.statusUnfolded.includes(fold) ? 'down' : 'right'} />
          </button>
        )}
        {x?.waitsOn ? (
          <div class="tone-needsYou clamp" style={{ '--lines': STATUS_TEXT_LINES }}>
            {x.waitsOn}
          </div>
        ) : null}
        {m.text ? (
          <div class={`${textLevelOf(m)} clamp`} style={{ '--lines': STATUS_TEXT_LINES }}>
            {m.text}
          </div>
        ) : null}
        {merged ? (
          <div
            class="outcome muted clamp"
            style={{ '--lines': STATUS_TEXT_LINES }}
            ref={el => fitMergedLine(el, merged)}
          />
        ) : null}
        {m.was ? <WasLine was={m.was} /> : null}
        {fold === null ? <Keys keys={milestoneKeyPlan(m)} /> : null}
      </div>
    </div>
  )
}
