# Releasing

Pull requests merge into the `next` branch. A release fast-forwards `main` to `next`. A new install takes `main` as soon as it is pushed. An existing install updates only when the version changes, so the bump is what ships a build to most people.

Run the automated checks on the `next` commit you will release, before `main` moves.

## 1. Run the automated checks

Write the engine types first, with the Claude Code the release is checked against. `check.sh` type-checks against whatever `.claude-plugin/types` holds, and a session writes that folder only when it loads the mod from this checkout, so types an older session wrote hide what the current engine requires. One session writes them:

```sh
claude -p --plugin-dir "$PWD" --no-session-persistence --model haiku 'Reply with the single word ok.'
```

It writes them even when an installed inbox loads ahead of this copy, in which case the output says the hooks module did not load. `.claude-plugin/types/claude-code/index.d.ts` names the version that wrote them.

Send each command's output to a log file and check its exit status. Each must exit 0.

| Command | What it checks |
| --- | --- |
| `./scripts/check.sh` | Formatting, file sizes, plugin validation, structure, one version in the three plugin manifests, type checks, all test suites, and that the Codex and omp bundles match their sources. |
| `./scripts/eval.sh` | The inbox model on every case in `evals/cases/`, on Sonnet and on Codex. |
| `./scripts/eval.sh --suite agent --agent all` | How Claude, Codex and omp use the `record` and `close` tools under the inbox's guidance, on every case in `evals/agent-cases/`. The omp runs need a Claude sign-in in omp: run `omp`, then `/login`. |
| `./scripts/eval.sh --suite status --judge` | The Status call on every replay in `evals/replays/`, on Sonnet and on Codex, with the judge at its checkpoints. Known failing checks are listed apart and do not fail the run. |
| `./scripts/eval.sh --suite status --judge-pages <folder>` | The judge calls every hand-written page right. Run it twice: on `.scratch/status-judge-pages/` in the main checkout, and on its `goal/` folder. Each folder holds its own `set-1.json` and `set-2.json`, and both are kept out of Git. |

The evals call models, so they take a while and use your plans.

## 2. List what changed

Run `git log --oneline v<last version>..next`. For each change, find its row in "After you change X, check Y" in [looks.md](looks.md), and add that row's checks to the live pass.

## 3. Prepare a test machine

Use a Mac or a macOS VM other than the one you work on, so the pass cannot touch your real inbox. It needs Claude Code, the Claude desktop app and the ChatGPT app, each signed in, and `gh` installed and signed in. It also needs a sample project whose GitHub remote has an open PR, for the PRs check. Install the previous release there and use it in at least four sessions, so each look can open a different one with saved state. omp needs to be installed and signed in to a provider. The Herdr app needs to be installed with no inbox mod in its `mods/` folder, so the install check has a mod to install. Its app home is `~/.config/herdr-app`, or `HERDR_APP_HOME`.

1. Copy the saved state aside. The mod keeps it in `~/.claude/plugins/store/`, in the file whose name starts with `inbox`. Codex keeps one file per session in `~/.codex/plugins/data/inbox-inbox/sessions/`. Note which version wrote them.
2. Fast-forward `main` to the `next` commit you checked, and push it with `git push origin <commit>:main`. Then install `main` as the README's Install section says. Remove the plugin first in both agents, since an install with the same version label does not update.
3. Confirm each agent runs `main`. Compare a few installed files with `git show main:<path>`: Claude Code's copy is at the `installPath` in `~/.claude/plugins/installed_plugins.json`, and Codex's is in `~/.codex/plugins/cache/inbox/inbox/<version>/`. The ChatGPT app reinstalls the plugin from GitHub when it opens, so check Codex's copy after the app is open.
4. Trust the Codex plugin's hooks, as the README says.

An agent on the test machine may have real connectors, such as an issue tracker. Deny any write it asks to approve during the pass.

## 4. Run the live pass in each look

