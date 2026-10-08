# The inbox as a Codex plugin

Status: plan. Nothing is built. The Claude Code mod stays unchanged.

Goal: give Codex sessions what the inbox gives Claude Code sessions. That
means one place for what waits on the person, Codex's findings, check results
it can trust, and an inbox kept current after each reply.

Terms follow `GLOSSARY.md`. "The mod" is the Claude Code mod in this repo.
"The plugin" is the Codex version. Each claim about Codex carries a tag:

- **[verified]**: checked on this Mac against Codex CLI 0.154.0, or the
  desktop app's bundled Codex 0.160.1.
- **[documented]**: stated in OpenAI's plugin, hooks or UI docs, or in
  [openai/mcp-extensions](https://github.com/openai/mcp-extensions), not tried.
- **[unverified]**: inferred. Step 0 below checks it before anything is built.

## Summary

- **Most of the inbox ports directly.** A plugin's MCP server serves the
  tools. Hooks give Codex the inbox texts. A background Stop hook runs the
  per-reply update. A blocking Stop hook sends Codex back over a contradicted
  claim.
- **The pane becomes a tab beside each conversation.** OpenAI's MCP
  extensions let a plugin's MCP App open as a tab within a thread, one
  instance per thread [documented]. Its buttons send a message into the
  conversation with `ui/message` [documented]. The SDK and its example
  plugin, Bits & Bolts, target the Codex desktop app with a local stdio MCP
  server, the same shape as this plugin.
- **The band has no surface.** No plugin can draw above the prompt. The tab's
  header shows what the band shows.
- **The plugin needs a long-lived process.** The mod is one process that
  lives as long as the session. A Codex hook is a new process for every event.
  Timers, the live tab and safe state writes need one process that stays up.
  The plugin's MCP server is that process, if it can tell which session it
  serves.
- **The first version** includes the findings and close tools, the inbox
  texts, the per-reply update, check tracking with the claim check, and the
  Inbox tab with Needs you and Findings. The PRs tab comes later.

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
| Tabs and sidebar entries | `_meta["openai/ui"].entrypoints`: `thread` opens the app as a tab in a thread, `global` as a sidebar entry [documented, desktop supported] | Thread tabs open with `{}` as arguments. Whether the app learns which thread it is in [unverified] |
| Messages from the app | `ui/message` with `target: "active"` sends text into the current thread [documented] | None |
| Live updates in the app | `resources/subscribe` and `notifications/resources/updated` [documented for file viewers, used by Bits & Bolts] | For thread tabs [unverified]. Fallback: the app calls a data tool on a timer |
| Status line | `tui.status_line` in the CLI [verified] | Built-in items only. No custom command |
| Messages from outside the app | `codex queue --thread <id> --message <text>` [verified: the command exists] | Not needed while `ui/message` works |
| App server | `turn/start`, `thread/resume`, `turn/completed` and more on a shared local daemon [verified: in the generated protocol types] | Marked experimental |
| One-off model call | `codex exec --ephemeral --ignore-user-config --output-schema <file>` [verified: the flags exist] | Its cost and token overhead [unverified] |

## Feature map

| Inbox feature | In the mod | In the plugin | Fit |
| --- | --- | --- | --- |
| `record_finding`, `close` | `$.tool.register`, allowed without a prompt | MCP tools served by the plugin. Approval set per tool in the person's Codex config | Direct, but see gap 5 |
| `run_check` | Runs each check through Claude's own Bash tool | Left out. See gap 4 | Gap |
| Checks Codex runs in its shell | `tool.call` on Bash records lone checks and refuses compound ones | `PreToolUse` on the shell tool denies a compound check. `PostToolUse` records a lone one's result | Direct if the hook input carries the exit code [unverified] |
| Stale results | Git snapshots after each turn | The same git snapshots, taken by the server at `Stop`. `git.ts` carries over | Direct |
| Session's repos | Paths from Edit, Write, NotebookEdit | Paths from Codex's patch tool, via `PostToolUse` [unverified shape] | Direct if the hook fires for it |
| Claim check | `classic.Stop` blocks once | A blocking `Stop` hook | Direct |
| `GUIDANCE` in the system prompt | `prompt.compose` adds a section | `SessionStart` context on every start, resume, clear and compact | Direct. It becomes developer context, not system prompt |
| Start-of-context block (`carryText`) | `prompt.context` | The same `SessionStart` output | Direct |
| Inbox line and answer line | `prompt.submit` context | `UserPromptSubmit` `additionalContext` | Direct |
| Per-reply update by the inbox model | `$.model.complete` with Sonnet after `turn.complete` | A background `Stop` hook asks the server to run `codex exec` with `SYSTEM` | Direct. See gaps 6 and 7 |
| Catch-up after a missed update | `$.model.fork` | `codex exec` on `transcriptCatchUpPrompt`, built from `transcript_path` | Direct. Depends on Codex's transcript format [unverified] |
| Activity lines for the update | Every tool call | `PostToolUse` matched to the shell and patch tools only. Other tools add no line | Reduced |
| Band above the prompt | `ui.render` AbovePrompt | The Inbox tab's header. Nothing above the prompt | Gap 1 |
| `/inbox` pane, three tabs, keys | `ui.render` Pane | The Inbox tab: an MCP App opened from a thread entrypoint | Direct |
| Pane buttons that send a message | `$.prompt.submit` | `ui/message` to the active thread | Direct |
| Last action on a row | Drawn with `withLastAction()` | The same rule in the tab: each button shows what it did as soon as it is pressed | Direct |
| Card after 15 minutes away, or on resume | `clock.every` and `isAway` | A timer in the MCP server. The tab shows the card | Direct |
| PRs tab | `gh` polled from the mod | `gh` polled by the server. `prs.ts` carries over | Direct, later |
| Questions and permission dialogs | AskUserQuestion and `PermissionRequest` | `PermissionRequest` exists. Codex's question tool is not on by default | Later |
| Rate-limit and sign-in stops | `classic.StopFailure` | No such event. `Interrupt` covers only interrupts | Gap 6 |
| The person's `!` and slash commands | `session.append` command rows | No event | Gap 6 |
| Telling a button's message from the person's own | `origin.kind` on `prompt.submit` | `UserPromptSubmit` gets only the text. The server matches it against the messages it queued | Direct |
| Previous session's card ("Continue from it") | Store keyed by folder | The same, in the server's state | Direct, later |
| `/inbox demo` | Sample state | A demo switch in the tab | Direct, later |
| Every open session in one view, from the roadmap | Not built | A `global` entrypoint: a sidebar entry listing every session | Later |
| Saved state | `$.store`, one writer | JSON files under `PLUGIN_DATA`, written only by the MCP server | Direct |

## Gaps and what to do about each

### 1. The band

The CLI status line takes only built-in items [verified]. No hook output
appears above the prompt. A hook's `systemMessage` appears in the conversation
as a warning, after each turn [documented]. That is too loud for "2 waiting on
you".

**Do:** show the band's content as the Inbox tab's header. Add nothing to
the conversation in the first version. Look again when Codex allows a custom
status line item.

### 2. The pane

**Do:** the plugin's MCP server registers an `inbox.tab` tool with a thread
entrypoint and a `ui://inbox/tab` resource. The person opens it as a tab
beside the conversation, one instance per thread. It shows the header, then
Needs you and Findings.

- **Buttons:** each press sends its message with `ui/message`, as the mod's
  presses send a prompt. The text appears as the person's message, so the
  server records what it sent, to tell it from the person's own words.
- **Live updates:** the app subscribes to its resource and redraws on
  `notifications/resources/updated`. If thread tabs don't get those, it calls
  a data tool every few seconds while open.
- **Which session:** the tab must show its own thread's inbox. Its tool call
  gets `{}`, so step 0 checks what the app learns about its thread.

**Rejected:** a local web page served on a fixed port. It needs a browser
beside Codex, and its buttons would need `codex queue`, which is unverified
for a live session. The tab sits in the conversation and sends with
`ui/message`.

### 3. Hooks are short-lived processes

The mod keeps the turn's state in memory: activity, replies Claude was sent
back from, what the inbox line last told Claude. It runs timers. Codex starts
a new process for each hook. Up to 8 background hooks can run at once.

**Do:** the plugin's MCP server is the long-lived process. Codex starts one
with each session and stops it with the session, as Claude Code does the
mod. It owns the session's state, writes it to `PLUGIN_DATA`, runs the
timers, queues model updates and serves the tab. Each hook is a small script
that posts its event to the session's server over a local socket and prints
the answer.

This needs the hook and the server to agree on a session. Hooks get
`session_id` [documented]. Whether the MCP server can learn it is step 0
item 4. If it can't, the fallback is one server per person, started by the
first hook that finds it missing, with each MCP server forwarding to it.

- **Cost:** every matched hook starts a process, which adds latency to each
  matched tool call. So `PostToolUse` matches only the shell and patch tools.
- **Failure case:** if the server doesn't answer, a hook exits 0 with no
  output. Codex goes on as if the plugin weren't installed.
- **Guard:** the hooks do nothing in `codex exec` runs. That covers the
  inbox's own update call and runs that other plugins start. How a hook tells
  it is in `exec` [unverified]. The fallback is an environment variable the
  inbox sets on its own runs.

### 4. `run_check` would bypass Codex's sandbox

In the mod, `run_check` runs each check through Claude's own Bash tool, so it
gets Claude Code's permission check. An MCP server that runs commands would
run them outside Codex's sandbox and approvals.

**Do:** leave `run_check` out. Record checks Codex runs in its own shell, as
the mod already does for Bash. Deny a compound check in `PreToolUse`, with the
reason the mod gives. `checks.ts` and `check-tracking.ts` carry over unchanged.

### 5. Which session a tool call belongs to

`record_finding` must reach the right session's inbox. Codex may not tell an
MCP server which session called it [unverified]. The circuit plugin learns the
folder from MCP roots, not the session.

**Do:** check first whether the tool call carries the session id. If it
doesn't, a `PreToolUse` hook on the inbox's tools adds `session_id` to the
input through `updatedInput` [documented]. Hooks always get `session_id`.

### 6. Events Codex doesn't have

There is no `StopFailure`, so the band can't say "Rate limited until 3pm". No
event carries the person's `!` or slash commands, so the inbox can't close a
task when the person runs its command. The inbox model still sees the
person's next message, so it can close the task then.

**Do:** leave both out. Check new Codex releases for a stop-failure event.

### 7. The model-facing text was measured on Claude and Sonnet

`SYSTEM`, `GUIDANCE`, the tool descriptions and the inbox texts were tuned on
Claude and Sonnet. AGENTS.md records that a one-word change made the inbox
model re-add dismissed questions. The port changes both the agent, Codex, and
the inbox model, an OpenAI model.

**Do:** port the text with as few changes as possible. Two kinds are needed:

- "Claude" becomes "Codex".
- Tool names change. The texts name `mcp__inbox__record_finding`, Bash, Read
  and others by their Claude Code names. Codex names MCP tools and its own
  tools differently [unverified: the exact names].

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

## Cost

The update runs `codex exec` once per reply, on the person's Codex sign-in.
On a ChatGPT plan it counts toward usage limits.

The inbox's own prompt is the same size as the mod's: 3–4k tokens in,
100–250 out. `codex exec` adds its own base instructions [unverified size].
With `--ignore-user-config` it should skip the person's config, plugins and
MCP servers [unverified]. Step 0 measures the real total. If the base instructions double the
cost, the fallback is a direct Responses API call. That only works for people
with an API key.

`SessionStart` output is `GUIDANCE` plus the start-of-context block. With
many open items and findings it can pass the 2,500-token default limit on a
hook message. The plugin sets `additionalContextLimit` on that hook high
enough for the largest block the mod would send.

`GUIDANCE` and the tool descriptions add about 1,350 tokens to Codex's
context, as they do for Claude.

## Architecture

```
Codex session ── hooks (one process per event) ──┐
     │                                            ▼
     ├── MCP tools ──────────────────────▶ MCP server, one per session ──▶ PLUGIN_DATA/*.json
     │                                     │        │
     └── Inbox tab (MCP App) ◀── updates ──┘        └──▶ codex exec (inbox model)
              │
              └── ui/message: a press sends its text into the thread
```

- **Hooks:** `SessionStart`, `UserPromptSubmit`, `SessionEnd`, and
  `PreToolUse` and `PostToolUse` matched to the shell, patch and inbox tools.
  Two `Stop` hooks: a blocking one for the claim check, and a background one
  for the update.
- **MCP server:** Node, the same language as the mod, built on
  `@openai/mcp-extensions`. It reuses the logic
  of `checks.ts`, `check-tracking.ts`, `git.ts` and `prs.ts` unchanged. It
  uses a Codex copy of `ledger.ts`, because that file holds the model-facing
  text and imports a Claude Code type.
- **Shared code needs a build step.** Codex installs a plugin by copying only
  its folder into its cache, and manifest paths must stay inside that folder
  [documented]. Plain Node also can't load the shared modules as they are:
  `check-tracking.ts` imports `./checks` with no extension [verified]. So the
  plugin ships a bundle of the server, made with esbuild.
- **Tab:** one HTML bundle served as `ui://inbox/tab`, built with Vite as
  Bits & Bolts does. It talks to the host through the MCP Apps bridge.

## First version

Includes:

1. Plugin manifest, marketplace entry, and an install that works on this Mac.
2. The MCP server, with saved state.
3. `record_finding` and `close` as MCP tools.
4. `GUIDANCE`, the start-of-context block, the inbox line and the answer line,
   through hooks.
5. The per-reply update with `codex exec`, using the measured text and model.
6. Check tracking: record lone checks, deny compound ones, stale results, and
   the claim check.
7. The Inbox tab, with the header, Needs you, Findings, answer and dismiss
   buttons, Address it and Discuss, and the last action on each row.

Leaves out, in order of value: the PRs tab, the card after time away, the
previous session's card, catch-up, dialogs, demo mode, `run_check`.

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

## Build steps

1. Step 0.
2. Measure the ported `SYSTEM` and `GUIDANCE` with candidate models.
3. The MCP server's state and logic, with tests ported from `ledger.test.ts` and
   `check-tracking.test.ts`.
4. Hook scripts, tested by piping recorded hook input into them.
5. The MCP server's tools and socket.
6. The Inbox tab.
7. Install it, then run a real session in the desktop app.

## Decisions

1. **The code lives in a folder here,** `codex/`. A build step bundles the
   four shared modules into the plugin, so fixes to them reach the plugin on
   the next build. It must be a subfolder, because the repo root's
   `hooks/hooks.json` is the mod's and Codex would read it as plugin hooks.
   Step 0 item 8 applies. The rejected option, a new repo, would copy the
   modules and miss later fixes to them.
2. **The first version targets the desktop app only.** Step 0 checks run in
   the desktop app, and step 7 tests there. The CLI is not tested.
