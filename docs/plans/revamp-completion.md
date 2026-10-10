# Finishing the revamp

The revamp is done when the `revamp` branch merges to main with every part below finished. Nothing outside it gets built first.

The revamp covers the work planned on this branch:

- [target-architecture.md](target-architecture.md), the 16 build steps
- [inbox-ui.md](inbox-ui.md), the UI plan
- [band-redesign.md](band-redesign.md) and the 2026-10-09 decisions
- [desktop-look.md](desktop-look.md), the desktop design
- [revamp-handoff.md](revamp-handoff.md), its live checks and known gaps

It does not cover the cross-client work in `docs/plans/clients.md`, Claude mode, or the shared HTML view. Those come after the merge.

Code is built in a separate worktree, `revamp-build`, and moves to `revamp` once `check.sh` passes. Your sessions load the `revamp` worktree and hot-reload it, so unfinished edits there would reach your live inbox.

## Where it stands

- **Built and tested:** all 16 build steps, every 2026-10-09 decision, and section 1 below.
- **Seen working live:** terminal delivery. On desktop: focus, button edges, tab clicks, scrolling, typing with Enter, the dimmed guard and Markdown. In Codex: the tab, `inbox` answering in text only, and Explain going Sending, Queued, ✓.
- **Left:** the second build round (section 2), the probes that gate the rest of the desktop design (section 3), the decisions in section 4, and the merge.

## 1. Fixes, done

- [Resume] sends "Continue" once, however often it is pressed while sending (`809fa8c`).
- The inbox model is told the band shows only counts (`9841d9e`). The A/B found no difference across 10 runs per version, so the true sentence shipped.
- The docs match the built band and press path (`34c4c52`, `ac4140e`).
- The Codex tab shows its not-heard warning above open rows too (`c425466`), and a press times out after 60 s (`ed61ed0`).
- Desktop: the tab hit test checks y and hover uses `raisedText` (`b7b53bf`), "Not sent" has its own band row (`ef694e2`), the empty-state lines fit (`9198ea7`), the recommended option is marked in every look and action groups sit on separate lines (`bdb2e82`, `755d216`), and the fold line and settled ask clip to one line (`2dcf4d3`).

## 2. Second build round

Your decisions on 2026-10-09 approved all of these.

- **Approvals A1 to A8** from desktop-look.md. A6 is not needed: probe 1 passed, so Undo keeps its own key.
- **The row and fold Clients** (desktop-look.md components 9 and 16).
- **The text field takes the focus when it opens.** Built in `db0a6a6`: the focus repair moves the focus to the field once a drawing has it. Not yet checked live.
- **The Codex tab says why it could not read the inbox**, after "Could not read the inbox.", so a failure that does not repeat still shows its cause.
- **`GUIDANCE` in `hooks/register.tsx`** tells Claude the open items show in the band. They no longer do. It is text Claude reads, so it ships only after an A/B.

## 3. Probes, then the desktop steps they gate

I run most of these myself in the background. An accessibility press triggers pane Buttons, and `screencapture -l` captures the Claude window behind others. The tab bar and row Clients take no accessibility press, so a check that switches tabs or clicks a Client row needs you.

- **3 and 4:** row Client sizing, and many Clients in a scrolled pane.
- **5, 6, 7, 8 and 11:** theme colors, text width, the tab tone line and Box fills.
- **9, 10, 13, 14, 15, 17, 19 and 20:** one capture each.

Then the desktop steps they gate:

- the tab colors, bold label and tone line
- tab sizing
- the status-line constant
- Box fills
- `titleGap`
- tree rails or the indent fallback
- the spec pass

## 4. Decisions still yours

- **The Codex server's pending result when its process dies.** The server writes the pending result, then opens outside the lock. If the process dies in between, the row reads "Opening x…" until the next press. A new server cannot safely mark it failed, because another server process may own the press.
- **The wording list and smaller questions** in revamp-handoff.md.

## 5. Merge

The merge comes last, after sections 2 to 4 (your decision, 2026-10-09).

- Merge `revamp` to main, with your OK.
- Point `CLAUDE_CODE_PLUGIN_DIRS` back at the main checkout, and remove `CLAUDE_CODE_PLUGIN_DIR_WATCH`.
- Point the `inbox` marketplace in `~/.codex/config.toml` back at the main checkout, and reinstall the Codex plugin. The installed copy now carries temporary call logging.
- Restart open sessions.
