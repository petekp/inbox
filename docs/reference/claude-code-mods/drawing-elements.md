# Drawing: elements

Part of [Claude Code mods](../claude-code-mods.md).

| Element | Docs [IF#build-a-tree-from-elements; R#elements] | Types [T: per-surface element tables] |
|---|---|---|
| `Box`, `Text`, `Button`, `Link`, `Code`, `Markdown` | Everywhere | Every surface |
| `Input`, `Select` | Terminal, desktop | All but mobile: "the mobile app draws no field yet" |
| `Svg` | Desktop, up to 131,072 characters | "every remote surface" (desktop, mobile, vscode) |
| `Client` | Terminal, desktop | Terminal and desktop. vscode lacks it: "not a limit of the editor's webview" |
| `Raster` | Terminal; `columns` ≤512, `rows` ≤256 | Terminal ("elsewhere a fragment") |
| `Image` | Terminal; PNG or RGBA ≤2 MiB or a file path, `columns`/`rows` ≤255, `alt` | Terminal |

- Element the surface lacks. The interface page: "If a tree uses an element the app doesn't have, a prop an element doesn't take, or a child where none goes, Claude Code draws its own version of the site." [IF#build-a-tree-from-elements] The gallery: "In the terminal, a pane that returns only an `Svg` opens empty." [GA#svg] The types: "an omitted one draws a fragment". These conflict; see "Where sources disagree".
- Draw with `$.ui.resolve(e)` and branch on `e.surface` or on which elements exist. JSX works in `.tsx` after destructuring the elements. `$.ui.resolve(e)` is "A read, not a dispatch". [IF#build-a-tree-from-elements; T: `ui.resolve`]
- The inbox checks for a field with `'Input' in elements` (`hooks/register.tsx:on('ui.render', Pane)`).

## Button

- Props: `key`, `label`, `onPress`, `hotkey`, `plain`, `dimColor`, `autoFocus`, `action`. `onPress(e)` gets `e.surface`, "the app the press came from". [R#elements; IF#respond-to-presses-and-typing]
- Terminal: default `[ Add one ]`. `plain: true` gives `1: One`. Focused draws inverse. [GA#button]
- Hotkey display: [IF#know-which-keys-your-mod-can-receive]

| Button | Terminal | Desktop |
|---|---|---|
| Bracketed (default) | `[ Add one ]`, no hotkey shown | "The label with a small key beside it" |
| `plain: true` | `1: One` | "The label with a small key beside it" |

- `hotkey` is "one digit or one lowercase letter". Shift+w counts as `"w"`. "When two buttons in one drawing name the same `hotkey`, the later one gets it." "A digit `hotkey` on a button in the band also fires when the user types that digit alone into an empty prompt and pauses." [IF; R#elements; T: `ButtonProps.hotkey`]
- `action` "names one of Claude Code's own keybinding actions". Types: it applies "on the terminal while mounted". [R#elements; T: `ButtonProps.action`]
- Types only:
  - `variant?: 'primary' | 'secondary'`. Desktop draws "its own primary button". "`plain` wins". The inbox uses `variant="primary"` (`hooks/pane-row-keys.tsx:keyedButton`).
  - `role?: 'dismiss'`: desktop draws "its native close control at the site's trailing edge"; the terminal ignores it.
  - `hover?`: "Refused outside a keyed Box unless it names a `scope`."
  - `plain`: "A desktop draws its native button either way."
  - 2.1.295 only: "Children of strings and `Text` (a chip, a dim part) are drawn in its place". `key` defaults to "the `label`, or the one string child". 2.1.294 allowed only "the one string child".
- In the terminal, the inbox draws each pane key as a `plain` Button that holds a `Text` letter and the label `": Label"`, with no hotkey (`hooks/pane-row-keys.tsx:keyedButton`). The Buttons that carry the hotkeys sit in a `<Box display="none">` (`hooks/pane-row-keys.tsx:keyBindings`). `display` is in the types, not the docs.
  - On desktop, `hooks/pane-row-keys.tsx:keyedButton` draws only a native Button per action, with no letter and no hidden Box. Whether desktop honors hotkeys on hidden Buttons is unknown.

## Input and Select

- Input: `key`, `label`, `placeholder`, `value`, `submitLabel` (default `submit`), `onSubmit`, `onInput`, `autoFocus`. A one-line field. [R#elements; GA#input]
- "Typed letters reach an `Input` once it has the focus, so add `autoFocus: true` to a field that should take typing as soon as the pane opens." [GA#take-input]
- "`value` is the text the field holds when it's drawn, and the user's typing replaces it until your hook draws the field again." "Submitting an `Input` doesn't start a turn unless your callback calls `$.prompt.submit`." [IF#take-typed-input-and-draw-a-row-for-each-item]
- Select: `onSelect(value)`; "at least one choice with unique values". An option `value` over 10,000 characters makes Claude Code draw its own site. [GA#select; R#limits]
- Each use fires `ui.press`, `ui.input` or `ui.select` with the `key` in `e.element`. "Its hook runs before your callback". "The mods API has no method that presses another mod's button." [IF#respond-to-presses-and-typing]
- "Of several [autoFocus] in one site the first drawn wins". [T]

## Link

- Desktop: "a `Link` draws as plain text unless its `href` meets these requirements": "an `https:` URL, or an `http://localhost` URL"; "No `@`: write an `@` in the path or query as `%40`"; the spelling must equal `new URL(href).href`, which excludes "an uppercase host, a space, and `:443`". "In the terminal, these requirements don't apply." [IF#link-in-the-desktop-app]
- Types: "an OSC 8 span on the terminal (else its text then the URL in dim), an anchor on desktop." "on a remote surface anything but the `https:` URL its wire promises: the text is drawn plain, and said so; the tree stands." No localhost exception. Link is inline; its children are its text. [T: `LinkProps`]
- Gallery: "The terminal draws the URL as text after the label. Whether a click opens it depends on the user's terminal." [GA#link]
- "A `Link`'s `href`: 2,048 characters. A longer `href` keeps the whole tree from drawing." [R#limits] Types measure it "once what a terminal acts on is percent-encoded".
- Markdown: "a link not `https:`, `http:` or `file:` draws as text". `onLinkPress` makes links the plugin's to answer. [T: `MarkdownProps`]

## Other elements

- Text: `color`, `bold`, `dimColor`, `italic`, `underline`, `strikethrough`, `inverse`, `backgroundColor`, `wrap` (`'wrap'`, `'truncate'`, `'truncate-start'`, `'truncate-middle'`, `'truncate-end'`; types add `'end'`, `'middle'`). [IF; GA#text; T]
  - 2.1.299 added `size`, `weight`, `mono` and `tabular`, and deprecated `bold` for `weight`. `bold: true` is read as `weight: 'semibold'`. [CL#2-1-299; T: `TextProps.bold`]
  - Live, 2026-10-14, terminal 2.1.296: a pane with one Text `weight` was refused whole, with "ui.render (Pane) refused: Text prop "weight" is not allowed; the engine drew its own". The inbox keeps `bold` while any engine it supports is older than 2.1.299. The Claude desktop app v2.37337.1 bundles 2.1.295.
- Box: flex layout, `gap`, `padding`, `margin`, `width`, `height`, `borderStyle` (ten names; any other "draws with no border"), `backgroundColor`, `position`, `hover`. Types add `display: 'flex' | 'none'` and `overflow`. [R#elements; GA#box; T]
- Markdown takes `text`. Code takes `language` or `path`, `startLine`, `format: 'diff'`. [GA#markdown; GA#code]
- Svg: `source` ≤131,072 characters; `alt` required "since a surface without the element draws nothing else of it"; `isInteractive: true` draws "in a script-less sandboxed frame" so hover and animation work. [GA#svg; T: `SvgProps`]
- Client: "A region drawn by a second file of yours, for animation and pointer input. That file gets no mods API. It reaches your hooks by posting data, which arrives as a `ui.message` event. If it fails to load, draw, or run, your hooks receive a `ui.fault` event." `ui.fault` needs 2.1.289. `module` must be a string literal. Props JSON ≤100,000 characters. Tree bounds 20,000 nodes, 32 deep. [IF#build-a-tree-from-elements; R#interface; T: `ClientProps`]
- Image shows only where Claude Code detects kitty graphics with Unicode placeholders (kitty 0.28+, Ghostty). It fails in tmux, screen and "every background session"; the user sees dim `alt` text. [GA#image-and-client]
- Raster: `$.ui.blit(...)` repaints without re-running the hook. "Each character has to be one cell wide." [IF#draw-a-grid-of-colored-cells]

## Redraws

- The hook re-runs when the site's props or the terminal width change. "It doesn't run the hook on a timer, and it can't tell when a variable in your module changes." Use `$.ui.invalidate('ui.render')`, `$.state`, or `$.clock.every`. [IF#redraw-when-something-changes]
- "Throttled to 10 a second, or 30 in the terminal for the visible pane, the expanded band, and the hint line under the prompt. Calls that come sooner are coalesced." [R#limits] Inference: animations run at 10 a second on desktop.
- "Text in one tree: The first 100,000 characters are drawn". [R#limits]
