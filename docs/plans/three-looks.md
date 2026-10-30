# One inbox in three looks

Status: building. Shared text, row semantics, navigation and dependency checks are built. Further renderer separation remains proposed. Native verification is incomplete.

Shared modules decide the inbox's behavior and content. Each adapter maps that description to its own controls, units and motion. [The look map](../looks.md) lists current owners and deliberate differences. [The glossary](../../GLOSSARY.md) defines look, host and adapter.

## Built

- **Shared model text.** `hooks/model-text.ts` builds the guidance, prompts, inbox notes and numbered-answer mapping for both agents. `hooks/ledger.ts` owns ledger state and parsing. `hooks/claude.ts` contains the mod's transcript, command, dialog and stop helpers. `hooks/text.ts` contains text formatting. Codex type checking no longer needs generated Claude engine types.
- **Shared row and action descriptions.** `RowView` carries finding detail, the displayed file name and reply intent. `ActionView` carries emphasis and icon kind. Shared helpers decide marks, reply hints, recommended labels and feedback. Each renderer maps these fields to native controls.
- **Shared action order.** `rowKeyPlan` puts retry first, then options or help steps, then the remaining actions. Emphasis changes a button's appearance without changing its position. The desktop renderer follows that order.
- **Shared navigation.** `firstWaiting`, `keptOpen` and `rowAfterClose` decide which row opens. `isTabEmpty` and `followTo` decide when to move tabs. Hosts supply their blockers and drawn settled rows. New rows have no arrival bar. Codex animates their entry.
- **Shared PR rules.** Both hosts use `hooks/pr-tab.ts` for fetching, tracking, presses and PR-opening help. Press validation uses the same help steps as the view. Arrival acknowledgement updates every matching row of a bulk press and preserves newer presses. Both hosts retain sent-prompt records; ambiguous delivery stays visible in open rows and Closed folds, as the look map defines.
- **Shared update and Undo bookkeeping.** `applyExchangeUpdate` applies reply data and `addActivity` owns the activity limit and duplicate filter. Press results name actual reopened rows, so hosts clear closed-note acknowledgements only for those rows. Retry scheduling stays with each host.
- **Import checks.** The structure checker parses source and resolves literal import targets. It follows local dependencies from nested Codex sources and tests, shared build inputs and type imports. Shared restrictions continue through type bridges. Nested functions cannot imitate the runtime loader exception. The checker tests invoke the real command against disposable fixtures.
- **Shared status line, counts and PR row text.** `footerStatus` decides the status line under the inbox. `waitingCount` gives a group title's count. `threadRowText`, `checkRowText`, `prRowWaits`, `prsEmptyText` and `splitFollowUps` decide a PR row's mark, text, whether it waits and which buttons are follow-ups; omp reads `isFollowUp` itself. `closedMark`, `settledMark`, `canUndoRefused` and `settledTone` decide a closed or settled row's mark, its refused-notification Undo and a settled label's tone. omp draws from all of them.
- **Codex row-action components.** The tab uses production components in `codex/src/row-actions.tsx`. Mounted tests cover action order, emphasis and guarded clicks. A mounted real-tab test covers reply focus, hidden shortcuts, draft preservation and sending through its host bridge. Full polling, selection, PR drawing and measured motion still need separate proof.

## Remaining work

1. **Separate drawing from host orchestration where its inputs are explicit.** The mod still combines engine events, storage, presses and both native drawings. The Codex tab still combines page effects and row drawing. Use the existing row and action descriptions as inputs. Preserve stable focus keys, press guards, redraw timing and retained panel content while moving code.
2. **Remove remaining content copies at their owners.** PR block and row drawing, host-specific notices and some closed-row composition still sit in both adapters. Share a decision when both readers require the same result. Keep text fitting, native controls, theme resolution and DOM measurement local.
3. **Add drawing proof as renderers become separable.** Extend the existing mod drawing test for uncovered settled and PR content. Add Codex row and full-page checks only for contracts the mounted action tests cannot reach. A missing row field, stale selection or dropped panel during collapse must fail at the renderer that owns it.
4. **Complete native acceptance.** Automated state and component checks do not establish native painting, clipboard access, keyboard focus or measured animation. Record the current build, width, theme and transitions observed. Name each state or host that was not checked.

### Known copies and differences

Each entry names what is written more than once or differs between looks, and the owner it belongs in.

