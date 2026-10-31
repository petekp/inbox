# omp (oh-my-pi)

Checked on 2026-10-21. This file records what omp lets the inbox's omp host do, with the source line or live log behind each fact. It covers the host checks made before the Progress tab was built. The task list is in `task-lists.md`.

omp is the `omp` coding agent from `can1357/oh-my-pi`. The inbox's omp host is an extension (`omp/src/host.ts`). It is the only file that imports omp packages.

## Versions

| What | Version |
| --- | --- |
| omp in the inbox-ui VM, where live checks ran | 18.12.3 (`/Users/admin/omp-bin/omp`) |
| Source facts the Progress tab plan pinned | 18.1.17, tag `v18.1.17` |
| Source read for this file | tags `v18.1.17` and `v18.12.3`, shallow clones, 2026-10-21 |
| omp 18.14.0 from npm in a scratch folder, for "Checked against omp 18.14.0" | 18.14.0 (live and source, 2026-10-29) |

Each source fact below names its version. A fact marked "both" held in 18.1.17 and 18.12.3. Line numbers differ between the two, so each version's lines are given. Paths are under `packages/coding-agent/src/` unless they start with another package.

Tags used in this file:

- **[source 18.x.y]**: read in that tag's source.
- **[live]**: seen in the inbox-ui VM. The log path is beside the fact.
- **[unknown]**: not settled.

## Facts from the source

### Esc ends the run and still emits `agent_end`

- The agent loop finishes an aborted run with a message whose `stopReason` is `"aborted"` (`packages/agent/src/agent-loop.ts:698` in 18.1.17, `:808` in 18.12.3) [source both].
- `agent_end` reaches external subscribers only after the in-flight prompt count drops to 0. Hooks inside omp still fire on the original schedule (`session/agent-session.ts:774-782` in 18.1.17, `:1156-1165` in 18.12.3) [source both].
- A subscriber therefore sees `agent_end` after an Esc, not instead of one. The inbox host already ignores an `agent_end` whose `willContinue` is true (`omp/src/host-turns.ts:onAgentEnd`).

### A subagent's session file is `<parent>/<agentId>.jsonl`

- "`<parent>.jsonl` strips its suffix to `<parent>/`, and a child writes `<parent>/<agentId>.jsonl`" (`session/session-manager.ts:141-143` in 18.1.17, `:373-375` in 18.12.3) [source both].
- So a child's session file sits in a folder named after the parent's file, beside `<parent>.jsonl`. A session with no such parent file is a top-level session.

### Subagent frames go on two buses

- `emitSubagentFrame` emits each frame on `eventBus`, the spawner's session bus, and on `subagentEventBus`, a root-scoped bus, unless they are the same object (`utils/event-bus.ts:40-50`, both) [source both].
- An extension's `pi.events` is the session's `eventBus`. The root bus is separate: "Root-scoped bus carrying `task:subagent:*` observability frames for this session and every subagent it spawns" (`sdk.ts:518-521` in 18.1.17, `:739-743` in 18.12.3) [source both].
- A grandchild's frames reach its own spawner's session bus and the root bus. They do not reach the top session's `pi.events`: see "Live checks".

### The channel names are internal

- `task:subagent:lifecycle` and `task:subagent:progress` are constants in `task/types.ts:62-65` in 18.1.17 [source 18.1.17].
- In 18.12.3 the constants moved to `packages/tui/src/overlays/session-observer-registry.ts:4-7`. `task/types.ts:3-12` re-exports them and their payload types [source 18.12.3].
- `packages/wire/src/index.ts:343` (18.1.17) and `:347` (18.12.3) types them as `BusChannel` [source both].

### Plan mode and restricted sessions

- `restrictToolNames` skips discovery of custom commands, and the plan-mode policy turns it on for a plan-mode subagent: `const restrictToolNames = policy.planMode || session.restrictToolNames === true` (`task/structured-subagent.ts:403` in 18.1.17) [source 18.1.17]. `sdk.ts:1417` (18.1.17) and `:1890` (18.12.3) read the same option [source both].
- Live, a plan-mode child does load extensions but is offered only plan-mode tools: see "Live checks".

### A blocked call reaches `tool_execution_start`

