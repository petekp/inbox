# MCP servers and app-server

Part of [Codex plugins and the Codex app](../codex-plugins.md).

## MCP servers, as Codex hosts them

- **Supported.** Stdio and streamable HTTP servers, bearer tokens, OAuth, and
  ChatGPT-session auth for first-party servers. (L/extend/mcp#supported-mcp-features)
- **Shared config.** "The ChatGPT desktop app, Codex CLI, and IDE extension
  support MCP servers and share MCP configuration for the same Codex host."
  (L/extend/mcp)
- **Server instructions.** "Codex reads the MCP `instructions` field returned
  during initialization and uses it as server-wide guidance… Keep the first
  512 characters self-contained." (L/extend/mcp#supported-mcp-features;
  D/build/mcp-server#create-the-server) [inference] The inbox's guidance could
  move here from the SessionStart hook. Whether Codex re-reads `instructions`
  after compaction is [unknown].
- **Timeouts and startup.** `startup_timeout_sec` (default 10),
  `tool_timeout_sec` (default 60). `required = true` makes startup fail if the
  server can't initialize. `mcp_optional_startup_grace_ms` "defaults to 1000
  milliseconds" for the initial tool catalog; 0 waits for each server's
  startup timeout. (L/extend/mcp#other-configuration-options) [inference] The
  inbox server starts through `/bin/sh` and Node; if that takes over 1 s, its
  tools may miss the first turn's catalog.
- **Tool filters.** `enabled`, `enabled_tools`, `disabled_tools` (applied after
  `enabled_tools`). (L/extend/mcp#other-configuration-options) The full list of
  `mcp_servers.<id>.*` and `plugins.<plugin>.mcp_servers.<server>.*` keys is
  at L/config-reference#configtoml.
- **Destructive tools always prompt.** "Destructive app/MCP tool calls always
  require approval when the tool advertises a destructive annotation (unless
  the tool advertises a read annotation, which takes priority)."
  (L/agent-approvals-security#sandbox-and-approvals) app-server says the same:
  "Destructive tool annotations always trigger approval even when the tool
  also advertises less-privileged hints." (L/app-server#mcp-tool-call-approvals-apps)
  Whether `approval_mode = "approve"` overrides that is [unknown].
- **Automatic review.** It evaluates "side-effecting app and MCP tool calls"
  that need approval, and "uses extra model calls, so it can add to Codex
  usage." (L/agent-approvals-security#automatic-approval-reviews)
- **Elicitations.** `approval_policy.granular.mcp_elicitations = true` lets
  MCP elicitation prompts surface "instead of being auto-rejected".
  (L/config-reference)
- **Network.** The command network proxy "does not filter … MCP server
  connections". (L/agent-approvals-security#traffic-outside-the-command-network-proxy)
  "App and connector traffic is not controlled by the sandboxed-command
  network proxy or its domain allowlist." (L/config-reference, `features.apps`)
- **Live process behavior** [live] (docs/plans/codex-plugin/step-0-and-results.md:60, :334):
  - `initialize` and the server's environment carry no session id. A server
    learns its session at its first tool call.
  - One desktop app-server started 17 probe server processes in three
    minutes. Most got only `initialize` and `tools/list`. The tab's server
    lived at least 2.5 minutes, across turns.
  - So state must live in files or in one process the others can reach. The
    repo keeps one JSON file per session under an mkdir lock
    (codex/src/state.ts:withLock).
- **The inbox server's handshake** [repo]: it echoes the client's
  `protocolVersion` or defaults to `2025-06-18`, returns
  `capabilities: { tools: {}, resources: {} }` and
  `serverInfo: { name: 'inbox', version: '0.1.0' }`, and implements no
  `server/discover` (codex/src/server.ts:makeServer).
- **Removed: `codex mcp-server`.** "The `codex mcp-server` command and the
  standalone `codex-mcp-server` binary have been removed." Deprecated
  2026-08-24, removed 2026-09-05. app-server "isn't an MCP server or a
  drop-in replacement for an MCP client." (L/mcp-server,
  L/changelog#codex-2026-08-24, #codex-2026-09-05)

## app-server

app-server is the JSON-RPC server behind Codex's rich clients. The inbox does
not call it directly, but `codex queue` does.

- **Status.** "The app-server command is experimental and isn't supported for
  production workloads." (L/mcp-server) CLI help: "primarily for development
  and debugging and may change without notice".
- **Clients.** The doc names "the Codex VS Code extension". The glossary says
  it applies to "Desktop app, IDE extension, SDK". The README names "local
  stdio desktop sessions (`Codex Desktop`)" (GH/codex-rs/app-server/README.md:189-198).
- **Transports.** stdio JSONL (default); WebSocket ("experimental and
  unsupported"; non-loopback listeners "currently allow unauthenticated
  connections by default during rollout"); Unix socket. (L/app-server#protocol)
- **Handshake.** One `initialize` per connection, then `initialized`.
  Capabilities include `experimentalApi`. Experimental methods without it fail
  with "`<descriptor> requires experimentalApi capability`".
  (L/app-server#initialization, #experimental-api-opt-in)
- **Thread status.** `notLoaded`, `idle`, `systemError`, `active` with flags
  `WaitingOnApproval` and `WaitingOnUserInput`
  (L/app-server#read-a-stored-thread-without-resuming;
  GH/codex-rs/app-server-protocol/src/protocol/v2/thread.rs:1697-1700).
  `thread/status/changed` fires on change.
- **Unloading.** "the server keeps the thread loaded until it has no
  subscribers and no thread activity for 30 minutes." (L/app-server#unsubscribe-from-a-loaded-thread)
- **`thread/list`.** `sourceKinds`: "When omitted or `[]`, the server defaults
  to interactive sources only: `cli` and `vscode`". Kinds include `exec`,
  `appServer` and several `subAgent*`. No desktop kind exists; desktop threads
  record `source: "vscode"`. Other filters: `cwd`, `isPinned`, `searchTerm`,
  `archived`, sort keys, experimental `parentThreadId` and `ancestorThreadId`.
  (L/app-server#list-threads-with-pagination--filters)
- **Turns.** `turn/start` input items `text`, `image`, `localImage`, `skill`,
  `mention`. `turn/steer` needs `expectedTurnId`. `thread/inject_items`
  appends history "without starting a user turn". `thread/shellCommand` "runs
  outside the sandbox with full access". (L/app-server#turns, #steer-an-active-turn,
  #inject-items-into-a-thread, #run-a-thread-shell-command)
- **Approvals** are server requests: `item/commandExecution/requestApproval`,
  `item/fileChange/requestApproval`, `item/tool/requestUserInput`,
  `item/permissions/requestApproval`, `mcpServer/elicitation/request`.
  (L/app-server#approvals)
- **MCP.** `mcpServer/tool/call` (not experimental, common.rs:1277),
  `mcpServer/resource/read`, `mcpServerStatus/list`, `config/mcpServer/reload`.
  A `required` server that fails makes `thread/start` and `thread/resume`
  fail. (L/app-server#api-overview)
- **`mcpToolCall` item.** The schema has `appContext` (`connectorId`,
  `linkId`, `resourceUri`, `appName`, `actionName`), legacy
  `mcpAppResourceUri`, `mcpAppUi {resourceUri, preferredModelDisplayMode}`,
  `pluginId`, `readOnlyHint`, `durationMs` [source]
  (GH/codex-rs/app-server-protocol/schema/typescript/v2/ThreadItem.ts).
- **Plugins.** `plugin/list|read|install|uninstall` are "under development…
  Don't call this method from production clients yet." Sources are `local`,
  `git`, `npm`, `remote`. `marketplace/add|remove|upgrade`. (L/app-server#api-overview)
  `disabledPluginIds` exists, but "Saving this selection does not yet filter
  plugin capabilities." (README.md:385-409)
- **Hooks.** `hooks/list` lists discovered hooks per `cwd`. Source types
  include Plugin and Mdm; trust statuses Managed, Untrusted, Trusted,
  Modified; execution modes Sync and Async [source]
  (GH/codex-rs/app-server-protocol/src/protocol/v2/hook.rs:19-157).
- **Read state** (experimental): `thread/read.readState`,
  `thread/readState/update`, `thread/readState/changed`. "Only newly
  delivered, durable, visible terminal results advance read state."
  (README.md:22-63)
- **Thread attachments.** `thread/attachment/add|list|remove`, not gated. For
  pull requests, "clients should reuse the canonical application identity
  `JSON.stringify([canonicalHostname, lowercaseOwner, lowercaseRepository,
  pullRequestNumber])`." At most 100 per thread. (README.md:316-383;
  common.rs:672-687) Who writes these today is [unknown].
- **Auth.** "App-server authentication has never been permitted for
  commercial or hosted services." (L/app-server#auth-endpoints)
