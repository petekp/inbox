# Multi-client architecture

Status: proposed. Nothing in it is built yet.

## 1. Recommendation

Move each rule that both clients now write separately into a small, pure shared module in `hooks/`, one feature at a time. "Pure" means the module reads no host API and has no side effects. Each function changes one slice of state. Each client keeps a thin adapter. The adapter turns the client's own events into calls to those functions, stores the results in its own way, and keeps host effects such as Codex's `heard`.

The steps, in order:

1. **Extract the subagent rules now, on the `map` branch.** This branch just wrote the subagent-row and `progress` transitions twice, and the two copies already disagree in three small ways. The maintainer picks one rule for each of the three, then they are extracted. No eval is needed, because no text a model reads changes.
2. **Add the parity record and gate.** Add a capability and support record per client. Add a check in `scripts/check-structure.mjs` that fails when a client lacks a feature and no row in `docs/looks.md` says why. Classify today's gaps in the same step, so the gate fails from the first day.
3. **Add shared scenarios.** Move `world()` out of `tests/hooks.test.ts` into its own module first. Then seed one set of shared scenarios from the tests both clients already have.

Codex catch-up is a separate feature. It needs its own spike, eval cases and approval.

Terms:
- **Port.** A TypeScript type for something only a host can do, such as calling a model or reading the conversation. `EffectHost` in `hooks/presses.ts:552` is the existing example.
- **Adapter.** The client-side code that maps native events to shared calls and implements the ports.
- **Capability.** A typed statement of whether a client can supply a port or an event. It exists only where shared code reads it.
- **Support entry.** A per-client statement that a feature is `full`, `different` or `unsupported`, with a reason for anything but `full`.
- **Catch-up.** Filling the inbox and Map from the whole conversation when the inbox loads mid-session or after a failed update.
- **Scenario.** A list of client-neutral steps plus the shared view expected afterward.
- **Conformance test.** Each client's test runner plays every scenario through that client's real entry points.

## 2. Current state

**Already shared well.** The pure core:
- `hooks/ledger.ts`: `parseReply`, `applyExchangeUpdate`, `applyUpdate` with its `isCatchUp` flag, `upgradeLedger`, `pruneClosed`.
- `hooks/model-text.ts`: the `Host` record (259), `buildPrompt`, `promptNotes`, `catchUpPrompt` (101), `transcriptCatchUpPrompt` (113).
- `hooks/presses.ts`: `applyPress`, `runSends`, `runLocalEffects`, `EffectHost` (552).
- `hooks/pr-tab.ts`: `GhRun`, `fetchTracked`, `applyPrPress`, and the `Applied` type (280).
- `hooks/view.ts`: `inboxView`, `mapView`, `rowKeyPlan`.
- `hooks/tools.ts`:
  - `recordItem`, `recordClose`, `progressText`, `progressResult` (89).
  - `recordDescription(host)` (95), `progressDescription(host)` (75), and the constant `CLOSE_DESCRIPTION` (103).

`scripts/check-structure.mjs` keeps these modules free of host code through the `SHARED` list (line 9). Its `checkImports` scans `codex/src` and `codex/tests` by hard-coded folder names (line 142). Text a model reads is shared through `Host`, so its wording cannot drift between clients.

**Duplicated.** Code that wraps the shared functions:

| Concern | Mod (`hooks/register.tsx`) | Codex |
|---|---|---|
| Subagent result clip | `SUBAGENT_RESULT_MAX = 80` (2018) | `codex/src/core.ts:40`, same constant, `subagentResult` |
| Subagent row change | `changeSubagent` (2023), which takes a `(s, now) => Subagent` function | `core.ts:withSubagentChange` (70), which takes a partial change and always sets `at: now` |
| New subagent row | `agent.spawn` handler (2913-2929); the task comes from the Agent call | `core.ts:startSubagent` (54); the task comes from the `spawnedTasks` queue that `noteSpawn` fills |
| Row back to running | `agent.spawn` reuse (2936) | None |
| Step from a command | `tool.call` handler (2981) | `hook.ts` PreToolUse |
| Prune finished rows | `pruneSubagents` (2034); also drops running rows that `$.agent.list()` no longer lists | `core.ts:withoutSubagentsBefore` (88); also clears `spawnedTasks` |
| `progress` handler | `showProgress` (2046) | `codex/src/server.ts` `case 'progress'` (629) |
| Press result to `Applied` | `applyAnyPress` (2237) | `server.ts:pressOn` (327); same body, and `Pressed = Exclude<Applied, {stale:true}>` (`server.ts:70`) |
| Prompt bookkeeping | `notePrompt` | `core.ts:notePrompt` (109), which matches tab sends by text |
| Exchange assembly | `turn.complete` handler | `core.ts:endTurn` (178) |
| Update failure policy | `queueUpdate` (1058), `catchUp` (1044) | `codex/src/update.ts:applied` (97), `runUpdates` (147), `reconcileUpdateStatus` (122) |
| View assembly | `viewOf` (930) | `core.ts:viewOf` (306) |
| Tool list | `initializeInbox` (2626) | `server.ts:toolsFor` (83), plus `evals/probe.ts` `TOOLS` (27) and a `showProgress` stub (33) |

