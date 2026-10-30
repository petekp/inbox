# Codex plugin: what Codex allows

Part of [the Codex plugin plan](../codex-plugin.md).

Status: built. Session checks and the claim check were removed, so any part of this plan about them describes removed code.

## What a Codex plugin can do

| Part | What it does | Limits |
| --- | --- | --- |
| Manifest | `plugin.json` at the root, or `.codex-plugin/plugin.json` [documented] | None |
| Skills | `skills/<name>/SKILL.md`, invoked with `$name` or the slash list [documented] | Each use is a model turn |
| MCP servers | `.mcp.json`. A local stdio server works for a personal install [verified: the circuit plugin uses one] | Public listing needs a remote HTTPS server [documented] |
| Hooks | `hooks/hooks.json`. Events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `Stop`, `SubagentStart`, `SubagentStop`, `Interrupt`, `SessionEnd` [documented] | The person must trust each hook, and trust it again after any change. A plugin with hooks can't be listed in the public directory [documented] |
| Context for the model | Stdout or `additionalContext` from `SessionStart` and `UserPromptSubmit`, added as developer context [documented] | About 2,500 tokens per hook message by default [documented] |
| Sending the agent back | `Stop` returns `decision: "block"` with a `reason`, and gets `stop_hook_active` [documented] | None |
| Background hooks | `"async": true`, up to 8 at once per session [documented] | Unfinished ones are cancelled when the session ends |
| Custom UI | MCP Apps: HTML from a `ui://` resource on the plugin's MCP server [documented] | The CLI's `enable_mcp_apps` flag is off [verified], so this is for the desktop app |
| Tabs and sidebar entries | `_meta["openai/ui"].entrypoints`: `thread` opens the app as a tab in a thread, `global` as a sidebar entry [verified for a thread tab from a local plugin] | Thread tabs open with `{}` as arguments. The server learns the thread from each call's `_meta.thread_id` [verified] |
| Messages from the app | `ui/message` sends text into the current thread [verified] | Codex wraps it as untrusted input from an MCP app. The model reports the text instead of following it [verified] |
| Live updates in the app | `resources/subscribe` and `notifications/resources/updated` [documented for file viewers] | A thread tab's subscribe never reached the server, and no update arrived [verified]. The app calls a data tool on a timer instead [verified] |
| Status line | `tui.status_line` in the CLI [verified] | Built-in items only. No custom command |
| Messages from outside the app | `codex queue --thread <id> --message <text>` queues a message for a session. The desktop app runs it as the person's message, after any running turn [verified] | None |
| App server | `turn/start`, `thread/resume`, `turn/completed` and more on a shared local daemon [verified: in the generated protocol types] | Marked experimental |
| One-off model call | `codex exec --ephemeral --ignore-user-config` with tools and features off [verified] | About 12.5k input tokens of overhead per call [verified] |

## Feature map

| Inbox feature | In the mod | In the plugin | Fit |
| --- | --- | --- | --- |
| `record`, `close` | `$.tool.register`, allowed without a prompt | MCP tools served by the plugin. Approval set per tool in the person's Codex config | Direct, but see gap 5 |
| Session checks, `run_check`, the claim check | Removed | Removed | None |
| `GUIDANCE` in the system prompt | `prompt.compose` adds a section | `SessionStart` context on every start, resume, clear and compact | Direct. It becomes developer context, not system prompt |
| Start-of-context block (`carryText`) | `prompt.context` | The same `SessionStart` output | Direct |
| Inbox line and answer line | `prompt.submit` context | `UserPromptSubmit` `additionalContext` | Direct |
| Per-reply update by the inbox model | `$.model.complete` with Sonnet after `turn.complete` | A background `Stop` hook asks the server to run `codex exec` with `systemText` | Direct. See gaps 6 and 7 |
| Catch-up after a missed update | `$.model.fork` | `codex exec` on `transcriptCatchUpPrompt`, built from `transcript_path` | Direct, later |
| Activity lines for the update | Every tool call | `PreToolUse` on the shell, patch and MCP tools. Codex's other tools add no line | Reduced |
| Band above the prompt | `ui.render` AbovePrompt | Nothing. The Inbox tab's labels carry the counts | Gap 1 |
| `/inbox` pane, three tabs, keys | `ui.render` Pane | The Inbox tab: an MCP App opened from a thread entrypoint | Direct |
| Pane buttons that send a message | `$.prompt.submit` | The tab calls a tool, and the MCP server runs `codex queue` | Direct |
| Last action on a row | Recorded by `runPress()` | The same rule in the tab: each button shows what it did as soon as it is pressed | Direct |
| Card after 15 minutes away, or on resume | `clock.every` and `isAway` | A timer in the MCP server. The tab shows the card | Direct |
| PRs tab | `gh` polled from the mod | `gh` polled by the server. `prs.ts` carries over | Direct, later |
| Questions and permission dialogs | AskUserQuestion and `PermissionRequest` | Permission dialogs: `PermissionRequest` exists and is not used yet. Question dialogs (`request_user_input_async`): no hook fires. The Stop hook reads the turn's dialogs from the transcript and notes each, with its questions and options, as still open. The answer arrives as the person's next message | Question dialogs built; permission dialogs later |
| Rate-limit and sign-in stops | `classic.StopFailure` | No such event. `Interrupt` covers only interrupts | Gap 6 |
| The person's `!` and slash commands | `session.append` command rows | No event | Gap 6 |
| Telling a button's message from the person's own | `origin.kind` on `prompt.submit` | `UserPromptSubmit` gets only the text. The server matches it against the messages it queued | Direct |
| Previous session's card ("Continue from it") | Store keyed by folder | The same, in the server's state | Direct, later |
| `/inbox demo` | Sample state | A demo switch in the tab | Direct, later |
| Every open session in one view, from the roadmap | Not built | A `global` entrypoint: a sidebar entry listing every session | Later |
| Saved state | `$.store`, one writer | One JSON file per session, written under a lock by hooks and MCP servers | Direct |