Run the pass in five looks, one at a time: Claude Code in a terminal, a Code session in the Claude desktop app, the Inbox tab in the ChatGPT app, omp in a terminal, and the inbox panel in the Herdr app. Quit the other desktop app first. Use a small sample project in Git. The omp and Herdr passes are described below the table.

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
| Tabs | Open the inbox, then press 1, 2 and 3. | The tabs are Asks, Finds and PRs, on 1, 2 and 3. There is no Status tab: only a next build draws it. |
| PRs | Open the PRs tab with `gh` signed in. Then rename the `gh` binary, reopen the tab, and rename it back. Taking `gh` off `PATH` is not enough, since the inbox also looks for `/opt/homebrew/bin/gh` and `/usr/local/bin/gh`. | Your PRs, then "The inbox could not find gh. It needs gh to read your PRs." |
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

The Herdr app draws the inbox in a panel beside a terminal, for a host that runs in one of the app's terminals: Claude Code, the Codex CLI or omp. An app terminal has `HC_TERMINAL_ID` set, and a host outside one publishes nothing for the panel. Note the Herdr version. A release build's panel has three tabs, because it draws the Status tab only when the mod's folder holds a `.next-build` file. Run the Install and Update rows below first. Then run the Question, Task, Finding, Reply while closing, PRs, Resume and Agent replies rows once with each host, and read the results in the panel. Run the other rows last.