**The two `progress` handlers differ in three ways.** All three are untested.

| Case | Mod (`showProgress`) | Codex (`server.ts case 'progress'`) |
|---|---|---|
| A subagent repeats the same text | No write, so `at` is unchanged | Writes and sets `at: now` |
| Main-agent call that carries no turn | Accepted. The mod has no such case, since its calls come from its own engine. | Ignored, and the agent is told `progressResult.unlisted`. The call is dropped because `turnOf` (`server.ts:180-189`) returns `undefined` for tab calls, forked chats, subagents and other threads. |
| Host effect | None | `heard(...)` on the main-agent path only |

The `at` field drives result aging and pruning (`s.at > before` in both prune functions). No test covers the main-agent call that carries no turn, or the repeated text. `codex/tests/hook.spec.ts:119` covers subagent progress, and `tests/hooks.test.ts:3070` covers the mod's.

**Parity gaps.** "Recorded" means the gap appears in "Differences on purpose" in `docs/looks.md` (lines 123-154).

| Feature | Mod | Codex | Recorded |
|---|---|---|---|
| Catch-up | `register.tsx:catchUp` (1044) tries `$.model.fork`. On `'nothing-to-fork'` it reads `transcriptText($.session.messages())`, and returns `'behind'` if that is empty. Triggered from `queueUpdate` when `ledgerState !== 'current' \|\| pending === null`, and on load (`applyConversation`). | Missing. `codex/src` never calls `transcriptCatchUpPrompt`. | No. Listed as "Direct, later" in `docs/plans/codex-plugin.md:69`. |
| Failed update | The next update becomes a catch-up (`queueUpdate`). | A first failure marks the exchange `failed` and keeps it (`update.ts:applied`). `runUpdates` returns `'retry'`, and the next Stop retries it. A second failure drops the exchange. A crashed worker is set to `'failed'` by `reconcileUpdateStatus` (`update.ts:122`, called at `server.ts:410`). | Yes, `docs/looks.md:136` |
| `ledgerState` values | `'current' \| 'behind' \| 'failed'` (`types/index.d.ts:266`) | `'current' \| 'failed'` (`codex/src/state.ts:51`) | No |
| "Retries" status | Hard-coded `retries: true` (`register.tsx:viewOf`, 962) | Derived from pending and failed state (`core.ts:viewOf`) | No |
| `progress` differences | See the table above | See the table above | No |
| How a subagent row reaches `'stopped'` | Only from the subagent's own `turn.complete` with `reason !== 'answer'` (3051). A main-agent interrupt leaves subagent rows alone. | Only from `Interrupt`, which stops every running row (`hook.ts:150-156`). `SubagentStop` always writes `'done'` (169), because its input carries no end reason. | No |
| Exchange trigger | Real values | `'unknown'` when no prompt was recorded, otherwise `null` (`core.ts:188`) | No |
| Dialog outcome | Real values | Always `{kind:'open'}` (`hook.ts:134`) | No |
| URL lines in tool output | Yes | None | No |
| Linking a PR from `gh pr create` output | Yes (`tool.call` handler) | Reply text only (`core.ts:endTurn`) | No |
| New PRs move the view to the PRs tab | Yes (`followNewRows`) | No. `TAB_IDS` has no `'prs'` (`codex/src/arrivals.ts:13`). `tab.tsx:follow` (383) returns early on the PRs tab and never picks it. The tab lists PRs through a separate `[...TAB_IDS, 'prs']` (277). | No |
| PRs empty-state hint | "this session" (`register.tsx:5199`) | "this conversation" (`codex/src/tab.tsx:1719 PRS_HINT`) | No |
| URL test in open | Any scheme (`register.tsx:1976`) | `https` only (`server.ts:551`) | No |
| Forked conversation inherits the ledger | Yes. `prepareConversation` reads the parent's saved session (2680-2688). | No. No `codex/src` code copies a parent thread's state, and `turnOf` drops calls from a forked chat (`server.ts:186`). | No |
| Subagent task source, pruning, nesting | Engine roster | No roster | Yes, `docs/looks.md:138` |

## 3. Target architecture

**Shape.** Shared pure functions are organized by feature. Each one changes one slice of state. A slice is one field, such as the subagent list or presence.

