# Drawing: render sites, keyboard and focus

Part of [Claude Code mods](../claude-code-mods.md).

## Drawing: render sites

- A **render site** is a place a mod can draw. Claude Code fires `ui.render` before drawing one, and the hook returns the tree to draw. "`e.component` names the site, `e.surface` says which app is drawing, and `e.props` holds the site's own data. For a pane, `e.requestId` is the `id` you opened it with." [IF#pick-where-to-draw]
- A **surface** is the app that draws: `terminal`, `desktop`, and in the types also `mobile` and `vscode`. [T: `RenderSurface`]
- "The pane and the band are empty until a mod fills them." [IF#pick-where-to-draw]
- **Pane**: "a sidebar beside the transcript in a wide fullscreen terminal, or a framed region above the prompt otherwise. With several panes open, each gets a tab that shows its title." [IF#pick-where-to-draw]
- **Band** (site `AbovePrompt`): "a strip directly above the prompt input. It's always there, and every mod shares it." [IF#pick-where-to-draw]
- Sharing the band: "A tree replaces what the mods after yours draw there. To keep theirs, put the result of `await next(e)` among the children of a `Box`." [IF#pick-where-to-draw]
  - The inbox's band hook (`hooks/register.tsx:on('ui.render', AbovePrompt)`) yields while a survey holds the band (`if (!isOn || e.props.hasSurvey) return next(e)`). When it draws, its tree puts the result of `await next(e)` under its own lines, so the mods that run after it still show. Live on 2.1.304, with a probe mod loaded after it that draws one line without `next(e)`: the probe's line shows under the counts, and under the stop line.

### Sites by surface

| Site | Surfaces (docs) | Types say |
|---|---|---|
| `Pane`, `UserMessage`, `AssistantMessage`, `ToolUse`, `ToolResult`, `ToolGroup`, `CommandOutput`, `AskUserQuestion` | Terminal, desktop | "Raised on every surface" |
| `AbovePrompt`, `Spinner`, `SessionMode`, `PromptHint` | Terminal, desktop | "terminal and desktop surfaces only" |
| `ToolProgress`, `TurnDuration`, `InfoNotice` | Terminal | "Raised on the terminal surface only" |

Sources: [R#render-sites; IF#change-what-claude-code-already-draws; T: render-site props].

- "The permission prompt isn't a render site." A tree for `AskUserQuestion` "has to hold the reference exactly once, with your elements above it. Otherwise, Claude Code draws its own dialog." [IF#change-what-claude-code-already-draws]
- At engine-drawn sites, `next(e)` returns `{ type: 'engine', ref }`, "unless a mod that runs after yours returned a tree of its own". [IF#change-what-claude-code-already-draws]
- "Each surface's ask is its own evaluation, since a tree may hold an element only some surfaces draw (Svg, Client)." [T: `RenderSurface`]

### Pane and band props

| Site | Props [R#render-sites] |
|---|---|
| `Pane` | `title`, `isFocused`, `bodyColumns`, `placement`, `scroll`, `view`; `requestId` is the pane id |
| `AbovePrompt` | `hasSurvey`, `isWorking`, `maxRows`, `bodyColumns`, `scroll`, `view`; "One instance" |

- Fit the tree: width to `e.props.bodyColumns`. A docked pane (`placement === 'dock'`) has `e.props.scroll.bodyRows` rows. An inline pane "grows with your tree up to a limit, and `bodyRows` is that limit." "A tree taller than the pane scrolls as a whole." [R#render-sites]
- "`e.viewport` holds `columns`, `rows`, and `isFullscreen`. It's absent until the app has measured its window. Its `rows` is the height of the whole window, not of your pane." [R#render-sites]
- Types detail:
  - `AbovePrompt.maxRows`: "in fullscreen, what the bottom slot has left above the prompt; otherwise the terminal's height. … That slot is capped at half the terminal's rows, the prompt's included." "A tree of at most `maxRows` rows shows whole; a taller one scrolls in a window of `scroll.bodyRows`." "A bare digit arms only the hotkeys of the Buttons wholly inside that window." [T: `AbovePrompt`] Inference: a band that overflows loses keys on buttons outside the window.
  - `AbovePrompt.bodyColumns` is "its column's width less the engine's five at the right end" (for `[-]`). "size a table to it rather than to `viewport.columns`". `scroll.bodyRows` "is `maxRows` less the `n more` row". [T: `AbovePrompt`]
  - The engine draws `[-]` beside the band and an `n more` row under it. The person collapses the band with ctrl+x ctrl+a or `[-]`, and focuses it with a click or ctrl+x tab. `hasSurvey`: "True while a survey holds the band; a hook yields to it." `isWorking`: "True while a model turn is running." [T: `AbovePrompt`]
  - `Pane.placement`: "`dock` beside the transcript (the terminal in fullscreen from 110 columns), or `inline` above the prompt." Read-only. [T: `Pane`]
  - `Pane.title`: with one pane open, "the engine draws no title". `Pane.view` and `AbovePrompt.view` name the transcript on screen (main or one agent's); a switch re-runs the hook. [T: `Pane`]
  - On a remote surface such as desktop, a cell is "the pane's width and height over the advance and line height of its code font". "a change of height alone re-draws nothing". [T: `RenderViewport`]
  - `isFullscreen`: "A remote surface that reports it places panes (`$.ui.open` is placed there); the mobile app reports `false`." It is false "on the main screen (`CLAUDE_CODE_NO_FLICKER=0`, tmux by default) and headless". [T: `RenderViewport`; `CommandPresentation`]
- The repo already sizes to `bodyColumns` and `maxRows` (`hooks/register.tsx:on('ui.render', AbovePrompt)` and `hooks/register.tsx:on('ui.render', Pane)`).
- No doc shows where the desktop app puts the band or a pane, or whether it docks. Unknown.

### Opening a pane

- `$.ui.open({ id, title?, focus?, closeOnEscape?, holdToasts?, rows?, columns? })`. `$.ui.close({ id })` closes it. `rows` defaults to "a third of the space". [IF#open-a-pane-at-the-right-time] Sizes are "A request, not a grant: a size the person dragged or keyed … wins". [T: `ui.open`]
- `focus`, `closeOnEscape` and `holdToasts` "accept only `true`". `false` throws, as in `ui.open: focus is true or left out`. [IF#open-a-pane-at-the-right-time]
- "To let a command open the pane while Claude is working, add `immediate: true` when you register the command. Without it, a command typed during a turn waits for the turn to end." [IF#open-a-pane-at-the-right-time]
- Width rules: a pane opened by a user action shows at any width. One the mod opens on its own (timer, `turn.start`) shows only from 144 columns, or 110 after the user has opened that pane once. It resolves `{ isPlaced: true }` or `{ isPlaced: false, reason }`. "A waiting pane appears when the user opens it or widens the terminal." [IF#when-a-pane-waits-for-a-wider-terminal; R#limits]
  - What counts as asked: "the person's command, prompt or press behind it (not `focus`)". The 110 allowance holds "in this session or an earlier one, until they close the pane by hand". "a `-p` run places all". [T: `ui.open`, `ui.panes`]
- `holdToasts`: "In the terminal, the hold lasts while that pane is the one showing". It also holds other mods' toasts and the engine's notifications. "Leave the field off a pane that stays open." Past 50 waiting, older toasts drop. [IF#hold-toasts-behind-a-dialog; T]
- `ui.close` fires before a pane closes, with `e.origin.kind` `plugin`, `person` or `unload`. A hook may refuse a close with origin `person`. [R#interface; T: `Pane`]

## Keyboard and focus

- "Your mod never reads the keyboard itself." Apart from a digit hotkey on the band, keys reach controls "only while your pane or band has keyboard focus. The rest of the time, keys go to the prompt." [IF#know-which-keys-your-mod-can-receive]
- A pane gets focus by `focus: true` from a command or press, ctrl+x then tab, or a click. "Claude Code grants `focus: true` only while the prompt is empty and nothing else has keyboard focus." [IF] Types: focus is refused while the person holds "An element of the band or a pane …, text in the composer, a dialog or a survey". [T: `ui.open`]
  - Live, 2026-10-14, terminal 2.1.296, 2.1.299 and 2.1.300, fullscreen renderer, with the pane docked and inline: a click on a pane `Button` presses it and leaves the keys with the prompt, whether or not the prompt has text. A click on empty space in the pane leaves them there too. This conflicts with the types, which say a site holds the keys "after ctrl+x tab, a click or `open({ focus })`". [T: `Button.hotkey`]
  - In the same runs, a click on an `Input` gave it the keys, also with text in the prompt.
  - So a press that opens a field can give it the keys only through `open({ focus })`. With text in the prompt that is refused: the inbox's Reply drew its field, and the letters typed next went to the prompt.
- Keys while focused: Tab next control; Up and Down move between controls "while your drawing fits", else scroll; Enter presses; a hotkey presses its button ("While an `Input` has the focus, every printable key goes to the field"); PgUp, PgDn, Home, End scroll; ctrl+x then an arrow resizes; ctrl+x x closes the pane "even while one of its fields has the focus"; Esc returns to the prompt and closes a `closeOnEscape` pane. "A mod can't bind Tab or the arrow keys to anything else". [IF#know-which-keys-your-mod-can-receive]
  - Live, 2026-10-21, terminal 2.1.307, inline and docked: a printable key that no `Button` in the focused pane binds goes to the prompt, and the prompt takes the keyboard. The next key, even a bound one, goes there too. No `ui.focus` event fires. A pane that must keep the keys has to bind every key the person may press.
- Keybindings: `~/.claude/keybindings.json`, opened with `/keybindings`, applied without restart. [KB#configuration-file]

| Context | When active [KB#contexts] |
|---|---|
| `AbovePrompt` | The band, or a button in it, has focus |
| `AbovePromptInput` | An input in the band or a mod's pane has focus |
| `AbovePromptSelect` | A select in the band or a pane has focus |
| `Pane` | A mod's pane has focus |
| `PaneField` | An input or select in a mod's pane has focus |

| Action | Default [KB#above-prompt-actions; KB#pane-actions] |
|---|---|
| `abovePrompt:toggle` | ctrl+x ctrl+a: collapse the band to a one-row hint, or expand it |
| `abovePrompt:focus` | ctrl+x tab: focus the band, then each pane, then back to the prompt |
| `abovePrompt:next` / `previous` / `press` / `leave` | Tab / Shift+Tab / Enter / Escape |
| `pane:scrollUp` … `pane:bottom` | Up, Down, PgUp, PgDn, Home, End |
| `pane:grow` / `pane:shrink` | ctrl+x left or up / ctrl+x right or down |
| `pane:close` | ctrl+x x (also in `PaneField`) |

- "`ctrl+x b`, `ctrl+x ctrl+a`, and `ctrl+x tab` require v2.1.260 or later." Chord keys must come within 3 seconds. Reserved: ctrl+c, ctrl+d, ctrl+m, ctrl+[, ctrl+i, ctrl+h, Caps Lock. [KB#unbind-default-shortcuts; KB#chords; KB#reserved-shortcuts]
- Inference: users can rebind these keys, so the inbox's Help text ("ctrl+x tab", `hooks/view.ts:helpKeys`) can go stale. Whether desktop reads `keybindings.json` is undocumented.
- The pane's hotkeys: 1, 2, 3, j, k, v, a, t, e, x, o, r, d (repo). Tab, arrows, Enter and Esc belong to the engine.
