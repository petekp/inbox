# Releasing

Pull requests merge into the `next` branch. A release fast-forwards `main` to `next`. A new install takes `main` as soon as it is pushed. An existing install updates only when the version changes, so the bump is what ships a build to most people.

Run the automated checks on the `next` commit you will release, before `main` moves.

Release a `next` commit whose bundles match its sources. Pull requests carry source only, and after each push to `next` the `bundles` workflow commits the rebuilt bundles as "Rebuild bundles for <short sha>". Before you pick the commit, wait for that workflow's latest run to finish, with `gh run list --workflow bundles.yml --branch next --limit 3`, and pull `next` again. CI on `main` fails when a committed bundle does not match its sources, and `./scripts/bundles.sh check` runs the same check locally.

## 1. Run the automated checks

Write the engine types first, with the Claude Code the release is checked against. `check.sh` type-checks against whatever `.claude-plugin/types` holds, and a session writes that folder only when it loads the mod from this checkout, so types an older session wrote hide what the current engine requires. One session writes them:

```sh
claude -p --plugin-dir "$PWD" --no-session-persistence --model haiku 'Reply with the single word ok.'
```

It writes them even when an installed inbox loads ahead of this copy, in which case the output says the hooks module did not load. `.claude-plugin/types/claude-code/index.d.ts` names the version that wrote them.

Send each command's output to a log file and check its exit status. Each must exit 0.

| Command | What it checks |
| --- | --- |
| `./scripts/check.sh` | Formatting, file sizes, plugin validation, structure, one version in the three plugin manifests, type checks, all test suites, and that the bundles build. |
| `./scripts/bundles.sh check` | That the committed bundles match their sources. It refuses to run while the working tree's bundles differ from HEAD's, and `./scripts/bundles.sh restore` puts them back. |
| `./scripts/eval.sh` | The inbox model on every case in `evals/cases/`, on Sonnet and on Codex. |
| `./scripts/eval.sh --suite agent --agent all` | How Claude, Codex and omp use the `record` and `close` tools under the inbox's guidance, on every case in `evals/agent-cases/`. The omp runs need a Claude sign-in in omp: run `omp`, then `/login`. |
| `./scripts/eval.sh --suite status --judge` | The Status call on every replay in `evals/replays/`, on Sonnet and on Codex, with the judge at its checkpoints. Known failing checks are listed apart and do not fail the run. |
| `./scripts/eval.sh --suite status --judge-pages evals/judge-pages` | The judge calls every hand-written page right. |

The evals call models, so they take a while and use your plans.

On a Mac that several sessions share, run one heavy job at a time. `./scripts/inbox-slot run -- ./scripts/check.sh` waits for the slot, runs the command and releases the slot when the command exits. For the `inbox-ui` VM, run `./scripts/inbox-slot take --for vm --pid <the VM's pid>` before booting it, and `./scripts/inbox-slot release` after. `./scripts/inbox-slot status` shows the holder. `check.sh` does not take the slot itself, so CI and other contributors run it unchanged.

## 2. List what changed

Run `git log --oneline v<last version>..next`. With hundreds of commits, read the merged pull requests instead: `gh pr list --state merged --base next --search "merged:>=<tag date>"`. For each change, find its row in "After you change X, check Y" in [looks.md](looks.md), and add that row's checks to the live pass.

## 3. Prepare a test machine

Use a Mac or a macOS VM other than the one you work on, so the pass cannot touch your real inbox. It needs Claude Code, the Claude desktop app and the ChatGPT app, each signed in, and `gh` installed and signed in. It also needs a sample project whose GitHub remote has an open PR, for the PRs check. Install the previous release there and use it in at least four sessions, so each look can open a different one with saved state. omp needs to be installed and signed in to a provider. The Herdr app needs to be installed with no inbox mod in its `mods/` folder, so the install check has a mod to install. Its app home is `~/.config/herdr-app`, or `HERDR_APP_HOME`.

1. Copy the saved state aside. The mod keeps it in `~/.claude/plugins/store/`, in the file whose name starts with `inbox`. Codex keeps one file per session in `~/.codex/plugins/data/inbox-inbox/sessions/`. Note which version wrote them.
2. Fast-forward `main` to the `next` commit you checked, and push it with `git push origin <commit>:main`. Then install `main` as the README's Install section says. Remove the plugin first in both agents, since an install with the same version label does not update.
3. Confirm each agent runs `main`. Compare a few installed files with `git show main:<path>`: Claude Code's copy is at the `installPath` in `~/.claude/plugins/installed_plugins.json`, and Codex's is in `~/.codex/plugins/cache/inbox/inbox/<version>/`. The ChatGPT app reinstalls the plugin from GitHub when it opens, so check Codex's copy after the app is open.
4. Trust the Codex plugin's hooks, as the README says.

An agent on the test machine may have real connectors, such as an issue tracker. Deny any write it asks to approve during the pass.

## 4. Run the live pass in each look

