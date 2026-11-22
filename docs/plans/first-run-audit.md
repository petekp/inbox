# First-run audit, 2026-11-21

Status: proposed. The README fixes are in this branch. Of the code fixes it recommends, only gap 4's is built.

This audit followed a new user through their first ten minutes with the inbox in each client. It ranks what stopped or confused them, and says for each gap what is fixed and what still needs work. It replaces the audit of 2026-11-19. Gaps from that audit that still hold are listed again. The fixed ones are left out.

## How it ran

Each client started with no inbox installed and no inbox state, in the test VM. The walk followed only `README.md` and `codex/README.md`, and installed v0.6.0 from `main`. The agent then got a short task in a sample project that told it to ask one question first. Each client got at most three model turns. The screenshots stay outside the repo.

| Client | Version | Install and open | First useful row |
|---|---|---|---|
| Claude Code, terminal | 2.1.330 | 2 commands, then `/inbox` | After the first reply |
| Claude desktop app | 6.28899.6 | About 12 clicks, then `/inbox` | Not seen, since the agent asked in Claude's own dialog, see gap 3 |
| Codex in the ChatGPT app | 0.171 | 2 commands, a hooks trust, then about 2 clicks | After the first reply |
| omp | 18.12.3 | 2 commands | Not seen, since omp's own sign-in had expired |
| Herdr app, with Claude Code | 0.1.16 | `/inbox`, then an Install press on the Codex tab and a restart | After the first reply |

After the walk, the current `next` build (028edd25) was loaded in the terminal and its empty states checked. See "Main and next".

## Ranked gaps

### Blockers

#### 1. In a Herdr terminal, the Herdr mod's Install button could not be pressed

Claude Code in a Herdr terminal answers the first `/inbox` with "Opened the inbox here, since the Herdr app has no inbox mod". The inline pane then asks "Install the inbox's Herdr mod?" with Install and Don't install. In v0.6.0 these two buttons had no hotkey, so pressing one needed focus in the pane. `herdrAskButtons` in `hooks/pane/pane-herdr-ask.tsx` draws them.

In the walk, none of these reached them: a click, Ctrl+X Tab sent as key events, and keys sent with `hc`. The same key events moved focus in Terminal.app. The 2026-11-19 audit hit the same wall. Whether a person's real click works in Herdr is unverified.

