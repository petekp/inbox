# Unknown, and how to check: engine and API

Part of [Claude Code mods](../claude-code-mods.md).

This part holds rows 1-62. They mostly concern desktop behavior, the engine, hooks and plugins. [Clients and admin](unknowns-clients.md) holds rows 63-135.

| # | Question | Live check |
|---|---|---|
| 1 | In Code mode, does `session.attach` with `surface: 'desktop'` always fire, and before or after `session.start`? | In a Code-mode session, log `$.session.surfaces()` at start and at each attach and detach. Cover a new session, `/resume`, and `claude --desktop --continue`. |
| 2 | What does `/plugin` show in Code mode: the `mods active` line, the Built-in list, `/reload-plugins`? | Open `/plugin` in a live Code-mode session. |
| 3 | Does the mobile app or claude.ai Remote Control attach as `mobile`, and does it draw a band or pane? | Start Remote Control from a terminal session with a probe mod that logs `session.attach` and draws `AbovePrompt`. Open the session on a phone. |
| 4 | Does the VS Code extension attach as `vscode` and draw anything? | Same probe in the VS Code chat panel. Log `$.session.surfaces()` and `e.isInteractive`. |
| 5 | Do desktop SSH sessions load plugins and draw? | Code mode with an SSH environment. Read `/status` and a probe log. |
| 6 | Which engine does the desktop app use now, and how far does it trail the CLI? | `/status` in Code mode. Log `$.session.version()` to the debug log. |
| 7 | Does remote turn-off stop built-in mods or the desktop engine separately? How does "saved off" clear there? | Run `claude plugin test` with the desktop app's engine binary. |
| 8 | Does the shipped guard match its main-branch source? Does GUIDANCE reach the system prompt, does the carry block reach Claude, does `classic.SessionStart` fire after `/clear`, does a `Read` deny rule beat the inbox's allow, do the tools fail to register with `allowedMcpServers` set? | On a test machine, add a managed-settings file, run `claude --debug`, and probe each one. Ask Claude to quote the `inbox:guidance` section. |
| 9 | How does `cc-plugin-you-should-know`'s note look under the inbox's band lines, and how many rows does it take? Both draw in one tree, under one `maxRows`. | Enable both in a signed-in session and run a long task until a note appears. |
| 10 | Does a server-managed `enabledPlugins` entry install the inbox in an Anthropic-hosted cloud session? | Test org. Even if it installs, nothing draws, so the gate should keep the mod off. |
| 11 | Under `allowManagedModsOnly`, do the inbox's tools and `/inbox` go away? | Managed-settings test file plus `claude --debug`. |
| 12 | Is `e.isInteractive` ever true in Code mode, for example after `/desktop` hands off a live terminal session? | Run `/desktop` from a terminal session with the mod loaded and log the start event. |
| 13 | Rollout switch default under a third-party provider or gateway. Does it gate folder-loaded mods or only installed ones? | Fresh `CLAUDE_CONFIG_DIR`, no GrowthBook cache: `CLAUDE_CODE_USE_BEDROCK=1 claude plugin test` in an empty folder; repeat with `ANTHROPIC_BASE_URL=<gateway>`. Then `claude --debug-file <log> --plugin-dir <repo>` and grep "rollout flag" and "hooks module inbox". |
| 14 | Does `claude plugin test` need a saved rollout value or the network on a cold CI box? The binary has "the rollout switch was fetched, but its value could not be saved for the test files to read". | Run it in a container or fresh `CLAUDE_CONFIG_DIR` with the network blocked. |
| 15 | Where desktop failure lines show. Does the app render `ui_log` messages? How do you get a debug log for the desktop engine? | Set `CLAUDE_CODE_PLUGIN_DIRS` and `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`, save a throwing hook, watch the app and `~/.claude/debug/`. |
| 16 | Does `CLAUDE_CODE_PLUGIN_DIR_WATCH` work from user settings `env`? | Set it only there and watch for a reload in desktop. |
| 17 | With `--plugin-dir <repo>` and the installed `inbox` both enabled, which loads? Is `$.store` shared? | `--debug-file`, grep "another plugin of that name", list `~/.claude/plugins/store/`. |
| 18 | Does a save outside `hooks/` reload the mod? Does the protected-path rule cover the whole repo? | `--plugin-dir <repo>`, touch `docs/x.md`, look for the reload line. Ask Claude to edit a doc in `acceptEdits` and see whether it prompts. |
| 19 | Does a worker restart fire `session.attach` again for desktop? Is a `$.prompt.submit` started from `session.attach` de-duplicated? | Needs a forced crash. Look for a respawn helper in the testing types. |
| 20 | Do toasts work in desktop, and with what limits? | Probe mod in Code mode. |
| 21 | When the desktop app updates its engine, does an open session keep the old one? | `/status` in Code mode before and after an app update. |
| 22 | Does the hot-reload approval prompt for Claude-written mods appear in desktop? | Ask Claude for a mod in Code mode. |
| 23 | Does a pane the mod opens unasked wait for width on desktop? Answered: a pane opened by a command reads `placement: 'dock'`, `isFullscreen: true`, `bodyColumns` 36 to 69 as the person resizes it, and the band's `maxRows` is 12. [desktop](../claude-desktop-app/live-checks.md#live-probe-of-a-code-mode-session) | Call `$.ui.open` from a timer and record `isPlaced`. |
| 24 | How does desktop draw `plain` Buttons labeled `": Label"`? Answered in part: a `Button`'s `hotkey` does nothing in a focused desktop pane, so hidden hotkey Buttons do nothing there. [desktop](../claude-desktop-app/live-checks.md#live-probe-of-a-code-mode-session) | Open `/inbox` in Code mode and screenshot it. |
| 25 | How does a desktop pane or band get focus: click only, or ctrl+x tab and `focus: true` too? Do digit band hotkeys from an empty prompt work? | Try each in Code mode. |
| 26 | Does desktop read `keybindings.json`? | Rebind `pane:close` and try it in Code mode. |
| 27 | Desktop Link rule: https only, or `http://localhost` too? | Draw both in a Code-mode pane; see which is a live anchor. |
| 28 | Does desktop apply `holdToasts`, show `$.ui.toast` and `$.ui.status`, and draw the band's `[-]`? | Pane with `holdToasts` in Code mode, toast from a timer. |
| 29 | Real redraw rate on desktop. | `$.clock.every(16)` with invalidate; count renders per second per surface. |
| 30 | How desktop draws `variant="primary"` and `role="dismiss"`. | Sample Button in Code mode. |
| 31 | With a terminal and desktop attached to one session, which surface fires `onPress`? Do both draw the band at once? | Attach the app to a terminal session, press in each, log `e.surface` and render counts. |
| 32 | Minimum engine for `Client` on desktop, the desktop Link rules, Button `variant`, Button `Text` children, `$.ui.notify`. | Save each build's `index.d.ts` outside the gitignored path and diff them. |
| 33 | What `origin.kind` does a prompt typed in desktop Code mode carry? If it is `sdk`, the inbox ignores it as the person's words (`hooks/register.tsx:isPersonsWords`). | Log `e.origin` from `prompt.submit` to the debug log in a Code-mode session. |
| 34 | Does `$.ui.copy` work on desktop? | Answered: yes, `isCopied: true`. [desktop](../claude-desktop-app/live-checks.md#live-probe-of-a-code-mode-session) |
| 35 | Do `$.prompt.fill`, `suggest`, `read`, `$.ui.selection` and `$.ui.ask` work in Code mode? | A temporary command that calls each and logs results, in a session with its own `CLAUDE_CONFIG_DIR`. |
| 36 | Does `$.process.run` work in Code mode? | Answered: yes, `git` and `gh` ran. [desktop](../claude-desktop-app/live-checks.md#live-probe-of-a-code-mode-session) |
| 37 | Does the desktop app use `~/.claude` (the same store file)? | Compare the store file's modification time after a Code-mode session. File stats only. |
| 38 | Is the inbox's `systemText` above Sonnet's minimum cacheable length? | Log `usage.cache_creation_input_tokens` and `cache_read_input_tokens` from two calls less than 5 minutes apart. |
| 39 | Does `session.detach` with reason `end` fire for desktop, and how much of the 1.5 s bound do the inbox's end hooks use? | Debug-log timing at the end of a Code-mode session. |
| 40 | Does the engine in desktop Code mode honor `cache: true` blocks (2.1.289)? | Same cache-count probe on the desktop engine. |
| 41 | Does `$.store` move with the plugin's origin? What does the hash cover? Does uninstall delete it? | With its own `CLAUDE_CONFIG_DIR` and `CLAUDE_CODE_PLUGIN_DIRS` unset, install `inbox@inbox`, start a session, list `plugins/store/`. Uninstall and list again. |
| 42 | Do `$.tool.register` tools trip the "This reload changes MCP tools" `--force` gate on install or `/reload-plugins`? | Install fresh in a session that already had a turn; read the install summary. |
| 43 | Do synced (`@synced`) plugins load `modules`, in the terminal and in Cowork? | Upload a tiny mod to claude.ai, start `claude --debug`, grep `hooks module <name>@synced`. |
| 44 | Does Cowork or Claude mode run `modules` at all? | Upload the plugin zip to claude.ai, open a local Cowork task, look for a `$.store` write timestamp. |
| 45 | Do the desktop app and the terminal share the plugin cache and `installed_plugins.json`? | Install from the terminal, compare version and path in desktop Manage plugins. |
| 46 | Can a desktop Code-mode user add a marketplace without a terminal? | Look for an add-marketplace control on a clean profile. Check whether a marketplace added in Claude mode's Customize shows in Code mode. |
| 47 | For a relative-path entry, is the version the repo HEAD SHA or the last commit touching the folder? | Local git marketplace with a subfolder entry; commit outside it; `claude plugin update`; compare versions. |
| 48 | What happens to a loaded mod when an update replaces its cache folder mid-session? | Update while a session runs; watch the debug log and whether `/inbox` still works before `/reload-plugins`. |
| 49 | Does `claude plugin update inbox` without `@inbox` work? | Run it and read the exit code and message. |
| 50 | Does background auto-update run in a desktop Code session? | Enable auto-update, push a commit, check a desktop-only user. |
| 51 | Do `userConfig` values reach `register(on, options)` in Code mode? Do `/config` rows show? Can `inbox@inline` be configured with `/plugin configure`? | Scratch mod with an option that has a default; log `options`; run `/config` in Code mode. |
| 52 | Does `/reload-plugins` typed in Code mode reload mod modules? Do monitors start there? | Edit a visible string, type `/reload-plugins`, watch the band. Scratch monitor that prints once. |
| 53 | Does project scope with `extraKnownMarketplaces` load the inbox for a collaborator with no install? | Test repo with those settings, clean `CLAUDE_CONFIG_DIR`, accept trust, check the mod loads. |
| 54 | Does `validate --strict` fail on gating hooks without `.catch`? | `claude plugin validate --strict --json` on a scratch copy with version, author and description set. |
| 55 | Do `disableAllHooks` and `allowManagedHooksOnly` in user settings stop the mod's `classic.*` dispatch too? | Session with its own `CLAUDE_CONFIG_DIR`, `--settings '{"disableAllHooks": true}'`; see whether the band draws and `classic.Stop` runs. |
| 56 | Can one `hooks/hooks.json` carry both `modules` and `hooks`? Does `/hooks` list mod hooks? | `claude plugin validate` on a copy with an added `hooks` key; open `/hooks`. |
| 57 | Does the 10,000-character cap apply to mod-injected context? | Inject 12,000 characters from a scratch mod; inspect what Claude receives. |
| 58 | How does a mod's `classic.Stop` `block` render versus `additionalContext`, in the terminal and Code mode? | Scratch mod returning each. |
| 59 | What do `classic.*` events carry in Code mode, and does `SessionStart` fire before or after `session.attach`? | Log `e` from `classic.SessionStart`, `classic.UserPromptSubmit`, `classic.Stop` in Code mode. |
| 60 | Do project settings hooks run in Code mode without a trust prompt? Does the desktop app register SDK callback hooks? | Fresh untrusted folder with a `.claude/settings.json` SessionStart hook that writes a file. |
| 61 | Does `PermissionRequest` reach mods for sandbox network prompts, and does it fire in Code mode before the app's dialog answers? | Sandboxed `curl` with the mod logging `classic.PermissionRequest` and `classic.Notification`. |
| 62 | Can the pane answer AskUserQuestion through `updatedInput`, in the terminal and Code mode? | Scratch mod that answers a known question. |