The two hosts store state differently:
- **Mod.** About 20 separate `$.state` atoms (`register.tsx:226-271`). It cannot update several atoms in one transaction. `update()` returns the new value, as `queueUpdate` shows.
- **Codex.** The whole JSON file changes inside one locked `updateState` call (`codex/src/state.ts:422`).

So a function that changes one slice maps to one `update($, ATOM, fn)` call in the mod and to one `updateState` callback in Codex. A check that guards a write, such as "is this subagent listed", runs inside the same callback as the write. The outcome comes back through a closure variable, as `server.ts case 'progress'` already does.

Each host keeps its own:
- storage, locks and ordering,
- the `ownsConversation` guard against /clear and /resume races,
- host effects such as `heard`.

**Modules.** All are flat files in `hooks/` added to `SHARED`, so the import gate covers them with no change. Each is created only when its migration step runs.

```ts
// hooks/subagents.ts
// Requirement: the same transitions exist in register.tsx and core.ts today, and they already disagree.
// Simpler path rejected: keeping two copies, which is how the `at` bump and the 'stopped' triggers drifted.
export const SUBAGENT_RESULT_MAX = 80
export const newSubagent: (id: string, task: string, now: number) => Subagent
export const addSubagent: (list: Subagent[], row: Subagent) => Subagent[]
export type SubagentChange = Partial<Pick<Subagent, 'state' | 'step' | 'progress' | 'result'>>
// No-op when the id is unlisted or nothing changes. `at` moves only on a real change.
export const changeSubagent: (list: Subagent[], id: string, change: SubagentChange, now: number) => Subagent[]
export const subagentResult: (reply: string | null | undefined) => string | null
export type EndReason = 'answer' | 'other' | 'unknown' // 'unknown': the host's end event carries no reason
export const finishSubagent: (list: Subagent[], id: string, reason: EndReason, reply: string | null, now: number) => Subagent[]
export const stopRunning: (list: Subagent[], now: number) => Subagent[]
export const dropFinishedBefore: (list: Subagent[], before: number) => Subagent[]
export type ProgressTarget = { kind: 'empty' } | { kind: 'main'; text: string } | { kind: 'subagent'; id: string; text: string }
export const progressTarget: (caller: { agentId: string | null }, input: Record<string, unknown>) => ProgressTarget
```

The module covers only part of the subagent logic. Three parts stay in the adapters, and the module's doc comment names them so they are not read as drift:
- **Mod.** The task source (the Agent call description), and lost-row pruning against `$.agent.list()` (`pruneSubagents`).
- **Codex.** The task source (`noteSpawn` and the `spawnedTasks` queue), clearing that queue on prune, and the `turnOf` guard together with the result text it returns.
- **Both.** `heard` and any other host effect.

```ts
// hooks/turn.ts: replaces two Exchange literals and two turnsStarted counters
export const beginTurn: (p: Presence) => Presence
export const endTurn: (p: Presence) => Presence
export type TurnScratch = { person: string | null; trigger: string | null; activity: string[]; press: PressRef | null }
export const buildExchange: (t: TurnScratch, reply: string, turn: number, screen: string) => Exchange | null
```

The `Presence` type here covers only the fields both stores share. It is a contract on both `PluginState` (`types/index.d.ts`) and `SessionState` (`codex/src/state.ts`).

```ts
// hooks/update-flow.ts: the job choice and the presence transition
// The ledger half is already shared: applyUpdate and applyExchangeUpdate in hooks/ledger.ts.
export type LedgerState = 'current' | 'behind' | 'failed'
export type JobKind = 'exchange' | 'catch-up' | 'none'
export const nextJob: (ledgerState: LedgerState, hasPending: boolean, canCatchUp: boolean) => JobKind
export const settledPresence: (p: Presence, outcome: LedgerState, turnsApplied: number) => Presence
```

`nextJob` encodes the mod rule `ledgerState !== 'current' || pending === null`. It returns `'exchange'` when catch-up is not possible. Each adapter still decides what "failed" means for one attempt: the mod's `.catch(() => 'failed')`, and Codex's mark-then-drop and crash reconcile. Before this module is written, both clients' job states (pending, failed, crashed, behind) are written down side by side, as the first task of step 8.

```ts
// hooks/conversation.ts: the neutral half of hooks/claude.ts:transcriptText (58)
export type Turn = { role: 'person' | 'agent'; text: string; activity: string[] }
export type ConversationSource = () => Promise<Turn[] | null> // null means unavailable
export const flattenConversation: (turns: Turn[]) => string  // keeps MESSAGE_MAX and TRANSCRIPT_MAX clipping
```

