# Releasing

Pull requests merge into the `next` branch. A release fast-forwards `main` to `next`. A new install takes `main` as soon as it is pushed. An existing install updates only when the version changes, so the bump is what ships a build to most people.

Run the automated checks on the `next` commit you will release, before `main` moves.

## 1. Run the automated checks

Send each command's output to a log file and check its exit status. Each must exit 0.

| Command | What it checks |
| --- | --- |
| `./scripts/check.sh` | Formatting, plugin validation, structure, type checks, all test suites, and that the Codex and omp bundles match their sources. |
| `./scripts/eval.sh` | The inbox model on every case in `evals/cases.json`, on Sonnet and on Codex. |
| `./scripts/eval.sh --suite agent --agent all` | How Claude, Codex and omp use the `record` and `close` tools under the inbox's guidance, on every case in `evals/agent-cases.json`. The omp runs need a Claude sign-in in omp: run `omp`, then `/login`. |
| `./scripts/eval.sh --suite overview --judge` | The Overview call on every replay in `evals/overview-replays.ts`, on Sonnet and on Codex, with the judge at its checkpoints. Known failing checks are listed apart and do not fail the run. |
| `./scripts/eval.sh --suite overview --judge-pages <folder>` | The judge calls every hand-written page right. The pages are kept out of Git, in `.scratch/overview-judge-pages/` in the main checkout. |

The evals call models, so they take a while and use your plans.

## 2. List what changed

Run `git log --oneline v<last version>..next`. For each change, find its row in "After you change X, check Y" in [looks.md](looks.md), and add that row's checks to the live pass.

## 3. Prepare a test machine

Use a Mac or a macOS VM other than the one you work on, so the pass cannot touch your real inbox. It needs Claude Code, the Claude desktop app and the ChatGPT app, each signed in, and `gh` installed and signed in. It also needs a sample project whose GitHub remote has an open PR, for the PRs check. Install the previous release there and use it in at least four sessions, so each look can open a different one with saved state. omp needs to be installed and signed in to a provider.

1. Copy the saved state aside. The mod keeps it in `~/.claude/plugins/store/`, in the file whose name starts with `inbox`. Codex keeps one file per session in `~/.codex/plugins/data/inbox-inbox/sessions/`. Note which version wrote them.
2. Fast-forward `main` to the `next` commit you checked, and push it with `git push origin <commit>:main`. Then install `main` as the README's Install section says. Remove the plugin first in both agents, since an install with the same version label does not update.
3. Confirm each agent runs `main`. Compare a few installed files with `git show main:<path>`: Claude Code's copy is at the `installPath` in `~/.claude/plugins/installed_plugins.json`, and Codex's is in `~/.codex/plugins/cache/inbox/inbox/<version>/`. The ChatGPT app reinstalls the plugin from GitHub when it opens, so check Codex's copy after the app is open.
4. Trust the Codex plugin's hooks, as the README says.

An agent on the test machine may have real connectors, such as an issue tracker. Deny any write it asks to approve during the pass.

## 4. Run the live pass in each look

Run the pass in four looks, one at a time: Claude Code in a terminal, a Code session in the Claude desktop app, the Inbox tab in the ChatGPT app, and omp in a terminal. Quit the other desktop app first. Use a small sample project in Git. The omp pass is described below the table.

Note the model each agent runs. A new install of Claude Code may default to a smaller model than the evals use, and the agent's side of a check can differ with the model.

Capture each result and read the capture. A row's Undo lasts a few seconds, so capture right after the press. For each look, note which states you did not see.

| Check | Do | Expect |
| --- | --- | --- |
| Saved state | Open a session the previous release saved and no earlier look has opened. Open the inbox before the first turn. | The rows the previous release saved are there, and nothing errors. |
| Question | Give the agent a task that ends in a choice. Then press an answer. | An Asks row with the choices, the recommended one first. The answer goes to the agent as your message, and the row shows its ✓. |
| Task | Ask for something only you can do, such as signing in with a command. Press its copy step. | A task row with a step for the command. The press shows "✓ Copied". |
| Finding | Point the agent at a bug outside its task. Press Explain, then Dismiss, then Undo. | A Finds row. Each press shows its result, and Undo brings the row back. |
| Dialog | Have the agent ask two questions through its question dialog, in two separate dialogs. Answer the first, and dismiss the second: Escape in the terminal, the dialog's close button in Codex. In the desktop app, press Skip instead. Codex drops every answer in a dialog that is closed, so never answer and close in the same dialog there. | The answered question does not stay open. The dismissed one becomes an Asks row. Skip sends the agent "[No preference]", so it adds no row. |
| Reply while closing | Start typing a reply on a row, and have the agent close that row. | The row stays in place until you send or discard the reply. |
| Tabs | Open the inbox, then press 1, 2 and 3. | The tabs are Asks, Finds and PRs, on 1, 2 and 3. There is no Overview tab: only a next build draws it. |
| PRs | Open the PRs tab with `gh` signed in. Then rename the `gh` binary, reopen the tab, and rename it back. Taking `gh` off `PATH` is not enough, since the inbox also looks for `/opt/homebrew/bin/gh` and `/usr/local/bin/gh`. | Your PRs, then "The inbox could not find gh, so it cannot read your PRs." |
| Resume | Resume the session in Claude Code, or reopen the thread in Codex. Then ask a new question. | The rows come back, and the agent can still record. |
| Agent replies | Read the agent's replies throughout the pass. | No reply shows an inbox id, such as `i3` or `f4`. |

In omp, run the pass with a fresh `HOME` set on each command, so it cannot touch your real `~/.omp`. Install from the marketplace instead of with `-e`: `omp plugin marketplace add <repo path or GitHub repo>`, then `omp plugin install inbox@inbox-omp`. A fresh `HOME` opens omp's setup first: press Escape until the prompt shows. Run the Question, Task, Finding, Reply while closing, PRs, Resume and Agent replies rows, and these:

| Check | Do | Expect |
| --- | --- | --- |
| Band | Start omp in the sample project. | The band shows above the prompt and names `/inbox`. |
| Panel | Run `/inbox`, switch tabs with Tab and `1` to `3`, and close with Escape. | The panel opens over the band and shows each tab. The band returns on close. |
| Press that sends | Press an answer on a question row. | The agent receives your message, and the row shows its ✓. |
| Closed list | Close a question, select its group's Closed line, and press Enter twice. | The closed row shows under the line, then folds away. |

In Codex, also check that old session files are deleted. Put more than 40 session files in a copy of the data folder, start a session, and confirm that only the oldest ones are gone.

Fix what the pass finds before you bump. A problem you ship anyway goes in the release notes.

## 5. Bump and release

Installs update as soon as the bump is pushed, so the release notes are written first and published right after the push.

1. Write the release notes to a file outside the repo, with the `release-notes` skill from [petekp/claude-code-setup](https://github.com/petekp/claude-code-setup/tree/main/skills/release-notes). Without it, use its order: one line on the effect people will notice most, what they'll notice in each look, how to update in each agent, then the technical changes.
2. Set the new version in `.claude-plugin/plugin.json`, `codex/plugin/.codex-plugin/plugin.json`, `serverInfo` in `codex/src/server.ts`, `appInfo` in `codex/src/tab.tsx` and `version` in `omp/package.json`.
3. Run `npm --prefix codex run build` and `npm --prefix omp run build`, then `./scripts/check.sh`.
4. Commit as "Bump to x.y.z" on `next`, and tag it `vx.y.z`. Push `next`, the tag, and the same commit to `main`.
5. Publish the release at once with `gh release create vx.y.z --notes-file <notes file>`.
