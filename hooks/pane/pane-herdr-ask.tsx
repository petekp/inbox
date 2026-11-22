import { HERDR_ASK_BUTTONS } from '../../core/remote/herdr-ask'
import { BANNER_PAD_Y_PT } from '../../core/view/layout'
import { pressHerdrAsk } from '../mod/mod-herdr'
import { mod } from '../mod/mod-state'
import type { PaneBase } from './pane-context'
import type { KeyAction } from './pane-keys'
import { DESKTOP_LINE_PT } from './pane-sizes'
import { HOTKEY_SEPARATOR } from './pane-row-keys'

/** Install and Don't install with their keys while the install question asks, else none. */
export const herdrAskKeys = (): KeyAction[] =>
  mod.herdrAsk?.is === 'asking'
    ? HERDR_ASK_BUTTONS.map(a => ({
        key: a.id,
        label: a.label,
        hotkey: a.hotkey,
        kind: 'local',
        onPress: () => void pressHerdrAsk(a.isYes),
      }))
    : []

/**
 * The install question's buttons, on their own line under its text, while it asks. The terminal draws each key before
 * its label, as a row's buttons do, and desktop, which takes no keys, draws the labels only.
 */
export function herdrAskButtons({
  look,
  Box,
  Button,
  Text,
  pal,
  space,
}: Pick<PaneBase, 'look' | 'Box' | 'Button' | 'Text' | 'pal' | 'space'>) {
  const keys = herdrAskKeys()
  if (keys.length === 0) return null
  const hover = { color: pal.muted, inverse: true }

  return (
    <Box
      flexDirection="row"
      columnGap={space.buttonGap}
      marginTop={look === 'desktop' ? (2 * BANNER_PAD_Y_PT) / DESKTOP_LINE_PT : 0}
    >
      {keys.map(k =>
        look === 'desktop' ? (
          <Button key={k.key} label={k.label} onPress={k.onPress} />
        ) : (
          <Button plain key={k.key} hover={hover} onPress={k.onPress}>
            <Text color={pal.key} hover={hover}>
              {k.hotkey}
            </Text>
            {`${HOTKEY_SEPARATOR}${k.label}`}
          </Button>
        ),
      )}
    </Box>
  )
}
