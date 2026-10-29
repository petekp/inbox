# Scripted release pass

Status: proposed. Nothing in it is built.

The live pass in [release.md](../release.md) step 4 is the last check before a release reaches people. Today it is run by hand in a macOS VM, one look at a time. This plan makes it trustworthy as the inbox adds clients, in two tiers:

- **Tier 1, process.** Test the exact build that ships, installed the way people install it, and decide each check from recorded evidence. It needs no new tools, and it gates the next release.
- **Tier 2, tools.** Turn the checks into data, script them for each look, and move what does not need a real app into the repo's tests.

In this plan, a **check** is one line of the pass, such as Question or Dialog, and a **look** is one of the four places the inbox is drawn ([GLOSSARY.md](../../GLOSSARY.md)). A **candidate** is a commit that already holds the version bump and has not been tagged.

## What the pass misses now

- **The build.** Each look is checked on whatever commit exists when its turn comes. The bump comes after the pass, so no look is checked on the exact commit that ships.
- **The install.** The pass loads the build from a plugin folder, or in omp with `-e`. People install from a marketplace: a new install takes `main`, and an existing one updates when the version changes. Neither path is tried.
- **The model.** Claude Code in the test VM ran Haiku. The agent's side of a check, such as recording a question, was checked on a smaller model than the evals use.
- **The verdict.** Whoever drives a check also writes its verdict, and the release owner reads only some captures.
- **The machine.** Each run backs up the VM's saved state and restores it by hand.

## The two bugs the 0.2.10 pass found

Any design has to catch both. Today's checks would miss both on a rerun.

- **The desktop reply field's Discard button ran off the pane at the narrowest width.** It is the Claude app's own layout engine, so only the real app shows it. No check narrows the pane, and "Reply while closing" expects only that the row stays. An accessibility press on the clipped button still works, so pressing it proves nothing.
- **A question dismissed in omp's dialog showed only after the next message.** omp cancels a dialog with this event order: `tool_result` (an error) → `turn_end` → `turn_start` → `message_end` (aborted) → `turn_end` → `agent_end`. The turn ends with no reply text, which the shared `endTurn` drops unless told otherwise. omp's list of checks in release.md leaves out Dialog. A check that reads the saved state after the next step would pass with the bug in place.

## What running the pass by hand showed

The 0.2.10 passes were driven by hand-written scripts: window captures, a text finder that clicks a word it reads, tmux keys, and install scripts. Each item below is a requirement for the Tier 2 drivers.

- **The scripts live outside the repo** and hard-code the VM window's id, which changes each time the VM boots. A driver finds the window by its name at each run.
- **A press's ✓ and its Undo last 5.12 s,** set by `SETTLED_MS` in `hooks/view.ts`. Capturing, finding the word and clicking took longer, and Undo was missed four times across the desktop and Codex looks. A driver presses Undo by its accessibility label or key, right after Dismiss.
- **The terminal's inline pane gives Undo no key,** and Tab passes over it, so no keyboard driver can press it there. Closing the last open row on a tab also moves the keyboard focus to the prompt, so the next keys go to the agent.
- **The VM's clock jumped about an hour mid-pass,** so row ages read wrong. A clone syncs its clock before a run.
- **Restoring a release's saved state by hand brought back transcripts that held later answers,** so the first turn closed the restored question. The base image's fixed saved sessions avoid this.
- **Codex asked once to approve the read-only `gh pr view` call** that the PRs check needs. The check expects that prompt and approves only read-only calls.
- **The Dialog check expects Skip to add no row,** but when the agent asks the same question again in its reply, the inbox model rightly adds it. The expectation reads the dialog's own effect, not the reply's.
- **omp's test `HOME` has no `gh` sign-in,** so its PRs tab read "No PRs" until the VM's sign-in was linked in. The base image sets up `gh` for each agent's home.
- **The ChatGPT app's Fork menu ignored synthetic clicks and keys,** so the fork was made with `codex fork`, and an app-made fork was not seen. The ChatGPT app driver needs a way to fork.

## Tier 1: process

