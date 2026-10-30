# MCP and MCP Apps, as they affect the inbox

Part of [Claude Code mods](../claude-code-mods.md).

MCP (Model Context Protocol) is how Claude Code connects to tool servers. An **MCP App** is an MCP tool that names a UI resource (a `ui://` HTML page) for a host to render. The Codex plugin draws its Inbox tab this way.

## MCP Apps in Claude clients

- Claude Code is a text-only MCP Apps client: "Rendering the UI takes a host that supports MCP Apps, such as the Claude desktop app. Claude Code calls the tool as text and doesn't render the UI." [MA-quickstart#see-the-ui-render-in-claude]
- "MCP Apps UI resources … don't appear in the `@` suggestions or in the resource list tool's results … Reading a UI resource by its URI still works." Since 2.1.281. [MCP#reference-mcp-resources; CL#2-1-281]
- When an app tool returns `structuredContent`, "the `tool_result` Claude receives is that JSON object as a string … rather than your `content` text." [MA-quickstart] The SDK says the same for in-process tools. [SDK-custom-tools#return-structured-data]
- "Claude Desktop and claude.ai also render some tool results inside a conversation as interactive widgets … Those widgets load from generated subdomains of `claudemcpcontent.com`". [network-config#desktop-and-claude-ai]
- Desktop chat renders MCP Apps from a local stdio server in `claude_desktop_config.json`, after "Allow" or "Always allow". [MA-getting-started#try-an-example-mcp-app-in-claude-desktop]
- A server added by URL on claude.ai or in the app is reached "from Anthropic's infrastructure over the internet, so a `localhost` address isn't reachable that way." [MA-quickstart]
- Display: "an inline card, an inline carousel, or a full screen view"; protocol modes `inline`, `fullscreen`, `pip`. "The host also caps inline height and clips content that exceeds it." "No floating panels". [MA-design-guidelines#display-modes]
- "Each time Claude calls a tool that renders an MCP App, Claude mounts a separate iframe in the conversation. No host API unmounts earlier instances when a newer one appears". Widgets from one connector share an origin, so `BroadcastChannel` reaches across them. [MA-instance-supersession]
- A widget can call its server's tools with `app.callServerTool`. [MA-quickstart#add-the-ui-to-the-tool]
- Mobile renders apps in a native WebView, and "users must add a connector on web or desktop before it appears on mobile." [MA-design-guidelines#mobile-guidelines]
- `ui.domain` for Claude is "the first 32 hex characters of the SHA-256 of your server URL, followed by `.claudemcpcontent.com`." Links from locally configured servers always show a confirmation modal. [MA-getting-started#set-ui-domain-for-claude; MA-external-links]
- Claude chat: a tool result over about 150,000 characters, with the code sandbox on, is written to the sandbox filesystem "so it never hydrates." [MA-troubleshooting#fix-common-problems]
- TS Agent SDK `readMcpResource(serverName, uri)` (alpha, 0.3.280+) "Reads one MCP Apps `ui://` resource … so your application can render a tool's widget". "The contents are untrusted third-party HTML, so render them in a sandbox." [SDK-ts#query-object]
- Inference: a Claude-mode inbox would be an inline card per tool call, not a persistent tab like Codex's `entrypoints: [{type:'thread'}]`. Whether the desktop Code mode renders MCP Apps is unverified; the quickstart's "Claude Code" includes the Code tab per the platform-support page.
- No page says Claude Code hides `visibility: ['app']` tools from the model, or that Claude hosts declare a UI extension at `initialize`. The SDK passes `ui.visibility` through `McpServerStatus`. [SDK-ts#mcpserverstatus] So the Codex server's `inbox_view` and `inbox_press` may reach Claude as ordinary tools if loaded in Claude Code.

## Where an MCP server reaches

| Path | Reaches | Source |
|---|---|---|
| Plugin-bundled local (stdio) server | Claude Code; Cowork "when the Cowork session runs on your computer"; "not on claude.ai" | [PC#reach-users-on-claudeai-and-cowork; PS-claude] |
| Plugin-bundled remote server | Claude Code; Chat after the user connects it on the plugin's Connectors tab | [PS-claude] |
| `claude_desktop_config.json` | "both the Desktop chat surface and local Code tab sessions". "The standalone CLI does not read `claude_desktop_config.json`." In the Code tab it wins over a same-named `~/.claude.json` or `.mcp.json` entry. | [desktop#mcp-servers-from-the-claude-desktop-chat-app] |
| Desktop connectors | "the desktop app registers the connectors as in-process `type: "sdk"` servers, and no MCP setting or `managed-mcp.json` reaches them" | [MCP#how-connectors-reach-claude-code] |

- Inference: one `claude_desktop_config.json` entry is the cheapest path into both desktop modes. A local stdio inbox can't reach web or mobile.
- First turn in an SDK host: when `options.mcpServers` is empty or holds only SDK servers, the first turn waits up to 2 seconds; with tool search on, only for pending servers with `alwaysLoad: true`. Settings-file and plugin servers "commonly show `pending`". [SDK-mcp#connection-timing] Inference: an inbox MCP server may be missing on a Code-mode first turn unless it sets `alwaysLoad: true`.

## Tool names

| How the tool is added | Name |
|---|---|
| Mod `$.tool.register` | `mcp__inbox__<name>` (live; server instructions read "Tools registered by the inbox plugin through $.tool.register.") [T: `tool.register`] |
| Plugin-bundled server | `mcp__plugin_<plugin>_<server>__<tool>`; server `plugin:<plugin>:<server>`. "A hook matcher written against the bare server key … never fires for a plugin-bundled server." [MCP#plugin-provided-mcp-servers] |
| Configured server | `mcp__<server>__<tool>` [SDK-mcp] |

- Inference: a configured server keyed `inbox` could collide with the mod's `mcp__inbox__*`. Behavior unknown. `inbox` is not a reserved name (reserved: `workspace`, `claude-in-chrome`, `computer-use`, `Claude Preview`, `Claude Browser`). [MCP#configuration-warnings]
- Changelog 2.1.295: the permission-prompt status in Remote Control, claude.ai and the desktop app now names an MCP tool "by its server and readable name instead of its `mcp__server__tool` identifier". [CL#2-1-295]

## Mods and MCP

- `$.mcp.call(server, tool, args)` uses "the engine's own connection and credentials" with "No permission prompt". `McpToolResult` carries `content`, `isError` and `structuredContent?` "when its tool declares an output schema". `$.mcp.connect(server)` works for servers in the plugin's own manifest; the name is "usually `plugin:<plugin>:<server>`". No `$.mcp` call reads a resource. [T: `mcp`]
- `McpServerProvenance.source`: `sdk | plugin | user | project | local | dynamic | managed | enterprise | claudeai | agent`; `plugin` means "a server a plugin ships or registers at runtime". [T]

## Limits and behavior

- Tool search is on by default; only names and server instructions load up front. "Claude Code truncates each tool description and each server's instructions at 2,048 characters by default" (`CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH`). [MCP#scale-with-mcp-tool-search] Changelog 2.1.295: deferred tool descriptions are now cut at 16,384. [CL#2-1-295] The inbox pins its tools upfront (`isDeferred: false` through `hooks/register.tsx:on('tool.describe')`). A mod's pinned tool has its description cut at 4096 characters, and at 16384 behind tool search (live, 2026-10-21; see "When the guard loads").
- "Each connected server takes some space in Claude's context window because its tool names and server instructions load into every session." [MCP-quickstart#add-and-verify-a-server]
- Output: warns over 10,000 tokens; cap 25,000 tokens (`MAX_MCP_OUTPUT_TOKENS`); a result with no image over 50,000 characters is saved to a file. HTTP, SSE and (2.1.295) WebSocket messages over 16 MiB fail. [MCP#mcp-output-limits-and-warnings; CL#2-1-295]
- Stdio servers: "Claude Code doesn't reconnect them automatically." A tool call silent for 30 minutes (stdio) or 5 minutes (remote) aborts with an error; that is per call, not the server. [MCP#automatic-reconnection; MCP#push-messages-with-channels]
- A main-conversation MCP call still running after 2 minutes becomes a background task (2.1.212+), not in `-p`. [MCP#automatic-backgrounding-of-long-tool-calls]
- `list_changed`: "In an interactive terminal session, Claude Code fetches the updated list from that server". "In non-interactive mode with the `-p` flag and in the Agent SDK, Claude Code refreshes only the tool list". [MCP#dynamic-tool-updates] Inference: desktop Code mode, an SDK host, refreshes tools only.
- `.mcp.json` is read only at session start. [MCP-quickstart#troubleshooting] In `-p`, SDK and cloud sessions, project-scoped servers load without the approval prompt. [MCP#project-scope]
- Channels: a server pushes messages into a session with the `claude/channel` capability and `--channels`. "On the v2 runtime, a channel server that negotiates MCP protocol revision 2026-07-28 can't deliver channel messages". [MCP#push-messages-with-channels]
- Elicitation: an MCP server can ask the person through a form or URL dialog; the `Elicitation` hook can auto-respond. [MCP#respond-to-mcp-elicitation-requests] Inference: a host-drawn way to ask "questions only the person can answer", but it blocks the tool call.
- `_meta["anthropic/requiresUserInteraction"]: true` prompts on every call even in bypass and auto modes; with `--permission-prompt-tool`, an `allow` becomes a deny; the SDK's `canUseTool` can approve. [MCP#require-approval-for-a-specific-tool]
- Credential variables such as `ANTHROPIC_API_KEY` read as empty in remote `url` and `headers`. [MCP#credential-variables-that-read-as-empty]
- Changelog 2.1.295 changed claude.ai connectors to negotiate protocol 2026-07-28 by default on installs that fetch no flags; the MCP page still says only "In sessions where it fetches feature flags". [CL#2-1-295; MCP#mcp-client-runtimes]

## The Codex plugin's server (repo, for comparison)

- `codex/src/server.ts`: `TAB_URI = 'ui://inbox/tab'`, `TAB_MIME = 'text/html;profile=mcp-app'`, `APP_ONLY = { ui: { visibility: ['app'] } }`; the `inbox` tool's `_meta` has `ui.resourceUri` and `'openai/ui': { entrypoints: [{ type: 'thread' }] }`; `inbox_view` and `inbox_press` are app-only.
- `codex/plugin/.mcp.json` is a stdio server with Codex fields (`cwd`, `env_vars`, `default_tools_approval_mode`). Whether Claude Code drops these is unknown.