The Claude-only parsing stays in `hooks/claude.ts`: skipping `inbox:` messages, `readCommandRow` and `commandRowLine`, and the `AskUserQuestion` and `toolActivity` mapping. It becomes the mod's `ConversationSource`. The fork-then-transcript fallback stays in the mod's `catchUp`, because the choice is made at run time.

```ts
// hooks/agent-tools.ts
// Requirement: three tool lists today (register.tsx initializeInbox, server.ts toolsFor, evals/probe.ts TOOLS).
export type AgentTool = { name: 'record' | 'close' | 'progress'; description: (h: Host) => string; schema: object }
export const AGENT_TOOLS: AgentTool[] // close's description returns the constant CLOSE_DESCRIPTION for every host
```

This removes the copies of descriptions and schemas only. Handlers stay in each host. `evals/probe.ts` keeps its stub `showProgress` (33), which has no subagent state. So the agent eval checks the agent's calls, not the production progress rule. Calling `progressTarget` and `changeSubagent` from the probe over an in-memory list is a separate choice (section 9).

```ts
// hooks/clients.ts: the capability record and the coarse parity matrix
// Requirement: The maintainer asked for parity by default as clients are added. Nine of today's gaps are unrecorded, and nothing fails.
export type ClientId = 'claude-code' | 'codex' // a host process, not a look. Terminal and desktop share 'claude-code'.
export type Capabilities = {
  canCatchUp: boolean   // read by nextJob
  agentRoster: boolean  // can prune lost subagent rows
  toolOutputs: boolean  // URL lines, gh pr create linking
}
export type FeatureId =
  | 'catch-up' | 'failed-update-recovery' | 'progress-without-turn' | 'subagent-stopped'
  | 'exchange-trigger' | 'dialog-outcome' | 'pr-link-from-output' | 'pr-arrivals' | 'fork-ledger'
export type Support = { kind: 'full' } | { kind: 'different' | 'unsupported'; reason: string }
export type Client = { host: Host; caps: Capabilities; support: Record<FeatureId, Support> }
export const CLIENTS: Record<ClientId, Client>
```

`Capabilities` holds only the fields shared code reads. A field is added only when a shared function branches on it. `support` covers behavior only and stays coarse.

The parity unit for behavior is the host. Terminal and desktop run the same `register.tsx` handlers, so they share one entry. Look differences stay in the hand-written `docs/looks.md` table: drawing, keys, hit areas, and desktop limits from `docs/reference/claude-desktop-app.md`. The demo order test checks them.

**What each adapter owns.**
- **Mod** (`hooks/register.tsx`, `hooks/claude.ts`):
  - Engine events, the atoms, `commitLedger`, and the `ownsConversation` and generation checks.
  - The promise queue, `$.model.complete` and `$.model.fork`, the fork-then-transcript fallback, `$.agent.list()`.
  - Prompt rewrites, stop, permission and dialog rows, `AbovePrompt`, the clock ticks.
  - Event order. For example, `turnsStarted` must still be counted at `turn.start`.
- **Codex** (`codex/src`):
  - Hook processes, the file lock and `.updating`, the detached worker, `reconcileUpdateStatus`.
  - Hook-trust detection (`heard`), `_meta` parsing (`turnOf`, `subagentOf`), `spawnedTasks`, text-matched sends (`notePrompt`), dialogs from the transcript (`transcript.ts:dialogsInTurn`), `codex queue`.
  - The MCP JSON-RPC shell, and the Codex-only `inbox` text tool, which is marked `different` in `support`.

**Native UI stays per client.** These keep drawing from the shared plans:
- The mod's pane and the `*-client.tsx` regions.
- Codex's `tab.tsx`, `rows.ts` and `row-actions.tsx`.

A shared `sessionView()` replaces the two `viewOf` functions, but only when the first new UI client starts. Until then, the two existing views are cheaper to keep than a new contract.

**Not built.** These have no requirement until a third client exists (see section 5):
- a resident daemon,
- a shared store interface,
- an event vocabulary for the in-process mod,
- a normalized hook-event layer.

## 4. How a new feature reaches every client

**The rule.** A feature is:
- a shared function,
- a `support` entry for every `ClientId`,
- a scenario.

Each adapter either calls the function or marks the feature `different` or `unsupported` with a reason, and a `docs/looks.md` row names it. Otherwise the check fails.

