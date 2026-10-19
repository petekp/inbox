# Working on the inbox

The inbox is drawn in three looks: the Claude Code terminal, the Claude desktop app's pane, and the Codex tab. Before you change the UI or a rule, read [docs/looks.md](docs/looks.md). It says which file owns each rule, where the looks differ on purpose, and what to check after each kind of change. [GLOSSARY.md](GLOSSARY.md) defines the terms.

## Every change

- The repo is public. Keep private paths, other people's names and session content out of commits.
- Run `./scripts/check.sh` after every change.
- Change shared behavior in the owner listed in `docs/looks.md`. Adapters map shared row and action descriptions to native controls. Hosts run events, storage and effects. Rebuild the Codex bundles after a shared-module change with `npm --prefix codex run build`.
- When you finish a change to a shared module or a look's drawing code, say for each look whether the change applies and what you checked there. A difference between looks that is not in the "Differences on purpose" table in `docs/looks.md` is drift: fix it, or add it to the table with its reason.
- Before you bump the version, run every check in [docs/release.md](docs/release.md).
- Saved state outlives the code. The mod uses `PluginState` in `types/index.d.ts`; Codex uses `SessionState` in `codex/src/state.ts`. Convert old shared fields in `upgradeLedger` or `upgradeLastActions`, and old host fields in `upgradeState` and `upgraded`.

## Text a model reads

Test a change to text a model reads before keeping it. Small rewordings change behavior: a one-word edit to the findings rule in `systemText` made the inbox model re-add questions the user had dismissed.

- Claude and Codex read the guidance `guidanceText` builds, and the `inbox:` texts that `inboxText`, `closedText`, `carryText` and `answerNote` build, all in `hooks/model-text.ts`. Each host's `Host` supplies its names and the guidance's first paragraph, so a change there reaches both agents.
- A subagent reads no guidance. Each host adds `progressRule` from `hooks/model-text.ts` to the start of each subagent the main agent starts: the mod to the `agent.spawn` prompt, and Codex as SubagentStart context. The agent suite runs only a main agent, so test a change to it with real subagents in `claude -p` and `codex exec`, and count the `progress` calls.
- Claude reads the tool descriptions and results from `hooks/tools.ts`. Codex reads those too, and its own tool texts in `codex/src/texts.ts`.
- Both agents read the message each press sends, from `messages` in `hooks/presses.ts` and `prompts` in `hooks/prs.ts`.
- The inbox model reads `systemText` and the blocks from `buildPrompt` in `hooks/model-text.ts`. In the mod it is a Sonnet call after each reply. In Codex it is `codex exec` with the model in `MODEL` in `codex/src/update.ts`.
- After a change to `guidanceText`, a tool description in `hooks/tools.ts` or a tool answer, run `./scripts/eval.sh --suite agent`, and run it before a release. It gives Claude Code on Opus and Codex the shipped guidance and a stand-in MCP server named `probe` (`evals/probe.ts`), which uses the real tool descriptions, schemas and answers. It checks the `record`, `close` and `progress` calls and the reply for each case in `evals/agent-cases.json`, with the same pass bar as the model suite and 5 runs by default. Use `--agent`, `--runs`, `--case` and `--out` as in the model suite. A Codex run uses a temporary `CODEX_HOME` that holds only a link to `auth.json` and `AGENTS.md`, so Codex does not load your installed inbox plugin.
- To compare two versions, print each one's prompt for the same sample exchange. Run each several times with `claude -p --model sonnet --tools "" --system-prompt …`, and for text Codex reads, with `codex exec` and the Codex model. Count the outcomes.
- After a change to `systemText` or `buildPrompt`, run `./scripts/eval.sh`. It runs the inbox model on the cases in `evals/cases.json`, on Sonnet and on Codex, and fails a case that passes in too few runs. Add a case for each behavior a change sets out to fix. `check.sh` leaves the evals out, since each run calls a model.

