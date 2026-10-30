# Hooks: events, matchers, input and output

Part of [Codex plugins and the Codex app](../codex-plugins.md).

A hook is a command (or MCP tool call) Codex runs when an event matches.
Hooks reached general availability in May 2026 (L/whats-new#automate-trusted-workflows;
L/changelog#codex-2026-05-13-app, an entry dated 2026-05-14: "This launch
also includes Hooks general availability"). The `hooks` feature flag is Stable and on
(GH/codex-rs/features/src/lib.rs:1319-1324).

## Events

| Event | When | Matcher filters | Plain stdout | `additionalContext` |
| --- | --- | --- | --- | --- |
| `SessionStart` | Start; sources `startup`, `resume`, `clear`, `compact` | source | Developer context | Yes |
| `UserPromptSubmit` | Each prompt | ignored | Developer context | Yes |
| `PreToolUse` | Before a covered tool call | tool name | Ignored | Yes, without blocking |
| `PermissionRequest` | "when Codex is about to ask for approval" | tool name | Ignored | No |
| `PostToolUse` | After a covered tool call, including non-zero exits | tool name | Ignored | Yes |
| `PreCompact`, `PostCompact` | Around compaction | `manual` or `auto` | Ignored | No |
| `SubagentStart` | A subagent starts | agent type | The subagent's context | Yes |
| `SubagentStop` | A subagent stops | agent type | Invalid | No |
| `Stop` | The main turn ends | ignored | Invalid | No |
| `Interrupt` | The person interrupts an active main turn | ignored | Invalid; only `systemMessage` | No |
| `PreModelRequest`, `PostModelRequest` | Around each model request attempt, retries included. Observation only; 0.164.0 | not checked | Logged, never read as control | No |
| `SessionEnd` | Main thread ends | reason | n/a; output advisory | No output schema |

Sources: the event table and per-event sections of L/hooks, and the
generated schemas in GH/codex-rs/hooks/schema/generated/ (12 input schemas,
11 output schemas; no session-end output).

Notes per event:

- **SessionStart after compaction.** "After Codex compacts a root session,
  SessionStart hooks that match source: "compact" run before the next model
  request", including mid-turn. "If the hook returns `continue: false`, Codex
  ends the turn without sending another model request." (L/hooks#sessionstart)
  The inbox's SessionStart hook has no matcher, so it fires on compact
  (the `SessionStart` block of codex/plugin/hooks/hooks.json).
- **SessionStart `fork`.** The schema on `main` adds a fifth source, `fork`
  [source] (GH/codex-rs/hooks/schema/generated/session-start.command.input.schema.json).
  The docs list four. The hooks page warns that "main branch schemas may
  include hook fields that are not in the current release".
- **SessionStart resume.** It fires again on resume, and earlier guidance is
  still in the conversation [live] (docs/plans/codex-plugin/step-0-and-results.md:128).
- **SessionEnd.** "runs for the main thread when you archive or delete a
  conversation that's still open, when Codex closes normally, or after a
  conversation has been idle and isn't open in any connected client for 30
  minutes." "Switching away from a conversation or calling thread/unsubscribe
  doesn't end the session right away." "Your hook can still read the session
  transcript while it runs." `reason` is always `other`. It does not run for
  subagents. The example payload has `"session_id": "thr_123"`.
  (L/hooks#sessionend)
- **Interrupt.** "doesn't run for idle threads or subagents". "Hook output
  can't prevent the interruption or restart the turn." (L/hooks#interrupt)
- **PermissionRequest.** "runs when Codex is about to ask for approval, such
  as a shell escalation or managed-network approval… It doesn't run for
  commands that don't need approval." Any `deny` wins; "an `allow` lets the
  request proceed without surfacing the approval prompt". With no decision,
  the normal flow runs. `updatedInput`, `updatedPermissions` and `interrupt`
  "fail closed today". `tool_input.description` is a "Human-readable approval
  reason, when Codex has one". (L/hooks#permissionrequest) [inference] The
  hook firing does not prove the person sees a prompt: under "Approve for me",
  eligible requests go "through automatic review instead of showing a prompt
  for manual approval" (L/permission-modes#choose-a-mode).
- **Compaction hooks can stop work.** A PreCompact `continue: false` "stops
  before compacting"; PostCompact "stops after compacting".
  (L/hooks#precompact, #postcompact)
- **SubagentStart ignores `continue: false`.** (L/hooks#common-output-fields)

## Matchers and tool coverage

- A matcher is a regex. `"*"`, `""` or none matches all. (L/hooks#matcher-patterns)
- Shell and unified exec both match as `Bash`. `apply_patch` also matches
  `Edit` and `Write`. `spawn_agent` also matches `Agent`. MCP tools match as
  `mcp__<server>__<tool>`. Hosted tools such as WebSearch are not covered.
  (L/hooks#matcher-patterns, #tool-coverage)
- "Some specialized tool paths can opt out of the default hook path. Treat
  tool hooks as a useful guardrail, not a complete enforcement boundary."
  (L/hooks#tool-coverage)
- Unified exec: "A later `write_stdin` poll can deliver the original command's
  `PostToolUse` when that command finishes." `write_stdin` "doesn't run
  `PreToolUse` again". (L/hooks#tool-coverage)
- Code mode: PreToolUse can block or rewrite a call made from JavaScript. A
  blocking PostToolUse rejects the promise. (L/hooks#tool-calls-from-code-mode)
- **Live shapes** [live] (docs/plans/codex-plugin/step-0-and-results.md:58-60):
  - Shell: `tool_name` is `Bash`, `tool_input.command` is the command,
    `tool_response` is the output text only, with no exit code.
  - Patch: `apply_patch` fires Pre and PostToolUse. `tool_input.command` is
    the patch; its `*** Add File:`, `*** Update File:` and `*** Delete File:`
    lines name the files.
  - MCP tools appear as `mcp__<server>__<tool>`, so PreToolUse sees them.
- **A long command got no PostToolUse.** A 20-second command in the desktop
  app got none, because code mode returns after about 1 second [live]
  (docs/plans/codex-plugin/step-0-and-results.md:106-111). The exit code is in the transcript
  instead (see "Transcripts").
- **The repo's matcher** is `Bash|apply_patch|mcp__.*` on PreToolUse
  (the `PreToolUse` block of codex/plugin/hooks/hooks.json).

## Input

- **Common fields.** `session_id` ("Subagent hooks use the parent session
  id."), `transcript_path` (string or null), `cwd`, `hook_event_name`,
  `model`, plus `turn_id` on turn-scoped events. `permission_mode` is one of
  `default|acceptEdits|plan|dontAsk|bypassPermissions`. (L/hooks#common-input-fields)
- **Schema details** [source] (GH/codex-rs/hooks/schema/generated/*.input.schema.json):
  - Every input schema has `additionalProperties: false`.
  - SessionEnd requires only `cwd`, `hook_event_name`, `reason` (const
    `other`), `session_id`, `transcript_path`. No `model`, no `permission_mode`.
  - Pre/PostCompact have no `permission_mode`.
  - Optional `agent_id` and `agent_type` appear on PreToolUse, PostToolUse,
    PermissionRequest, UserPromptSubmit, PreCompact and PostCompact. The docs
    list them only on SubagentStart and SubagentStop. Stop, Interrupt and
    SessionStart have neither.
  - PreToolUse requires `tool_use_id`; PermissionRequest has none.
  - Stop requires `stop_hook_active` and `last_assistant_message` (nullable).
  - SubagentStop requires `agent_transcript_path`.
- **The repo's `HookInput` type** omits `model`, `permission_mode` and
  `tool_use_id` (codex/src/hook.ts:HookInput).
- [inference] A subagent's prompts and tool calls carry the parent's
  `session_id`. Without a check on `agent_id`, they would land in the parent
  session's inbox.

## Output

- **Common fields.** `continue`, `stopReason`, `systemMessage` ("Surfaced as a
  warning in the UI or event stream"), `suppressOutput` ("Parsed today but not
  yet implemented"). "Exit 0 with no output is treated as success."
  (L/hooks#common-output-fields)
- **PreToolUse.** Deny with `permissionDecision: "deny"`, legacy
  `{"decision":"block"}`, or exit 2 with the reason on stderr. Rewrite with
  `permissionDecision: "allow"` plus `updatedInput`. `"ask"`, legacy
  `approve`, `continue: false`, `stopReason` and `suppressOutput` are "parsed
  but not supported yet. Codex marks the hook run as failed, reports the
  error, and continues the tool call." (L/hooks#pretooluse) The schema still
  lists `ask` and `approve` [source].
- **PostToolUse.** `decision: "block"` "replaces the tool result with that
  feedback". `updatedMCPToolOutput` is parsed but unsupported.
  (L/hooks#posttooluse)
- **UserPromptSubmit** can block with `decision: "block"` or exit 2.
  (L/hooks#userpromptsubmit)
- **Stop.** `decision: "block"` "tells Codex to continue and automatically
  creates a new continuation prompt that acts as a new user prompt, using
  your reason". `continue: false` from any Stop hook wins. (L/hooks#stop) The
  stop output schema has only `continue`, `decision`, `reason`, `stopReason`,
  `suppressOutput`, `systemMessage` [source].
- **Live** [live] (docs/plans/codex-plugin/step-0-and-results.md:124-129): SessionStart and
  UserPromptSubmit `additionalContext` reached the model as a developer
  message; PreToolUse `deny` stopped the command; Stop `{decision: "block",
  reason}` continued the turn and the next Stop had `stop_hook_active: true`.
- **Size limit.** "By default, Codex limits each model-visible hook-output
  message to roughly 2,500 tokens." Larger text is spilled to
  `<temp_dir>/hook_outputs/<session_id>/<uuid>.txt` with a head-and-tail
  preview. `additionalContextLimit` per handler (positive, or `0` for
  unlimited) raises it. "The setting applies only to `additionalContext`.
  Tool feedback and continuation prompts keep the default limit." "Context
  from multiple hooks and plugins adds up and can degrade model performance."
  For events that cannot produce context, Codex "ignores
  `additionalContextLimit` and reports a configuration warning".
  (L/hooks#large-hook-output) The repo's hooks set no `additionalContextLimit`
  (codex/plugin/hooks/hooks.json).
