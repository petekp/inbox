# Sources

Part of [Codex plugins and the Codex app](../codex-plugins.md).

## Public docs, fetched 2026-10-08

learn.chatgpt.com (Codex use, hooks, config, enterprise, app-server):

| URL | Covers |
| --- | --- |
| https://learn.chatgpt.com/docs/hooks | Events, matchers, input, output, background hooks, trust, plugin hooks, managed hooks |
| https://learn.chatgpt.com/docs/plugins | Surfaces, plugin parts, CLI browser, permissions, removal, directory tabs |
| https://learn.chatgpt.com/docs/build-plugins | ChatGPT-side plugin guide, sharing permissions |
| https://learn.chatgpt.com/docs/build-skills | Skills availability and auto-reload |
| https://learn.chatgpt.com/docs/skills-and-plugins | Overview with duplicate "Build plugins" links |
| https://learn.chatgpt.com/docs/extend/mcp | MCP server support, stdio keys, approval modes, plugin servers, ChatGPT web |
| https://learn.chatgpt.com/docs/config-file/config-basic | Precedence, feature flags |
| https://learn.chatgpt.com/docs/config-file/config-advanced | Project config limits, notify, history, project instructions, OTel, desktop keys |
| https://learn.chatgpt.com/docs/config-reference | Every config and requirements key |
| https://learn.chatgpt.com/docs/config-file/environment-variables | Public environment variables |
| https://learn.chatgpt.com/docs/feature-maturity | Maturity labels |
| https://learn.chatgpt.com/docs/agent-approvals-security | Approvals, sandbox, automatic review, network proxy |
| https://learn.chatgpt.com/docs/sandboxing | What the sandbox covers |
| https://learn.chatgpt.com/docs/permission-modes | Desktop permission modes |
| https://learn.chatgpt.com/docs/agent-configuration/agents-md | AGENTS.md discovery |
| https://learn.chatgpt.com/docs/enterprise/plugin-management | Workspace import, Desktop only |
| https://learn.chatgpt.com/docs/enterprise/managed-configuration | requirements.toml, marketplace restrictions, command identity |
| https://learn.chatgpt.com/docs/enterprise/apps-and-connectors | "Plugin controls", capability chain, cloud orchestration |
| https://learn.chatgpt.com/docs/app | ChatGPT desktop app |
| https://learn.chatgpt.com/docs/environments/modes | Local, Worktree, Cloud |
| https://learn.chatgpt.com/docs/glossary | Chat, thread, turn, session, finding |
| https://learn.chatgpt.com/docs/notifications | Alerts, Activity view, pets |
| https://learn.chatgpt.com/docs/reference/settings | Settings sections, follow-up behavior |
| https://learn.chatgpt.com/docs/reference/commands | Deep links and shortcuts |
| https://learn.chatgpt.com/docs/prompting | Steering and queuing |
| https://learn.chatgpt.com/docs/developer-commands?surface=cli | CLI commands and flags (tables rendered client-side) |
| https://learn.chatgpt.com/docs/non-interactive-mode | `codex exec` |
| https://learn.chatgpt.com/docs/app-server | app-server protocol |
| https://learn.chatgpt.com/docs/mcp-server | Removal of `codex mcp-server`; app-server status |
| https://learn.chatgpt.com/docs/codex-sdk | TypeScript and Python SDKs |
| https://learn.chatgpt.com/docs/changelog | Release notes, CLI 0.162.0, desktop 26.707 and 26.727 |
| https://learn.chatgpt.com/docs/whats-new | Merge into the ChatGPT app, hooks GA |
| https://learn.chatgpt.com/docs/whats-new/devday-2026 | Plugin Extensions, MCP Events, dots |
| https://learn.chatgpt.com/docs/dots | dots |
| https://learn.chatgpt.com/docs/llms.txt | Docs index |

developers.openai.com/plugins (packaging, submission, UI):

