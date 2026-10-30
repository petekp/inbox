# Where sources disagree: clients and admin

Part of [Claude Code mods](../claude-code-mods.md).

This part holds rows 59-110. They mostly concern MCP, other clients, sessions, admin policy and costs. [Engine and API](disagreements-engine.md) holds rows 1-58 and 111-119.

| # | Conflict | Trust | Why |
|---|---|---|---|
| 59 | MCP description cut. MCP page: 2,048 characters for tool descriptions and server instructions. Changelog 2.1.295: 16,384 for descriptions loaded through tool search. | Changelog, for deferred descriptions | Newer. Server instructions and upfront descriptions: unknown. |
| 60 | Connector protocol default. MCP page: 2026-07-28 only where feature flags are fetched. Changelog 2.1.295: default also without flags. | Changelog | Newer. |
| 61 | 16 MB limit. MCP page lists HTTP and SSE only. Changelog 2.1.295 adds WebSocket as "the limit the other transports already have". | Changelog | |
| 62 | MCP Apps in the Code tab. Quickstart: "Claude Code … doesn't render the UI", and the platform page counts the Code tab as Claude Code. Network page: "Claude Desktop … render[s] some tool results … as interactive widgets" without naming modes. | Unknown | Check live. |
| 63 | MCP quickstart lists a "Claude Code desktop app" and a separate "Claude Desktop chat app". Desktop pages describe one app with tabs. The app now has two modes. | The app | The quickstart is outdated. |
| 64 | Oversized MCP result. MCP page: replaced "with a message". SDK page: "with an error message". | Unknown | |
| 65 | MCP connect timers. MCP page calls a 5 s cap "the standard 5-second connect timeout". Quickstart and SDK call the 30 s `MCP_TIMEOUT` the connection timeout. | SDK page | It names both timers. |
| 66 | Which plugin parts Claude mode loads. The platform-support page says Chat ignores hooks, mods and local MCP. | Platform-support page | |
| 67 | Cowork and Claude Code. Desktop docs say Cowork sessions run Claude Code (OTel passed "to Claude Code"; "Claude Code never fetches admin-console settings" there). | Docs, if Claude mode includes Cowork | A locally installed mod still would not load there, since Cowork plugins come from claude.ai. |
| 68 | "Desktop is interactive only" [desktop] versus a headless stream-json child (live `ps`), which the types say starts with `isInteractive: false` (types; not logged live). | Both | Different meanings: user experience versus engine flag. |
| 69 | SSH and mods. Desktop docs: SSH supports plugins. The mods table excludes only WSL. | Docs imply it draws | Neither says it outright. Check live. |
| 70 | Plugins in cloud sessions. The carry-over table and settings page: no user or repo plugin loads. The changelog describes synced plugins that load, run SessionStart hooks and connect MCP servers, and a fix for a mod's `session.receive` hook in cloud sessions. | Both | The table omits the synced path. |
| 71 | No `web` surface. claude.ai/code is a Remote Control client, but `RenderSurface` has no web value. No page says how a browser viewer attaches. | Unknown | |
| 72 | Desktop as a Remote Control viewer. The Remote Control page lists Claude Desktop as a viewer; the mods table's Remote Control row names only claude.ai and mobile. | Unknown | Whether it attaches as `desktop` decides whether the inbox turns on. |
| 73 | "Cloud sessions" vs "remote" in identifiers (`allow_remote_sessions`, `--remote`, `CLAUDE_CODE_REMOTE`, `/remote-env`). | Docs | Old names persist in identifiers. |
| 74 | Desktop session list. Sessions page: the desktop app keeps "their own session list". Live: desktop Code sessions show in `claude agents --json` and `ListAgents` and store transcripts in `~/.claude/projects`. | Live | "Own list" holds only for the resume picker. |
| 75 | Agent view vs `--json`. The TUI hides interactive sessions until backgrounded; `--json` lists "every live session". | Both | The TUI list is a subset. |
| 76 | Mod messaging. Types give mods `$.session.send` and `session.receive`; the messaging page describes only model-driven `SendMessage` and `ListAgents`. | Types | |
| 77 | `ROADMAP.md` says the store keeps each session's ledger but has no liveness. `claude agents --json` is the documented liveness source and is not mentioned in repo plans. | Docs | |
| 78 | Desktop and `-p`. Changelog 2.1.260: "`-p --resume`/`--continue` (as used by the desktop app)". Live `ps` on 2026-10-08: the app's engine runs with stream-json flags and no `-p`. | Live | Matters for the `--bare` default flip. |
| 79 | Installed plugins in SDK sessions. SDK plugins page implies a CLI-installed plugin must be passed by path. Headless page: `-p` loads installed plugins unless `--bare`. The `settingSources` table never lists installed plugins. Mods overview: hooks run in the Agent SDK. | Unknown | Live check in "Unknown". |
| 80 | `--bare` and `--plugin-dir` mods. Headless page: `--bare` still loads `--plugin-dir`. Mods overview and create page: `--bare` stops mods. Refusal message names only "installed plugins that are not managed". | Unknown | Inference: an `@inline` hooks module may still load. |
| 81 | `system/init` plugin `version`. TS SDK changelog 0.3.214 says entries include it. The TS reference type shows only `name` and `path`. | Changelog | Check at runtime. |
| 82 | SDK `capabilities` table lists four values. The same page requires `mcp_read_resource_v1` and `mcp_tool_ui_meta_v1`. | Page body | The table is stale. |
| 83 | SDK plugins page omits mods, hooks modules, `skipMcpDiscovery` and `pluginDelivery: 'initialize'` (TS changelog 0.3.261, also absent from the TS reference). | Changelog and types | The page is incomplete. |
| 84 | Desktop as an SDK host. SDK pages never say so; only the changelog does (2.1.208, 2.1.260, 2.1.280, 2.1.282). The mods table marks "`claude -p` and the Agent SDK" as drawing nothing and the Code tab as drawing. | Both | The difference is the `ui_attach` surface declaration, described only in the types. |
| 85 | `--bare` skip list. headless#examples names "hooks, plugins, auto memory, or `CLAUDE.md`". #start-faster-with-bare-mode adds skills, commands, subagents and MCP servers. | Fuller list | Incomplete, not contradictory. |
| 86 | Types on `vscode`. `Mounted` says the `vscode` tables "lack `Input` and `Client`". The `vscode` element table includes `Input`. Seen in 2.1.294 and 2.1.295 types. | Unknown | One of the two is stale. |
| 87 | Desktop mode names, third source. claude-apps-gateway: Desktop "runs its Cowork and Code tabs, plus the Chat tab when you enable it, on embedded Claude Code sessions". | Unknown | Gateway builds run Claude Code in Cowork and Code. |
| 88 | Artifacts page vs live tool. Page: "Single page: Relative links do not resolve" and "No backend: An artifact is a static page". Live `Artifact` tool: multi-file `files`, a per-artifact database, viewer identity, "depending on what is enabled for this person". | Live tool, per account | |
| 89 | Artifact surfaces. Page names "Claude Code CLI, or the Claude desktop app". Changelog 2.1.268 adjusts "[VSCode] … artifact permission prompts" and gives Cowork the Artifact tool. | Changelog | The page omits VS Code and Cowork. |
| 90 | Artifact surface version. "Requires Claude Code v2.1.281 or later" sits after the remote-control sentence. Unclear whether it covers all artifacts. | Unknown | Inference: remote-control only, since `/artifacts` needs 2.1.208. |
| 91 | JetBrains panel. JetBrains page describes only the terminal CLI. Changelog 2.1.281 says "VS Code and JetBrains panels". | Unknown | Matters because the mods table promises drawing for "the JetBrains plugin". |
| 92 | Remote Control hosts. Platforms page: "CLI, Desktop, or VS Code". Changelog 2.1.273 mentions Remote Control "attached to a … JetBrains session". | Changelog | JetBrains is the CLI, so it is covered in practice. |
| 93 | Status line and mods. The status line page describes one user-set line. The mods interface map shows mods adding "a status line under the prompt" (`$.ui.status`). Neither page mentions the other. | Unknown | How the two share a row is not documented. |
| 95 | The SDK `readMcpResource()` is "*Alpha.*" on the TS reference. The MCP Apps pages describe the `ui://` flow as stable for hosts. | Both | Different products: SDK API status, not the protocol. |
| 96 | Host allow rules. permissions#settings-precedence: hosts can supply managed policy "including permission allow rules unless the admin sets the `allowManaged*Only` locks". settings-reference#parentsettingsbehavior: host settings apply "still filtered to restrictive values". | Unknown | Allow rules are not restrictive. |
| 97 | `CLAUDE_CODE_PLUGIN_DIR_WATCH`. mods/reference documents only `1`. env-vars also documents `0` (off everywhere). | env-vars | The reference is incomplete. |
| 98 | Undocumented variables. `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_EXECPATH`, `CLAUDE_CODE_SESSION_ATTENDED`, `CLAUDE_PLUGIN_DATA` are set live and have no env-vars row. `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` is named in mods/admin only. | Live | |
| 99 | `strictPluginOnlyCustomization.hooks` "keeps running plugin hooks" and never mentions mods. | Unknown | |
| 100 | `prependPlugins` scope. settings-reference: managed lists skip a plugin that isn't the org's. mods/admin says without qualification that a cache-copied plugin's mod is skipped. | Unknown | Whether a user's own list on an unmanaged machine can name `inbox@inbox` is not stated. |
| 101 | `tool.check` power. Types: "A hook may answer any verdict in either direction". Docs: deny rules hold over a mod on managed or Team/Enterprise machines. | Both | The engine allows; the guard enforces. Reading only the types misleads. |
| 102 | Blocked model. Types: `$.model.complete` rejects. model-config: a background request naming a `deniedModels` model "runs on the session's model instead". Allowlists and org restrictions substitute "the newest version of the family". | Unknown | Handle all three. |
| 103 | Cache lifetime. costs: the lifetime "is an hour on a subscription". prompt-caching: the "everything else" bucket gets five minutes. Types: mod marks last five minutes. | prompt-caching and types | costs describes only the main conversation. |
| 104 | Plugin cost tools. plugins/measure: hooks have "no model context cost". Live `plugin details inbox`: ~0 tokens. The mod adds about 1,350 tokens per request and a per-turn call (`README.md:67`). | README measurement | The measure page does not cover mods. |
| 105 | "Always uses Sonnet" (`ROADMAP.md:29`, AGENTS.md "Sonnet call"). The alias moves by provider, version, env var and allowlist. | model-config | Repo measurements are not dated by model. |
| 106 | AGENTS.md test recipe vs the shipped call. The recipe runs `claude -p --model sonnet`, a main-conversation request (1h cache on a subscription, default `medium` effort). The shipped call uses `effort: 'low'`, `maxTokens: 1600` and five-minute marks. | Code | Trials do not reproduce the shipped cost or behavior exactly. |
| 107 | Content-flag fallback. model-config: a flagged Sonnet 5.5 request re-runs on Sonnet 5 by default, and subagents always re-run. The types say nothing for `$.model.complete`. | Unknown | |
| 108 | Doc examples use older models: costs shows `claude-sonnet-4-6`; monitoring-usage shows `claude-sonnet-5`. | model-config | Cosmetic. |
| 109 | What's-new stops at Week 37 (v2.1.269). The changelog runs to 2.1.295. No digest covers the mods launch. | Changelog | The digests are about four weeks behind. |
| 110 | `keybindingFlavor`. Week 34 says to set it to `'readline'`. Week 36 says it "no longer has any effect". | Week 36 | Week 34 is stale. |
