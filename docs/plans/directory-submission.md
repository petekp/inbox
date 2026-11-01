# Submitting the inbox to the Claude Code plugin directory

Status: built. The directory's scan of 0.2.15 on `main` reported one block, in `askLedgerModel`. The last row of Fixes holds the fix. It stays unconfirmed until the directory passes it, in a validated draft or in the scan of `main`.

The directory scans a submitted plugin and reports findings at four levels
([pre-submission checklist](https://claude.com/docs/plugins/pre-submission-checklist)):

- **Block**: the plugin can't be submitted until it's fixed.
- **Policy hold**: the plugin can be submitted, and a reviewer reads it before it goes live.
- **Warning**: can be submitted as is.
- **Note**: information only.

`claude plugin validate` does not run the directory's rules, so only the directory confirms a fix. Validating a draft, as below, checks a build before a release.

`./scripts/check.sh` checks each hooks module that `hooks/hooks.json` names against the rules behind the blocks so far. They cover where `$` may be passed, which types a function that takes `$` may name, what a permission hook may return, and which names may be bound more than once: `e`, `next`, `h`, and the name of a top-level function that takes `$`. A failure prints the directory's code, the line and what to change. A block from any other rule still shows up only in the directory's scan.

## Fixes

| Finding | Fix |
|---|---|
| Permission hook answers `allow` (`hooks/register.tsx`, the two `tool.check` hooks) | Delete both hooks. They never run: the mod answers `record_finding` and `close` in `tool.call`, which settles the call before the permission check. Checked on Claude Code 2.1.300 with a probe mod under `claude -p --permission-mode default`: a `tool.check` that denies changes nothing, and with no `tool.check` the tool runs with no prompt. That holds with a catch-all `tool.call` hook that passes calls on, registered before or after, as the mod has. Not checked in the desktop app, which answers permission prompts through the Agent SDK. |
| Directory couldn't confirm the `PermissionRequest` hook leaves the decision with the user (`MOD_PERMISSION_ANSWER_UNREAD`) | The scan needs the hook's parameter names, `$`, `e` and `next`, bound nowhere else in `hooks/register.tsx`. Rename the other bindings of `e` and `next` in the file, and drop the hook's `.catch`, which bound all three again. Without a `.catch`, a hook that throws before `next` is skipped, so the prompt still reaches the user. |
| `$` or `on` used in a way the directory couldn't follow (`MOD_CAPABILITY_USE_NOT_PLAIN`, 10) | The scan forbids the name `h` in a `.tsx` file, since elements compile to calls of `h`. Rename the SVG builders' `w` and `h` to `width` and `height`, and the fold-hover updater's `h`. Also keep the `on('session.append', …)` registration on one line, under `// prettier-ignore`. |
| No privacy policy link, after "Reads and stores" personal data | Set `privacyPolicyUrl` to the README's `#what-it-runs-sends-and-changes`, and say there what the inbox keeps: the 40 most recent sessions, in local plugin storage. Renaming that heading breaks the link. |
| No `author` in plugin.json | Add `{ "name": "Pete Petrash" }`, plus `repository` and `license`. |
| No `version` in plugin.json | Add a version that matches the Codex plugin's, now `0.2.5`. Installs update only when the version goes up, so each release raises it in both manifests. |
| On 0.2.13: `$` passed to functions imported from `claude-host.ts` (`MOD_CAPABILITY_USE_NOT_PLAIN`, 3) | The directory allows `$` only as a whole argument to a function declared at the top of the same file. `hooks/register.tsx` passed `$` to 13 functions from `claude-host.ts`, which held the mod's storage and `SessionHost`, at 22 places. The scan flagged the first three in file order, lines 882, 933 and 1038, and reported that its validation did not finish. It left the same call, `processRun($)`, unflagged at lines 2590 and 3070, so it stopped early and the rest fail too. Every function that takes `$` moved from `claude-host.ts` into `hooks/register.tsx`, and `claude-host.ts` is gone. The moved code's `next` and `e` bindings were renamed, as the `PermissionRequest` row above requires. `readIsNextBuild`, a top-level `const` arrow that takes `$`, became a function declaration. |
| On 0.2.13: directory couldn't confirm the `tool.check` hook leaves the decision with the user (`MOD_PERMISSION_ANSWER_UNREAD`) | The hook awaited `next(e)`, read whether the verdict was an ask, and returned the verdict by name. The directory accepts a permission hook that returns `next(e)` as written, or a fixed `deny` or `ask` written in the return. The hook now starts `waitForPermission` and returns `next(e)`. `waitForPermission` gets the verdict from a `$.tool.check` query, which runs no tool, opens no dialog and skips the inbox's own hook. Two `e =>` parameters elsewhere in `hooks/register.tsx` became `effect =>`, so `e` names only a hook's event. |
| On 0.2.14: `$` passed in ways the directory couldn't follow (`MOD_CAPABILITY_USE_NOT_PLAIN`, 3) | The scan flagged lines 1515, 1820 and 1835 of `hooks/register.tsx` at `2d613e90`. Lines 1820 and 1835 call the top-level function `later($, …)`. The same file also binds `later` as a `.reduce` parameter, in code moved there from `claude-host.ts`. The scan reads a file's names without scopes, as it does for `e`, `next` and `h`, so it couldn't tell which `later` the calls meant. All 13 `later($` calls fail, and the scan stops after 3 findings. The parameter is now `laterSend`. Line 1515 passed `$` to `askLedgerModel`, the block in the next row. This fix also removed `modelAsk`, whose returned function made that call. The structure check still refuses `$` passed on inside a returned function, though no scan has shown that the directory refuses it. Before line 1835 the scan accepted `$` passed on from a callback given as an argument, from a function in an object literal that a function returns, and from a function called where it is written. It also accepted `processRun`'s returned function, which uses `$` only in `$.ns.method(...)` calls. No scan has shown whether a function that an arrow returns as its body fails too, as in `(p) => (press) => runPress($, …)`. `hooks/register.tsx` has such arrows, and the check does not flag them. `modelAsk` is gone. `sessionHost` and a new `catchUpStatus` each return their `ask` function in an object literal. Each `ask` passes `$` to the top-level function `askInboxModel`. |
| On 0.2.15: `$` passed to `askLedgerModel` (`MOD_CAPABILITY_USE_NOT_PLAIN`, 2). Unconfirmed until the directory passes this fix. | The scan flagged lines 1519 and 1869 of `hooks/register.tsx` at `b8560fc4`, the only two calls to `askLedgerModel`. At 0.2.14 it stopped after 3 findings, before the third call. So every call to `askLedgerModel` failed, while calls that pass `$` to other top-level functions passed. Two things set `askLedgerModel` apart. Its return type was `ModelResult`, an alias for `Awaited<ReturnType<EngineInterface['model']['fork']>>`, which indexes into the engine's interface. Its call also wrote `cache: true as const` inside the argument. The same scan accepted `true as const` inside two `$.ui.open` arguments, so the type is the likely cause. `askLedgerModel` and `ModelResult` are gone. `askInboxModel` makes the `$.model.complete` call itself, with no cast, and `catchUpReply` calls `askInboxModel`. `callReport` takes `ModelCompleteResult`, a type the engine exports. The structure check now refuses `$` passed to a function whose signature, or a type alias it names, indexes into `EngineInterface`. |

## Checking a build before release

The directory takes one submission per repo and folder ([submission limits](https://claude.com/docs/plugins/submit.md)), so the inbox can't have a second listing. To check a build before it reaches `main`, validate a draft submission of it.

Before a release:

1. Push the release commit to `directory-test`.
2. In [claude.ai/directory/manage](https://claude.ai/directory/manage), choose **Submit new**, then **Plugin bundle**.
3. Enter `petekp/inbox@directory-test` and press **Validate**.
4. Read the findings. Release only when they show no block, and add each new block to Fixes.
5. Delete the draft. Drafts count toward the directory's limit of 10 submissions a day.

Validate runs the directory's rule checks, the source of every block so far. It does not run the security scan. A security-scan finding holds the version for a reviewer. It does not block it.

## Disclose in the README

Each of these is a policy hold. The README's "What it runs, sends and changes" section covers them:

- Programs it starts: `gh` (read-only PR queries), `open` and `test -x` (opening a file or link you press), `herdr` (a sidebar line, only inside Herdr).
- Data sent out: conversation text to Anthropic through Claude Code's own model calls (the Sonnet update after each reply, and the catch-up); `gh` queries to GitHub under your `gh` sign-in. The `gh` sign-in is the likely "credential from the user's machine". Asking for a GitHub token through `userConfig` would be worse for the user, so this stays disclosed rather than changed.
- Prompts it submits: the text of a button you press, sent as your message.
- Context it adds: its instructions (`prompt.compose`), notes beside your prompt (`prompt.submit`, `session.append`).
- Hooks that observe: `tool.call` (notes what tools ran, opens a row for a question), `PermissionRequest` (opens a row while a permission prompt is open, then passes it on), `config.set` (reads the theme).
- Tools it adds and answers itself: `record_finding`, `close`, and the `/inbox` command.

## Leave as is

- **`types` in plugin.json** flagged as unknown. It's a documented manifest field for mods, and `claude plugin validate` reads it. The directory's scan lags here.
- **CLAUDE.md at the plugin root**, **the oversized `docs/reference/claude-code-mods.md`**, and **`npx -y` in `scripts/check.sh`** (the download-and-run findings). These exist because the plugin is the whole repo (`"source": "./"`). Each is a warning or a hold. Pete chose to keep shipping the whole repo.
- **Mod adds tools, commands or agents**: a note.

## Decisions

1. **Blocks.** The scan of 0.2.15 had one. The last row of Fixes holds its fix, which the directory has not passed yet. The holds and warnings left are listed above.
2. **Icon.** `.claude-plugin/icon.png`, 1024 px square: a white Geist Mono `i` and a block cursor as tall as the `i`, on a dark background with an indigo glow, after the launch video's end card. The directory takes the icon only the first time the plugin is saved or submitted.
3. **Name.** `inbox` may be confused with other listings (4 holds). Pete chose to keep `inbox` for now. A later rename can change `displayName` alone, which changes only what people see. Changing `name` also changes the install command, the tool names Claude calls, and the key the saved state is stored under.
4. **Data questions.** Personal data: reads and stores. Sends data to another service: yes, listed in the README. Retention by our service: not retained. For users under 18: no.
5. **Updates.** The directory follows `main` and checks it about every 6 hours, with no push webhook. Every commit it picks up becomes a new version that it scans. Following a release branch or tag instead would keep everyday pushes out of the directory.
