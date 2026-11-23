import type { Elements, RenderElement, RenderInput, RenderSurface } from 'claude-code'

import { bandCounts, bandIdleText, bandOpenLabel, nothingMark } from '../../core/view/band'
import { isResumable, stopFix, stopText } from '../../core/view/banners'
import { isBlankLedger } from '../../core/domain/ledger'
import { setDemo } from './mod-demo'
import { drawnState, redraw } from './mod-drawn'
import { openInbox } from './mod-pane-open'
import type { Mod } from './mod-ports'
import { sessionState } from './mod-state'
import { resume } from './mod-turns'
import { lookOf, paletteFor } from '../pane/palettes'
import { DOT, resumeLabel } from '../../core/view/rows'
import { ago } from '../../core/domain/text'
import { RUNNING_MARK } from '../../core/view/help'
import { RUNNING_FRAME_MS } from '../../core/view/timing'
import { RUNNING_SVG_CELLS, runningSvg } from '../pane/desktop-svg'
import { DESKTOP_CELL_PT, DESKTOP_LINE_PT } from '../pane/pane-sizes'

let isBandFramePending = false

/**
 * Redraws the terminal band when the running mark's next frame starts on the clock, as the pane's frames do, so the two
 * marks change together. A desktop Svg moves on its own.
 */
function nextBandFrame(m: Mod, now: number) {
  if (isBandFramePending) return
  isBandFramePending = true
  m.clock.after(RUNNING_FRAME_MS - (now % RUNNING_FRAME_MS), () => {
    isBandFramePending = false
    void redraw(m)
  })
}

/**
 * Draws the band above the prompt: the inbox's counts with the Open inbox button, and the stop row with Resume when the session
 * stopped. `theirsOf` draws what the mods after this one put there.
 */
export async function band(
  m: Mod,
  e: RenderInput<'AbovePrompt'>,
  elements: Elements[RenderSurface],
  theirsOf: () => Promise<RenderElement>,
) {
  const { Box, Button, Text } = elements
  const [{ ledger, stop, view, ui, isDemo, showsDemoNotices, openDialog, now }, theme] = await Promise.all([
    drawnState(m),
    m.atoms.theme.read(),
  ])
  // A loading conversation may bring back saved rows, so the band waits for them before it reads that none wait.
  const isLoadingRows = sessionState.isConversationLoading && isBlankLedger(ledger)
  if (!stop && isLoadingRows) return theirsOf()
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
  const look = lookOf(e.surface)
  const nothing = bandIdleText(view.sync.ledger, { agent: 'Claude', kind: openDialog })
  const isChecking = counts.length === 0 && nothing.isChecking
  if (isChecking && look === 'terminal') nextBandFrame(m, now)
  const Svg = look === 'desktop' && 'Svg' in elements ? elements.Svg : null
  // The mark's place stays while it is hidden, so the text does not move.
  const desktopMark =
    Svg && counts.length === 0 ? (
      <Box width={RUNNING_SVG_CELLS} height={1} flexShrink={0} marginLeft={1}>
        {isChecking ? (
          <Svg
            source={runningSvg(now)}
            alt={RUNNING_MARK}
            width={RUNNING_SVG_CELLS * DESKTOP_CELL_PT}
            height={DESKTOP_LINE_PT}
          />
        ) : null}
      </Box>
    ) : null

  // On desktop a native button is taller than
  // a line of text, so the text sits level with its top.
  const countLine = (
    <Box flexDirection="row" alignItems="flex-start" gap={1}>
      <Box flexGrow={1} flexShrink={1} minWidth={0} flexDirection="row">
        <Text wrap="truncate-end">
          {showsDemoNotices ? <Text dimColor>Demo: </Text> : null}
          {counts.length > 0
            ? counts.flatMap((p, n) => (n === 0 ? [p] : [<Text dimColor>{DOT}</Text>, p]))
            : [
                <Text dimColor>{nothing.text}</Text>,
                ...(Svg ? [] : [<Text dimColor>{nothingMark(isChecking, now)}</Text>]),
              ]}
        </Text>
        {desktopMark}
      </Box>
      {showsDemoNotices ? <Button key="hide-demo" label="Hide demo" onPress={() => void setDemo(m, false)} /> : null}
      <Button
        key="open-inbox"
        label={bandOpenLabel(ui.shownSince !== null)}
        onPress={() => void openInbox(m, isDemo, e.surface)}
      />
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
