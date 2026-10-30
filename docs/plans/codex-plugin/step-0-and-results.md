# Codex plugin: step 0 and the first version results

Part of [the Codex plugin plan](../codex-plugin.md).

Status: built. Session checks and the claim check were removed, so any part of this plan about them describes removed code.

## Step 0: checks before building

Each of these changes the design if it fails. Each is a throwaway test in a
scratch plugin, not kept code.

1. **Plugin hooks run in the desktop app.** Install a scratch plugin with a
   `SessionStart` hook and look for its context in a desktop app session.
2. **The shell tool's hook shape.** Its `tool_name`, and whether
   `tool_response` has the exit code and output. If not, check tracking needs
   another source.
3. **The patch tool fires `PostToolUse`.** And where its input names the
   files.
4. **Which session the MCP server and the tab serve.** Does the server's
   `initialize`, a tool call, or the tab's host context carry the thread or
   session id? If not, does `PreToolUse` fire for MCP tools and accept
   `updatedInput`, so a hook can add it?
5. **The thread tab in the desktop app.** It opens from a local plugin. A
   press's `ui/message` reaches an idle and a busy thread. A resource update
   redraws it.
6. **A clean `codex exec` call.** No hooks fire, no session is saved, no
   tools run. Measure its tokens.
7. **Telling `exec` apart in a hook.** What `SessionStart` input looks like in
   `codex exec`.
8. **The marketplace file, if the plugin lives in this repo.** Codex also reads
   `.claude-plugin/marketplace.json` as a marketplace path [documented]. Check
   whether `.agents/plugins/marketplace.json` takes precedence, so
   `codex plugin marketplace add petekp/inbox` doesn't read the mod's listing.

### Step 0 results