1. **Push the candidate.** Commit the bump, the rebuilt bundles and a passing `check.sh` on a branch, push the branch, and leave `main` and the tag alone.
2. **Run every eval on the candidate:** `./scripts/eval.sh`, then `./scripts/eval.sh --suite agent --agent all`. Keep their results and model names.
3. **Install from GitHub at the candidate's branch** where the agent allows it. `codex plugin marketplace add` takes `owner/repo@ref`. Where an agent takes no ref, the pass names the source type it used. The probes below settle Claude Code and omp.
4. **Prove the build.** The first check in each look compares the installed files' sha256 with `git show <candidate>:<path>`, and records the model name from the transcript and the app and engine versions. Each look repeats it after the app restarts, since the ChatGPT app reinstalls the plugin from GitHub when it opens.
5. **Run each look on its agent's default sign-in**, with the model set to the one the evals use.
6. **Clone the VM for each run** from a base image, and delete the clone afterwards. Stop only the VMs the run started, by process id.
7. **Decide from evidence.** A check passes only with the evidence its expectation names. A check with no evidence fails. The release owner reads every capture a check depends on.
8. **Promote the same commit.** After the pass, fast-forward `main` to the candidate, tag it and publish. Then run a short smoke in a fresh clone through the real update from GitHub.

Any change after the pass makes a new candidate and a new run.

## Tier 2: tools

### Where each check runs

| Layer | Catches | Runs |
| --- | --- | --- |
| Drawing | What a look draws for a state: buttons, order, labels | `check.sh`. The mod's test kit returns a mounted tree as plain data with `drawn()`, and omp's `render()` in `omp/src/panel.ts` returns text lines. |
| Host replay | Event order, timing and saved state in each host | `check.sh`. Sequences recorded from the real hosts replay through `omp/tests/host.spec.ts`, the Codex tests and `tests/session-fake-host.ts`. |
| Agent evals | Whether each agent records and closes as the guidance says | `./scripts/eval.sh`, both suites |
| Live pass | Install and update, the app's own layout, hooks, a press reaching the agent, and app UI around the inbox | VM clones |

The host replay layer catches the omp bug without a VM. Feed the six recorded events and assert that the dismissed question reaches the inbox model's prompt after `agent_end`, with no further event. Each layer's tests name the future failure they catch, as the repo's test rules require. There are no broad snapshots.

The live pass still runs the same check in omp, since the event order belongs to omp and can change in its next release.

### Checks as data

The checks become one file, `scripts/release-pass/checks.json`. The table in release.md is generated from it, so there is one source. Each check names:

- the looks it runs in;
- its setup;
- its steps, in the inbox's terms, such as "press Explain on the finding";
- its expectation, as conditions the checker can test: saved state, screen text, an accessibility frame, a transcript line, or a deadline such as "within 10 s of Escape, with no further input";
- the captures to keep.

New and changed checks:

- **Identity:** installed files, model and versions, as in Tier 1.
- **Dialog in omp:** a real `ask` dialog, cancelled with Escape. The dismissed question must be in the inbox within the deadline, before any other message.
- **Narrow pane on desktop:** drag the pane to its narrowest, open a reply field, and assert that every control's accessibility frame lies inside the pane's frame. Then click Discard where it is drawn. Repeat at the default width.
- **Reply while closing:** typed through a click on the field and real keystrokes, not an accessibility action.
- **PR press:** press an action on a PR row, beyond the empty and missing-`gh` states.
- **Missing `gh`:** rename the binary, then force a fresh fetch. A reopened tab can show cached PRs.
- **Agent replies:** a search of every transcript for an inbox id.
- **First install:** each agent from nothing. omp has no earlier release, so 0.2.10 is omp's first install.

Codex's row animations stay in the local-page measurement that AGENTS.md describes. This pass does not time 200 ms moves.

### Drivers

| Look | Input | Reads |
| --- | --- | --- |
| Terminal | tmux keys, started from a Terminal window so Claude Code can read its keychain sign-in | `tmux capture-pane` text |
| omp | tmux keys | `tmux capture-pane` text |
| Claude app | Accessibility presses by label, pointer events for the tab bar and anything drawn in a `Client`, real keystrokes for typing, and a drag for the pane width | The accessibility tree's text and frames, and window captures |
| ChatGPT app | Accessibility, if the Inbox tab shows in the tree; pointer events if not | Same, if it shows |

In the clone, each driver uses the VM user's real config folders, where the previous release and its saved sessions live. Window captures come from the host, with the clone's window on screen, and the driver moves the pointer before each capture, since an idle VM screen stops repainting.

### Real model turns, not a stand-in

Every check that needs an agent turn uses a real one, on the evals' model. A scripted stand-in model cannot be pointed at all four agents:

- Codex's inbox model runs `codex exec --ignore-user-config` (`codex/src/update.ts`), so a custom provider never reaches it.
- omp picks the person's `@inbox` role first, then a Sonnet from the signed-in `anthropic` provider (`inboxModel` in `omp/src/host.ts`).
- Claude Code reaches a stand-in only by an API key, which changes the sign-in path that mods behave differently under.

