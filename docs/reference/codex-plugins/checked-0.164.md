# Checked against Codex 0.164.0

Part of [Codex plugins and the Codex app](../codex-plugins.md).

Checked on 2026-10-23, with the CLI from npm in a scratch `CODEX_HOME` that
held a link to `auth.json`, a local marketplace holding a copy of this repo's
`codex/plugin`, and a probe client speaking app-server JSON-RPC over stdio. The
ChatGPT desktop app still bundles 0.163.0-alpha.11.2, so nothing here ran in
the app. Quotes are from the 0.164.0 release notes (2026-10-22).

**Hook approval is bound to the plugin's contents (PR #54619)**

The release notes list "#54619 Bind plugin hook approval to plugin contents".
This changes what the inbox's users must do after every update.

- `config.toml` now holds two hashes per hook: `trusted_hash` (the hook's
  definition, as before) and `trusted_content_hash` (every file under the
  plugin root). `hooks/list` reports `currentHash` as
  `<definition hash>/<content hash>` [live 0.164.0].
- The content hash covers the whole plugin folder, in sorted order, each
  file's name, length and bytes. It skips only `__pycache__`, `.venv`,
  `*.pyc` and `*.egg-info` (hooks/src/engine/plugin_fingerprint.rs)
  [source 0.164.0].
- A trusted install, then a one-line change to `dist/server.mjs` and
  `codex plugin add inbox@inbox` again: all four hooks read `modified`
  [live 0.164.0]. Bumping only `version` in `plugin.json` (the cache folder
  becomes `.../0.2.11`) gave the same result. The definition hash did not
  change, because it does not include the plugin's install path.
- The hooks then fail, they are not skipped. `codex exec` printed
  `hook: SessionStart Failed`, and in an app-server thread `hook/completed`
  had `status: "failed"` with the entry `plugin contents changed; hook
  approval required`. Trusted, the same run printed `Completed` and the hooks
  wrote the inbox's state [live 0.164.0].
- The check runs again at every hook run, not only when hooks are listed
  (plugin_trust.rs `verify`) [source 0.164.0]. Editing a file in the installed
  copy breaks trust at the next hook run.
- Approvals made before 0.164.0 have no `trusted_content_hash`. The first hook
  run pins the plugin's contents at that moment as a baseline in
  `<codex home>/.hook-trust/`, and that run succeeds. A later change to the
  contents then fails (plugin_trust.rs `migrate_legacy_trust`) [source
  0.164.0]. Not run live.
- `codex plugin marketplace upgrade` reports "No configured Git marketplaces
  to upgrade" for a local-path marketplace; the install reads the source
  folder when `codex plugin add` runs [live 0.164.0].
- **Where the app asks for trust** [source, ChatGPT.app 26.1021.31345
  `app.asar` webview bundle, read 2026-10-27]. The composer shows a "Review
  hooks" button while an enabled hook for the chat's folder reads `untrusted`
  or `modified` in `hooks/list`. Its dialog lists each hook as "New" or
  "Modified", with "Allow all". The app reuses its `hooks/list` answer for 5
  minutes (`staleTime`). It reads the list again when a composer mounts after
  that, after one of its own hook actions, or after a restart. So after an
  update run from a terminal, the button stays hidden until the app reads the
  list again. Settings, then Hooks (under Coding), lists plugin hooks under
  "From Plugins", one row per plugin, named by its `displayName`. The row's
  dialog has "Trust all". The plugin's own page shows "N hooks need review
  before they can run", with "Review" and "Trust all". The README and the
  tab's line name the button first, then Settings' Hooks page.
- The inbox's own signal is `heard`: `none` when no hook has run in the chat.
  In the failing thread above `inbox_view` returned `"heard":"none"` and the
  tab read "The inbox has not heard from this chat's hooks."
  (codex/src/core.ts `heardState`, codex/src/tab.tsx `notHeardText`) [live
  0.164.0]. `heard` alone cannot tell never trusted from trust lost, so the
  tab also asks `hooks/list`, as the next point says.
