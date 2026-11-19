# First-run audit, 2026-11-19

This audit followed a new user through their first ten minutes with the inbox in each client. It ranks what stopped or confused them. For each gap it says what changed in the docs, and what still needs a code fix.

## How it ran

Each client started with no inbox installed and no inbox state, in a copy of the test VM. The walk used only `README.md` and `codex/README.md`, and installed version 0.5.0 from `main`. The agent then got one short task in a sample project. The task told the agent to ask one question before writing code, so the first useful row would be that question.

| Client | Version | Install and open | First useful row |
|---|---|---|---|
| Claude Code, terminal | 2.1.328 | About 6 actions | After the first reply |
| Claude desktop app | 6.6395.1 | 11 clicks, once the right path was found | After the first reply |
| Codex in the ChatGPT app | 0.169 | 2 commands and 5 clicks, once `codex` was found | 13 seconds after the first message |
| omp | 18.12.3 | 2 commands | Not seen, since omp's own sign-in had expired |
| Herdr app, with Claude Code | 0.1.16 | 3 steps and a restart, see gap 6 | Not seen, since Claude asked in its own dialog |

`README.md` and `codex/README.md` were the same on `main` and `next`, so `next` fixes none of the doc gaps.

## Ranked gaps

### Blockers

1. **Codex users without `codex` on their PATH stop at the first command.** The README's first Codex step is `codex plugin marketplace add petekp/inbox`. A ChatGPT app user gets `command not found: codex`, because the app ships `codex` inside itself and adds nothing to the PATH. Only `codex/README.md` gave the binary's path.

   Fixed. The README now says what to run when `codex` is not found, and gives the path.

2. **The desktop install steps named controls the Claude app no longer has.** The + menu now shows Plugins, not Add plugins. The page it opens is titled Plugins, not Directory, and its control at the top right reads Add, not +. The repository field is now a list, so typing `petekp/inbox` does nothing until the user picks the entry. The install button reads Add to this computer.

   Fixed. The README gives the path the app shows now, and ends with typing `/inbox`. `docs/reference/claude-desktop-app/how-it-runs.md` records the new path.

### Confusion

3. **The inbox showed a question the agent never asked.** On the desktop app, the first reply produced an Asks row, "Commit the --wave change to greet.js?", with Commit and Not yet. The agent had only said "Nothing is committed yet". The ledger model, which reads each reply after it ends, made up the question. A new user cannot trace that row to anything the agent said, which makes later rows harder to trust.

   We recommend adding this exchange as a case in `evals/cases/`, then tightening the questions rule in `systemText` so it records only questions the reply asks. We did not build it, because it changes text a model reads. Issue [#648](https://github.com/petekp/inbox/issues/648) tracks it.

4. **The inbox said "Nothing needed" while Claude's own question dialog waited for an answer.** This was seen on the desktop app and in Herdr, and the terminal runs the same code. Herdr's sidebar said "Needs you" at the same moment. `openDialog` in `hooks/register.tsx` saves the open dialog, and only the Herdr sidebar line reads it. No tab and no band line show it, so in the terminal and the desktop app it shows nowhere.

   We recommend showing an open dialog in the Asks tab, or at least saying in the empty Asks tab that Claude is waiting on its dialog. We did not build it, because it changes behavior. Issue [#649](https://github.com/petekp/inbox/issues/649) tracks it.

5. **A new Claude Code session shows nothing until the first reply.** Right after install, the user sees no band, the line above the prompt, and no sign that the inbox is running. The band hides while the session has no rows, through the `isBlankLedger` check in the `AbovePrompt` render in `hooks/register.tsx`. In a Herdr terminal, the question "Install the inbox's Herdr mod?" draws only in the inbox pane, never in the band. The README told the user to answer that question at start, but it shows only after `/inbox`. The empty tabs say what will show up, and offer nothing to try.

   Partly fixed. "Using it" in the README now says the inbox starts empty and fills after the first reply. The `/inbox demo` paragraph moved there from the end of the Herdr section, and now covers omp too. The Herdr steps now start with `/inbox`.

   We recommend showing the Herdr question in the band, and mentioning `/inbox demo` in the empty Asks tab in Claude Code and omp, the hosts that have it. We did not build either, because both change behavior or drawing in more than one look.

6. **In Herdr, `/inbox` still said the Herdr mod was missing after an install from elsewhere.** This happened in Claude Code after Install was pressed on the Codex tab. The question closed, but `/inbox` kept saying "Opened the inbox here, since the Herdr app has no inbox mod". A restart fixed it. In `hooks/mod-herdr.ts`, the mod checks for the Herdr mod at turn-on, after its own Install press, and each time it publishes its state to Herdr, as after a reply. The poll in `showAsk` closes the question when another session answers, but does not check again. So the stale answer likely lasts until the next reply. The walk sent no reply in between, so that part is unverified. omp checks at each `/inbox`, so it works. `next` has the same code.

   Worked around in the docs. The README's Herdr steps say to restart Claude Code when `/inbox` still opens in the terminal after an Install pressed elsewhere.

   We recommend refreshing `appTerminal.hasMod` when that poll sees the answer, then removing the README sentence. We did not build it, because it changes behavior. Issue [#650](https://github.com/petekp/inbox/issues/650) tracks it.

7. **The Status showed a finished subject twice, once as if still in progress.** This was seen in the terminal, the desktop app and Codex, on the Status tab after the first task ended. The head read "Loud greetings · Adding a louder option to greet.js" above the finished row "✓ Loud greetings · Uppercase works".

   Issue [#640](https://github.com/petekp/inbox/issues/640) covers it. `next` has two commits on it, 01927576 and 76976baf. This audit did not check `next` in the VM.

8. **The two READMEs gave different paths to the Codex tab.** `README.md` said "the ⋯ menu beside New", which matches the app. `codex/README.md` said "+ at the top right, then More tools", which the app no longer has.

   Fixed. `codex/README.md` now gives the same path as `README.md`.

### Polish

9. **A narrow desktop pane shows the tabs as icons with no labels.** The pane draws 🧭 🙋 🔍 🔀, so a new user cannot tell Asks from Finds. The Codex tab also switches to these icons when it is under 348 pixels wide. We recommend showing labels when the pane has room, or a tooltip. We did not build it, because it changes drawing.

10. **The desktop app wrapped a title with a leading dash as "-" over "-wave".** We recommend not breaking a line inside a word that starts with dashes. We did not build it, because it changes drawing.

11. **A desktop session started with `/inbox` is named "Inbox".** The app names a session after its first message, so the inbox cannot change this. The README's desktop steps now open the pane in a session the user already started.

12. **The ChatGPT app reopens its side panel as a new tab, not the Inbox tab, after a restart.** This is a host limit.

13. **omp's panel footer says "no inbox model: set @inbox" when omp's own sign-in has expired.** The README explains that text, but the user's real fix is omp's `/login`, which the footer does not mention. We recommend saying in the footer when no provider is signed in. We did not build it, because it changes drawing and host logic.

## What this audit could not see

- omp ran no model turn. omp's Anthropic sign-in in the VM had expired, and signing in again needed a password. The install, the band, the panel and its empty state were seen.
- The Herdr inline panel's Install button did not respond to ctrl+x then tab sent as window input. tmux delivered the same keys in the terminal walk, so the test harness may be the cause. Install was pressed on the Codex tab instead.
- Herdr's pane showed no Asks row, because the agent asked in Claude Code's own dialog. The pane and its empty state were seen.
