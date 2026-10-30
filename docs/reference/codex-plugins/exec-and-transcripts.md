# `codex exec`, attention features and transcripts

Part of [Codex plugins and the Codex app](../codex-plugins.md).

## `codex exec` (the per-reply update)

- "Codex streams progress to `stderr` and prints only the final agent message
  to `stdout`." (L/non-interactive-mode#basic-usage)
- Flags: `--ephemeral` ("Run without persisting session rollout files to
  disk"), `--ignore-user-config` ("Do not load `$CODEX_HOME/config.toml`.
  Authentication still uses `CODEX_HOME`."), `--ignore-rules`,
  `--disable <feature>` (repeatable; "translates to
  `-c features.<name>=false`"), `-m`, `-s read-only|workspace-write|danger-full-access`
  (read-only by default), `-C`, `--skip-git-repo-check`, `--output-schema`,
  `-o/--output-last-message`, `--json`. `--full-auto` is deprecated.
  (L/developer-commands?surface=cli, exec table) The 0.160.1 `--help` also
  shows `--thread-source <SOURCE>` [live 2026-10-08].
- **Global AGENTS.md.** `exec` reads `$CODEX_HOME/AGENTS.md` even with
  `--ignore-user-config`, `--ignore-rules` and `-c project_doc_max_bytes=0`:
  asked for its instructions, it quoted the file [live 0.163.0, 2026-10-20].
  No flag or feature skips it. `codexAsk` runs the inbox model in its own
  `CODEX_HOME`, `<data dir>/model-home`, which holds only a link to the
  person's `auth.json`; asked the same, it quoted nothing from the file
  [live 0.163.0]. The file store saves a refreshed sign-in by opening
  `auth.json` in place (`FileAuthStorage::save`,
  codex-rs/login/src/auth/storage.rs), so the refresh goes through the link
  to the person's file. A keyring store keys by the home's path, so a
  separate home would miss it; `codexAsk` keeps the person's home when they
  have no `auth.json`.
- Stdin: "If you omit the prompt argument, Codex reads the prompt from stdin".
  With both, the piped content is added as context. (L/non-interactive-mode)
  Live: "`exec` waits on stdin unless it is given `/dev/null`" [live]
  (docs/plans/codex-plugin/step-0-and-results.md:61).
- `--json` events: `thread.started` (with `thread_id`), `turn.started`,
  `turn.completed` (with `usage`), `turn.failed`, `item.*`, `error`.
  (L/non-interactive-mode#make-output-machine-readable)
- "If you configure an enabled MCP server with `required = true` and it fails
  to initialize, `codex exec` exits with an error". (L/non-interactive-mode#permissions-and-safety)
  [inference] `--ignore-user-config` avoids this unless a managed config
  applies.
- Exec "reuses saved CLI authentication by default"; `CODEX_API_KEY` also
  works. (L/non-interactive-mode#authenticate-in-automation)
- **Cost** [live]: "It costs 21.5k input tokens for a one-word answer, 12.3k
  of it cached. Switching off tools and features and replacing the base
  instructions brings it to 12.5k, and no flag tried went lower."
  (docs/plans/codex-plugin/step-0-and-results.md:61) Measured on 0.160.1, before 0.161.0 made
  GPT-6.1 Sol the default model.
- **Unknown flags.** `exec` rejects an unknown `--disable` name with "Unknown
  feature flag: X"; the code drops it and retries [live]
  (codex/src/update.ts:codexAsk; docs/plans/codex-plugin/step-0-and-results.md:140-141).
  `personality` is "removed" in 0.160.1 but still in the `OFF` list
  (codex/src/update.ts:OFF). On 0.163.0 `--disable personality` is still
  accepted [live 0.163.0].
- **Model.** `gpt-6.1-sol` at low effort got 12 of 12 right in 4–5 s;
  `gpt-6-luna` got 10 of 12 [live] (docs/plans/codex-plugin.md:115-122).
- `exec` threads are excluded from `thread/list` by default (see app-server).
- **`notify` is not a substitute trigger.** It runs one external program on
  `agent-turn-complete` with `thread-id` and `last-assistant-message`, but it
  is a single user-level command and project config cannot set it.
  (L/config-advanced#notifications, #project-config-files-codexconfigtoml)

## The desktop app's own attention features

These overlap with what the inbox shows.

- **Activity view.** "select the bell in the sidebar to see chats that are
  unread, running, or waiting for your response." "Depending on your current
  surface, the options can include **Work**, **Chat**, **Pinned**, and
  **Scheduled**." (L/notifications#follow-chats-in-activity-view) Added in
  26.727, 2026-07-30 (L/changelog#codex-2026-07-30-app).
- **Pets** "can show when a chat is **Running**, **Needs input**, **Ready**,
  or **Blocked**". (L/notifications#follow-chat-activity-with-a-pet)
- **iOS Priority view** brings "running tasks, unread updates, and tasks
  awaiting your response to the top". (L/changelog, iOS 1.2026.237)
- **Desktop alerts.** Turn completion "never, only while ChatGPT is in the
  background, or always", plus separate permission and question
  notifications. (L/notifications#configure-desktop-notifications)
- **PR review in the side panel** is part of the desktop Codex experience.
  (L/whats-new#use-codex-in-the-chatgpt-desktop-app)
- [inference] The inbox should not rebuild "which chat needs me". It adds
  item-level content Activity lacks, and can link with
  `codex://threads/<thread-id>`.
- **Deep links.** "The ChatGPT desktop app keeps the `codex://` URL scheme for
  compatibility." `codex://threads/<thread-id>` opens "A local chat".
  `codex://new?prompt=…` "Sets the initial composer text" and "doesn't send
  the prompt automatically". (L/reference/commands#deep-links, #chats)
- Other: pop-out chats with Always on top; `/app` moves a CLI session into the
  desktop app; imports from Claude Code, Claude Cowork and Cursor.
  (L/reference/settings, L/developer-commands?surface=cli, L/whats-new)

## Transcripts

`transcript_path` points to a JSONL file of the thread. "the transcript
format isn't a stable interface for hooks and may change over time."
(L/hooks#common-input-fields) The inbox reads it to detect `exec` runs and,
at each Stop, to find the question dialogs the agent opened in the ending turn.

- **Command ends.** Every command's end is an `event_msg` / `item_completed`
  with `item.type: "CommandExecution"`; its `id` equals the hook's
  `tool_use_id`, and it is written before PostToolUse [live]
  (docs/plans/codex-plugin/step-0-and-results.md:58, :377).
- **Item fields** [live 2026-10-08, 1,525 items]: `aggregated_output`,
  `command` (always an argv list), `cwd` (always a `file://` URL), `duration`,
  `exit_code`, `formatted_output`, `id`, `parsed_cmd`, `process_id`, `source`,
  `status`, `stderr`, `stdout`, `type`. The code reads none of them.
  `isNonInteractiveRun` reads only the first line of the file, `session_meta`
  (codex/src/transcript.ts:isNonInteractiveRun).
- **Row types** [live 2026-10-08]: `session_meta`, `response_item`,
  `event_msg`, `world_state`, `turn_context`, `token_usage_record`,
  `compacted`, `inter_agent_communication_metadata`. All 60 recent threads have
  `history_mode: "paginated"`.
- **Question dialogs** [live 2026-10-17, 46 calls in the local rollout files].
  Codex's dialog tool is `request_user_input_async`. No hook fires for it. A
  call is a `response_item` row whose `payload.type` is `function_call` and
  whose `payload.name` is `request_user_input_async`. `payload.arguments` is a
  JSON string `{"questions": [...]}`. Each question has a `title` and, in most,
  an `options` list of plain strings. A recommended option ends
  "(Recommended)". Its `function_call_output` holds only
  whether the dialog was accepted. The person's answer arrives later as a user
  message (see "The dialog's reply"). The call rows carry no turn id. A turn starts at the
  `event_msg` row with `payload.type: "task_started"` and a `payload.turn_id`.
  [inference] That id is the `turn_id` the hooks get.
  `codex/src/transcript.ts:turnIn` reads the last 4 MB of the file and
  keeps the dialogs after the `task_started` row for the Stop hook's turn.
- **Closing a dialog drops its answers** [live 2026-10-20, ChatGPT app in the
  inbox-ui VM]. When the person answers the first question of a two-question
  dialog and then presses the dialog's close button, the call's output stays
  `{"accepted":true}` and no prompt follows. Neither the agent nor the inbox
  learns the answer, so every question in that dialog stays open.
- **The dialog's reply** [live 2026-10-24, one rollout; source, ChatGPT.app
  `app.asar` webview bundle, read 2026-10-24]. An answer in the dialog arrives
  as a user message whose whole text is
  `<send_user_message_question_reply>\n[{"questionItemId": …, "question": …, "answer": …}]\n</send_user_message_question_reply>`.
  `questionItemId` is the string `JSON.stringify(["request_user_input_async",
  <call_id>, <index>])`, with the call's `call_id` and the question's index in
  its `questions`. While the dialog's turn runs, the app steers the reply into
  that turn (seen 21 s after the call, with the same `turn_id`).
  - The app counts a question answered only when a user message in its turn or
    any later turn, trimmed, starts and ends with those tags and its JSON names
    the question's id. It parses the JSON by cutting the tags off by their exact
    lengths, so nothing may stand outside them.
  - The dialog stays on screen until each of its questions is answered so or
    skipped with the close button. It does not close when its turn ends. Only
    its desktop notification ("Your assistant has a question") and the thread's
    needs-input flag end with the turn.
  - The close button sets a flag in the app's page and sends nothing. No
    app-server method answers or closes the dialog. The tool's handler returns
    `{"accepted":true}` at once and leaves no request open, and
    `item/tool/requestUserInput` belongs to the blocking user-input tool.
  - So the inbox sends its answer to a question linked to a dialog in this
    form, through `codex queue` (`codex/src/dialogs.ts:dialogReply`,
    `hooks/dialogs.ts:linkDialogs`). An answer press first links the
    dialogs of the rollout's newest turn, so an answer pressed while the
    dialog's turn runs is linked too (`codex/src/server-host.ts:linkRunningDialogs`).
  - [live 2026-10-25, ChatGPT app in the inbox-ui VM, GPT-6.1 Sol] An inbox
    answer sent in this form closes the dialog when its queued turn starts. In
    an idle thread that was about 1 s after the press. With the dialog's turn
    still running, the dialog stayed open until that turn ended, more than
    70 s later, and closed as the queued reply's turn started. The app draws the
    message as a question-and-answer bubble, not as raw tags. Codex passes the
    text unchanged to `UserPromptSubmit`'s `prompt`, so the press's delivery
    reads arrived. The agent took it as the answer both times.
- **Still plain JSONL** [live 2026-10-08]: 146 files in three days, none
  compressed, although `local_thread_store_compression` is on.
- **Compression and file names** [live 2026-10-23, source 0.164.0]. Codex
  replaces a rollout older than 7 days with `<name>.jsonl.zst`, in a
  background pass at startup or on the experimental `rollout/compress` call
  (rollout/src/compression.rs). On this Mac `sessions/` holds 3,340 `.zst`
  and 188 `.jsonl` files; the newest `.zst` is from 2026-10-15 and every file
  since is plain. A chat that resumes is written back as plain `.jsonl`
  (`materialize_rollout_for_append_blocking`), so the `transcript_path` a hook
  gets is plain. `rolloutFor` still skips a compressed file and gives null, so
  the Inbox tab does not catch up on a chat nobody has resumed.
- **A reverted chat's rollout** [live 2026-10-23, source 0.164.0]. Its file is
  `rollout-<time>-<thread id>_<rollout id>.jsonl`, next to the earlier
  `rollout-<time>-<thread id>.jsonl` (rollout/src/rollout_file_name.rs). The
  newer file's `session_meta.id` is the thread id. Five such files exist here, the
  oldest from Codex 0.153.4. `rolloutFor` takes the newest of both.
- **A reverted chat's history** [live 2026-10-23, source 0.164.0]. The newer
  file holds only the turns after the revert. Its `session_meta` has
  `history_mode: "paginated"` and `history_base`: `thread_id` (the rollout id
  of the file it continues, which is the thread id for a chat's first file),
  `end_ordinal_exclusive` and `end_byte_offset`. The chat's history is the
  first `end_byte_offset` bytes of that file, then the newer file. Codex
  follows `history_base` back until a file has none
  (thread-store/src/local/rollout_lineage.rs `resolve_rollout_lineage`). On
  this Mac, a reverted chat's base file kept rows 0 to 444 and held the
  reverted turn after the offset, ending in `turn_aborted`; the newer file's
  rows start at ordinal 445. `readRollout` reads the history the same way,
  newest first, within its 8 MB budget, so a newer file over 8 MB is read
  alone. A base file that is missing or compressed ends the history there:
  the turns before the revert are then left out. Forked chats here carry no
  `history_base`.
- [inference] The format is moving: paginated history, `migrate-rollouts`,
  compression, `world_state`. This is the inbox's riskiest dependency. Each
  read needs a test that fails loudly and an "unknown" state in the UI.
