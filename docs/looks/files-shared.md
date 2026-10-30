# Files: shared modules

Part of [the look map](../looks.md#files).

| File | Role |
| --- | --- |
| `hooks/view.ts` | Shared module. The inbox view: Asks order and count, handles, row state, feedback, done labels, action order, key plan, timing constants. |
| `hooks/presses.ts` | Shared module. The press reducer, its effects, and the saved last-action shape. |
| `hooks/compare-page.html` | Shared file. The page template for a comparison. An agent appends its comparison as JSON after the file's last line, and the page draws it. The Codex and omp builds copy it to `codex/plugin/dist` and `omp/dist`. |
| `hooks/arrivals.ts` | Shared module. Which rows are new, and where a look moves for them. |
| `hooks/ledger.ts` | Shared module. Saved ledger, upgrades, reply parsing and ledger writes. |
| `hooks/host-tasks.ts` | Shared module. The agent's own task list: how each host's tool calls become `Session.hostTasks`, and the `<tasks>` lines the Status call reads. |
| `hooks/status.ts` | Shared module. The Status page's stored parts, the parser for the Status call's lines, the clip limits, and how an answer changes the saved Status. |
| `hooks/children.ts` | Shared module. How each host's events become the Status tab's children: the task notice parser, the Herdr delegate steps, the end of a delegate Herdr no longer shows working, the cut-off at a reload, and the gate that limits how often a child's activity is saved. |
| `hooks/model-text.ts` | Shared module. Guidance, prompts, inbox notes, question numbers and the `Host` and `Told` types. Each host's `Host` names its agent, surface and the `record` and `close` tools. |
| `hooks/session-version.ts` | Shared module. The version every host writes on a session it saves, and `checkVersion`, which Codex and omp run when they read one. |
| `hooks/session.ts` | Shared module. The session state shape, and its pure functions: `notePrompt`, `endTurn`, `recorded`, `pressOn`, `sessionView`, and the catch-up rule, `needsCatchUp` and `appliedCatchUp`. |
| `hooks/conversation.ts` | Shared module. `flattenConversation` turns a conversation's `Turn`s into the text a catch-up reads, and clips it. Each host maps its own conversation to turns. |
| `hooks/clients.ts` | Shared module. The parity record: how each host supports each feature, and why where it does not. |
| `hooks/session-host.ts` | Shared module. The `SessionHost` flows that run on a host's store: `runUpdates`, `askOverConversation`, `reconcileUpdateStatus`, `wakeForDone`, `press`, `fetchPrs`, `isPrFetchDue`, `prFetchTracker` and `exclusiveKeys`. |
| `hooks/gh.ts` | Shared module. `ghFinder` finds a gh that starts, and `ghIn` runs it, over a host's command runner. `branchIn` reads a folder's git branch over the same runner. |
| `hooks/herdr.ts` | Shared module. What a host reports to the Herdr pane it runs in: the `inbox` status line, the stop, and each row tab's count, as pane tokens in one `herdr pane report-metadata` command. Also `delegatesInHerdr`, which asks `herdr agent list` which delegates still run, only while one runs. |
| `hooks/text.ts` | Shared module. Clipping, code-block formatting and relative ages. |
| `hooks/prs.ts` | Shared module. PR parsing, readiness and prompts. |
| `hooks/pr-tab.ts` | Shared module. The PRs tab's rules: fetching each tracked PR through a host's gh runner, which PRs the tab draws, its row ids, and what each PR press does. |
| `hooks/tools.ts` | Shared module. The record and close tools, and `agentTools`, the one list of their names, descriptions and schemas that every host and eval probe registers. Each call's answer holds the text the agent reads and the line the person sees under the call. |
| `hooks/demo.ts` | Shared module. Sample data for `/inbox demo` and the Codex demo. |
| `hooks/dialogs.ts` | Shared module. Notes the questions of a Codex dialog or a dismissed dialog, and links each to the inbox question that copies it: a Codex dialog's link, and the dialog's option descriptions. |
| `hooks/layout.ts` | Shared module. Sizes the desktop look and the Codex tab share. |
| `hooks/marks.ts` | Shared module. Mark shapes for marks the system font draws poorly: desktop draws its Svg marks from `markShape`, and desktop and Codex draw a cancelled row's ✗ from `cancelledMarkShape`. |
| `hooks/tones.ts` | Shared module. Status colors for native marks and terminal palettes. The Codex build writes them into CSS, and omp draws them as true color. Also the banner tints the terminal and omp draw. |
| `hooks/inline.ts` | Shared module. Inline markdown in the agent's text, as spans each look draws. |