- `hooks/list` is not experimental (app-server-protocol common.rs:917), and
  the inbox's MCP server gets `CODEX_CLI_PATH`. The server now asks a
  short-lived `codex app-server` for `hooks/list` on a chat's view, heard or not,
  for the chat's folder or else the home folder, without blocking a view. It
  asks once per folder, then every 5 s while the hooks are stopped, 30 s after
  a failed answer, and after a trusted answer only once a turn runs that the
  hooks did not hear, or once a plugin update reloads the server's handler.
  The tab's line under its
  tab bar says "Codex is not running the inbox's hooks…" (`untrusted`) or "Codex
  stopped the inbox's hooks when the inbox updated…" (`modified`). It keeps the "not heard"
  text when the call fails or the hooks read trusted (`codex/src/hook-trust.ts`).
  Checked live in the ChatGPT app's Codex 0.164.0 on 2026-10-27: after a
  reinstall made the hooks `modified`, a chat with rows showed the line, the
  hook icon's Review hooks dialog offered Allow all, and the line left after it.
- The app-server starts in the home folder. The MCP server's own folder is the
  plugin's version folder under `plugins/cache`, which an update deletes
  while the server runs, and a process started there fails with `ENOENT`.
  `hooks/list` loads each folder's config and lists the plugin hooks of the
  person's installed plugins, so the home folder gives the user-level answer
  (app-server `catalog_processor.rs` `hooks_list_response`) [source 0.164.0].
  Not run live with the home folder.