## Gaps and what to do about each

### 1. The band

The CLI status line takes only built-in items [verified]. No hook output
appears above the prompt. A hook's `systemMessage` appears in the conversation
as a warning, after each turn [documented]. That is too loud for "2 waiting on
you".

**Do:** draw no band. The Inbox tab's labels carry the counts, and its status
sits at the right of the tab row. Add nothing to the conversation in the
first version. Look again when Codex allows a custom
status line item.

### 2. The pane

**Do:** the plugin's MCP server registers an `inbox.tab` tool with a thread
entrypoint and a `ui://inbox/tab` resource. The person opens it as a tab
beside the conversation, one instance per thread. It shows Asks and
Finds, with the status at the right of the tab row.

- **Buttons:** a press calls an app-only tool, and the MCP server runs
  `codex queue` with the press's text. The message reaches the model as the
  person's own, as the mod's presses do. The server records what it sent,
  so `UserPromptSubmit` can tell a press from the person's own words.
  Rejected: `ui/message`, which Codex wraps as untrusted input from an app,
  so the model reports its text instead of acting on it.
- **Live updates:** the app calls a data tool every few seconds while open.
  A thread tab gets no resource updates.
- **Which session:** every call from the tab carries `_meta.thread_id`, the
  same id the hooks get as `session_id`. The server keys each tab's data by
  it.

**Rejected:** a local web page served on a fixed port. It needs a browser
beside Codex. The tab sits beside the conversation it serves.

### 3. Hooks are short-lived processes

The mod keeps the turn's state in memory: activity, replies Claude was sent
back from, what the inbox line last told Claude. It runs timers. Codex starts
a new process for each hook. Up to 8 background hooks can run at once.

**Do:** keep each session's state in one JSON file in the plugin's data
folder. Every hook and MCP server process reads it, changes it and writes it
back under a lock. Each hook is a short script that does its event's work
and prints its answer. The per-reply update runs in a detached process the
`Stop` hook starts, so a long model call outlives the hook.

Reason: the first version needs no timers, and the tab polls, so nothing
needs a process that stays up. Codex does not run one MCP server per
session either: the desktop app started 17 server processes in three
minutes, most only to list tools [verified in step 0]. Hooks get
`session_id`, and tool calls carry the same id in `_meta` [verified], so
every process finds its session's file. Rejected: one long-lived inbox
process per person, reached over a socket. It adds a lifecycle, version
checks after each update, and a socket, for timers the first version
doesn't have. The card after time away and the PRs tab may need it later.

- **Cost:** every matched hook starts a Node process before each matched
  tool call. So the plugin has no `PostToolUse` hook, and `PreToolUse`
  matches only the shell, patch and MCP tools, with
  `Bash|apply_patch|mcp__.*`. It notes the activity line before the tool
  runs, since a long shell command gets no `PostToolUse`.
- **Failure case:** a hook that fails exits 0 with no output. Codex goes on
  as if the plugin weren't installed.
- **Guard:** the hooks do nothing in `codex exec` runs. That covers the
  inbox's own update call and runs that other plugins start. A hook reads
  the first line of `transcript_path`, whose `originator` is `codex_exec` in
  an `exec` run [verified in step 0].
- **Node:** hooks and the server run on `$CODEX_MCP_NODE_PATH`, the Node
  the desktop app ships with, and fall back to `node` on the PATH. The server
  starts through `/bin/sh` to choose, and `.mcp.json` lists the variables
  Codex passes it in `env_vars`, as OpenAI's bundled plugins do [verified:
  hooks, server and update ran with no `node` on the PATH].

### 4. Removed: `run_check` and check tracking

Removed. The mod and the plugin no longer run or record session checks. The check modules and the git and tree helpers they used no longer exist.

### 5. Which session a tool call belongs to

Answered in step 0: every tool call carries the session id in `_meta`.

### 6. Events Codex doesn't have

There is no `StopFailure`, so the band can't say "Rate limited until 3pm". No
event carries the person's `!` or slash commands, so the inbox can't close a
task when the person runs its command. The inbox model still sees the
person's next message, so it can close the task then.

**Do:** leave both out. Check new Codex releases for a stop-failure event.

### 7. The model-facing text was measured on Claude and Sonnet

`systemText`, `GUIDANCE`, the tool descriptions and the inbox texts were tuned on
Claude and Sonnet. AGENTS.md records that a one-word change made the inbox
model re-add dismissed questions. The port changes both the agent, Codex, and
the inbox model, an OpenAI model.

**Do:** port the text with as few changes as possible. Two kinds are needed, both in `codex/src/texts.ts`:

- "Claude" becomes "Codex".
- The surface: the band and the /inbox pane become the Inbox tab. Tool
  names stay, since Codex also names the inbox's tools
  `mcp__inbox__record` and `mcp__inbox__close` [verified].

Then measure it as AGENTS.md describes. Run the same sample exchanges several times
through `codex exec` with each candidate model, and count re-added, wrongly
closed and missed items. Change wording only for a failure the counts show.

### 8. Distribution

A plugin with hooks can't be listed in the public directory [documented].
Each person must trust the hooks once, and again after each update that
changes them.

**Do:** publish through a Git marketplace, as the mod does:
`codex plugin marketplace add petekp/<repo>`. Say in the README that the
hooks need trust, and why.