A real turn varies. A check that fails is run again at most twice. Every attempt is kept, and a check that passes only on a retry is marked flaky and goes to the release owner. It is never reported as a plain pass.

A stand-in model server is still useful for the drivers' own fast loop on the host, as `mods/scripts/live.sh` in petekp/claude-code-setup runs Claude Code on a placeholder key. It never decides a release.

### The base image

A script in the repo builds the base image, so it can be rebuilt:

- install the apps and `gh`;
- record each app's version;
- install the previous release from its marketplace;
- create saved sessions in each agent from a fixed set of prompts.

Signing in stays by hand. Every run records the app versions it saw, and the identity check fails if an app updated itself mid-run.

macOS runs at most two macOS VMs at a time, and other projects share them. With two free, one clone runs terminal and omp while the other runs the Claude app, then the ChatGPT app. With one free, the looks run one after another.

## Steps

1. **Tier 1 for 0.2.10.** The pass is by hand, under Tier 1's rules, with the new Dialog and narrow-pane checks.
2. **Probes:**
   - Can Claude Code and omp install from a git branch?
   - Does the ChatGPT app's Inbox tab show in the accessibility tree?
   - Can the driver drag the desktop pane's divider?
   - What does a clone cost in time and disk?
   - Does a clone keep its sign-ins?
3. **Host replay tests** for the omp cancel order, and for the other event orders the hosts depend on.
4. **The checks file and the generated release.md table.**
5. **The terminal and omp drivers, and the checker.**
6. **The base-image script and the clone scripts.**
7. **The Claude app and ChatGPT app drivers.**

## What needs approval

This is release tooling, so each piece needs Pete's yes before it is built:

- release.md: the candidate branch, the new order, the generated table and the new checks;
- AGENTS.md: "before you bump" becomes "on the candidate";
- `scripts/release-pass/`: the checks file, drivers, checker, base-image script and clone scripts;
- `check.sh`: the generated-table check and the host replay tests;
- pushing candidate branches to GitHub.

## Risks

- **Upkeep.** The Claude app and Claude Code update themselves. An update can break a driver, and a broken driver blocks a release until it is fixed.
- **Real turns.** Checks that need the agent stay slower and less certain than scripted ones. The evals hold the line on agent behavior, and the pass checks that the wiring works.
- **Shared VMs.** A run sometimes waits for a free VM.

## Follow-ups