**Each step reports four things.** These follow from `AGENTS.md`:
- **Saved state.** Which stored fields change, and which upgrade converts them. In the mod that is `upgradeLedger` and `upgradeLastActions` (shared), and `upgradeState` (`register.tsx:1189`). In Codex it is `upgraded` (`codex/src/state.ts:207`). Each conversion gets a test on old saved data.
- **Bundles.** Run `npm --prefix codex run build`. The bundles are committed, and `check.sh` checks them (`codex bundles`). Rebuilt bundles show up in the step's diff.
- **Evals.** Whether text a model reads changed. If it did, run `./scripts/eval.sh --suite agent` or `./scripts/eval.sh`. The pass bar is `c.min?.[agent] ?? MIN` (`evals/agent.ts:341`).
- **Looks.** For terminal, desktop and the Codex tab: whether the change applies, and what was checked.

**Example: the progress tool (migration step 1).**
1. `progressTarget` returns `empty`, `main` or `subagent` from the caller and the input.
2. Each adapter acts on the result.
   - **Mod.** For `main`, one `update($, PRESENCE, ...)`. For `subagent`, one `update($, SUBAGENTS, list => ...)` that checks the listing and calls `changeSubagent` in the same callback. That removes today's separate `read($, SUBAGENTS)` (2054).
   - **Codex.** The same branches inside its existing `updateState` callback. The adapter keeps the `turnOf` guard and `heard`.
3. `changeSubagent` makes the `at` bump one rule: `at` moves only on a real change. This changes Codex, which now bumps on a repeat, so it needs the maintainer's choice (section 9). The step also adds a test for each of the three differences in section 2.

**Example: Codex catch-up (a spike, then a build).** The spike answers each of these:
1. **Where the transcript path is stored.** `transcript_path` arrives only in hook input (`hook.ts:32`). `SessionState` does not store it. It is null for ephemeral threads (`docs/reference/codex-plugins.md:911`). Storing it is a new field with an `upgraded` default.
2. **How the worker runs a job with nothing pending.** `runUpdates` loops only `while pending.length > 0` (147). `update-main.ts` receives only the session id. Catch-up needs a stored job kind that the worker reads, and the job must run under the `.updating` lock. The lock keeps it ordered against pending exchanges.

   The hook timeout is not the constraint. Four hooks set 3 s (PostToolUse `spawn_agent`, SubagentStart, SubagentStop, Interrupt), and Stop sets 60 s. SessionStart, UserPromptSubmit and PreToolUse use the 600 s default (`codex/plugin/hooks/hooks.json`; `codex-plugins.md:797`).
3. **How the rollout is read.** The rollout JSONL format is documented as unstable (`codex-plugins.md:39`). It holds `function_call`, reasoning and developer rows that must be mapped to `Turn.activity`. `dialogsInTurn` reads only the last `TAIL_BYTES`, so a whole-conversation read needs its own bounded reader. Add a fixture recorded from a real file, and a size and time cap.
4. **The prompt.** No model has ever run the transcript catch-up prompt (`docs/plans/prompt-audit.md:310`). Add a Codex catch-up case to `evals/cases.json` and run `./scripts/eval.sh`.
5. **The triggers.** SessionStart, skipping `source: 'compact'` (`hook.ts:61`, since compaction fires it mid-turn), and possibly a failed update (decision 1).
6. **Saved state.** Widen `ledgerState` (`state.ts:51`) to include `'behind'`, converted in `upgraded`.

When all of that holds, set `codex.caps.canCatchUp = true` and `support['catch-up'] = full`. Each `codex exec` call costs about 12.5k tokens of input overhead.

## 5. How a new client is added

**Which inputs look universal.** This table comes from documentation research only. None of it is verified for the clients after Codex.

| Input | Claude mod | Codex | Cursor | Gemini CLI | Copilot CLI | opencode | Amp |
|---|---|---|---|---|---|---|---|
| Turn boundaries | yes | yes | yes (`stop`) | yes (`AfterAgent`) | yes (`agentStop`) | `session.idle` | yes |
| Prompt text | yes | yes | yes | yes | yes | yes | yes |
| Tool hook before the call | yes | yes | yes | yes | yes | yes | yes |
| Inject at session start | yes | yes | yes | yes | yes | yes | yes |
| Serve tools (MCP or registered) | yes | yes | yes | yes | yes | yes | yes |
| Headless model call | yes | `codex exec` | `agent -p` | `gemini -p` | `copilot -p` | session API | `ai.generate` |
| Inject on every prompt | yes | yes | no | yes | no (config hooks) | experimental | yes |
| Subagent events | yes | yes | yes | no | yes | no | no |
| Verified transcript reader | yes | no (format unstable) | no | no | no | yes (SDK) | yes |
| Persistent pane | yes | MCP App tab | in-chat MCP App only | no | no | no | no |
| Send as the person | yes | `codex queue` | no | no | no | `submitPrompt` | `appendUserMessage` |

