# Differences on purpose: the Herdr look

Part of [the look map](../looks.md#differences-on-purpose).

This table compares the Herdr look with the Codex tab, the nearest look. The structure check reads the parts whose names start with `differences-herdr` as the Herdr look's table.

| Topic | Herdr look | Why | Where |
| --- | --- | --- | --- |
| Who draws | A Herdr app mod draws the inbox apart from the host, from the session file the host publishes under the app's home folder. | Herdr's mods run in Herdr's own process, so the look reaches the host's session only through a file. | `herdr/src/files.ts:readSession`, `herdr/src/files.ts:sessionPath` |
| Following focus | Shows the session of the terminal last focused in the look's tab, and keeps it while the look itself has focus. Before anything in the tab had focus, it shows the first terminal with a session label. | One look pane can serve several agents in a tab. | `herdr/src/follow.ts:follow` |
| A terminal with no session | Draws a message in place of the tabs: no terminal in the tab, no inbox in the terminal with the program that runs there, or a session that ended. | The followed terminal can be any program, and a session can end while its terminal stays open. | `herdr/src/screen.ts:screenOf` |
