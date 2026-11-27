# Checked against Codex 0.172.0

Part of [Codex plugins and the Codex app](../codex-plugins.md).

Checked on 2026-11-26 against codex-cli 0.172.0, installed from npm in a scratch folder. The live checks ran `codex app-server` with an empty `HOME` and `CODEX_HOME`, no sign-in and a stand-in stdio MCP server that logs each start. No model was called. Source paths are in `openai/codex` at tag `rust-v0.172.0`.

## An optional MCP server can start at its first tool call

- **The feature is on [binary].** `codex features list` shows `mcp_lazy_stdio_startup  stable  true`. 0.164 has no such feature.
- **A second chat in the same app-server does not start an optional server [live].** Three `thread/start` calls in one app-server started the stand-in once, for the first chat. The other two sent no `mcpServer/startupStatus/updated`.
- **The server starts at the chat's first tool call [live].** `mcpServer/tool/call` on the second chat started a second process, which got `initialize`, `tools/list` and then the call.
- **`required = true` or turning the feature off starts it for every chat [live].** With either, each of the three chats started its own process.
- **The catalog cache lives in the app-server's process [source].** `codex-mcp/src/tool_catalog_cache.rs` keeps up to 32 catalogs for 30 minutes, in memory. So the first chat after an app-server starts always starts the server.
- **Why [source].** In `codex-mcp/src/connection_manager.rs`, a stdio server waits for its first call when the feature is on, the server is not `required` (or has `startup_readiness = "catalog"`), it is not a plugin the chat selected, and a cached catalog lists a tool its filter allows.

The inbox's `codex/plugin/.mcp.json` sets neither `required` nor `startup_readiness`, so its server is optional. In a second chat it starts when the agent or the tab first calls an inbox tool. A required server that fails makes `thread/start` fail ([MCP servers](mcp-servers.md)). Whether the tab's page loads before that first call was not checked.

## Presses, hooks and the shared daemon

Read from the binary's `--help`, its generated app-server schema and the release notes for 0.168 to 0.172. Nothing here was run live.

- `codex queue` takes `--thread`, `--message` and `--resume`, as `codex/src/server-host.ts` sends them.
- The managed daemon still runs `app-server --listen unix://… --managed-daemon`, which `codex/src/shared-daemon.ts:isSharedDaemon` matches.
- `hooks/list` takes `cwds` or `threadId` and answers `data[]` of `{cwd, hooks[], errors[], warnings[]}`, each hook with `pluginId` and `trustStatus`, as `codex/src/hook-trust.ts` reads it.
- The release notes name no change to the rollout's `user_message` or `event_msg` lines.

## Untrusted context

- **`untrusted_as_tool_output` is on by default [binary].** It is stable and true in 0.172, and off in 0.164 and 0.166.
- **What it changes [source, PR 60487].** Untrusted context a client passes as `additionalContext` to `turn/start` or `turn/steer`, or an extension injects, reaches the model as a `function_call_output` item in the `agent` namespace instead of a user message. It does not touch MCP tool results. The inbox's presses pass `additionalContext: null` (`codex/src/app-steer.ts`).
- **Hooks keep their own path [source].** A hook's `additionalContext` becomes a `HookAdditionalContext` message recorded in the conversation (`core/src/hook_runtime.rs:record_additional_contexts`), as at [0.166](checked-0.166.md). The flag does not change it, so the guidance the inbox's hooks add reaches the model as before.