**Rollouts (PRs #54008, #55923, #55252, #53997, #55652, #54639, #55733, #55388)**

The release notes: "Resuming sessions now finds compressed histories and
restores saved thread settings instead of replacing them with global
defaults."

- 153 rollout files from Codex 0.162.0 and 0.163.0 alphas, written since
  2026-10-16, have the row kinds the 2026-10-08 sample had, plus
  `event_msg` / `thread_settings_applied` and `turn_aborted`, and top-level
  `ordinal` and `metadata` keys on every row. `session_meta` gained
  `history_mode`, `history_base`, `creator_*`, `runtime_workspace_roots` and
  `thread_source`. `compacted` rows carry `replacement_history`,
  `retained_context` and window ids [live 2026-10-23]. The inbox reads
  `session_meta.originator`, `.source`, `.cwd`, `.forked_from_id`,
  `.parent_thread_id`, and the `task_started`, `task_complete`,
  `item_completed` and `response_item` rows. It skips any other row.
- Two 0.164.0 `codex exec` rollouts have the same shape. `CommandExecution`
  items still carry `command` as an argv list and `aggregated_output`; `cwd` is a
  `file://` URL [live 0.164.0].
- Compression applies to rollouts older than 7 days. Resuming writes them back
  as plain `.jsonl`. See "Transcripts" for the file names. `transcript_v2` is
  marked removed (#55388); the inbox never used it.
- Not checked live: `rollout/compress` on a real chat, and a resume of a
  compressed chat from the desktop app.
- Changed: `rolloutFor` takes the `<thread id>_<rollout id>` file of a
  reverted chat, and `readRollout` reads the history it continues, as
  "Transcripts" describes (codex/src/transcript.ts).

**New hook events (#55144, #55657, #56044)**

- #55144 adds `PreModelRequest` and `PostModelRequest`. They are keys of the
  hooks config (config/src/hook_config.rs:40-43), so a plugin's `hooks.json`
  can use them [source 0.164.0]. Input: `session_id`, `turn_id`, `cwd`,
  `transcript_path`, `model`, optional `agent_id` and `agent_type`. The post
  event adds `status` (`completed`, `failed`, `cancelled`), `error` and
  `token_usage`. Output is logged, never read as control. They fire once per
  request attempt, retries included, so many times per turn. They would not
  replace Stop as the trigger for the per-reply update.
- #55657 adds `MessageLifecycleContributor` to the Rust extension API
  (ext/extension-api/src/message_lifecycle.rs). It is not a hook event.
- #56044 lets Stop and Interrupt hooks of plugins found through V2 capability
  discovery run for remote executors. It adds no event.
- `Interrupt` already exists. Stop does not run when a turn is interrupted
  (see 0.163.0 above). An Interrupt hook could save the interrupted turn as
  `coveredTurn`, so the next hook would not catch it up. Not built.
- Nothing adopted.

**MCP (#55263, #54656, #54686)**

- `mcpServerStatus/list` still shows the inbox server's six tools with their
  `_meta`: `ui.visibility: ["app"]` on `inbox_press` and `inbox_tab_page`, the
  tab's `resourceUri` and the thread entrypoint on `inbox_view`. The resource
  reads as `text/html;profile=mcp-app`. `mcpServer/tool/call` for `inbox_view`
  returned `structuredContent` [live 0.164.0].
- #55263 starts dormant servers for hook calls; the inbox's hooks are
  `command` handlers, not `mcp_tool`. #54656 applies tool-list changes
  within a turn; the inbox's tool list is fixed.

**Queued prompts (#55682)**

The release notes: "Queued prompts now wait for pending permission selections
to resolve before continuing."

- A turn waited on a command approval (`approvalPolicy: "untrusted"`).
  `thread/queue/add`, the call `codex queue` makes, returned in 1 ms with the
  stored item, and `thread/queue/list` showed it. No second turn started
  while the approval was pending. After the approval was accepted, the first
  turn finished and the queued message started its own turn [live 0.164.0].
- `codex queue` against a daemon started in the scratch home printed
  "Queued message <id> for thread <id>." and exited 0, before and after
  `daemon restart`. An unknown thread failed with `no rollout found for thread
  id` [live 0.164.0].
- So a press during a pending approval is accepted at once. The inbox keeps it
  `queued` until the message arrives as a prompt, and there is no timer that
  turns it into `unconfirmed` (hooks/presses.ts `withArrival`).
- Any `-c` or `--config` on `codex queue`, even at two levels, makes it refuse
  while a local daemon runs: "cannot queue through an embedded app server
  while a local app-server daemon is running; remove configuration overrides or
  use --remote" [live 0.164.0]. The inbox passes none.

**Disk clean-up (#53827, #55149, #55689, #55690, #55856)**

- The release notes: "Reduced disk usage by pruning unused installations,
  cleaning abandoned marketplace checkouts, and bounding daemon logs."
- These remove old standalone and daemon releases, `marketplace-add-*` and
  `marketplace-upgrade-*` staging folders, and trim daemon logs
  (PR descriptions). A local-path marketplace is not a staging folder.
  Through add, `plugin add`, `marketplace upgrade`, a version bump with
  re-add, and a daemon start, restart and stop, the scratch home kept the
  marketplace entry and the installed plugin. The re-add removed the previous
  version's cache folder, as before [live 0.164.0].
- Not checked: a Git marketplace after a long idle period.

**Overrides and the daemon (#56022, #53751, #55442)**

- `update.ts` passes `-c` only after `exec`, and `codex queue` gets none, so
  #56022 (`-c` at several subcommand levels) does not change them.
- The per-reply update: `codex/src/update.ts` flags (`--ephemeral`,
  `--ignore-user-config`, `--ignore-rules`, `-m`, `-o`, the 16 `--disable`
  names) do not use `--json`. `./scripts/eval.sh --suite model --agent codex --runs 5` ran against 0.164.0 on commit `1b61c6f` with a clean tree: all 61 cases passed 5 of 5 runs, 305 runs in all. Run with `CODEX_CLI_PATH` set to the scratch 0.164.0 binary and `CODEX_HOME` set to a scratch home that held a link to `auth.json`. [live 0.164.0]

**Remote plugins, notes only (#54424, #53990, #54761, #55667)**

- #54424 adds remote plugin metadata to plugin configuration. #53990 keeps host
  MCP and plugin configuration local with remote environments. #54761 upgrades
  `zip` to 9.0.0 and the plugin archive extraction. #55667 enables app routing
  for remote curated Agent Plugins. The inbox is a local plugin. Whether they
  change how a local-path or Git marketplace installs is not tested; the
  installs above worked.
