# Session ids and sending a press

Part of [Codex plugins and the Codex app](../codex-plugins.md).

## Session, thread and turn ids

A thread is Codex's stored conversation. A session id names the tree of
threads a root thread and its forks belong to. They differ after a fork.

- "`thread.sessionId` identifies the current live session tree root. Root
  threads use their own thread id as the session id; forked threads keep the
  session id of the root they came from. Clients should read the session id
  from `thread.sessionId` instead of deriving it from the thread id."
  (L/app-server#start-or-resume-a-thread)
  **A user fork has its own session id, unlike what the line above says.** [live 0.163.0-alpha.11]
  `thread/fork` returned a thread whose `sessionId` equals its own id, and `forkedFromId` the base thread's id. The
  fork's hooks (`session_id`) and the model's MCP calls (`x-codex-turn-metadata.session_id`) carried the fork's own id,
  and SessionStart ran with `source: "fork"`. Log: `step0/logs/r5.rpc.jsonl`, `r5.hooks.jsonl`, `r5.mcp.jsonl`. The
  source says the same (core/src/session/session.rs:928-950 [source 0.163.0]). The "root" in "root thread" is the
  thread the person started a chat in. A subagent takes its agent controller's session id, which is the root thread's (r7 shows this at depth 2). The `Thread` object also has
  `forkedFromId`, `parentThreadId` ("only be set if this thread is a
  subagent"), `ephemeral`, `section`, `projectId` [source]
  (GH/codex-rs/app-server-protocol/schema/typescript/v2/Thread.ts).
- **A fork's rollout names its parent.** [live] Codex 0.154.0, `thread/fork` on a rollout kept in a scratch
  `CODEX_HOME`: the fork's rollout starts with its own `session_meta` row, which has `forked_from_id` set to the
  parent's thread id, then the parent's rows including the parent's `session_meta`. A rollout that is not a fork has
  no `forked_from_id`; a subagent's has `parent_thread_id` instead. Every hook's `transcript_path` is that rollout,
  so the inbox reads the parent from the first row (`codex/src/transcript.ts:forkedFromId`).
- **A rollout is found by thread id.** [live] On the test Mac, rollouts are
  `${CODEX_HOME:-~/.codex}/sessions/YYYY/MM/DD/rollout-<timestamp>-<thread id>.jsonl`, and the first row, `session_meta`,
  has `payload.id` equal to the thread id. Older files are compressed (`.zst`), and `archived_sessions` holds others.
  The inbox reads neither (`codex/src/transcript.ts:rolloutFor`). The MCP server's environment names no Codex home, so
  it uses `$CODEX_HOME`, else `~/.codex`.
- **The tab catches a chat up when it opens.** [live] The tab's `tools/call inbox_view` carries `_meta.thread_id`,
  which equals the hooks' `session_id`. For a chat the inbox has never heard from, the server finds the rollout by that
  id, copies a fork's parent ledger, marks the ledger `behind` when the rollout has earlier turns, and starts the update
  in a detached process (`codex/src/server.ts:makeServer`). In the Codex app on the test Mac, a resumed chat's rows
  appeared within a minute of opening its tab, with no message sent, and the server read `~/.codex/sessions`. A fork's
  tab sent the fork's own thread id, the one in its rollout's file name, and its state file took the parent's ledger.
  The first message after that ran the hooks and left the ledger as it was. A chat whose tab never opens waits for the
  hook of its next message.
- **Hooks.** `session_id` on hook input. "Subagent hooks use the parent
  session id." (L/hooks#common-input-fields) The SessionEnd example uses
  `"thr_123"`. [inference] The hook `session_id` is a thread id.
- **Three `_meta` shapes on MCP calls:**

  | Caller | Where the id is | Source |
  | --- | --- | --- |
  | The model | `_meta["x-codex-turn-metadata"]` with `session_id`, `thread_id`, `turn_id`, `turn_trigger`, `forked_from_thread_id`, `parent_thread_id`, `thread_source`, plus `_meta.callId` | [live] docs/plans/codex-plugin/step-0-and-results.md:60; [source] GH/codex-rs/core/src/mcp_tool_call.rs:1311-1344, turn_metadata.rs:275-312, :440-490, responses_metadata.rs:418-445 |
  | The desktop tab | `_meta.thread_id`, "equal to the hooks' `session_id`" | [live] docs/plans/codex-plugin/step-0-and-results.md:65 |
  | app-server `mcpServer/tool/call` | The caller's own `_meta` object with `threadId` added; `{threadId}` if the caller sent none; a non-object `_meta` passes unchanged. No `x-codex-turn-metadata`. | [source] GH/codex-rs/app-server/src/request_processors/mcp_processor.rs:16, :679-701, :715-737 |

- The model-call payload strips `agent_name`, `parent_turn_id` and
  `root_turn_id`, and adds `codex_version`. "Never serialize harness-owned tool
  inventory for external MCP servers." [source] (GH/codex-rs/core/src/turn_metadata.rs:275-312)
- **The inbox resolver.** `sessionOf` reads
  `x-codex-turn-metadata.session_id`, then `thread_id`, then `threadId`
  (codex/src/server.ts:sessionOf). [live 0.163.0-alpha.11]
  In a user fork, `session_id` and `thread_id` are both the fork's own id, so reading `session_id` first keys state to
  the chat the person is in (`step0/logs/r5.mcp.jsonl`). Whether `codex queue --thread <session_id>` reaches that chat
  was not tested; see the Unknown table. The earlier inference that a fork sends the root's `session_id` was wrong. In
  a subagent, `session_id` is the controller's session id (the root's) and `thread_id` is the subagent's own.
- **Live transcripts on the test Mac** [live 2026-10-08, 60 most recent,
  metadata only]: 9 top-level threads had `id == session_id` and
  `thread_source: "user"`. 51 were subagent threads with
  `source: {subagent: …}` and `thread_source` `guardian_review` (45) or
  `subagent` (6); in all of them `id != session_id`, and in 28
  `session_id == parent_thread_id`. Whether plugin hooks fire in those
  threads: see "Subagents, guardians and hooks" (answered live 2026-10-21).
- A queued turn's `task_started` event in the rollout file has
  `turn_attribution.turn_trigger: "queue"`; the other turns have `null`
  [live 0.163.0]. The queue service starts the turn with
  `turn_trigger: Some("queue")` (ext/queue/src/service.rs:394, :441)
  [source 0.163.0]. That the model's MCP calls then carry it in
  `x-codex-turn-metadata` was not seen. [inference]

## Sending a press: `codex queue` and `thread/queue/*`

### What the code says [source]

- **No public doc mentions it.** The CLI overview lists 27 commands without
  `queue`; no fetched page or changelog entry contains "codex queue" or
  "thread/queue". (L/developer-commands?surface=cli#command-overview,
  L/app-server#api-overview, L/changelog)
- **Command.** "Queue a message for an existing session."
  (GH/codex-rs/cli/src/main.rs:209-210) `--thread <THREAD>` ("Session UUID or
  exact session name"), `--message <TEXT>` (non-empty), remote options and
  `-c` (GH/codex-rs/cli/src/queue_cmd.rs:12-27). "`codex queue` does not
  support image attachments" (queue_cmd.rs:45-47), although `--help` lists
  `-i/--image` [live 2026-10-08].
- **Path.** It sends `thread/queue/add` with one text input and a fresh
  UUIDv7 `clientUserMessageId` through a local or remote app-server
  (GH/codex-rs/tui/src/session_queue_commands.rs:1, :52, :111-126).
- **Daemon rule.** "--no-daemon cannot be used with codex queue. Queuing must
  discover the shared server to avoid writing through a separate server." It
  refuses to queue through an embedded server while a local daemon runs.
  (session_queue_commands.rs:32-50)
- **Name lookup.** A UUID goes straight to `thread/queue/add`. A name is
  looked up among active sessions only; a miss fails with "No active session
  found matching '{target}'." (session_queue_commands.rs:91-110)
- **Output.** "Queued message {id} for thread {thread_id}." (:78-81)
- **Old or gated servers.** "the {server} does not support thread/queue/add;
  update or restart the {server}", on method-not-found, an `experimentalApi`
  rejection, or "unknown variant `thread/queue/add`", through the implicit
  daemon or `--remote` only (:63-74, :130-142).
- **Methods.** `thread/queue/add`, `list`, `update`, `delete`, `reorder`,
  `start`, all `#[experimental]` (GH/codex-rs/app-server-protocol/src/protocol/common.rs:630-664).
  Notification `thread/queue/changed` with only `{ thread_id }`
  (common.rs:1960-1961; protocol/v2/thread.rs:2145-2147). It fires on add,
  update, reorder, delete and drain (GH/codex-rs/app-server/tests/suite/v2/thread_queue.rs:117-250).
- **Types.** `QueuedSubmission { id, input, clientUserMessageId }`. An update
  keeps `id` and `clientUserMessageId`. (protocol/v2/thread.rs:926-1027;
  thread_queue.rs:117-250)
- **Rejections** (GH/codex-rs/app-server/src/request_processors/thread_queue_processor.rs):
  - loaded ephemeral thread: "ephemeral thread does not support queued
    submissions" (:263-266);
  - unloaded archived thread: "session {id} is archived" (:284-287);
  - multi-agent-v2 sub-agents that cannot take direct input, and unloaded
    spawned sub-agents (:49-50, :296-313);
  - no service: "user message queue is unavailable" (:247-251);
  - bad image URLs and oversized input (:81, :325-329).
- **Cold threads.** `add` accepts a thread that is not loaded. `start` needs a
  loaded one, fails during an active turn, and fails while the server drains
  (:193-222, :253-292). A message added to an unloaded thread waits until the
  thread resumes. From 0.166.0, `codex queue --resume` resumes it; see
  "Checked against Codex 0.166.0".
- **Capacity.** "queue cannot contain more than 100 submissions"
  (thread_queue.rs:328-366).
- **Idle dispatch.** Adding to an idle thread starts the turn at once, with
  `"turn_trigger": "queue"` in the request's `x-codex-turn-metadata`
  (thread_queue.rs:369-428).
- **Durability.** A persisted queued item dispatches on cold resume.
  Interrupting a turn keeps the queue. (thread_queue.rs:430, :560, :864-948)
- **Daemon.** CLI 0.156.0 added `/daemon` and `--no-daemon`; 0.157.0
  "Enabled automatic background-server startup for eligible interactive
  sessions". (L/changelog)

### What this repo saw [live]

| Case | Result | Source |
| --- | --- | --- |
| Idle thread | Arrived as a plain user message; the model followed it; `UserPromptSubmit` fired with the exact text | docs/plans/codex-plugin/step-0-and-results.md:90 |
| Busy thread | Started its own turn 14 ms after the running turn ended | :358 |
| Hand-off | `codex queue` exits in about 0.2 s; a row appears in `~/.codex/queue_1.sqlite` | :359 |
| Server-started press | An app-server started the inbox server; `mcpServer/tool/call` pressed an answer; the server ran `codex queue`; the message started a turn | :398 |
| `codex exec resume` | Also reads the queue and delivered the message | :397 |
| Ephemeral thread | `codex queue` fails | :398 |

- **Which binary.** The server uses the CLI path a hook saved, then
  `CODEX_CLI_PATH`, then `CODEX_APP_RUNTIME_CLI_PATH`, then its parent
  process if named `codex`, then `codex` (codex/src/cli.ts `findCli`,
  codex/src/server.ts:queueMessage). The update process uses the same lookup.
- **`--resume`.** The server passes `--resume` when that binary's
  `queue --help` lists it, asked once per binary (codex/src/cli.ts
  `queueResumeCheck`). Older binaries reject the flag.
- A press from the tab in the desktop app is not yet confirmed end to end
  (docs/plans/codex-plugin.md:3-4).

### User-facing queue behavior [doc]

- "**Steer** adds the message to the current run… **Queue** saves the message
  for the next run." "Queued messages appear above the composer, where you can
  edit, reorder, send, or delete them." Follow-up behavior is a setting, with a
  shortcut for the other behavior on one message. (L/prompting#steering-and-queuing,
  L/reference/settings#general)
- CLI: "Press Tab while Codex is working to queue a follow-up". "Codex parses
  queued slash commands when they run." (L/developer-commands?surface=cli)
- iOS 1.2026.237 (2026-09-01): "Queued prompts now sync with the connected
  host, remain editable, and send even when the app is in the background."
  (L/changelog)
- [inference] A person can edit inbox-sent text before it runs, and an edit
  keeps the submission's ids. The UI should say "queued" until the turn
  starts.