Run the pass in five looks, one at a time: Claude Code in a terminal, a Code session in the Claude desktop app, the Inbox tab in the ChatGPT app, omp in a terminal, and the inbox panel in the Herdr app. Quit the other desktop app first. Use a small sample project in Git. The omp pass is described below the table, and the Herdr pass on its own page.

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
| Status | Give the agent two jobs, and make one of them end in a question for you. Open the Status tab after each reply. | A head names what the session is focused on. Each part of the work shows with where it stands. The part the open question holds up shows ◆, and the question's Asks row reads "Holds up" and the part's name. View question opens that row. |
| Collapse | Open an Asks row. Press its title, then press it again. Select a row and press `z`. Open a row's reply field, type, and press the title. In the Claude app, click only. Then resume the session. | The first press collapses the row to its title, and the second expands it. `z` does the same. No other row opens. The reply field closes and keeps its draft. A collapsed row stays collapsed, after the resume too, until something new arrives on it, such as the agent recording it again. |
| Empty tabs | Clear every row so a tab is empty, then open Asks, Finds, PRs and Status. On PRs, rename `gh` and reopen the tab. On Status, open the goal field. | Each tab shows its own empty text, centred. The inline terminal and omp keep it at the top left. PRs reads "Checking for PRs…" while it reads, then "No PRs", and with `gh` renamed its hint is the `gh` text from the PRs row, with Refresh PRs under it. The empty Status text stays while the goal field is open. |
| PR order | With three open PRs, have the agent rank two of them with `order_prs`. Open the PRs tab. | The two ranked PRs come first, in the agent's order, with no rank number. A muted "Other PRs" line starts the third. With all three ranked, or none, there is no line. |
| Tabs | Open the inbox, then press 1, 2, 3 and 4. | The tabs are Status, Asks, Finds and PRs, on 1 to 4. No footer shows a version. Open Help: the right end of the Keys title reads `Inbox v<version>`, with no `· next`. |
| PRs | Open the PRs tab with `gh` signed in. Then rename the `gh` binary, reopen the tab, and rename it back. Taking `gh` off `PATH` is not enough, since the inbox also looks for `/opt/homebrew/bin/gh` and `/usr/local/bin/gh`. | Your PRs, then "The inbox could not find gh. It needs gh to read your PRs." |
| Resume | Resume the session in Claude Code, or reopen the thread in Codex. Then ask a new question. | The rows come back, and the agent can still record. |
| Agent replies | Read the agent's replies throughout the pass. | No reply shows an inbox id, such as `i3` or `f4`. |

In omp, run the pass with a fresh `HOME` set on each command, so it cannot touch your real `~/.omp`. Install from the marketplace instead of with `-e`: `omp plugin marketplace add <repo path or GitHub repo>`, then `omp plugin install inbox@inbox-omp`. A fresh `HOME` opens omp's setup first: press Escape until the prompt shows. Run the Question, Task, Finding, Status, Collapse, Empty tabs, PR order, Reply while closing, PRs, Resume and Agent replies rows, and these:

| Check | Do | Expect |
| --- | --- | --- |
| Band | Start omp in the sample project. | The band shows above the prompt and names `/inbox`. |
| Panel | Run `/inbox`, switch tabs with Tab and `1` to `4`, and close with Escape. | The panel opens over the band and shows each of the four tabs, Status first. The band returns on close. |
| Press that sends | Press an answer on a question row. | The agent receives your message, and the row shows its ✓. |
| Closed list | Close a question, select its group's Closed line, and press Enter twice. | The closed row shows under the line, then folds away. |

In Codex, also check that old session files are deleted. Put more than 40 session files in a copy of the data folder, start a session, and confirm that only the oldest ones are gone.

The Herdr app's pass has its own page, [release-herdr.md](release-herdr.md). Run it after the other looks.

Fix what the pass finds before you bump. A problem you ship anyway goes in the release notes.

## 5. Bump and release

Installs update as soon as the bump is pushed, so the release notes are written first and published right after the push.

1. Write the release notes to a file outside the repo, with the `release-notes` skill from [petekp/claude-code-setup](https://github.com/petekp/claude-code-setup/tree/main/skills/release-notes). Without it, use its order: one line on the effect people will notice most, what they'll notice in each look, how to update in each agent, then the technical changes.
2. Set the new version in `.claude-plugin/plugin.json`, `codex/plugin/.codex-plugin/plugin.json` and `omp/package.json`. The Codex and omp bundles take it from these files when you build them in step 3. `./scripts/check.sh` fails when the three differ.
3. Run `./scripts/check.sh`, which builds the bundles with the new version.
4. Commit the three version files as "Bump to x.y.z" on `next`, and push `next`. Put the bundles back first with `./scripts/bundles.sh restore`, since the `bundles` workflow rebuilds them.
5. Wait for the workflow's run for the bump to finish, with `gh run list --workflow bundles.yml --branch next --limit 3`. Pull `next`: its tip is now "Rebuild bundles for <bump sha>". Run `./scripts/bundles.sh check` there.
6. Tag that commit `vx.y.z`. Push the tag, and the same commit to `main`. CI on `main` checks its bundles again.
7. Publish the release at once with `gh release create vx.y.z --notes-file <notes file>`.
