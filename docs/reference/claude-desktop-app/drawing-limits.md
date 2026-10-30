# Drawing limits for desktop design

Part of [The Claude desktop app](../claude-desktop-app.md).

The table of what desktop draws is in [panes, layout and color](what-desktop-draws-layout.md) and [buttons, input, focus and other elements](what-desktop-draws-controls.md).

Read this before designing any desktop UI for the inbox. It lists what a mod can draw in Code mode on engines 2.1.293 and 2.1.295, with a source and a status for each claim. Each claim is either verified live, stated in the docs or types, inferred, or unknown.

**What this means for the inbox's tabs:**
- A mod cannot customize the engine's pane tabs. The only thing a mod controls is the title text. Another `$.ui.open` with the same id changes that text, so a title can carry a count.
- Box and Button cannot make a whole tab, row or card clickable. A Box takes no clicks. A Button is only as big as its label and does not stretch.
- A `Client` can. It is a region a separate surface module draws, with a set width and height, and it gets pointer input over the whole region on desktop (live, 2026-10-09). Its module can post each click to the hooks module.

**Source key:**
- `types:N (Symbol)` is `.claude-plugin/types/claude-code/index.d.ts` line N, as written by engine 2.1.293. Each engine that loads the mod rewrites this file, so the line numbers drift. Find the line by the symbol (desktop.md:89).
- `mods.md:N` is `docs/reference/claude-code-mods.md`.
- `desktop.md:N` is `docs/reference/claude-desktop-app.md`.
- `live` means probes in this project's desktop Code-mode sessions. The attach, viewport, placement, band, copy and submit probes ran on 2026-10-08 (desktop.md:29-55). The drawing probes ran on 2026-10-09.
- The app downloads its engine copies into Application Support; they are not built into the app. Probes before 14:41 PDT on 2026-10-09 ran on 2.1.293. Later probes ran on 2.1.295 and say so (desktop.md:3, :129-133).

## What this rules out

- **Customizing the engine's pane tabs.** Only `title` reaches a tab. Nothing styles, sizes, badges or replaces it. The title text can change, as with a count.
- **A whole-tab hit area built from Box or Button.** A Box takes no clicks. A Button sizes to its label and does not stretch, even in an absolute overlay. Draw the tabs in a Client instead.
- **Clickable whole rows or cards built from Box or Button.** Same reason as the tab bar.
- **Making a Button look like text or a tab.** `plain` still draws native chrome and a pointer highlight.
- **Styled content inside a Button**, such as colored counts, dim parts, chips or icons. Engine 2.1.293 takes only a string label.
- **Spacer or invisible Buttons made of spaces.** They have no size and take no clicks.
- **Keyboard-first design and key hints beside labels.** Hotkeys do nothing, and `action` chords are terminal only.
- **Column-exact alignment with spaces or character counts.** The font is proportional, about 1.25 characters per column.
- **Relying on `wrap="truncate-end"` to keep one line.** Text still wraps. Keep the text short.
- **Rules drawn with `─` and other box-drawing characters.** They wrap.
- **Single-side dividers.** A Box has no per-side borders.
- **Rounded corners, shadows, opacity, font sizes or font families.** No props exist for them.
- **Mixed Button-and-Text rows at text height.** A native button is taller than a text line.
- **Trying a prop just to see what happens.** One unsupported prop drops the mod's whole drawing.
- **Image or Raster.** They are not drawn on desktop. Svg is the only image route, and the mod receives no clicks from it.
- **Redrawing a focused Button under a new key.** The pane loses focus (#100874), unless the mod moves the focus to a Button that is still drawn.
- **Giving a text field the keyboard.** On the first Reply in desktop 2.42304.0 with engine 2.1.299, an `Input` with `autoFocus` stays empty while typing enters the composer. `ui.open` returns `{ isPlaced: true }` and `ui.focus` returns `{}`. Clicking the field enables typing. Pointer-up and requesting focus before any await produced the same failure. A native Reply Button needed a second click to activate. These probes leave the host failure open ([#100966](https://github.com/anthropics/claude-code/issues/100966)).
- **Redrawing the pane every fraction of a second.** While a settled row's leave bar redrew every 213 ms, clicks on the pane's Buttons did nothing. With one redraw at the end, they worked (live, 2.1.295, #100924).

## What works

- `Client` rows and fold lines: a click anywhere on them lands, they show hover, and the pane still scrolls with the pointer over them (live, 2.1.295).
- A docked pane whose width follows the person's drag. Fit content to `bodyColumns`.
- Native Buttons. `onPress` fires with surface `'desktop'`, and a click on a button's corners or edges presses it (live, 2.1.295).
- Moving the focus to a Button the next drawing still has, when a press removes the focused one. A `$.ui.focus` for that Button, called once the render hook has returned, kept every next click working in a run of 19 presses (live, 2.1.295).
- A `Client` for any click area larger than a Button label. Its module draws with Box and Text, gets pointer events over its whole region, and posts to the hooks module through `ui.message`.
- Scrolling the pane with the pointer over a `Client` (live, 2.1.295). On 2.1.293 the pane did not scroll there (#100923).
- Hierarchy with `variant="primary"` (white filled) against the default (dark gray rounded).
- A Box `backgroundColor` and hover `backgroundColor` for row highlight. This is visual only, not clickable.
- Stable Button keys across redraws, which keep pane focus.
- Non-breaking spaces to pad a Button label. A long label shows an ellipsis.
- `$.ui.copy` and `$.prompt.submit({ asUser: true })`.
- The band draws, up to 12 rows here.

## Still unknown

- **How a Client maps a click to what it drew.** Pointer positions are whole cells, but desktop text is proportional. Check whether a Box with a set width in cells lines up with the cells the pointer reports.
- **Whether a Client keeps the pane's focus, takes keys after a click, and draws its own hover.** Draw tabs in a Client, then click, type and hover.
- **Whether desktop draws engine pane tabs, and whether they switch on click.** Open two mod panes in a desktop session, then screenshot and click.
- **Whether Cmd+\ closes a mod pane, and whether it pops out.** Try each in a desktop session. Where it docks is in "Live checks on desktop 3.1623.0".
- **Which `borderStyle` names other than `single` desktop honors.** Draw one Box per name and screenshot.
- **Text and Button hover, and scope groups, on desktop.** Draw each inside a keyed Box and hover.
- **Whether Buttons inside a `display: 'none'` Box stay hidden.** Draw one and screenshot.
- **How `role: 'dismiss'` looks.** Draw it in the pane and in the band.
- **Where a Link click opens, and whether `http://localhost` links work.** Click both kinds of link.
- **Whether Markdown link clicks reach `onLinkPress`.** Log presses while clicking a Markdown link.
- **Whether typing reaches an Input on desktop.** Draw an autoFocus Input and type.
- **Whether `ctrl+x tab` or `focus: true` focuses the pane on desktop, and whether keybindings.json applies.** Try each and read `isFocused`.
- **Toasts, status, `holdToasts` and `$.ui.selection` on desktop.** Call each and screenshot or log the result.
- **`$.ui.notify`.** Retest once the app runs 2.1.295. Check the session's engine version first.
- **The real redraw rate on desktop.** Log redraw timestamps under rapid state changes.
- **Which surface fires `onPress` when a terminal and the desktop share a session.** Attach both and click.
- **Whether the app shows failure and reload lines.** Break the mod with the watch variable set and look.
