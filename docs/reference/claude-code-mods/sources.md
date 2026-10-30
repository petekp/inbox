# Sources

Part of [Claude Code mods](../claude-code-mods.md).

Every page was read on 2026-10-08. Page URLs below were checked to resolve that day. Unless noted, `…` stands for `https://code.claude.com/docs/en/`.

## Mods

| Key | URL | What it covers |
|---|---|---|
| O | …/plugins/mods/overview | What a mod is, where mods run and draw, version floors, turning mods off, built-in mods |
| A | …/plugins/mods/admin | The guard, managed policy for mods, what counts as an organization's mod, policy mods |
| R | …/plugins/mods/reference | Files, events table, `$` methods, elements, render sites, limits, settings and env vars ("as of v2.1.290") |
| E | …/plugins/mods/events | How a hook handles an event, `classic.*` events |
| IF | …/plugins/mods/interface | Panes, bands, width rules, desktop `Link` rules, keeping state, saving from several sessions |
| API | …/plugins/mods/api | Calling a model, files, processes and network, registering commands and tools, `isDeferred` |
| GA | …/plugins/mods/gallery | Element examples |
| C | …/plugins/mods/create | Tutorial, hot reload, Claude-written mods and the enable question |
| TT | …/plugins/mods/test | `claude plugin test` and the testing kit |
| TS | …/plugins/mods/troubleshoot | Refusal messages, where error lines go, the rollout switch |
| G | https://github.com/anthropics/claude-code/tree/main/mods/sec-default | The built-in guard's public source (`hooks/register.ts`, `README.md` "The rows"), read at commit `684800b` |
| T | `.claude-plugin/types/claude-code/index.d.ts` (local, gitignored) | Engine types written by the engine that last loaded the mod. Cited by symbol. |
| skill | The built-in `cc-plugin-plugin-authoring` skill text (local) | How Claude writes and loads mods |

## Hooks, settings and permissions

| Key | URL | What it covers |
|---|---|---|
| H | …/hooks | Settings-hook events, inputs, outputs, timeouts, context injection, workspace trust |
| HG | …/hooks-guide | Hook recipes, notification timing in SDK hosts |
| P | …/permissions | Rule order, mods and deny rules, trust, what runs before trust |
| SET | …/settings | Settings files and cloud sessions |
| SETR | …/settings-reference | Every settings key, including `disableAllHooks`, `allowManagedHooksOnly`, `enabledPlugins`, `prependPlugins`, `parentSettingsBehavior` |
| ENVV | …/env-vars | Environment variables, including `CLAUDE_CODE_PLUGIN_DIRS`, `CLAUDE_CODE_PLUGIN_DIR_WATCH`, `CLAUDE_CODE_SESSION_ID` |
| KB | …/keybindings | Keybinding contexts and actions |
| CLI | …/cli-reference | CLI flags: `--bare`, `--safe-mode`, `--plugin-dir`, `--plugin-url` |
| tools-reference | …/tools-reference | Built-in tools |

## Plugins

| Key | URL | What it covers |
|---|---|---|
| PL | …/plugins | Plugins overview |
| PLD | …/plugins/loading | Loading, caching, `--plugin-dir`, reload |
| PI | …/plugins/install | Installing and updating |
| PC | …/plugins/components | Components, plugin `settings.json` keys, reach to claude.ai and Cowork |
| MF | …/plugins/manifest-reference | `plugin.json` fields, `userConfig` |
| PCLI | …/plugins/cli-reference | `claude plugin` commands |
| PCR | …/plugins/create | Creating a plugin |
| PS | …/plugins/security | Plugin security |
| PO | …/plugins/org | Organization plugin controls, when each surface applies the keys |
| PH | …/plugins/host-marketplace | Hosting a marketplace |
| PP | …/plugins/publish | Publishing |
| PT | …/plugins/troubleshooting | Plugin troubleshooting |
| MR | …/plugins/marketplace-reference | `marketplace.json` |
| PM | …/plugins/measure | Plugin context cost, `claude plugin details`, analytics |
| PS-claude | https://claude.com/docs/plugins/platform-support | Which plugin parts reach Claude Code, Cowork and claude.ai |

## MCP

| Key | URL | What it covers |
|---|---|---|
| MCP | …/mcp | MCP servers, tool names, limits, tool search, channels, elicitation |
| MCP-quickstart | …/mcp-quickstart | Adding a server |
| MA-quickstart | https://claude.com/docs/connectors/building/mcp-apps/quickstart | MCP Apps: Claude Code calls an app tool as text |
| MA-getting-started | https://claude.com/docs/connectors/building/mcp-apps/getting-started | MCP Apps in Claude Desktop, `ui.domain` |
| MA-design-guidelines | https://claude.com/docs/connectors/building/mcp-apps/design-guidelines | Display modes, mobile |
| MA-instance-supersession | https://claude.com/docs/connectors/building/mcp-apps/instance-supersession | One iframe per tool call |
| MA-external-links | https://claude.com/docs/connectors/building/mcp-apps/external-links | Link confirmation |
| MA-troubleshooting | https://claude.com/docs/connectors/building/mcp-apps/troubleshooting | Large results |

