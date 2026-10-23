# Agent task lists

Checked on 2026-10-23. This file records whether each host shows the agent's own task list to the inbox, with the source or live run behind each fact. The Overview tab's work queue depends on it (`docs/plans/overview.md`).

Tags: **[source]** read in code or a binary. **[live]** seen in a run, with its log under `.scratch/ov/`. **[unknown]** not settled.

## Summary

| Host | Task list the agent can use | Offered by default | How the inbox can read it |
| --- | --- | --- | --- |
| Claude Code | `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`; also `TodoWrite` | No, on a first-party model | The mod's `tool.call` event, when the tools are on |
| Codex | `update_plan` | No, with the default model in `codex exec`. The app is [unknown] | The rollout, at Stop |
| omp | `todo` | Yes | The extension's `tool_result` event, which carries the whole list |

Only omp offers a list by default. The queue therefore cannot depend on one. The Overview call writes the queue from the exchange in every host, and reads a host's list as extra input where one exists.

## Claude Code

Version 2.1.309.

- The binary holds `TodoWrite`, `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet` [source].
- The task tools are on when `CLAUDE_CODE_ENABLE_TASKS` is not `false` and one more condition holds. The condition is true for a background-job session, for an SDK launch option that opts in, for a main-loop model the binary cannot name, and when `CLAUDE_CODE_ENABLE_TODO_TOOLS` is `1`. The binary is minified, so these names come from reading its gate function [source].
- `claude -p --model haiku` with no env var was offered no task tool. `ToolSearch` found none, even among deferred tools, and the agent said so [live, `.scratch/ov/cc-p.jsonl`].
- The same run with `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` offered the four task tools as deferred tools. The agent called them [live, `.scratch/ov/cc-CLAUDE_CODE_ENABLE_TODO_TOOLS.jsonl`]:
  - `TaskCreate {subject, description, activeForm}`, once per task.
  - `TaskUpdate {taskId, status}` with `status` `in_progress` then `completed`. The ids were "1", "2", "3" in creation order.
- With `CLAUDE_CODE_ENABLE_TASKS=1` alone, nothing was offered [live, `.scratch/ov/cc-CLAUDE_CODE_ENABLE_TASKS.jsonl`].
- The interactive session that wrote this file was offered none of them. No local Claude Code transcript holds a call to any of them [live].
- A mod sees a call through `tool.call`, which fires for every tool call, with the arguments as fields of the event (`docs/reference/claude-code-mods.md`, the Tools row). Reading these calls is the documented path. It has not been run [unknown].
- A task's text arrives only in `TaskCreate`. A `TaskUpdate` names the task by id. A reader must keep the id to text map itself. Whether ids restart after `/clear` is [unknown].
- Settings hooks have `TaskCreated` and `TaskCompleted` events. The guard skips a mod's `classic.*` hooks, so a mod cannot use them (`docs/reference/claude-code-mods.md`).

## Codex

- `update_plan` is a `function_call` row in the rollout, as `arguments` JSON: `{plan: [{step, status}]}`, with `status` `pending`, `in_progress` or `completed` [live]. Seen in a rollout from September 2025; its `session_meta` holds the CLI version.
- The 0.154.0 binary holds the `update_plan` instructions, which name the same three statuses [source].
- `codex exec` 0.154.0 with the default model `gpt-6-astra` was asked to use `update_plan`. It said the tool was not available and made no function call [live, `.scratch/ov/cx-exec.log`].
- No rollout from 2026 on this Mac holds an `update_plan` call [live].
- Whether the Codex app offers `update_plan`, and which setting turns it on, are [unknown]. A 2026 transcript mentions `update_plan.enabled=true`. The binary has no string by that name.
- The inbox's PreToolUse matcher is `Bash|apply_patch|mcp__.*`, so the hook never sees `update_plan`. Widening the matcher would stop the entry running until the person trusts it again (`docs/reference/codex-plugins.md`). The Stop hook already reads the turn's rows from the rollout (`codex/src/transcript.ts`), so that is the read path. It has not been run [unknown].
- The app's bundled Codex is 0.160.1 or later. This file's live runs used 0.154.0.

## omp

Source read in the `v18.12.3` tag, the same version as the `omp` on this Mac. The copy under `node_modules` is 17.4.2 and was not used.

- The `todo` tool is built in and on by default: `todo.enabled` defaults to true (`packages/coding-agent/src/tools/settings.ts:356`) [source].
- A task has `content`, `status` and an optional `blocker`. Status is `pending`, `in_progress`, `completed`, `abandoned` or `blocked`. Tasks sit in named phases (`tools/todo.ts`) [source].
- Every successful call returns `details: {op, phases, storage}`, with the whole list after the call (`tools/todo.ts:761`) [source].
- An extension's `tool_result` handler receives `toolName` and `details`. For `todo` the event is the custom form, `details: unknown` (`extensibility/extensions/types.ts:1419-1432`) [source]. The extension checks the shape itself.
- Live capture of a `todo` result in an extension is [unknown].