**The six-input base contract is a hypothesis.** The six inputs are turn boundaries, prompt text, the tool hook, session-start injection, tools, and a model call. Codex shows what such a contract misses. Codex needed three workarounds that no base input covered:
- **Telling a button send from a typed message.** It matches text in `core.ts:notePrompt`.
- **Knowing which subagent a call came from.** It reads `_meta` (`turnOf`, `subagentOf`) and keeps the `spawnedTasks` queue.
- **Seeing question dialogs, since no hook fires for them.** It reads them from the transcript (`transcript.ts:dialogsInTurn`).

So every new client starts with a spike.

**A text-only client** is the minimum. It has no pane, no send port and no transcript reader. It gets the agent tools, `inbox:` injection, and a text tool like Codex's `inbox`. Its press and drawing features are `unsupported` with that reason.

**Checklist.**
1. **Spike first.** Fill in the same feature map that `docs/plans/codex-plugin.md` has for Codex. Cover the transcript format, recursion when a model call runs inside a hook, real hook coverage, send detection, and subagent identity. Cursor's CLI is unproven. Choose between Gemini CLI and Antigravity first.
2. **Add the id.** Add it to `ClientId`. Type-check then lists every `support` entry to fill. Unverified items start as `unsupported (unverified)`.
3. **Write the host records.** A `Host` record of names and intro text, and a `Capabilities` literal. Add a `Capabilities` field only if shared code reads it.
4. **Map events to shared functions.**
   - A hook-process client copies the ordering in `codex/src/hook.ts:handleHook`, while it is the second hook-process client.
   - If a second hook-process client already exists, first extract that ordering into a shared out-of-process host with a small normalized event vocabulary. Split the lock into `codex/src/lock.ts`, then move it to a shared file.
   - An in-process client (opencode, Amp) calls the shared functions directly, as the mod does.
5. **Implement the ports.** The model call, the optional `ConversationSource` with a fixture recorded from a real file, and the send port or a record of its absence.
6. **Register the tools.** Register `AGENT_TOOLS` through MCP or the client's tool API.
7. **Run the scenarios.** Add a scenario driver in the client's test runner and run the corpus. A `full` entry must pass. A `different` entry needs a per-client expectation.
8. **Draw.** Draw from the shared plans (`rowKeyPlan`, `mapView`, PR plans), or show text only. Add any drawing difference to the hand-written table.
9. **Add it to the gate.** Add the client's source and test folders to the folder list in `check-structure.mjs`.

## 6. Parity enforcement

**The matrix.** `CLIENTS` in `hooks/clients.ts` is the matrix. `ClientId` and `FeatureId` are closed unions, and the record type is total, so a missing entry is a type error. `different` and `unsupported` require a reason.

**The gate.** Extend `scripts/check-structure.mjs`. It already loads the TypeScript AST API (lines 31-32) and verifies `path:symbol` references in `docs/looks.md` (`checkLookMap`).
- **One check.** Read `CLIENTS` from `hooks/clients.ts` with the AST. Fail when a `FeatureId` that is not `full` for some client is not named in a "Differences on purpose" row. Prose is not generated, because those rows carry detail per look that the record does not hold.
- **No warning phase.** `scripts/check.sh` has no warning level. Classify today's gaps in the same change, and fail from the start.
- **Folders from data.** Read the client source and test folders from a list, not from the hard-coded `codex/src` and `codex/tests` at line 142.

**Conformance tests.**
- **Two runners, one corpus.**
  - The mod runs under `claude plugin test` with `claude-code/testing`.
  - Codex runs bundled by `codex/build.mjs --tests` under `node:test`.
  - Each runner reads the same scenario data, so the corpus proves each client conforms. It never compares the clients in one run.
- **What a scenario is.** Plain data. Its steps include prompt, tool with an optional agent id, spawn, progress, subagent end, interrupt, stop, model reply, press and arrival. It sets expectations on `mapView`, `inboxView` and tool answers. A scenario can carry a per-client expectation only where `support` says `different`.
- **Each driver must translate the steps.**
  - A spawn is `agent.spawn` plus the engine roster in the mod. In Codex it is PostToolUse `spawn_agent` followed by `SubagentStart`.
  - Time is `mock.clock` with `clock.settle()` in the mod. Codex tests inject `now()`.
- **The mod driver.** It needs `world()` (`tests/hooks.test.ts:129`) and its module-level fixtures (`sent`, `held`, `ran`, `stopBlock`, `ledgerReply`, `agents` and others) moved into a helper module. That is its own step.
- **The Codex driver.** It builds real state files and calls `handleHook` and `makeServer` through `codex/tests/helpers.ts`.
- **Where the corpus lives.** In `tests/shared/`. It must be reachable from the `build.mjs --tests` bundle and allowed by the gate's `codex/tests` scan. Test data stays out of the shipped `hooks/` folder.