| URL | Covers |
| --- | --- |
| https://developers.openai.com/plugins/build/plugins | "Package your plugin": formats, marketplaces, cache, hooks, enabling, workspace publishing |
| https://developers.openai.com/plugins/concepts/plugins | "Plugin architecture" |
| https://developers.openai.com/plugins/deploy/submission | "Upload and submit your plugin": field tables |
| https://developers.openai.com/plugins/deploy/submission-errors | Upload errors and warnings |
| https://developers.openai.com/plugins/deploy/connect-chatgpt | "Connect and test your plugin": tunnels |
| https://developers.openai.com/plugins/guides/submit-claude-plugin | "Submit your Claude Code plugin to OpenAI" |
| https://developers.openai.com/plugins/plugin-guidelines | Review rules for tools, names, testing |
| https://developers.openai.com/plugins/build/chatgpt-ui | "Add UI to your MCP server" |
| https://developers.openai.com/plugins/reference | Tool and resource `_meta`, `window.openai`, tool results |
| https://developers.openai.com/plugins/build/extensions | "Plugin Extensions": entrypoints |
| https://developers.openai.com/plugins/build/mcp-server | Server instructions, annotations, skills import |
| https://developers.openai.com/plugins/concepts/mcp-server | Transport |
| https://developers.openai.com/plugins/build/mcp-events | MCP Events |
| https://developers.openai.com/plugins/concepts/ui-guidelines | UI guidelines |
| https://developers.openai.com/plugins/build/app-quickstart | Quickstart |
| https://developers.openai.com/plugins/deploy/troubleshooting | Troubleshooting |
| https://developers.openai.com/plugins/llms.txt | Docs index |

## Specs, schemas and source

| Source | Covers |
| --- | --- |
| https://agent-plugins.org/schemas/1.0.0/plugin.schema.json | Portable manifest schema (cited, not read in full) |
| https://agent-plugins.org/schemas/1.0.0/mcp.schema.json | Portable `mcp.json` schema, stdio entry |
| SPEC, TSR, BB (openai/mcp-extensions at `7e1be49`) | OpenAI MCP extensions: entrypoints, display modes, `ui/message`, model context, settings, deep links |
| https://modelcontextprotocol.io/extensions/apps/overview | MCP Apps overview and client list |
| APPSPEC (ext-apps at `82221c0`) | Stable MCP Apps spec `2026-01-26` |
| APPSDRAFT (ext-apps at `c55a3a2`) | Draft MCP Apps spec |
| https://modelcontextprotocol.io/extensions/client-matrix | Community host matrix |
| GH/codex-rs/features/src/lib.rs, legacy.rs | Feature flags and stages |
| GH/codex-rs/hooks/src/declarations.rs, hooks/schema/generated/ | Hook trust keys, hook input and output schemas |
| GH/codex-rs/cli/src/main.rs, cli/src/queue_cmd.rs, tui/src/session_queue_commands.rs | `codex queue` |
| GH/codex-rs/app-server-protocol/ (src/protocol/common.rs, v2/thread.rs, v2/hook.rs, v2/turn.rs, schema/typescript/v2/) | app-server methods and types |
| GH/codex-rs/app-server/src/request_processors/thread_queue_processor.rs, mcp_processor.rs | Queue rules, `mcpServer/tool/call` `_meta` |
| GH/codex-rs/app-server/tests/suite/v2/thread_queue.rs | Queue behavior tests |
| GH/codex-rs/app-server/README.md | Read state, attachments, plugins, desktop as a client |
| GH/codex-rs/core/src/mcp_tool_call.rs, turn_metadata.rs, responses_metadata.rs, codex_thread.rs | `_meta` on model tool calls |
| GH/codex-rs/protocol/src/mcp.rs, items.rs | MCP Apps extension id, item types |
| GH/sdk/python/src/openai_codex/generated/notification_registry.py | Python SDK registers `thread/queue/changed` |
| GH/docs/config.md | Lifecycle hooks note (stale) |

## This repo

`docs/plans/codex-plugin.md`,
`codex/README.md`, `codex/plugin/.codex-plugin/plugin.json`,
`codex/plugin/.mcp.json`, `codex/plugin/hooks/hooks.json`,
`.agents/plugins/marketplace.json`, `.claude-plugin/plugin.json`,
`codex/src/{server,server-main,server-handler,hook,state,update,transcript,texts,tab}`.

## Not authoritative

Third-party posts say `codex queue` shipped in CLI 0.149.0 and disagree on
`--thread` vs `--session`. The 0.160.1 `--help` output settles it: `--thread`.
