import type { PaneBase, PaneHandlers } from './pane-context'
import { moveTimelineSelection, timelinePage, toggleTimelineBranch } from './timeline-page'

type TimelinePaneBase = Pick<
  PaneBase,
  'Box' | 'Button' | 'Text' | 'pal' | 'view' | 'now' | 'timelineSelection' | 'timelineFolded'
>
type TimelinePaneHandlers = Pick<PaneHandlers, 'runPress' | 'selectTimelineRow' | 'updateTimelineFolded'>

export function paneTimeline(context: TimelinePaneBase, handlers: TimelinePaneHandlers) {
  const { Box, Button, Text, pal, view, timelineSelection, timelineFolded } = context
  const { selectTimelineRow, updateTimelineFolded, runPress } = handlers
  const page = timelinePage(view.timeline, timelineSelection, timelineFolded, view.lastActions)
  const tones = {
    done: pal.tone.done ?? pal.muted,
    stalled: pal.tone.issue ?? pal.muted,
    working: pal.tone.needsYou ?? pal.muted,
  }
  const tone = (status: string) => tones[status as keyof typeof tones] ?? pal.muted
  const marks: Record<string, string> = { done: '✓', stalled: '!', working: '●', 'waits-on-other': '◌' }
  const bar = (parts: (typeof page.bars)[number]['parts']) =>
    parts.map(part => <Text color={tone(part.state)}>{part.mark.repeat(part.count)}</Text>)

  const timelineView = (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text color={pal.muted}>Task plan · {page.summary}</Text>
        {page.bars[0]?.parts.length ? <Text color={pal.muted}> · </Text> : null}
        {page.bars[0]?.parts.length ? bar(page.bars[0].parts) : null}
      </Box>
      {page.isEmpty ? (
        <Box flexDirection="column">
          <Text bold>{page.empty.title}</Text>
          <Text color={pal.muted}>{page.empty.hint}</Text>
        </Box>
      ) : null}
      {page.bars.slice(1).map(item => (
        <Box key={`bar-${item.id}`} flexDirection="row">
          <Text color={pal.muted}>{item.label}: </Text>
          {bar(item.parts)}
        </Box>
      ))}
      {page.rows.map(row => {
        const selected = row.task.id === page.selected?.row.task.id
        const selection = selected ? page.selected : null
        const selectAction = row.actions.find(action => action.action === 'select')
        const detail = row.detailLead
        return (
          <Box key={`timeline-${row.task.id}`} flexDirection="column">
            <Box flexDirection="row">
              <Text color={tone(row.status)}>
                {selected ? '> ' : '  '}
                {row.prefix}
                {marks[row.status] ?? '·'}{' '}
              </Text>
              {selectAction ? (
                <Button
                  plain
                  key={`timeline-select-${row.task.id}`}
                  label={row.task.title}
                  onPress={() => void selectTimelineRow(selectAction.id)}
                />
              ) : (
                <Text>{row.task.title}</Text>
              )}
              <Text color={pal.muted}>
                {' · '}
                {row.statusLabel} · {row.measure}
              </Text>
            </Box>
            {row.warnings.map(warning => (
              <Text color={pal.tone.issue ?? pal.muted}>
                {detail}⚠ {warning}
              </Text>
            ))}
            {selection?.details.map(line =>
              line.label === 'Links' ? (
                <Box flexDirection="row">
                  <Text color={pal.muted}>{detail}Links · </Text>
                  {line.actions.map(link => (
                    <Box key={`${link.label}-${row.task.id}`} flexDirection="row">
                      <Button
                        label={link.result?.state === 'pending' ? 'Opening…' : link.label}
                        dimColor={link.isOut}
                        onPress={press => void runPress(link.press, press.surface)}
                      />
                      {link.result?.state === 'done' ? <Text color={pal.tone.done}>✓ Opened</Text> : null}
                      {link.result?.state === 'failed' ? (
                        <Text color={pal.tone.issue ?? pal.muted}>
                          {link.result.parts.find(part => part.error)?.error}
                        </Text>
                      ) : null}
                    </Box>
                  ))}
                </Box>
              ) : (
                <Text color={pal.muted}>
                  {detail}
                  {line.label} · {line.text}
                </Text>
              ),
            )}
          </Box>
        )
      })}
    </Box>
  )
  const footer = page.selected?.row.actions.length ? (
    <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
      {page.selected.row.actions.map(action => (
        <Button
          key={action.action}
          label={action.label}
          hotkey={action.hotkey === 'enter' ? undefined : action.hotkey}
          plain
          onPress={() =>
            action.action === 'select'
              ? void selectTimelineRow(action.id)
              : void updateTimelineFolded(folded => toggleTimelineBranch(folded, action.id))
          }
        />
      ))}
    </Box>
  ) : null

  return {
    view: timelineView,
    footer,
    move(step: number) {
      const id = moveTimelineSelection(page.rows, timelineSelection, step)
      if (id) void selectTimelineRow(id)
    },
  }
}