Write the two Map scenarios first, so their steps settle the step vocabulary:
- Map Working and progress: `tests/hooks.test.ts:3039` and `codex/tests/hook.spec.ts:99`.
- Subagent rows: `tests/hooks.test.ts:3070` and `codex/tests/hook.spec.ts:119`.

The future failure these catch is one client changing a subagent or progress rule while the other keeps the old one. Today's twin tests miss that because each pins only its own client. Delete each old twin only after its scenario passes in both runners.

**Smaller checks.**
- **Codex-host cases for shared modules.** These belong in `codex/tests`. `tests/ledger.test.ts` and `tests/prs.test.ts` use `claude-code/testing` and cannot run under `node:test`. `ledger.test.ts` also imports host-only helpers from `hooks/claude` (line 19). Add a Codex case only where a shared function branches on `Host`.
- **Button order.** Extend the demo order test (`tests/hooks.test.ts`, terminal and desktop only) to the Codex `RowActions`.
- **Eval overrides.** Add a release check that lists every per-agent eval `min` override in `evals/agent-cases.json` and requires a `different` entry or a reason for each.

## 7. Migration plan

Each step ships alone and keeps `./scripts/check.sh` green. Each step states the four items in section 4: saved state, bundles, evals, looks. Extraction steps preserve behavior, except where a step names a decision.

1. **Now, on `map`: `hooks/subagents.ts`.**
   - **Decide first.** The maintainer picks the `at` rule, the result text for an ignored main-agent call, and the `'stopped'` triggers (section 9, decisions 3 and 4).
   - **Tests first.** Add tests for those three cases, so the extraction is pinned. The existing pins are `tests/hooks.test.ts:3039/3070` and `codex/tests/hook.spec.ts:99/119`.
   - **Move these** out of `register.tsx` and `codex/src/core.ts`: `SUBAGENT_RESULT_MAX`, `newSubagent`, `addSubagent`, `changeSubagent`, `subagentResult`, `finishSubagent`, `stopRunning`, `dropFinishedBefore` and `progressTarget`.
   - **Callers.** `showProgress`, `server.ts case 'progress'`, the mod reactivation (2936) and the command step (2981) call them. Codex `SubagentStop` passes `reason: 'unknown'`, and `Interrupt` calls `stopRunning`.
   - **Adapters keep** `heard`, `turnOf`, `spawnedTasks` and `$.agent.list()` pruning.
   - **Gate and docs.** Add `subagents` to `SHARED`. Record the remaining differences in `docs/looks.md`.
   - **Saved state.** The `Subagent` shape does not change.
   - **Eval.** None: the result strings and descriptions do not change. `evals/probe.ts` imports only `progressText` and `progressResult`, which are unchanged.
   - **Removes** the duplicated constant, row constructors, change and clip pairs, and both progress branch bodies.
2. **`hooks/clients.ts` and the gate.**
   - Classify every gap in section 2.
   - Add a looks.md row for each that is not `full`.
   - Add the one-directional check and the folder list.
   - Fix the stale away-card and previous-session rows in `docs/plans/codex-plugin.md`.
   - **Removes** unrecorded drift.
3. **Move `world()` into its own helper module.** No behavior change.
4. **Scenario runner and two drivers.** Seed them with the two Map scenarios. **Removes** those four twin tests once both runners pass.
5. **Press merge.**
   - `applyAnyPress` becomes the shared function beside `applyPrPress`, over `(ledger, prViews, lastActions, press, ctx)`. It returns `Applied`.
   - `pressOn` becomes a wrapper that builds `ctx` from `s.presence.turnsStarted`. `Pressed` is already `Exclude<Applied, {stale:true}>`.
   - This is a small de-duplication. Unifying `resolveOpen` is decision 5, not part of this step.
6. **`hooks/agent-tools.ts`.**
   - `register.tsx initializeInbox`, `server.ts toolsFor` and `evals/probe.ts` all use `AGENT_TOOLS`.
   - `CLOSE_DESCRIPTION` stays a constant.
   - A snapshot test checks that each host's descriptions are byte-identical before and after.
   - Run `./scripts/eval.sh --suite agent` before and after.
   - **Removes** two copies of the tool list.
7. **`hooks/turn.ts`.**
   - Moves the Exchange literal, the turn flags, `notePerson` and the shared part of `notePrompt`, keeping the mod's handler order. Text-matched sends stay in Codex.
   - **Removes** the duplicated `Exchange` builders.
