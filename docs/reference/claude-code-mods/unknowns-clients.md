# Unknown, and how to check: clients and admin

Part of [Claude Code mods](../claude-code-mods.md).

This part holds rows 63-135. They mostly concern MCP, Claude mode, sessions, the SDK, IDE extensions, admin policy and costs. [Engine and API](unknowns-engine.md) holds rows 1-62.

| # | Question | Live check |
|---|---|---|
| 63 | Does desktop Code mode render MCP Apps? Does claude.ai/code? | Add an example MCP App server to `claude_desktop_config.json`; ask for it in Claude mode and in a Code-mode session. |
| 64 | Does Claude Code hide `visibility: ['app']` tools from the model? Does Claude chat declare the MCP Apps UI extension at `initialize`? | Point `claude --mcp-config` at the Codex server; look for `inbox_view` in `/mcp` and stream-json `system/init.tools`. Log `initialize` params from a stdio test server. |
| 65 | Do a mod tool and a configured server both named `inbox` collide? | Add a stdio server keyed `inbox` while the mod is loaded; run `/mcp`. |
| 66 | Which description limits apply after 2.1.295, and do any apply to mod tools? | Compare `/context` for a long `$.tool.register` description, a long `alwaysLoad` tool and long server instructions. |
| 67 | What does the desktop app pass in `options.mcpServers`? Is an inbox server missing on the first turn without `alwaysLoad`? | Call an inbox tool on the first turn of a Code session, with and without `alwaysLoad`. |
| 68 | Which session or conversation id, if any, do Claude hosts pass to an MCP server or app? | Log `_meta` on `tools/call` and the App's `hostContext` in desktop chat and Code mode. |
| 69 | Does Claude mode run a Claude Code session that loads local plugins or mods? | Start a Claude-mode task; run `ps -axww -o pid,ppid,args` filtered for `claude-code/`; read `--setting-sources`. Redact paths and ids. |
| 70 | Does the app attach to scheduled-task, Dispatch and project sessions, and to sessions nobody has open? | Logging mod copy; local scheduled task; compare `surfaces()`. |
| 71 | Does the app detach when a session is archived, closed or the app quits? Does archiving fire `session.end`? | Log `session.detach` and `session.end` reasons. |
| 72 | How does a mid-turn correction, a `/btw` side chat, or a mid-turn command reach the mod? | Logging mod in Code mode. |
| 73 | Does the mod draw in SSH sessions, and where does its `$.store` live? | SSH session to a Linux VM with the plugin installed on the remote host. |
| 74 | Where do mod `Link` clicks open in the app, and where does a mod pane dock? Does Cmd+\ close it? Do mod hotkeys collide with app shortcuts? | Click a PR link in the inbox pane; try the keys in Code mode. |
| 75 | Does `/inbox` appear in the app's `/` menu? | Type `/` in Code mode. |
| 76 | Can a mod or the inbox model call the app's `mcp__ccd_*` tools, such as `spawn_task`? | `/mcp` in Code mode. |
| 77 | Does the app keep old engine folders for sessions started before an update? Which engine does a new session use? | List `~/Library/Application Support/Claude/claude-code/` across an update; `/status` in old and new sessions. |
| 78 | Does `claude://code/new?q=…` work without SSH parameters? | `open "claude://code/new?q=test"` on macOS. |
| 79 | Does a phone or web viewer of a Remote Control session see the band or pane? What surface does a browser attach as? | `claude --rc` with the inbox on; open on phone and claude.ai/code; log `session.attach` and any `ui.render` with `e.surface === 'mobile'`. |
| 80 | Server mode: is `isInteractive` false? Does a desktop viewer attach as `desktop` and turn the mod on? | Start `claude remote-control`; connect from the phone, then from the desktop app; log `session.attach` and `surfaces()`; check for a new `s:<id>` key. |
| 81 | Does `/inbox` typed from mobile or web run, and does its reply arrive there? | Type `/inbox` from the phone in a `--rc` session. |
| 82 | Does `$.ui.notify` or the push tool from a mod reach the phone? | Call `$.ui.notify` from a test mod with push enabled. |
| 83 | In a cloud session with a synced test plugin: what do `isInteractive`, `surface`, `surfaces()` report? Where does `$.store` live, and does it survive a reclaim? Does `session.start` fire again after a pause? | Synced test plugin that logs to a file; ask Claude to `cat` it. |
| 84 | Does `/clear` sent from the phone in a `--rc` session raise the events the inbox reloads on? | Log session events. |
| 85 | Does "Connect new sessions to Remote Control" in the desktop app make every Code session visible on the phone? | Check in the app. |
| 86 | Does the mod turn on in a background session, and does it draw when attached? Does an unattended background session run the per-turn call? | `claude --bg "say hi"`, `claude attach <id>`, run `/inbox`; log `isInteractive` and `surfaces()`. |
| 87 | Does a `{ consumed }` delivery start a turn or cost tokens? Do `SendMessage` deny rules block `$.session.send`? | Two throwaway sessions under their own `CLAUDE_CONFIG_DIR`; compare `/cost`. |
| 88 | Does `claude agents --json` start the supervisor, and how fast is it? Does an interactive or desktop session waiting on a permission show `waitingFor`? | `claude daemon status` before and after; time the call; hold a prompt and read `--json`. |
| 89 | After `←` or `/bg`, does the process keep the same session id, and does `classic.SessionStart` fire with `resume`? | Compare `$.session.id()` before with `--json` `sessionId` after. |
| 90 | Is the `ListAgents` listing scoped by `CLAUDE_CONFIG_DIR`? | Run `/list-agents` in sessions under two config dirs. |
| 91 | Do installed plugins, and so installed mods, load in a default `query()` with no `plugins` option? | In a test `CLAUDE_CONFIG_DIR` with the inbox installed, run `query({ prompt: "hi" })` and read `init.plugins`. |
| 92 | Does a `--plugin-dir` hooks module run under `--bare`? | `claude --bare -p "/inbox" --plugin-dir <copy> --output-format stream-json --verbose` on a copy patched to turn on. Read `init.plugins`, `plugin_errors` and stderr. |
| 93 | Will `--bare` becoming the `-p` default affect desktop Code-mode sessions? | Watch the changelog for the flip. Read the app engine's launch flags with `ps` after it. |
| 94 | What does a host send to attach a drawing surface (`ui_attach`), and can a third-party SDK host send it? | Search the `@anthropic-ai/claude-agent-sdk` package's `.d.ts` files for `ui_attach` and `surface`. |
| 95 | Does the desktop app end a session with SIGTERM or by closing stdin? Does the inbox's `session.end` work finish within 1.5 s there? | Close a Code-mode session after a turn. Check whether the `s:<sessionId>` record and the cleared sidebar status were written. |
| 96 | Does `init.plugins` carry `version` at runtime? | `claude -p hi --output-format stream-json --verbose --plugin-dir <copy>` and read the first `system/init` line. |
| 97 | Does the `statusLine` setting render in Code mode, the VS Code panel or mobile? | Set a trivial `statusLine` command that writes a timestamp to a file. Open a session on each surface. |
| 98 | Does a JetBrains chat panel exist, and do mods draw there? | Install the current JetBrains plugin and look for a non-terminal UI. Log `session.attach` there. |
| 99 | Is `session.receive` with `source: "artifact-room"` shipped in 2.1.295? Which page actions produce room events? | On a 2.1.295 terminal session, log `session.receive` events. Publish a throwaway page whose script writes room events. |
| 100 | Can a mod publish an artifact without a model turn? | Search the current types and mods docs for a publish API. Today only the model's `Artifact` tool publishes. |
| 101 | Does a mod-started turn count as "a prompt you type" for the no-prompt artifact publish rule? | Have a test mod submit a prompt with `asUser` that asks for a publish, and watch for a permission prompt. |
| 102 | Is the status line's `session_id` the same id the mod uses for `s:<id>`, across `/clear` and `/resume`? | Echo `session_id` from a status-line script and compare it with `$.session.id()`. |
| 103 | When one conversation is open in the VS Code panel and a terminal, do both inbox instances run the per-turn update, and which write wins? | Open one conversation in both with **Open here anyway**, send one prompt, and compare the saved record. |
| 104 | What widths do JetBrains and VS Code integrated terminals usually have? | Read `bodyColumns` in a render hook at default layouts. |
| 105 | Which engine wrote the local types file, and which version should the type check pin? | Read `index.d.ts:1` before each check run. Record it with the result. |
| 106 | Does host-supplied desktop policy count as "managed settings" and seat the guard for a Pro user in Code mode? | In a Code-mode session, look for `cc-plugin-sec-default` in the debug log and read "Setting sources" in `/status`. |
| 107 | What is `CLAUDE_CODE_ENTRYPOINT` in Code mode, the VS Code panel and the SDK? Can a mod read it with `$.env.get`? | `echo $CLAUDE_CODE_ENTRYPOINT` from Bash in each, plus a temporary `$.env.get` log in a copy. |
| 108 | Does the mod trust gate apply in Code mode, which never shows the trust dialog? | Open a Code-mode session in a never-trusted folder and see whether the band appears. |
| 109 | Can a project's settings `env` set `CLAUDE_CODE_PLUGIN_DIRS`? | Put it in a test repo's `.claude/settings.json`, trust the folder, and check `/plugin` and the debug log. |
| 110 | Is `$.model.complete` refused under `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`? | Run a patched copy under `-p` with the variable set, and watch for the per-turn call. |
| 111 | Does `/cd` into a repo with `disableAllHooks` stop the inbox mid-session? | `/cd` into such a repo and check whether the band stays. |
| 112 | Does `CLAUDE_CODE_PLUGIN_DIR_WATCH` cover folders loaded through `CLAUDE_CODE_PLUGIN_DIRS`? | Edit a file in a mod loaded that way and watch the debug log for a reload. |
| 113 | Do mod calls count against plan limits, and do they show in `/usage`? | On a subscription, read `five_hour` `percentUsed`, force several large `$.model.complete` calls, and read it again. Look for an inbox row in `/usage`. |
| 114 | Which cache lifetime do mod marks get, and can a mod get one hour? | Make one call, wait 6-10 minutes, repeat. A cache read means one hour. Try `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL=1h`. |
| 115 | Which `query_source` do mod calls carry in OTel, and which model answers? | Run with `OTEL_LOG_RAW_API_BODIES=file:<dir>` and read `<dir>/index.jsonl`. |
| 116 | Does a blocked `sonnet` reject, run on the session's model, or substitute an older Sonnet? | In a scratch `CLAUDE_CONFIG_DIR`, set `deniedModels`, then `availableModels`, and call `$.model.complete({ model: 'sonnet' })`. Read the raw-bodies index. |
| 117 | Does thinking count against `maxTokens: 1600` at `effort: 'low'`? | Log `r.usage.output_tokens` across many turns and look for replies cut at the cap. |
| 118 | What does a content-flagged `$.model.complete` resolve to? | In a test repo, send a prompt known to trip the cyber classifier. |
| 119 | Does the desktop app set `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST` or its own model configuration, changing what `sonnet` means in Code mode? | Run a Code-mode session with raw-body logging and read `model` for the inbox's request. |
| 120 | Is the CLI identity block before `request.system` the same across directories, so sessions share the cache? | Run two sessions in different repos within 5 minutes. The second's first call should read the cache. |
| 121 | Does registering the inbox's tools mid-session invalidate the main conversation's cache? | Hot-reload the mod in a long session, then read `Prompt cache (main)` in `/usage` for "likely cause: tool definitions changed". |
| 122 | Does the per-turn prompt land in local transcripts? | Grep the session's JSONL for a unique string from `buildPrompt`. |
| 123 | When did `tool.describe` gain `isDeferred`, and is it honored before 2.1.293? | Check `/context` or the tool list in a 2.1.292 session. |
| 124 | Can a mod's pane pop out into its own desktop window? | Try it in Code mode with the inbox pane open. |
| 125 | Is the mods rollout switch served on telemetry-off, Bedrock, Vertex or Foundry installs? | Run the inbox with telemetry off and read the refusal line. |
| 126 | Does `$.ui.notify` work in the desktop app, and does it do nothing when an API key is set? | Try it on 2.1.295 in the terminal, then in Code mode once the app bundles 2.1.295. |
| 127 | Does a desktop warm start delay `session.start` relative to opening a session? | Log a timestamp at `session.start` and at the first `ui.render` in Code mode. |
| 128 | Could OSC 7501 or the `claude agents --json` `state` field replace part of the inbox's "waiting on you" detection? | Compare `state` values with the inbox's open items across a few sessions. |
| 129 | When is `prompt.context` asked again? The types cache its answer for the session until `$.ui.invalidate`. If the mod turns on late at `session.attach`, does the first message go out without the `inbox:` block? | Log each `prompt.context` call across `/clear`, `/resume` and a Code-mode start. |
| 130 | Does a slow `publishStatus` (`$.process.run` with a 5,000 ms timeout) inside `session.end` cut the hook before the `/clear` and `/resume` reset runs? | Log `next.budget` at the start of `session.end` during `/clear`, with `herdr` slowed. |
| 131 | After the app detaches, does the headless process keep running, so the inbox's poll and tick loops keep going? Should the mod hook `session.detach`? | Close the window or switch sessions; log `session.detach` and check whether ticks continue. |
| 132 | Can a local session receive `session.receive` GitHub events, or only relay-backed sessions? | Subscribe a PR in a local session and log `session.receive`. |
| 133 | Does the inbox turn on in a `claude --bg` session later opened with `claude attach`, or in one opened with `--desktop` or `--remote-control`? | Start each way with a logging copy and check whether the band draws. |
| 134 | Does a desktop Code-mode session reload the mod on save without `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`? | Edit a file in the working copy during a Code-mode session and watch for the reload line. |
| 135 | Can `plugin.json` declare a minimum engine version? | Neither the mods reference "Files" table nor `claude plugin validate --help` names one. Ask the platform team, or search the manifest schema. |