- **An `@inbox` check in omp.** Run omp with a fresh `HOME` and three configs: no `@inbox`, `@inbox` set to a working model, and `@inbox` set to a model omp cannot use. The panel footer must name the Sonnet, the working model, and the Sonnet again. It would catch a change that breaks the fall-through, or a footer that names a model the inbox does not call.
- **An update with the Codex Inbox tab open.** Open the Inbox tab in the ChatGPT app, then install a newer build the way `~/.agents/scripts/inbox-live.sh` does (`codex plugin add inbox@inbox`). Change threads until the Codex log shows "Loading MCP server catalog", and check the tab still works. Then open a new Inbox tab in a thread that has none, and check it shows the new build, using a build that looks different, such as one with Show demo. The first step would catch a tab address that changes between builds: Codex then removes the open tab, which shows "Couldn't display Inbox" until it is closed and opened again. The second would catch a page swap that fails, since a new tab starts on Codex's saved copy of an earlier build and then stays on it. The release pass installs a build once, before any tab is open, so it missed both.
- **A message typed in Codex while a turn runs.** In the ChatGPT app with the Inbox tab open, give the agent a task that runs for a while. While it runs, dismiss a row and wait for its Undo to end. Type a message and press Enter, then press Done on another row before the turn ends. The dismissed row must fold at Enter, and the Done row must stay until you type again. The inbox counts a typed message when Codex runs `UserPromptSubmit` (`codex/src/hook.ts`), and nothing has shown when Codex runs that hook for a message sent during a turn. In Claude Code, the mod's `prompt.submit` runs at Enter even for a queued message, so Codex should match it. The check would catch two failures. If Codex runs the hook only when the waiting message starts, the dismissed row stays until then, and the Done row folds too, though nothing was typed after it. If Codex runs no hook for that message, the dismissed row stays until a tab change. `codex/tests/hook.spec.ts` sends `UserPromptSubmit` itself, and no check in the pass sends a message while a turn runs, so neither catches these.
- **The omp panel test can still time out under heavy load.** "/inbox hides the band while the panel shows…" in `omp/tests/host.spec.ts` timed out after 5 s in one of three `check.sh` runs on 2026-10-24. It has not failed since in about 2,000 runs with up to 64 test processes at once. Most of the test's time goes to waiting for the panel to open, which includes the first `import('@oh-my-pi/pi-tui')` that `openPanelUi` in `omp/src/host.ts` runs. That wait takes about 150 ms on a quiet machine and up to 2.3 s with 64 processes running. The test already waits on each state it reads, so heavier load can use up its 5 s on that wait alone. Load pi-tui before the test starts, or give the test a longer timeout, so that a timeout means the panel did not open.
- **The Codex row-actions test can fail under heavy load ([#75](https://github.com/petekp/inbox/issues/75)).** `codex/tests/row-actions.spec.ts` failed after about 100 s in two of ten `check.sh` runs on 2026-10-26, with a load average near 12. Run alone, it passed three times in 14 s, and the whole Codex suite passed on each rerun. On 2026-10-27 the whole Codex suite failed the same way in 11 of 26 runs on one branch. Every failure came within one busy hour, at a load average near 8. Each time, the file's second test, "the actual Codex tab replaces actions…", reported no result, and the file failed after about 105 s.

On 2026-10-28, `check.sh` failed the same way on the 0.2.14 release branch, with the file failing as a whole after 135 s at a load average near 78. Run alone, its three tests passed in 29 s.

A debugger attached to one failing run found the test inside Node's assertion code. `assert.equal(root.querySelector('input'), held)` had failed: after a poll closed the row, the reply field was no longer the same element. Node then diffs the printed forms of the two DOM elements for the error message (`myersDiff`), which kept the process at about 150% CPU for the rest of the 105 s. That explains the long run and the missing assertion text. Synthetic CPU load (20 busy processes) did not reproduce it. Two fixes follow: compare elements with `assert.ok(a === b, message)` so a failure reports at once, and find why a poll under load replaces the reply field.
- **Read the plugin directory's scan of `main` after each update.** Nothing local runs the directory's rules for a hooks module. `claude plugin validate --profile directory` says it applies none of them. The directory checks `main` about every 6 hours and scans each new commit. After `main` moves to a release, the release owner reads the scan of that commit in the developer portal. The release is done when the scan reports no block and no hold that the README's "What it runs, sends and changes" section leaves out. A scan that did not finish counts as not read, so the owner reads the next one. This would have caught the two blocks on 0.2.13: `$` passed to functions in another file, merged on 2026-10-19, and a `tool.check` hook that read its verdict, merged on 2026-10-22. They reached `main` with 0.2.13 and went unseen for nine days.
- **A slow gh in each look.** Put a gh on the PATH that sleeps 25 seconds before it runs the real one, and open the PRs tab in each look. Each PR must keep its last view and read "Last refresh failed: gh did not answer within 20 seconds". The first 0.2.14 pass saw the PRs tab say "The inbox could not find gh" on a busy host, where gh was only slow, and #175 fixed it. This step would catch a timeout read as a missing gh again, in any host's run.
- **One question per turn in the Codex dialog step.** Asked for two questions, Codex put both in one two-page dialog. The step then cannot answer one question and close the other with its ✕, and the 0.2.14 pass needed an extra turn to check that a dialog closed unanswered leaves an Asks row. Asking for one question per turn would keep that check in the step.
- **The omp band test fails when run alone.** "the band shows above the editor and redraws with the counts after a change" in `omp/tests/host.spec.ts` failed 12 of 15 times run alone on 2026-10-28, on `f66b4f82` too. Another run of 15 failed once. Each failure is an assertion, not a timeout: after `renders.count` rose, the band still read "Nothing needed", not "Asks". A render the test did not cause can pass its wait before the recorded task reaches the band. Waiting for the band's text instead of the render count would make a failure mean the band did not redraw.
- **The mod's test kit skips a `process.run` fake that throws.** In `claude plugin test`, a fake that throws, as `tests/hooks.test.ts` does for a missing gh, is skipped with "test's process.run hook was skipped". The mod's call then rejects with "no implementation for process.run", not with the fake's error. A test whose fake throws a message the mod reads, as #175's first version read "still running after", passes or fails on the kit's message instead. A fake that returns `{ deny: … }` reaches the mod with its own message. Moving the throwing fakes to `deny`, or a kit that fails the call with the thrown error, would catch a mod that reads the wrong error.
