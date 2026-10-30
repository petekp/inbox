# Workspaces, config.toml, sandbox, AGENTS.md and feature flags

Part of [Codex plugins and the Codex app](../codex-plugins.md).

## Workspaces and managed configuration

Each of these can turn the inbox off on a managed Mac. When a local setting
conflicts with an enforced rule, "the local client falls back to a compatible
value and notifies the user" (L/enterprise/managed-configuration#admin-enforced-requirements-requirementstoml).
Whether the person sees which plugin was affected is [unknown].

| Control | Effect | Source |
| --- | --- | --- |
| `features.plugins = false` | Plugins off in local clients, "also … with an API key" | L/enterprise/managed-configuration |
| `[features].hooks = false`, or pinned in requirements | All hooks off | L/hooks#turn-hooks-off |
| `allow_managed_hooks_only = true` | "skips hooks from user, project, session, and plugin sources" | L/hooks#managed-hooks-from-requirementstoml |
| `[marketplaces] restrict_to_allowed_sources = true` with `allowed_sources` (git, `host_pattern`, local) | "reject unmatched marketplace add, plugin install, and configured Git marketplace refresh operations" and "filter configured marketplaces and their plugins at runtime" | L/enterprise/managed-configuration#restrict-plugin-marketplace-sources |
| `mcp_servers` allowlist | A server is enabled "only when both its name and identity match an approved entry". Present but empty disables all MCP servers | L/enterprise/managed-configuration#admin-enforced-requirements-requirementstoml |
| `plugins.<plugin>.mcp_servers` table in requirements | "plugin-bundled servers without a matching plugin and server entry are disabled" | L/config-reference#requirementstoml |
| `features.plugin_sharing = false` | Disables publishing to a workspace | D/build/plugins#publish-a-local-plugin-to-your-workspace |

