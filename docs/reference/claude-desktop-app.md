# The Claude desktop app

Clicks, typed answers, layout, queued presses, subagents and nested sessions were checked on 2026-10-21 in Claude desktop 3.1623.0 with engine 2.1.304 (see "Live checks on desktop 3.1623.0"). Startup and Reply focus were rechecked on 2026-10-15 in Claude desktop 2.42304.0 with its bundled Claude Code engine 2.1.299. Other results below retain their original dates and versions. The initial reference used desktop 2.31226.0 and 2.31226.1, with engine copies from 2.1.289 through 2.1.295.

The desktop app is the inbox's third client, beside the terminal and Codex. Its Code mode runs Claude Code sessions, so the inbox mod (the plugin code in `hooks/`) can run there. Its Claude mode is the chat side of the app; whether it can host any part of the inbox is unknown.

Terms used below:

- **Engine**: the Claude Code program (`claude`) that runs a session and loads plugins and mods.
- **Mod**: a plugin's code that hooks engine events and draws UI. The inbox is one.
- **Surface**: where a session is drawn. The engine's types name four: `terminal`, `desktop`, `mobile`, `vscode` (`RenderSurface` in the engine types).
- **Attach**: a client such as the desktop app connecting to a running session (`session.attach`).
- **SDK host**: a program that runs Claude Code headless and talks to it over stream-json, as the Agent SDK does.
- **Guard**: the built-in mod `sec-default@builtin` (shown as `cc-plugin-sec-default`), which runs ahead of a user's mods in some setups.
- **Live**: checked in the app on the stated date. Undated observations come from the initial 2026-10-08 probe.

## The facts that most constrain the inbox

1. The app runs its own Claude Code copy, separate from the terminal's. "The desktop app downloads and updates that copy, so it can differ from the `claude` command in your terminal" (https://code.claude.com/docs/en/desktop#claude-code-version-in-the-code-tab). Live: 2.1.289 and 2.1.293 versus 2.1.295.
2. The app runs each session headless, as an SDK host (live process arguments). Live: `session.start` has `isInteractive: false`, `surface: null` and no surfaces. The app attaches about 0.1 s later with `surface: 'desktop'`. See "Live probe of a Code-mode session" below.
3. Mods run and draw in local Code-mode sessions. WSL sessions get no plugins. A cloud session runs a mod's hooks only for a plugin that reaches it, and draws nothing (https://code.claude.com/docs/en/plugins/mods/overview#where-mods-run).
4. Mods need engine 2.1.286 on Desktop (overview page). The inbox "was built and tested with Claude Code 2.1.292" (`README.md:20`). Whether it works on the app's 2.1.289 copy is unknown.
5. `ToolProgress`, `TurnDuration`, `InfoNotice`, `Raster` and `Image` do not draw on the desktop (https://code.claude.com/docs/en/plugins/mods/reference#render-sites, #elements). Live: `$.ui.copy` works on the desktop, although a types comment says "a remote surface has no path yet".
6. Live: a prompt typed in Code mode arrives with `origin.kind` `composer`, so the inbox counts it as the person's words (`hooks/register.tsx:isPersonsWords`).
7. The app and the CLI share `~/.claude/settings.json`, `~/.claude.json`, CLAUDE.md, hooks and skills (https://code.claude.com/docs/en/desktop#shared-configuration).
8. The repo owner reported the mod loading in a local Code-mode session after commit 05c3548. Commit f7536d0 fixed `/clear`, `/resume` and `/branch`.
9. There is no in-app way to confirm the mod loaded. `/plugin` does not run in Code mode (see "Plugins and Customize"). For an installed mod, refusal and `hook skipped` lines go to the debug log only (https://code.claude.com/docs/en/plugins/mods/troubleshoot#find-out-why-a-mod-does-nothing).

## Parts

- [Live checks](claude-desktop-app/live-checks.md)
- [Modes, engine, versions, environments and plugins](claude-desktop-app/how-it-runs.md)
- [What desktop draws: panes, layout and color](claude-desktop-app/what-desktop-draws-layout.md)
- [Drawing limits for desktop design](claude-desktop-app/drawing-limits.md)
- [What desktop draws: buttons, input, focus and other elements](claude-desktop-app/what-desktop-draws-controls.md)
- [Connectors, settings, /resume and app features](claude-desktop-app/app-features.md)
- [Where sources disagree, what is unknown, and sources](claude-desktop-app/open-questions-and-sources.md)
