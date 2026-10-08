# Contrast in every theme

Goal: all text in the `/inbox` pane meets WCAG AA. That is 4.5:1 for text and
3:1 for marker glyphs such as ✓ and ▲. It holds in each of Claude Code's
built-in themes: Dark, Light, their colorblind-friendly versions, the two ANSI
themes, and Auto.

## What the mod cannot color

- **Button labels** use the terminal's own text color. A Button with
  `dimColor` uses the theme's `inactive` gray instead. Button has no color prop.
- **Hotkey letters**, the `a` in `a: Address it`, use the theme's `suggestion`
  color. In the Light theme that blue reaches 4.4:1 even on white, so no
  background can make it pass. On the selected row's blue it is 2.9:1.
- **The pane's background** is the theme's `composerSidebarBackground`. In the
  ANSI themes that is a palette gray, and default text on it fails AA in
  Ghostty's default palette.

## How the pane picks its colors

The mod stores the theme's name and picks one palette for it from `PALETTES`
in `hooks/register.tsx`.

1. **Dark, Dark colorblind-friendly, Light, Light colorblind-friendly:** hex
   colors tuned for that theme. Cards, tabs and the selected row keep their
   fills. Each text color is checked against every background it sits on.
2. **Dark ANSI and Light ANSI:** theme keys only, because a color name such as
   `black` draws as fixed RGB, while a theme key draws as the palette color
   the theme assigns it. The pane paints its body in the palette color nearest
   the terminal's background: black, or bright white. There are no card
   fills, and a bar marks the selected row. Text is the default color or the
   muted color. Status colors appear only on markers.
3. **Auto and custom themes:** theme keys whose values pass in both the Dark
   and Light themes, because the mod cannot tell which one Auto chose. Text
   sits on the pane's own background, and a bar marks the selected row.

These apply to every palette:

- The mod draws each key letter itself, in a color that passes. A hidden
  Button binds the key, as the tab keys already did.
- Secondary text uses the palette's muted color, never `dimColor`. Buttons
  drop `dimColor` and draw at full strength.
- The thread's first comment is drawn as Text in the muted color, because
  Markdown takes no color.

## How it was checked

Each theme was captured from a live session in tmux, with the demo data from
`/inbox demo`. A script measured the contrast of every run of text against its
background and listed the runs under their threshold. It assumed these
terminal colors:

- Dark themes: Ghostty with text `#b8c8d8` on `#090b0d` and the default
  palette.
- Light themes: text `#24292f` on white.
- Light ANSI: Ghostty's "Apple System Colors Light" palette.

Auto was captured as it resolved in tmux, to Dark. Its Light values were
checked by calculation.

The one remaining flag is the ✕ that closes the pane in the ANSI themes, at
3.3:1. Claude Code draws it, and it passes as an icon at 3:1.

## Out of scope

- The band above the prompt.
- Custom themes, whose colors the mod cannot know.
- Terminal palettes other than the ones above, in the ANSI themes.
