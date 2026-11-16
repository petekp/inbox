/** The chevron every fold draws in the text looks: › while folded, ⌄ while open. The Codex tab draws the same shape as an icon. */
const FOLD_CLOSED_CHEVRON = '›'
const FOLD_OPEN_CHEVRON = '⌄'

export const foldGlyph = (isOpen: boolean) => (isOpen ? FOLD_OPEN_CHEVRON : FOLD_CLOSED_CHEVRON)
