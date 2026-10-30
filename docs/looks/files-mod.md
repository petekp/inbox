# Files: the mod

Part of [the look map](../looks.md#files).

| File | Role |
| --- | --- |
| `hooks/claude.ts` | Mod only. Claude transcript, command, dialog and stop helpers. |
| `hooks/register.tsx` | Mod adapter and host. Draws the terminal and desktop looks, and also runs the band, the PRs tab, the per-reply update and the press runner. It keeps the drawn session in an engine atom, saves each conversation's session in the engine store, and builds the mod's `SessionHost`. The plugin directory refuses `$` passed to a function another of the mod's files declares, so every function that takes `$` lives in this file. |
| `hooks/tabs-client.tsx` | Mod only. A Client region for the desktop tab bar, so each tab takes clicks over its whole shape. |
| `hooks/row-client.tsx` | Mod only. A Client region for a closed row in the desktop pane. |
| `hooks/fold-client.tsx` | Mod only. A Client region for the desktop "N Closed" line. |
| `hooks/links-client.tsx` | Mod only. A Client region for an open row's follow-ups on desktop. |
| `hooks/undo-client.tsx` | Mod only. A Client region for Undo on desktop, whose fill drains while Undo lasts. |
| `hooks/desktop-metrics.ts` | Mod only. How wide the desktop pane draws text: characters per column, each character's width in points, a Button's padding, and line wrapping. |