- The loop emits `tool_execution_start` before it runs a call (`packages/agent/src/agent-loop.ts:3546` in 18.12.3). A call that an extension's `tool_call` handler blocked throws `ToolCallBlockedError` after it (`:3583`) [source 18.12.3].
- The approval gate runs inside the tool wrapper's `execute`, also after `tool_execution_start`. It throws for a `deny` policy and for a call the person denies (`extensibility/extensions/wrapper.ts:277`, `:351`, `:464`) [source 18.12.3].
- The wrapper emits `tool_result` only once the tool's own `execute` has returned or thrown (`:475`, `:505`), so a blocked call raises none [source 18.12.3]. The inbox notes a call's activity on `tool_result` (`omp/src/host-activity.ts:onToolResult`).
- The loop emits `tool_execution_end` for every call, a blocked one included, from `emitToolResult` (`packages/agent/src/agent-loop.ts:3454`, `:3466`). For a call that ran, it comes after the wrapper's `tool_result` [source 18.12.3]. A wait on a delegate notes its rows at `tool_execution_start`, and the inbox takes them back at a `tool_execution_end` with no `tool_result` before it (`omp/src/host-activity.ts`).

## Live checks

Tested 2026-10-21 in the inbox-ui VM with omp 18.12.3, run as `HOME=/Users/admin/omp-home-0210 omp -p --mode json --session-dir <scratch> --no-extensions -e <probe extension>`. The probe extension (`step0/omp-step2.mjs` in the VM share) logs `pi.events` frames, `session_start`, `before_agent_start`, `agent_start` and `agent_end` with the extension instance's id, edits the system prompt, and registers a `step` tool. Logs are under `step0/logs/` in the share, named `o1` to `o4`. The plan's omp source facts were pinned to 18.1.17. These answers are for 18.12.3 only.

- **`task:subagent:*` frames arrive on the parent's `pi.events`.** For a normal spawn the parent's extension instance received `task:subagent:lifecycle` with `status` `started` and `completed`, and many `task:subagent:progress` frames (`o1.omp.jsonl`).
- **Only direct children's frames reach the parent.** Main spawned `OuterAgent`, which spawned `OuterAgent.InnerAgent`. Main's instance received frames for `OuterAgent` only. `InnerAgent`'s lifecycle frames reached `OuterAgent`'s instance only (`o3.omp.jsonl`, rows with `inst` ids `6igfh` for main and `ksyyu` for `OuterAgent`).
- **What a frame carries.** Lifecycle: `id`, `agent`, `parentToolCallId`, `detached`, `agentSource`, `status`, `sessionFile`, `index`. It has no result text. Progress: a `progress` object with `id`, `status`, `task`, `assignment`, `currentTool`, `currentToolIntent`, `lastIntent`, `recentOutput`, `recentTools`, `toolCount` and token and cost counters (`o3.omp.jsonl`). A subagent's id is `<parent id>.<name>` for a nested one.
- **A child loads the parent's extensions in the same process.** Each spawn ran the extension's default function again, in the same process, and its own `session_start` fired. `ctx.agent` was `{kind: "sub", id, name: "task", depth, parentId}` for a child and `{kind: "main", id: "Main", name: "main", depth: 0}` for the main agent. The existing `isUnattended` check reads `ctx.agent.kind` (`omp/src/host-context.ts:isUnattended`). The child's session file was `<parent session file without .jsonl>/<agentId>.jsonl`, as the source says (`o1.omp.jsonl`, `o2-sessions/`).
- **A child's `before_agent_start` prompt edit takes effect.** The extension appended "begin your final reply with the word GRAPE". The child's final message was "GRAPE CHILD" although its assignment said to reply with exactly "CHILD" (`o2-sessions/<parent>/StepProbe.jsonl`).
- **A normal-spawn child is offered an extension tool.** The child called `step` and the probe logged it, for a child at depth 1 and at depth 2 (`o1.omp.jsonl`, `o3.omp.jsonl`).
- **A plan-mode child loads the extension but is offered no extension tool.** With `--plan-yolo`, the child's `before_agent_start` ran, its prompt edit worked, and its active tools were `read`, `grep`, `glob` and `web_search`. It had no `step` tool and answered "GRAPE NOSTEP" (`o4.omp.jsonl`, `o4-sessions/`). This contradicts the Progress tab plan's note that a plan-mode child loads no extensions. What 18.12.3 does is load them and restrict the tool list to the plan-mode set, which matches `PLAN_MODE_TOOLS` in `task/structured-subagent.ts:227` [source 18.12.3].
- **`agent_end` for a child.** A child's `agent_end` carried `stopReason: "stop"`.
- **Esc on an interactive main agent reaches the extension's `agent_end`.** Tested 2026-10-22 on the development Mac, not in the VM, with omp 18.12.3 in tmux, run as `env HOME=<fresh folder> ANTHROPIC_API_KEY=<placeholder> ANTHROPIC_BASE_URL=<local server that never answers> omp --no-extensions -e omp/dist/host.js`. A prompt's run held its model call open. The inbox's saved `presence.isTurnRunning` was true after `agent_start`, and Esc ended the run and set it false through the host's `agent_end` handler. No log was kept; the state file under `<HOME>/.omp/agent/inbox/sessions/` was read before and after.
- **A queued follow-up runs inside the same run and gets its own `before_agent_start`.** Tested 2026-10-28 on the development Mac with omp 18.12.3 in tmux, run as `env -i HOME=<fresh folder> PATH=<…> TERM=<…> ANTHROPIC_API_KEY=<placeholder> ANTHROPIC_BASE_URL=<local server> omp --no-extensions -e <event logger> -e omp/dist/host.js`. The local server held the reply to a prompt. Meanwhile an inbox press queued its message with `sendUserMessage(text, { deliverAs: 'followUp' })`, and in a second run the person queued a typed message with Ctrl+Q. Each time, after the held reply's `message_end` and `turn_end`, omp ran `before_agent_start` with the follow-up's text, then `turn_start` and the follow-up's `message_start`. It ran no second `agent_start`. It fired one `agent_end`, whose `messages` held both replies. No log was kept.

