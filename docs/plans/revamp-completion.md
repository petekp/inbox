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

- **Built and tested:** all 16 build steps, every 2026-10-09 decision, and sections 1 to 3 below.
- **Seen working live:** terminal delivery. On desktop: focus, button edges, tab clicks, row and fold clicks, scrolling, typing with Enter, the dimmed guard, Markdown, and the look from section 3. The status under the tabs was seen at a simulated 60 columns. In Codex: the tab, `inbox` answering in text only, and Explain going Sending, Queued, ✓.
- **Left:** the decisions in section 4, and the merge.

## 1. Fixes, done

- [Resume] sends "Continue" once, however often it is pressed while sending (`809fa8c`).
- The inbox model is told the band shows only counts (`9841d9e`). The A/B found no difference across 10 runs per version, so the true sentence shipped.
- The docs match the built band and press path (`34c4c52`, `ac4140e`).
- The Codex tab shows its not-heard warning above open rows too (`c425466`), and a press times out after 60 s (`ed61ed0`).
- Desktop: the tab hit test checks y and hover uses `raisedText` (`b7b53bf`), "Not sent" has its own band row (`ef694e2`), the empty-state lines fit (`9198ea7`), the recommended option is marked in every look and action groups sit on separate lines (`bdb2e82`, `755d216`), and the fold line and settled ask clip to one line (`2dcf4d3`).

## 2. Second build round, done

- Approvals A1 to A8 from desktop-look.md. A6 was not needed: probe 1 passed, so Undo keeps its own key.
- The row and fold Clients (desktop-look.md components 9 and 16).
- The text field takes the focus when it opens (`db0a6a6`). Live, the Claude app never gives the field the keyboard, so you still click into it. That is an app bug, reported as #100966.
- The Codex tab says why it could not read the inbox.
- `GUIDANCE` in `hooks/register.tsx` says the band shows only counts.
- A press's work survives a reload, a session that could not be read stays unread across a reload, and the Codex tab drops a press still pending after 60 s.

## 3. Probes and the desktop look, done

The probes ran on 2026-10-09. "Probe results" in desktop-look.md records each one, and `f29471e` builds what they decided:

- The shown tab is raised and bold, with a line in its tone along its top.
- Tabs are sized from measured text, and the status moves under them below 66 columns.
- The bars on an open row are Box fills.
- The gap under a group title is half a line.
- A PR's status block starts at the title's column, in place of tree rails.

## 4. Left for you

- **The wording list and smaller questions** are decided. revamp-handoff.md records each call and its reason.
- **Checks only you can run:** switch the app between light and dark against the `theme` setting (probe 6), close the pane and press [Open inbox] (probe 17), sweep the pointer over a long list (probe 4), and try `/login` from a stop (probe 18).

## 5. Merge

The merge comes last, after sections 2 to 4 (your decision, 2026-10-09).

- Merge `revamp` to main, with your OK.
- Point `CLAUDE_CODE_PLUGIN_DIRS` back at the main checkout, and remove `CLAUDE_CODE_PLUGIN_DIR_WATCH`.
- Point the `inbox` marketplace in `~/.codex/config.toml` back at the main checkout, and reinstall the Codex plugin.
- Restart open sessions.