Since [#723](https://github.com/petekp/inbox/issues/723), y presses Install and q presses Don't install, as a row's keys press its buttons.

#### 2. After an Install pressed elsewhere, `/inbox` still says Herdr has no inbox mod

This gap from the last audit still holds on v0.6.0. Install was pressed on the Codex tab, and the Herdr mod landed. `/inbox` in the running Claude Code still opened in the terminal and said the mod was missing. A restart fixed it. On `next`, `hooks/mod/mod-herdr.ts` still refreshes `appTerminal.hasMod` only at turn-on, when it publishes, and after its own press. The `showAsk` poll that sees the other session's answer does not refresh it. The README's Herdr steps tell the user to restart.

We recommend refreshing `hasMod` when that poll sees the answer, then removing the README sentence. Issue [#650](https://github.com/petekp/inbox/issues/650) tracks it.

### Confusion

#### 3. The inbox says "Nothing needed" while Claude's own question dialog waits

This gap from the last audit still holds, seen again on the desktop app. Claude asked its question in its own dialog, and the Asks tab said "Nothing needed" beside it. `openDialog` in `hooks/mod/mod-dialogs.ts` saves the open dialog, and only the Herdr sidebar line reads it.

We recommend showing an open dialog in the Asks tab, or saying in the empty Asks tab that Claude is waiting on its dialog. Issue [#649](https://github.com/petekp/inbox/issues/649) tracks it.

#### 4. A new Claude Code session shows no sign of the inbox until the first reply

This gap from the last audit still holds in the terminal, the desktop app and Herdr, on `main` and `next`. The band, the line above the prompt, stays hidden while the session has no rows. The `isBlankLedger` check in `hooks/mod/mod-band.tsx` hides it. omp shows "Nothing needed" and "/inbox to open" from the start, as its row in `docs/looks/differences-omp-panel.md` records. The mod's looks have no row for hiding it, so this is undocumented drift. The README says the inbox starts empty and fills after the first reply.

We recommend showing the band's "Nothing needed" line from the start in the mod's looks, as omp does, or recording the difference with its reason.

Fixed. The band now reads "Nothing needed" with Open inbox from the session's start, as omp's band does. It waits only while a conversation loads after the inbox turns on, `/clear` or `/resume`. In the desktop app, a new session runs no engine until its first message, so the band shows from that message, before the reply.

#### 5. On v0.6.0, Codex's PRs tab shows a raw git error

In a folder that is not a git repository, the PRs tab reads "Could not read the PRs: failed to run git: fatal: not a git repository…". This shows before the first message. `next` fixes it in d23e39a9, which treats a session with no branch as having no branch PR. The next release ships the fix, so this needs no issue.

#### 6. The READMEs gave a path to the Codex tab that the app no longer has

Both READMEs said to choose "the ⋯ menu beside New, then Inbox". In the ChatGPT app now, the side panel opens on a New tab page. In the walk, that page showed an Inbox tile. The app seems to promote a tile after use, so a new user may find Inbox only in the page's ⋯ menu.

Fixed. Both READMEs now say to click the Inbox tile, or to choose Inbox from the page's ⋯ menu when there is no tile.

#### 7. The desktop steps left out a confirmation

After Add to this computer, the Claude app asks the user to confirm a plugin that runs code. The README did not mention its Continue button.

Fixed. Step 4 of the desktop steps now ends with Continue.

### Polish

8. The band says "Open inbox" while the pane is already open beside it. This happens in the desktop app, Herdr and the terminal. The press raises the pane and gives it the keyboard, so only the label is wrong. We recommend a label that fits both states, such as "Go to inbox".

9. A narrow desktop pane shows its tabs as symbols with no labels: 🧭 🙋 🔍 🔀. This follows the tab-symbols rule in `docs/looks/differences-drawing.md`, and the Codex tab does the same under 348 pixels. A new user still cannot tell Asks from Finds. We recommend a tooltip, or labels whenever they fit.

10. omp's panel footer, from `omp/src/panel-tabs.ts`, says "no inbox model: set @inbox" when omp's own sign-in has expired. The real fix is omp's `/login`. We recommend saying in the footer when no provider is signed in.

11. A recommended answer names itself twice. Its label ends "(recommended)", and its note repeats "Recommended:" before the reason. `recommendedLine` in `core/view/rows.ts` builds the note. This is the documented form, in every look. We recommend dropping the word from the note and keeping the reason.

12. On 2026-11-19, the desktop app broke the word "--wave" in a row title across two lines: "-" on one line and "-wave" on the next. This walk showed no title with such a word. We recommend not breaking a line inside a word that starts with dashes.

### Host limits

- A desktop session started with `/inbox` is named "Inbox", because the app names a session after its first message.
- The ChatGPT app reopens its side panel as a New tab page, not the Inbox tab, after a restart.

### Checked and working as designed

- Codex shows "Install the inbox's Herdr mod?" above every tab to anyone with Herdr's settings folder. `herdrAskInApp` in `core/remote/herdr-ask.ts` and the `herdr-install` row in `docs/looks/differences-hosts-herdr.md` record this.
- Codex's hook icon was not beside the approval setting. The README's other path, Settings, then Hooks, then Inbox, then Trust all, worked. So did the tab's own banner, which gives the same path.
- The empty tabs read the same in every look that was seen: "Nothing needed", "No findings yet" and "No PRs", from `core/view/empty-tab.ts`.

## Main and next

| What | `main` (v0.6.0) | `next` (028edd25) |
|---|---|---|
| Empty-tab titles and hints | Same text | Same text, moved to `core/view/empty-tab.ts` |
| Band before the first reply | Hidden | Hidden |
| PRs tab outside a git repository | Raw git error | "No PRs" (d23e39a9) |
| Gaps 1 to 4 and 8 to 11 | Present | Same code |
| README steps | Old steps | Old steps, which this branch fixes |

## What this audit could not see

- `next` was loaded only in the terminal. The other looks share its empty-tab text, but their drawing on `next` was not checked.
- omp ran no model turn. Its Anthropic sign-in in the VM had expired, and signing in again needed a password. The install, the band, the panel and its empty states were seen.
- Gap 1 could not tell a harness limit from a product bug.
- A key test in Herdr sent "2" to Claude Code as a message, and Claude replied. The Herdr captures after that come from a session with one reply, so they do not show Herdr before the first reply.
- Issue [#648](https://github.com/petekp/inbox/issues/648), a question the agent never asked, did not show in this walk. It is still open.
- The desktop agent asked in its own dialog, so the desktop pane showed no Asks row from the agent.
