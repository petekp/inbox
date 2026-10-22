# omp (oh-my-pi)

Checked on 2026-10-21. This file records what omp lets the inbox's omp host do, with the source line or live log behind each fact. It covers the questions in step 0 of `docs/plans/progress-tab.md`.

omp is the `omp` coding agent from `can1357/oh-my-pi`. The inbox's omp host is an extension (`omp/src/host.ts`). It is the only file that imports omp packages.

## Versions

| What | Version |
| --- | --- |
| omp in the inbox-ui VM, where live checks ran | 18.12.3 (`/Users/admin/omp-bin/omp`) |
| Source facts the Progress tab plan pinned | 18.1.17, tag `v18.1.17` |
| Source read for this file | tags `v18.1.17` and `v18.12.3`, shallow clones, 2026-10-21 |

Each source fact below names its version. A fact marked "both" held in 18.1.17 and 18.12.3. Line numbers differ between the two, so each version's lines are given. Paths are under `packages/coding-agent/src/` unless they start with another package.

Tags used in this file:

- **[source 18.x.y]**: read in that tag's source.
- **[live]**: seen in the inbox-ui VM. The log path is beside the fact.
- **[unknown]**: not settled.

## Facts from the source

### Esc ends the run and still emits `agent_end`

- The agent loop finishes an aborted run with a message whose `stopReason` is `"aborted"` (`packages/agent/src/agent-loop.ts:698` in 18.1.17, `:808` in 18.12.3) [source both].
- `agent_end` reaches external subscribers only after the in-flight prompt count drops to 0. Hooks inside omp still fire on the original schedule (`session/agent-session.ts:774-782` in 18.1.17, `:1156-1165` in 18.12.3) [source both].
- A subscriber therefore sees `agent_end` after an Esc, not instead of one. The inbox host already ignores an `agent_end` whose `willContinue` is true (`omp/src/host.ts:701-702`).

### A subagent's session file is `<parent>/<agentId>.jsonl`

- "`<parent>.jsonl` strips its suffix to `<parent>/`, and a child writes `<parent>/<agentId>.jsonl`" (`session/session-manager.ts:141-143` in 18.1.17, `:373-375` in 18.12.3) [source both].
- So a child's session file sits in a folder named after the parent's file, beside `<parent>.jsonl`. A session with no such parent file is a top-level session.

### Subagent frames go on two buses

- `emitSubagentFrame` emits each frame on `eventBus`, the spawner's session bus, and on `subagentEventBus`, a root-scoped bus, unless they are the same object (`utils/event-bus.ts:40-50`, both) [source both].
- An extension's `pi.events` is the session's `eventBus`. The root bus is separate: "Root-scoped bus carrying `task:subagent:*` observability frames for this session and every subagent it spawns" (`sdk.ts:518-521` in 18.1.17, `:739-743` in 18.12.3) [source both].
- A grandchild's frames reach its own spawner's session bus and the root bus. Whether they also reach the top session's `pi.events` is a live question, below.

### The channel names are internal

- `task:subagent:lifecycle` and `task:subagent:progress` are constants in `task/types.ts:62-65` in 18.1.17 [source 18.1.17].
- In 18.12.3 the constants moved to `packages/tui/src/overlays/session-observer-registry.ts:4-7`. `task/types.ts:3-12` re-exports them and their payload types [source 18.12.3].
- `packages/wire/src/index.ts:343` (18.1.17) and `:347` (18.12.3) types them as `BusChannel` [source both].

### Plan mode and restricted sessions load no extensions

- `restrictToolNames` skips discovery of custom commands, and the plan-mode policy turns it on for a plan-mode subagent: `const restrictToolNames = policy.planMode || session.restrictToolNames === true` (`task/structured-subagent.ts:403` in 18.1.17) [source 18.1.17]. `sdk.ts:1417` (18.1.17) and `:1890` (18.12.3) read the same option [source both].
- Whether a plan-mode child loads extensions is checked live, below.

## Live checks

_Filled in by the live pass. Each answer names its log._