8. **`hooks/update-flow.ts` and `hooks/conversation.ts`.**
   - **First**, write down both clients' job states, including Codex's crash reconcile.
   - **Mod**, with no behavior change. Pinned by `tests/hooks.test.ts:832`, `858` and `917`. The tests at 2443-2747 guard only the mod adapter's ownership and save behavior.
   - **Then Codex catch-up** from section 4, behind the maintainer's approval, the spike, the eval case and a live Codex check.
   - **Saved state.** `ledgerState` and the transcript path go through `upgraded`.
   - **Removes** the two catch-up decisions and closes the catch-up gap.
9. **PR flow.**
   - `mergeFetched` replaces the four copies of the tracked-or-dismissing filter.
   - Linking from tool output and the Retry control are each built or recorded.
   - PR arrivals in Codex need `codex/src/arrivals.ts` (`TAB_IDS`) and `tab.tsx:follow` (383) changes, or a recorded row.
10. **When a third client is real.**
    - Split the lock into `codex/src/lock.ts`.
    - Add the shared hook-process host with normalized events, if that client runs hooks as processes.
    - Add `sessionView()`, and split the Pane closure in `register.tsx`, if that client has a UI.

## 8. Rejected alternatives

- **A resident shared daemon.**
  - The mod worker has no Node and no timers.
  - A `$.process.spawn` child dies on unload.
  - Spawning a process per event lands on every tool call.
  - Codex has many MCP server processes and no singleton.
- **One reducer over the whole session record, with a normalized event vocabulary for every client.**
  - The mod has no transaction across its atoms.
  - Moving every `register.tsx` handler behind it is the riskiest step and adds no parity.
  - One shared event list risks keeping only what every client can supply.
- **Functions that span two slices,** such as one `applyProgress` over presence and subagents, or one `settle` over ledger and presence. In the mod each needs two non-atomic atom writes, with a lost-update window against `agent.spawn` and `turn.complete`.
- **A JSON step boundary with effects returned as data.**
  - It turns the mod's straight-line async code into an event loop that tracks continuations.
  - Its round trips do not fit Codex hooks with 3 s timeouts.
  - It would change persistence from the ledger only (`register.tsx:706 save`) to the whole state in the 4 MiB `$.store`.
- **A static `conversation: 'fork' | 'transcript' | 'none'` capability.** The mod picks fork or transcript at run time (`catchUp`), so one value is wrong half the time.
- **Generating the "Differences on purpose" rows from `CLIENTS`.** The rows carry prose per look and several references. Generating them drops that detail, or moves it into the record and duplicates the doc.
- **A fine-grained feature registry of about 30 entries before any extraction.** It becomes a second taxonomy that rots. The coarse matrix gives the same gate.
- **Splitting `register.tsx` by concern first.** Each extraction already shrinks it. A split touches the drawing code of two looks and adds no parity. The Pane split waits for a third UI client.
- **Subfolders such as `hooks/session/*`.** The gate resolves `hooks/<name>.ts`, so subfolders need a gate rewrite and buy nothing.

## 9. Open questions and things not verified

**Decisions for the maintainer.** Each is a behavior change, not a refactor:
1. **Failed updates in Codex.** Should Codex adopt "failure leads to catch-up"? That reverses a recorded, on-purpose difference (`docs/looks.md:136`). Today the second failure drops the exchange (`update.ts:applied`).
2. **Codex catch-up.** Should Codex get catch-up at all? The costs: about 12.5k tokens of overhead per `codex exec` call, a prompt form no model has run, and an unstable transcript format.
3. **The progress tool.**
   - **The `at` bump.** Should a repeated identical progress text move `at`? The mod says no, Codex says yes.
   - **The ignored call.** When Codex ignores a main-agent call (`turnOf` returns `undefined`), it tells the agent `unlisted`. Is that the answer the agent should get? The guard itself is on purpose, since one Codex MCP server serves the tab, forked chats and subagents.
4. **`'stopped'` triggers.** Should a main-agent interrupt stop running subagent rows in the mod, as Codex does? When Codex cannot tell why a subagent ended, should the row read "done"?
5. **Open.** Which URL rule wins: any scheme, or `https` only?

**Design choices still open.**
- **The probe.** Should `evals/probe.ts` hold an in-memory subagent list and call `progressTarget` and `changeSubagent`, so the agent eval exercises the shared progress rule?
- **The corpus folder.** How `tests/shared/` is reached from both the `claude plugin test` run and the `build.mjs --tests` bundle without a new gate exception.

**From the inventory, not re-checked.**
- Line numbers for the mod-only exchange inputs (URL lines, PR linking in `tool.call`).
- The `Done` refusal reason.
- Whether a Codex fork gets a new session id, and therefore an empty state file.

**Outside facts not verified.** Claims about future clients come from documentation research only. That covers Cursor CLI hook coverage, the transcript formats, `copilot -p`, the opencode payloads, Amp's experimental API, and whether Antigravity replaces Gemini CLI.