- **Command identity.** "For stdio servers, match on `command` … The string
  form of identity.command … doesn't inspect `args`, `cwd`, `env`, or
  `env_vars`". A structured form,
  `command = { executable, args = [{ match, value }] }`, matches the
  executable and each positional argument. "Structured command rules still
  don't inspect `cwd`, `env`, or `env_vars`." Plugin servers use the same
  shapes under `plugins.<plugin>.mcp_servers.<server>`.
  (L/enterprise/managed-configuration#enforce-command-rules-from-requirements)
  [inference] The inbox's `/bin/sh -c` invocation can be pinned, but weakly:
  the argument expands `${CODEX_MCP_NODE_PATH:-node}`, and identity rules
  never inspect env. A direct executable with fixed args would be cleaner to
  allowlist.
- **Requirements file locations** are only `/etc/codex/requirements.toml`, the
  Agent Security cloud bundle, legacy `managed_config.toml`, and MDM
  (`com.openai.codex:requirements_toml_base64`). No user or `CODEX_HOME`
  location is listed. (L/enterprise/managed-configuration#locations-and-precedence)
- **Scope.** The source restrictions apply in "ChatGPT and Codex in the
  desktop app, and Codex CLI". They "don't control plugin use in ChatGPT on
  the web or mobile". "Bundled plugins and remotely installed workspace
  plugins are separate from this curated Git source policy." (same page)
- **Workspace GitHub import** (L/enterprise/plugin-management#supported-formats):
  - Accepts `.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json`,
    or a standalone `.claude-plugin/plugin.json` "when no marketplace manifest
    is present".
  - GitHub only, daily sync plus "Sync now". "GitHub import and sync do not
    apply repository installation or authentication policies." Admins set
    Available or Installed per role.
  - A removed entry is marked "No longer in source". "If an update to an
    existing plugin is invalid, its last working version is retained."
    (#keep-plugins-up-to-date) A `pluginId` field moves an existing workspace
    plugin under GitHub management.
  - Repo settings "don't change workspace installation policies for plugins
    imported through Admin > Plugins". (D/build/plugins#enable-or-disable-a-plugin-for-a-repo)
- **Control layers.** Availability, included skills, MCP server access,
  actions and permissions, service authorization, runtime permissions.
  (L/enterprise/apps-and-connectors#understand-the-capability-chain)
- **Who can publish to a workspace** disagrees between pages; see "Where
  sources disagree".
- "Enterprise admins can deploy required scripts through mobile device
  management (MDM)." (D/build/plugins#bundled-mcp-servers-and-lifecycle-hooks)

## config.toml layers

- Precedence, highest first: CLI flags and `--config`; project
  `.codex/config.toml` (closest wins, trusted projects only); profile;
  `~/.codex/config.toml`; cloud-managed defaults; `/etc/codex/config.toml`;
  built-in defaults. Untrusted projects skip project config, hooks and rules.
  (L/config-basic#configuration-precedence)
- Project config cannot set `openai_base_url`, `chatgpt_base_url`,
  `apps_mcp_product_sku`, `model_provider(s)`, `notify`, `profile(s)`,
  `experimental_realtime_ws_base_url` or `otel`, and prints a startup warning.
  (L/config-advanced#project-config-files-codexconfigtoml)
- "By default, Codex saves local session transcripts under CODEX_HOME".
  `history.persistence = "none"` turns it off. (L/config-advanced#history-persistence)
- `CODEX_HOME`: "If you set it, the directory must already exist."
  (L/config-file/environment-variables)
- Desktop-only `desktop.custom_file_handlers.<id>` adds "Open in" targets.
  (L/config-advanced#desktop)
- Keys that matter for the inbox: `[plugins."inbox@inbox"] enabled`,
  `[marketplaces.inbox]`, `[hooks.state."…"] trusted_hash`, `[features]`,
  `plugins.<plugin>.mcp_servers.<server>.*`, `mcp_optional_startup_grace_ms`,
  `approval_policy`. All are cited in the sections above.

## Sandbox and approvals

- `approval_policy` is `on-request | never | {granular}`. "`untrusted` is
  unsupported, and `on-failure` is deprecated." "The retired setting can
  prevent either client from starting." (L/config-reference;
  L/agent-approvals-security#migrate-from-the-retired-untrusted-approval-policy)
  No repo file passes `untrusted` [live 2026-10-08].
- "The sandbox applies to spawned commands." Seatbelt on macOS. CLI and IDE
  defaults: "no network access and write permissions limited to the active
  workspace." `.git`, `.agents` and `.codex` under writable roots are
  read-only. (L/sandboxing#what-the-sandbox-does,
  L/agent-approvals-security#os-level-sandbox, #protected-paths-in-writable-roots)
- Desktop modes: "Ask for approval", "Approve for me" (workspace-write,
  on-request, `auto_review`), "Full access", "Custom (config.toml)". The CLI
  uses `/permissions`. (L/permission-modes#choose-a-mode)
- Non-interactive runs: "use `codex exec --sandbox workspace-write`".
  (L/agent-approvals-security#common-sandbox-and-approval-combinations)
- **No page says whether hook commands or MCP server processes run inside the
  sandbox.** [inference] They probably run outside it: the inbox server runs
  `codex queue` and `codex exec` without approval. [unknown] until checked.
- "When a plugin capability runs through a Codex host, the host's sandbox and
  approval policy applies." (L/plugins#how-permissions-and-data-sharing-work)

## AGENTS.md

- "Codex builds an instruction chain when it starts (once per run; in the TUI
  this usually means once per launched session)." Global
  `~/.codex/AGENTS.override.md` else `AGENTS.md`; then each directory from the
  git root down to the cwd; concatenated root first. It "stops adding files
  once the combined size reaches the limit defined by `project_doc_max_bytes`
  (32 KiB by default)." (L/agent-configuration/agents-md#how-codex-discovers-guidance)
- Project guidance is included "in the first turn of a session"; the root is
  found with `project_root_markers` (default `.git`).
  (L/config-advanced#project-instructions-discovery)
- [inference] AGENTS.md cannot carry live inbox state. It could carry static
  guidance only, and that would mean editing the person's files.

## Feature flags and maturity

- Labels: Under development ("Don't use"), Experimental ("Unstable and OpenAI
  may remove or change it"), Beta, Stable ("removals typically go through a
  deprecation process"), Deprecated. (L/feature-maturity) Source also has
  Removed (GH/codex-rs/features/src/lib.rs:47-62).
- `codex features list` on 0.160.1 [live 2026-10-08]:

  | Flag | State |
  | --- | --- |
  | `hooks`, `plugins`, `apps` | stable, on |
  | `plugin_hooks` | removed |
  | `enable_mcp_apps` | under development, off |
  | `code_mode_host` | stable, on |
  | `code_mode` | under development, off |
  | `non_prefixed_mcp_tool_names` | under development, off |
  | `mcp_2026_07_28`, `codex_apps_mcp_2026_07_28` | under development |
  | `local_thread_store_compression` | under development, on |
  | `transcript_v2` | deprecated |
  | `personality` | removed |

- **`non_prefixed_mcp_tool_names`**: "Expose MCP model-visible namespaces
  without the legacy `mcp__` prefix" (lib.rs:1563-1568). [inference] If it
  also changes hook `tool_name`, the matcher `mcp__.*` and the tool names in
  the inbox's guidance (hooks/model-text.ts:guidanceText) break.
- **Code mode.** L/config-reference calls `features.code_mode.enabled` "under
  development and off by default", yet the desktop app runs shell commands
  through code mode [live] (docs/plans/codex-plugin.md:373). [inference] The
  app turns it on by its own config; the CLI and app behave differently here.