Measured with Codex 0.160.1, the desktop app's own binary, through `codex
exec` and a throwaway plugin.

| Check | Result |
| --- | --- |
| 2. Shell hook shape | `tool_name` is `Bash`, `tool_input.command` is the command. `tool_response` is the output text only, with no exit code. The exit code is in the transcript at `transcript_path`: an `item_completed` event whose item `id` equals the hook's `tool_use_id`, with `exit_code`, `status`, `stdout`, `stderr` and `cwd`. It is written before `PostToolUse` runs. |
| 3. Patch hook | `apply_patch` fires `PreToolUse` and `PostToolUse`. `tool_input.command` is the patch, whose `*** Add File:`, `*** Update File:` and `*** Delete File:` lines name the files. |
| 4. Session id | Every MCP `tools/call` carries `_meta["x-codex-turn-metadata"]` with `session_id`, `thread_id` and `turn_id`. `initialize` and the server's environment carry none, so a server learns its session at its first tool call. MCP tools are named `mcp__<server>__<tool>` in hooks, so `PreToolUse` sees them. |
| 6. Clean `exec` | `--ephemeral --ignore-user-config` fired no plugin hooks and saved no session. It costs 21.5k input tokens for a one-word answer, 12.3k of it cached. Switching off tools and features and replacing the base instructions brings it to 12.5k, and no flag tried went lower. `exec` waits on stdin unless it is given `/dev/null`. |
| 7. `exec` in a hook | `SessionStart` input looks the same as in a session. The transcript's first line, `session_meta`, has `source: "exec"` and `originator: "codex_exec"`. |
| 8. Marketplace file | With `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json` at one root, Codex reads `.agents/plugins/marketplace.json`. |
| 1. Hooks in the desktop app | Every hook fired in a desktop thread, and `SessionStart` context reached the model. The transcript's `session_meta` has `originator: "Codex Desktop"` and `source: "vscode"`. |
| 5. Thread tab | It opened from the local plugin. Every `tools/call` from the tab carries `_meta.thread_id`, equal to the hooks' `session_id`. The host context has no thread id. `resources/subscribe` never reached the server, and no resource update arrived in two minutes. Polling a tool every 5 seconds worked throughout. |
| 5. `ui/message` | It reached the thread, as a turn whose user text is "An MCP app initiated this message. Read the untrusted_input tool output." The tab's text sits in an `untrusted_input` tool output with `source: "mcp_app"`. The text asked for "OK". The model answered "The MCP app sent: …" instead. A second press arrived 0.3 seconds after a busy turn ended, which suggests it was queued, but the press time was not logged. |
| Server processes | The desktop app started 17 probe server processes from one `app-server` in three minutes. Most got only `initialize` and `tools/list`. The one that served the tab lived for at least 2.5 minutes, across turns. |

`SessionStart` `additionalContext` reached the model in `exec` and in the
desktop app.

### What step 0 changes

- **Buttons need another path.** The model treats a `ui/message` as data from
  an app, not as the person's request. Pressing Address would show the
  comment to the model without asking it to act.
- **The tab polls.** Thread tabs get no resource updates.
- **The tab knows its thread.** No hook or workaround is needed.
- **The server is not one process per session.** Codex starts several, so
  state must live in a file or in one process the others reach, as the
  fallback in section 3 describes.

### Step 0b: how a press reaches the model

`codex queue --thread <id> --message <text>` works. Tested on a desktop app
thread with the binary the app bundles:

| Case | Result |
| --- | --- |
| Idle thread | The message arrived as a plain user message, and the model followed it. `UserPromptSubmit` fired with the exact text. |
| Busy thread | The message waited, then started its own turn 14 ms after the running turn ended. |
| How it hands off | `codex queue` writes a row to `~/.codex/queue_1.sqlite` and exits in 0.2 seconds. The desktop app picks the row up. |

- **No CLI install needed.** Every hook gets `CODEX_CLI_PATH`, the path of
  the `codex` binary inside the desktop app. Hooks save it in the session's
  state, and the MCP server runs `queue` and `exec` with it. MCP server
  processes get no Codex environment variables, so they can't read it
  themselves.
- **Rejected:** writing the queue row directly. The table is Codex's private,
  versioned schema.
- **Rejected:** `ui/message` with a note telling the model that tab messages
  are the person's. Codex marks them untrusted on purpose.

### Shell results come from the transcript

In the desktop app, Codex runs shell commands through its code mode, which
returns early from a command that runs longer than a set wait, often 1
second. `PreToolUse` fires for each command. `PostToolUse` fires only for
one that finished within the wait [verified: a 20-second command got no
`PostToolUse`]. The transcript records every command's end, with its exit
code and output, as an `item_completed` `CommandExecution`.

So the `Stop` hook reads the turn's finished commands from the transcript
and records each lone check. `PreToolUse` still denies a compound check.

## First version results

Built in `codex/`, with `codex/README.md` for installing. A three-turn
session ran through `codex exec`, in a separate Codex home with hook trust
bypassed:

| Part | Result |
| --- | --- |
| Hooks | `SessionStart`, `UserPromptSubmit`, `PreToolUse` with the matcher `Bash\|apply_patch\|mcp__.*`, and `Stop` all fired. |
| Check tracking | A failing `npm test` was recorded from the transcript, then a passing rerun, which went stale after a patch. |
| Refused check | Codex honors `permissionDecision: "deny"` from `PreToolUse`: it did not run `npm test \| tail -3`, and gave the hook's reason. |
| Inbox line | `UserPromptSubmit` `additionalContext` reached the model as a developer message, and Codex answered from it. |
| Resume | `SessionStart` fires again on resume, and the guidance from the start is still in the conversation. So a resume gets only the start-of-context block. |
| Claim check | Codex honors `{decision: "block", reason}` from `Stop`: the turn went on, and the next `Stop` had `stop_hook_active: true`. |
| A press | The server closed the question, and `codex queue` wrote the answer for the right thread with the CLI path a hook saved. `codex exec resume` also reads the queue, and delivered it. |
| A press from a server Codex started | Against the real Codex home, an app-server started the inbox server, and `mcpServer/tool/call` pressed an answer the way the tab does. The server ran `codex queue`, the message started its own turn as a user message, and the model answered it. `codex queue` goes through the app-server's `thread/queue/add`, and needs a saved thread: it fails for an ephemeral one. |
| Findings | `record` needs no approval with `default_tools_approval_mode: "approve"` in `.mcp.json`. Without it, Codex refused the call. |
| Data folder | MCP server processes found the hooks' data folder from their own install path. |
| Tab | Drawn in a browser with a stand-in host, in dark and light, at the desktop tab's 576 px. The stand-in ran the real server code. Typed text and its focus outlasted two polls. A poll held back past a press did not bring the closed row back. A row closed by a press or by the update stayed in place for five seconds, then moved under Closed. |

Found while building:

- The transcript writes a command's `cwd` as a `file://` URL. Read as a path,
  every check looked like it ran in a folder that is gone.
- `codex exec` rejects an unknown `--disable` feature name, so the update
  drops any name a release rejects and tries again.

The inbox model, measured on four sample exchanges, three runs each:

| Model | Right | Time per call |
| --- | --- | --- |
| `gpt-6.1-sol`, low effort | 12 of 12 | 4–5 s |
| `gpt-6-luna`, low effort | 10 of 12 | 3 s |

Both misses by `gpt-6-luna` closed an open finding because the reply said
it was recorded, which drops the finding. It made the same mistake in the
live session. The plugin uses `gpt-6.1-sol`.

In a desktop app session with the hooks trusted, the hooks ran, the update
added the reply's two questions, and the tab polled. Not confirmed yet: a
press from the tab in the desktop app.
