# Revamp handoff

The `revamp` branch builds the UI plan in [inbox-ui.md](inbox-ui.md) through the 16 steps in [target-architecture.md](target-architecture.md). Each step is a commit, followed by a review commit where a reviewer found something. `./scripts/check.sh` passes on every commit. The branch is not merged or pushed.

## Before merging

Run these live checks. Tests cover each behavior, but no live session has.

1. **Delivery in the terminal.** Start a signed-in session with its own `CLAUDE_CONFIG_DIR`, as AGENTS.md describes. Start a long turn, open `/inbox`, and press Explain on a question. The row should read `Queued: Explain`, then `✓ Explain` once the turn ends and the message enters. If it stays Queued, the engine stored the prompt under different text, and every press in every session would read Queued.
2. **Desktop Code mode.** Load the branch in a desktop session, run `/inbox demo`, and check what the plan's live check 4 asks. Each outcome has a set change in step 14 of the plan:
   - The text field draws and Enter sends. If not, set `DESKTOP_TYPING` to false in `hooks/register.tsx`.
   - A guarded row's buttons look dim for 0.4 s after it opens.
   - The recommended option looks primary. If not, desktop needs the ` (recommended)` suffix too.
   - A review thread's body draws as Markdown.
   - Resize the pane across 50 columns: below 50 the status sits under the tabs and closed rows have no age.
3. **Codex.** Reinstall the plugin and open a thread:
   - The Inbox tab opens from the side panel. If not, switch to the `inbox_tab` fallback in the plan's section 6.2.
   - Ask "what's waiting on me?". The model calls `inbox`, and the call shows text only, with no inline tab.
   - Press Explain in the tab. It reads Sending, then Queued, then ✓.

**How to try the branch first.** Your settings load the main checkout through `CLAUDE_CODE_PLUGIN_DIRS`, and a second copy of the mod does not load beside it. So the options are pointing that setting at the worktree for a trial, or merging. Both copies write the same store file, `inbox_inline-<hash>.json`, because the store is keyed by plugin id, not by folder. The branch only adds fields to saved ledgers, and main ignores them. So going back to main after a trial is safe.

## Decisions that are yours

**Stored and wire-name changes, approved.** Each one has a conversion, and old state upgrades on load:

- `LastAction.isHandoff` becomes `kind`: Talk, Hand-off, Local or Mark.
- `LastAction.action` holds action ids instead of button keys.
- The `ARRIVAL` atom becomes `{ids, at}`.
- Codex: the tab's press payload `TabPress` becomes `RowPress`, with the option as text and the thread id.
- Codex: the thread entrypoint moves from the `inbox` tool to `inbox_view`.
- `PluginState.unfolded` also holds `'finding'`, for the Findings Closed fold. The plan did not list this one. Old values stay valid.

**The cost of removing session checks.** With the `<checks>` block gone, the per-turn update writes "tests pass" into the card in 8 of 8 runs when a reply claims it, against 0 of 8 before. You kept the removal after seeing this cost.

**Restoring checks is new work now.** The removal is one commit, `89995f7`, but 15 steps build on it. Reverting it alone does not apply cleanly.

**Defaults taken for the UI plan's section 6.** You can override each one. The plan names the steps an override changes.

- Address hands a finding off and Discuss keeps it open.
- Claude mode is not built.
- No row opens on its own after a press.
- The band has no answer buttons.

**Model-read text that changed.** Each change was measured with the A/B in AGENTS.md, with counts in its commit message:

- `89995f7`: the `<checks>` block and bullet are gone from the inbox model's prompt.
- `af36a61`: `systemText` gains one line under CLOSED: `Putting a finding off ("later", "not now") is not setting it aside: it stays open.` Without it, the update kept a finding the person put off open in 0 of 8 runs. With it, 8 of 8.
- `33201fd` and `524b71b`: Codex's `inbox` tool answers in text.

**Wording to accept or change.**

- A missing file reads `it no longer exists`. The plan said `it was moved`.
- Clipboard failures read `no app is attached`, `the clipboard did not take it` or `another plugin refused it`. In Codex they read `this tab has no clipboard access`.
- With only closed findings, Findings reads `No open findings.`
- The band count reads `1 need you` for one row.
- The terminal keeps ` (recommended)` on the recommended option, because a terminal Button ignores `variant`.

**Smaller open questions.**

- `/inbox demo` still toggles. It could instead only start the demo, with [Hide demo] as the only way out.
- The Needs you tab opens its first row when nothing counts. The plan's rule would open none.
- After Undo, Claude's notes list the item again without the word "reopened". That version passed its A/B at 7 of 8. A version with an explicit `Reopened by the user` line scored 8 of 8.

## After merging

- Restart open Claude Code sessions. `/reload-plugins` leaves the removed `run_check` tool listed until a restart.
- Reinstall the Codex plugin with `codex plugin add inbox@inbox`, using the `codex` binary bundled in the ChatGPT app. Then reload any open Inbox tab.

## Known gaps

- A pending open or copy can stay on `Opening x…` if the mod reloads mid-call. Nothing expires it.
- If the saved session is unreadable and the person sends a prompt before pressing [Try again], the saved copy can no longer be brought back.
- The Codex tab shows the not-heard warning only in place of an empty Needs you list, so a session with open rows and a skipped hook does not say items are missing.
- An `inbox_press` call from the Codex tab has no timeout.