## Checked against omp 18.14.0

Checked on 2026-10-29 on the development Mac, with `@oh-my-pi/pi-coding-agent`, `pi-tui` and `pi-ai` 18.14.0 from npm in a scratch folder. It ran in tmux as `env -i HOME=<fresh folder> PATH=<…> TERM=<…> ANTHROPIC_API_KEY=<placeholder> ANTHROPIC_BASE_URL=<local stand-in> omp --no-extensions -e omp/dist/host.js`. Quotes are from the 18.14.0 changelogs of `pi-coding-agent` and `pi-tui`.

- **No breaking change reaches the inbox's code [source 18.14.0].** The inbox uses none of the changed APIs: custom tool loader constructors, `StatusLineHost.resetExpiryNotice`, `ToolExecutionHandle.setToolActivityVisible`, the `@oh-my-pi/pi-tui/theme/defaults` export and `PINNED_HUD_TOGGLE_ID`. Its tools come from `pi.registerTool` in an extension, not from a custom tool file. `omp/src` and `evals/omp-probe.ts` type-check against 18.12.3 and 18.14.0.
- **The extension loads and works [live 18.14.0].** The band drew. `/inbox` was listed and opened the panel under the later slash-command loading. `record`, `close` and `order_prs` were in the model request's tools. After a reply, the ledger call reached the inbox model. Not seen: a row press, the Status tab, a subagent, the light theme and a narrow width.
- **Exact model selectors [source 18.14.0].** "Provider-qualified model selectors … must identify an exact model ID or alias." `ctx.models.resolve` returns `undefined` for a near match, with a warning, and does not throw (`src/extensibility/extensions/model-api.ts`). An `@inbox` role set to a near match falls through to the Sonnet pick, then `@smol`.
- **`out://` interim replies are on by default in the interactive terminal [source 18.14.0; not run live].** The agent writes Markdown to `out://` with `write`, or `> out://` in bash, to show the person a reply without ending its turn. The inbox reads such a write as `edited out://…` activity, and its text is not in the reply the ledger call reads (`omp/src/tool-calls.ts:activityOf`, `omp/src/host-turns.ts:onMessageEnd`).
- **Esc keeps queued extension messages (since 18.13).** A press queued during a turn, followed by Esc, reaches the agent with the person's next prompt instead of being dropped. Whether the inbox notes that press's arrival is not checked live.
- **New opt-in extension points, none used.** `registerAssistantTextRenderer`, `rerenderMessage`, and `registerLinkScheme` with `link_activate`, all behind the `extensionRenderers.assistantText` setting; and `ctx.startLive({ sdpOffer })`.