## Desktop app

| Key | URL | What it covers |
|---|---|---|
| desktop | …/desktop | Tabs, environments, engine copy and version, sessions, panes, MCP, managed settings |
| desktop-wsl | …/desktop-wsl | WSL sessions (no plugins) |
| desktop-linux | …/desktop-linux | Linux install and updates |
| desktop-quickstart | …/desktop-quickstart | First run |
| desktop-scheduled-tasks | …/desktop-scheduled-tasks | Scheduled tasks |
| deep-links | …/deep-links | `claude-cli://` links |
| claude-projects | …/claude-projects | Projects and "Waiting on you" |
| claude-apps-gateway | …/claude-apps-gateway | Gateway deployments; Desktop tabs on embedded Claude Code sessions |
| network-config | …/network-config | Network hosts, MCP widget origins |
| feature-availability | …/feature-availability | Features by provider |

## Other clients and sessions

| Key | URL | What it covers |
|---|---|---|
| RC | …/remote-control | Remote Control |
| MOB | …/mobile | The mobile app |
| WEB | …/claude-code-on-the-web | Cloud sessions |
| QS | …/web-quickstart | Cloud session quickstart |
| ENV | …/cloud-environments | What carries over to cloud sessions, the GitHub proxy |
| SE | …/sessions | Session ids, storage, resume, branch |
| XSM | …/cross-session-messaging | Messages between sessions |
| CH | …/channels | Channels |
| CHR | …/channels-reference | Building a channel |
| AV | …/agent-view | Agent view and `claude agents --json` |
| HL | …/headless | `claude -p`, `--bare`, stream-json, exit behavior |
| SDK-overview | …/agent-sdk/overview | What the Agent SDK is |
| SDK-features | …/agent-sdk/claude-code-features | `settingSources`, what loads |
| SDK-plugins | …/agent-sdk/plugins | Loading plugins in the SDK |
| SDK-hooks | …/agent-sdk/hooks | SDK callback hooks, timeouts, notifications |
| SDK-ts | …/agent-sdk/typescript | TypeScript SDK reference, `system/init`, `readMcpResource` |
| SDK-mcp | …/agent-sdk/mcp | MCP in the SDK, connection timing |
| SDK-custom-tools | …/agent-sdk/custom-tools | In-process tools |
| VSC | …/vs-code | The VS Code extension |
| JB | …/jetbrains | The JetBrains plugin |
| PLAT | …/platforms | Where Claude Code runs |
| SL | …/statusline | The `statusLine` setting |
| ART | …/artifacts | Artifacts |

## Costs and data

| Key | URL | What it covers |
|---|---|---|
| COST | …/costs | Billing, limits, `/usage`, background usage |
| MC | …/model-config | Model aliases, allowlists, effort, thinking, fallback |
| PCACHE | …/prompt-caching | Cache lifetimes, scope, invalidation |
| PCACHE-API | https://platform.claude.com/docs/en/build-with-claude/prompt-caching | Minimum cacheable length, breakpoints |
| PRICE | https://platform.claude.com/docs/en/about-claude/pricing | Model and cache prices |
| DU | …/data-usage | Training, retention, telemetry |
| MU | …/monitoring-usage | OpenTelemetry metrics and raw API bodies |

## Changes

| Key | URL | What it covers |
|---|---|---|
| CL | …/changelog | Release notes, generated from CHANGELOG.md on GitHub. Anchors look like `#2-1-295`. |
| WN | …/whats-new | Weekly digests, Week 13 to Week 37 |
| WN-33 to WN-37 | …/whats-new/2026-w33 to …/whats-new/2026-w37 | The digests cited here |

## Local sources

- This repo at `55ab122`: `hooks/register.tsx`, `hooks/ledger.ts`, `hooks/prs.ts`, `hooks/hooks.json`, `.claude-plugin/plugin.json`, `tests/hooks.test.ts`, `scripts/check.sh`, `README.md`, `ROADMAP.md`, `AGENTS.md`.
- Live commands on 2026-10-08: `claude --version`, `claude plugin list`, `claude plugin details inbox`, `claude plugin validate`, `claude plugin test`, `claude agents --json`, `ps`, and file listings of `~/.claude/plugins/store/` and `~/Library/Application Support/Claude/`.