- **Clock-driven redraws.** The mod arms a timer per press kind, omp restates the Queued and settled thresholds in `isAnimating`, and Codex checks `SETTLED_MS` inline on each poll. A shared `nextChangeAt(view, now)` in `hooks/view.ts` would give the mod and omp one timer. Until then a new timed state in the view redraws in omp and not in the mod.
- **Done wake delay.** After a Done press the mod waits exactly the settle window, omp 250 ms more, and Codex two polls more. Codex also does not wake at turn end. One delay helper in `hooks/session-host.ts`, with Codex's longer window recorded as a host limit, would stop the mod's timer from landing on the window's edge and skipping a wake.
- **The path probe for `openTarget`.** Codex and omp each write the same Node probe, in `codex/src/server.ts` and `omp/src/commands.ts`.
- **The mod's PR fetching.** The mod skips the 15-second rule for a new PR and asks for the branch's PR only while the PRs tab shows. Codex and omp share one fetch path. Routing the mod through `isPrFetchDue` with the person's away state as an input would make the PRs tab fill the same way everywhere.
- **Which rows wait in a tab.** The mod and Codex each write a `tabWaits` that reads `prRowWaits` for the PRs tab and `listWaits` for the others. One shared `tabWaits(view, tab)` would remove the copies.
- **Which row opens when the open row disappears.** The mod and Codex open the row now at its index, even a handled one. omp opens the first row that waits. The shared rule should open the first row that waits from that index, as `rowAfterClose` does after a press. omp has to keep the open row's index for it.
- **A refused reply.** The mod restores the words after a refused send through `isRowFailed`, Codex keeps the draft until success, and omp drops it, so omp loses the words. The press outcome should say whether to restore the draft, and every host should follow it.
- **A stale press.** Each host decides on its own whether to keep the draft, reopen the field and where the note shows. The press outcome should carry that decision.
- **Codex's PR Undo window.** `drawnPrs` lists a dismissed PR for `SETTLED_MS` of server time and the tab times it from the dismiss, so its Undo lasts about 2 to 5 seconds. A row's lasts 5. `drawnPrs` and `isDismissing` should take the host's settle window.
- **Load-time repair.** The mod, Codex and omp each repair a session cut off by a quit, with their own order and guards. One `afterRestart(s)` in `hooks/session.ts` would decide it.
- **Following new rows.** Each host rebuilds whether the shown tab is empty and where to move, with different blockers. The arrival module should take the host's blocker and return the move.
- **The turn-end sequence.** Each host ends a turn, queues the exchange, records the stop and tasks and wakes for Done in its own order. A shared step for the parts every host does would stop a host from leaving one out.
- **Press feedback text.** Each look composes a PR row's pending text and age itself. One function returning text, age and tone would remove the copies.
- **Stop presentation.** The band, the stop row and Resume are composed per host, and `Stop.detail` is a free string the classifiers copy words into. A typed stop reason would let `stopText` stop parsing it.
- **Saved-state stores.** `codex/src/state.ts` and `omp/src/state.ts` repeat the file store, pruning and session-file sweep, and the mod prunes differently. Export the version check from `hooks/session.ts` first.
- **Host wire formats in shared files.** Claude's task parser and tool names, Codex's plan parser and dialog link fields sit in `hooks/`. Each belongs in its host, with the core taking normalized tasks, activity lines and dialog questions.
- **Small copies.** The `ScreenTab` the inbox model reads is built by hand in three hosts. Demo presses keep three reply timers with different delays. omp has no recording demo and does not say so in its differences table. The `turn-working` parity entry for Claude Code reads full while its row lists a known gap. Running a task's command closes the task only in the mod, which alone sees a command the person types, and no FeatureId records that.
- **Tests.** `hooks/view.ts`, `layout.ts`, `tones.ts` and `dialogs.ts` have no unit tests of their own, and `arrivals`, `rowAfterClose` and `keptOpen` are tested only inside one look's suite. The press feedback sequence, held-row rules, catch-up and fork tests are each written once per host. Shared behavior tested once at the core, with each look tested only for its own drawing, would catch drift where it starts.

Each change passes `./scripts/check.sh`. Rebuild the Codex bundles after changing a shared module or Codex source. A move of model-facing text preserves its bytes; changed text follows the model-testing rule in `AGENTS.md`.

Native checks:

- Terminal: both themes, narrow fitting, keys, Reply, retry and close followed by Undo.
- Claude desktop: confirm the loaded build, then check Client hit areas, reply focus, row and fold states, PR content and both appearances. The pane changes form in one draw because it has no browser animation primitives.
- Codex: mounted controls and clipboard in the app, then frame measurements in the local page for pending press, settle, Undo, failure, exit and interrupted moves. Check both themes, narrow widths and reduced motion.

[unified-ui.md](unified-ui.md) proposes further visual alignment. [claude-mode.md](claude-mode.md) proposes an additional host and item source. Neither proposal establishes behavior in the three built looks.