## Presses

Every action shows what it did as soon as it is pressed. When Discuss showed nothing, a person sent the same message four or five times.

- Each `Action` declares its `kind`, a `PressKind`.
- A Talk or Hand-off press leaves a ✓ and its label on the row, as in "✓ Discussed". A Talk press reads "Explaining…" or "Discussing…" until the agent's reply, and a handed-off row the reply left open reads "Still open". It stores its action id from `actionId()`, so the same action then reads "… again".
- A Local press, an open or a copy, shows "Opening x…" on its row, then its result: "✓ Opened x", or in red why it could not. It never reports through a toast.
- A Mark or View press shows itself, as closing a row or opening the text field does.
- Row and PR presses use `applyPress()` and `applyPrPress()`. The mod's `runPress()` and the Codex server run their effects through each host. A click and a key press record the same result.

## Tests and live checks

- In `tests/hooks.test.ts`, `world()` answers every engine event the mod uses, and the test harness takes one handler per event. A test changes an answer through the variables `world()` resets, such as `ledgerReply`, `stopBlock` and `ghAnswers`.
- The plugin store is keyed by the mod's name, so a session that loads a copy under your own config writes to your real inbox's state. Check the UI live in a session with its own `CLAUDE_CONFIG_DIR`. `mods/scripts/live.sh` in petekp/claude-code-setup starts one in tmux.
- To try a change with real model turns, run `claude -p` on a copy of the mod. Patch the copy to turn on, since the mod does nothing under `-p`, and to skip its `$.store` writes, since the run signs in with your own config and would save the trial's sessions to your real inbox.
- To test whether the agent calls `record` or `close`, run `./scripts/eval.sh --suite agent` (see "Text a model reads"). Never let a test session reach an MCP server named `inbox`: the real mod answers the calls and saves them to your real inbox.

## Drawing in each look

- **Every look.** Check every state of what you change, and every move between states, not only the resting forms. Look at frames mid-move. A button must not shift while its press is out, content must not vanish before its space closes, and nothing may flicker. Then look in the real app. Say which states you did not see.
- **Every look.** A look draws the buttons its shared plan lists, in the plan's order. Row buttons come from `rowKeyPlan` in `hooks/view.ts`, and PR buttons from `threadActions`, `checkActions` and `prBlockActions` in `hooks/pr-tab.ts`. A look may style and wrap them. It never reorders, adds or drops one. If a look must differ, add the difference to "Differences on purpose" in `docs/looks.md` with its reason. The demo test in `tests/hooks.test.ts` checks the order in the terminal and desktop looks.
- **Every look.** Sizes the desktop pane and the Codex tab share, such as row padding, live in `hooks/layout.ts`. Change them there so the looks do not drift apart.
- **Terminal.** The terminal and desktop looks share `hooks/register.tsx`, so a change there for the desktop app can change the terminal too. Check it there.
- **Desktop.** Before designing for the Claude app's pane, read "Drawing limits for desktop design" in `docs/reference/claude-desktop-app.md`. Build only on what it marks verified or stated, and probe anything it marks unknown. A Button there is always native and as small as its label, and its hotkey does nothing. A custom-drawn control that takes clicks over its whole shape needs a `Client`. The pane has no opacity, transform or CSS, so a row changes form in one draw. The pane redraws only on events, so confirm it shows the new build before trusting a capture.
- **Codex tab.** A row's form and animation come from the state machine in `codex/src/rows.ts`. Add a new move there, as `docs/plans/codex-row-states.md` describes, not as a special case in `codex/src/tab.tsx`. Measure each row's height and position frame by frame in a local page that hosts the built tab, in both themes and with reduced motion. Then check it in the Codex app. The server's handler reloads when its file changes, after a reinstall or while `npm --prefix codex run dev` runs, and an open tab then replaces its page with the new one. Only a change to the loader, `codex/src/server-main.ts`, needs Codex quit and reopened.