| Check | Do | Expect |
| --- | --- | --- |
| Mod check | From the checkout, run `herdr-app check herdr/mod/inbox` with the newest Herdr. | It exits 0 and reports nothing wrong. |
| Install | With no `mods/inbox` and no `<app home>/inbox/herdr-mod.json`, start a host in an app terminal and run `/inbox`. Press Install. Claude Code asks in its inbox pane. omp asks in a row at the top of its Asks tab. The ChatGPT app asks in its Inbox tab. The Codex CLI never asks, and installs only after another host or the Inbox tab saved a yes. Delete `mods/inbox` and `herdr-mod.json` before the next host. | `/inbox` opens the host's own inbox pane and says why. The question "Install the inbox's Herdr mod?" shows once. Install shows "Installing the inbox mod in Herdr…", then "✓ Installed the inbox mod in Herdr." `mods/inbox/` holds `main.js` and `mod.json`, and `herdr-mod.json` reads `installed`. Once one host installed, no other asks. |
| Decline | Press Don't install, then run `/inbox herdr`. | The answer reads "Run /inbox herdr to install it later." Nothing is written to `mods/`, and `/inbox herdr` asks again. |
| Update | With the panel open, copy `main.js` and `mod.json` from an older commit that changed `herdr/mod/inbox/main.js` into `mods/inbox/`. Start Claude Code, then omp. Then reinstall the Codex plugin with `codex plugin add inbox@inbox`. Put the old copy back before each. | Each host puts the shipped build back, and the open panel redraws with no Herdr restart. A `mods/inbox` that is a link is left alone. |
| Sweep | Put `<app home>/inbox/sessions/old.json` and a `presses/old/` folder where no terminal's `inbox.session` label names them, and set their times two days back with `touch -t`. Start a host. | Both are gone. The files of a live session stay. |
| Open | Run `/inbox` in Claude Code or omp, and press Open inbox on Claude Code's band. The Codex CLI has no command. Split a pane for it with `herdr-app do pane.split '{"direction":"right","pane":"<pane id>","mod":"inbox"}'`, taking the id from `herdr-app ls`. Then run `/inbox` again, close the panel and run it once more. | The panel opens to the right of the terminal and the host's own pane stays closed. The replies read "Opened the inbox in Herdr, to the right of this terminal.", then "The inbox is already open in Herdr. Focused it.", and the last run opens a new panel. |
| Following | Start two sessions in two terminals of one tab and focus each. Then focus the panel, focus a shell terminal, and end a session. | The panel shows the focused terminal's session and keeps the last one while it has focus itself. A shell reads "No inbox in this terminal" and names its program. An ended session reads as ended. |
| Tabs | Open each tab with a click and with ← →. | Asks, Finds and PRs show in words with their counts. There is no Status tab. |
| Presses | Press an answer on a question and a task's copy step. On a finding, press Explain, then Dismiss and Undo. Capture right after each press. | Every button on the pressed row draws out and the row reads "Sending…". Then the row shows its ✓, and the agent gets the answer as your message. Copy reads "✓ Copied" and Undo brings the row back. |
| Press nobody takes | Stop the host with `kill -STOP <pid>`, press Done on a row, wait 20 seconds, and resume it with `kill -CONT <pid>`. | After 15 seconds the row reads as not applied and its press file is gone from `<app home>/inbox/presses/<session id>/`, so nothing applies it on resume. |
| Reply field | Press Reply on an Asks row, type, and press Send. Open it again, type, press Escape, then switch tabs and back. | The typing goes into the field. Send sends it as your message and closes the field. Escape and a tab change close the field and keep the draft. |
| Keys | Click a row, then press `j`, `k`, one of its hotkeys, ← →, and Escape. | `j` and `k` select the next and previous row, a hotkey presses its button, and ← → switch tabs. Escape gives focus back to the agent's terminal, and closes an open field first. |
| Help | Press Help at the right end of the tab row on each tab. | Help replaces the tab and lists its keys and marks, and the button reads "✕ Close help". It lists the keys the Keys row used. A second press brings the tab back. |
| PRs tab | Open the tab with `gh` signed in. Press Refresh PRs, and Clear merged and closed with a merged PR on the tab. Then rename `gh` and reopen the tab. | Your PRs, then the merged one clears. With `gh` renamed, the banner reads "The inbox could not find gh. It needs gh to read your PRs." |
| Themes and width | Open the panel in Herdr's light and dark themes, at a pane under 280 px and at about 420 px. Capture a Dismiss and its Undo mid-move. | No text is cut off. No button shifts while its press is out. A row fades in and out and keeps its height meanwhile, a running mark fades, and nothing flickers. |
| Reload omp | In an app terminal, open the panel for an omp session, reload the inbox extension in that omp session, then press Done in the panel. Read `herdr.log`. | The press applies once and the panel redraws. If it does not redraw, or an Answer fails, the old extension still watches the press folder. |
| Ended Codex thread | End a Codex CLI session in an app terminal and start another. Press Answer on the first session's row before the second writes. Then press Answer on a running Codex CLI session's row. | The first row does not read as sent when the message reaches no one. The second message reaches the running session. |
| Status seen | Waiting on PR #400. In a next build, with `.next-build` in the mod's folder, give a session finished work on its Status. Show the Status with every row on screen for 5 seconds, then leave it. | Finished rows fold into "N done", and "was" lines clear. A look shorter than 5 seconds counts nothing, and a row that was never on screen stays unfolded. |

Fix what the pass finds before you bump. A problem you ship anyway goes in the release notes.

## 5. Bump and release

Installs update as soon as the bump is pushed, so the release notes are written first and published right after the push.

1. Write the release notes to a file outside the repo, with the `release-notes` skill from [petekp/claude-code-setup](https://github.com/petekp/claude-code-setup/tree/main/skills/release-notes). Without it, use its order: one line on the effect people will notice most, what they'll notice in each look, how to update in each agent, then the technical changes.
2. Set the new version in `.claude-plugin/plugin.json`, `codex/plugin/.codex-plugin/plugin.json` and `omp/package.json`. The Codex and omp bundles take it from these files when you build them in step 3. `./scripts/check.sh` fails when the three differ.
3. Run `npm --prefix codex run build` and `npm --prefix omp run build`, then `./scripts/check.sh`.
4. Commit as "Bump to x.y.z" on `next`, and tag it `vx.y.z`. Push `next`, the tag, and the same commit to `main`.
5. Publish the release at once with `gh release create vx.y.z --notes-file <notes file>`.
