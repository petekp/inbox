import { isClientNew } from './client-copy'
import { linksRegionWidth, type LinksProps } from './links-client'
import type { PaneClient } from './pane-context'
import type { PaneRowFrame } from './pane-row-frame'
import type { TitleProps } from './title-client'
import { paneState } from '../mod/mod-state'
import type { UiState } from '../../core/view/ui-controller-types'

type Elements = Extract<PaneClient, { hasClient: true }>['elements']

/** The props an open row's title or links Client last drew with. */
export type ShownClient = { kind: 'title'; props: TitleProps } | { kind: 'links'; props: LinksProps }

export function noteShown(key: string, shown: ShownClient) {
  paneState.shownClients.set(key, shown)
}

/** Whether row `id` is on its way back from Undo: an Undo press is out on it, or the controller has yet to select it. */
export function isComingBack(ui: UiState, id: string): boolean {
  return Object.values(ui.pressesOut).some(p => p.action === 'undo' && p.rowId === id) || ui.restoring?.id === id
}

/**
 * The open row's title and links Clients, kept running at zero height while the row is settled with Undo and while it
 * comes back collapsed (`isComingBack`), so Undo shows them again without the pane's copy under them. The Claude app
 * keeps a zero-height Client running with its state, draws nothing for it and gives it no pointer input, and on the
 * next drawing that shows it draws it at once with its last render (drawing-limits.md). They lie in a frame laid out as
 * the open row's, so that render has the open row's width.
 */
export function heldClients(elements: Elements, desktopFrame: PaneRowFrame['desktopFrame'], rowId: string) {
  const { Box } = elements
  const title = paneState.shownClients.get(`collapse-${rowId}`)
  const links = paneState.shownClients.get(`links-${rowId}`)
  if (title?.kind !== 'title' && links?.kind !== 'links') return null
  const titleKey = `collapse-${rowId}`
  const linksKey = `links-${rowId}`

  return (
    <Box key={`held-${rowId}`} position="absolute" top={0} left={0} width="100%" height={0} overflow="hidden">
      {desktopFrame({
        key: `held-frame-${rowId}`,
        padY: 0,
        children: [
          title?.kind === 'title' ? (
            <elements.Client
              key={titleKey}
              module="./title-client.tsx"
              width="100%"
              props={{ ...title.props, isOverCopy: isClientNew(titleKey) }}
            />
          ) : null,
          links?.kind === 'links' ? (
            <Box key="links" flexDirection="row">
              <Box flexGrow={1} flexShrink={1} minWidth={0} width={linksRegionWidth(links.props)}>
                <elements.Client
                  key={linksKey}
                  module="./links-client.tsx"
                  width="100%"
                  props={{ ...links.props, isOverCopy: isClientNew(linksKey) }}
                />
              </Box>
            </Box>
          ) : null,
        ],
      })}
    </Box>
  )
}
