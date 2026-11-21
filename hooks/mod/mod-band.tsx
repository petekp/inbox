import type { Elements, RenderElement, RenderInput, RenderSurface } from 'claude-code'

import { bandCounts, isMaybeStale, noCountsText } from '../../core/view/band'
import { isResumable, stopFix, stopText } from '../../core/view/banners'
import { isBlankLedger } from '../../core/domain/ledger'
import { setDemo } from './mod-demo'
import { drawnState } from './mod-drawn'
import { openInbox } from './mod-pane-open'
import type { Mod } from './mod-ports'
import { sessionState } from './mod-state'
import { resume } from './mod-turns'
import { lookOf, paletteFor } from '../pane/palettes'
import { DOT, resumeLabel } from '../../core/view/rows'
import { ago } from '../../core/domain/text'

/**
 * Draws the band above the prompt: the inbox's counts with Open inbox, and the stop row with Resume when the session
 * stopped. `theirsOf` draws what the mods after this one put there.
 */
export async function band(
  m: Mod,
  e: RenderInput<'AbovePrompt'>,
  elements: Elements[RenderSurface],
  theirsOf: () => Promise<RenderElement>,
) {
  const { Box, Button, Text } = elements
  const [{ ledger, stop, view, isDemo, showsDemoNotices, isUnread, now }, theme] = await Promise.all([
    drawnState(m),
    m.atoms.theme.read(),
  ])
  if (!stop && isBlankLedger(ledger) && !isMaybeStale(view, isUnread)) return theirsOf()
  // Every mod shares the band, and a tree without the drawing from next(e)
  // hides what the mods after this one draw there.
  const theirs = await theirsOf()
  const pal = paletteFor(theme, lookOf(e.surface))
  const counts = bandCounts(view).map(c => (
    <Text>
      <Text>{c.label} </Text>
      <Text color={pal.tone[c.id] ?? pal.mark[c.id]}>{c.count}</Text>
    </Text>
  ))

  // On desktop a native button is taller than
  // a line of text, so the text sits level with its top.
  const countLine = (
    <Box flexDirection="row" alignItems="flex-start" gap={1}>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="truncate-end">
          {showsDemoNotices ? <Text dimColor>Demo: </Text> : null}
          {counts.length > 0 ? (
            counts.flatMap((p, n) => (n === 0 ? [p] : [<Text dimColor>{DOT}</Text>, p]))
          ) : (
            <Text dimColor>{noCountsText(view, isUnread)}</Text>
          )}
        </Text>
      </Box>
      {showsDemoNotices ? <Button key="hide-demo" label="Hide demo" onPress={() => void setDemo(m, false)} /> : null}
      <Button key="open-inbox" label="Open inbox" onPress={() => void openInbox(m, isDemo)} />
    </Box>
  )
  if (!stop)
    return (
      <Box flexDirection="column">
        {countLine}
        {theirs}
      </Box>
    )

  // An API error resumes from
  // [Resume], which keeps its key while it sends, so the desktop app keeps the band's focus.
  const canResume = isResumable(stop)
  const notSent = canResume && sessionState.resuming?.is === 'refused' ? `Not sent: ${sessionState.resuming.why}` : ''
  const isNotSentOwnRow = notSent !== '' && e.surface === 'desktop' && e.props.maxRows > 2
  const fix = canResume ? '' : stopFix(stop)
  const inlineNotSent = isNotSentOwnRow ? '' : notSent
  const stopLine = (
    <Box flexDirection="row" alignItems="flex-start" gap={1}>
      <Box flexShrink={1} minWidth={0}>
        <Text wrap="truncate-end">
          <Text color="error">Stopped {ago(now - stop.at)}: </Text>
          {stopText(stop)}.{fix ? <Text dimColor> {fix}</Text> : null}
          {inlineNotSent ? <Text color="error"> {inlineNotSent}</Text> : null}
        </Text>
      </Box>
      {canResume ? (
        <Button
          key="resume"
          label={resumeLabel(sessionState.resuming?.is === 'sending')}
          onPress={() => void resume(m)}
        />
      ) : null}
    </Box>
  )

  return (
    <Box flexDirection="column">
      {countLine}
      {e.props.maxRows > 1 ? stopLine : null}
      {isNotSentOwnRow ? <Text color="error">{notSent}</Text> : null}
      {theirs}
    </Box>
  )
}
