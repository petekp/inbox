# Finishing the revamp

The revamp is done when the `revamp` branch merges to main with every part below finished. Nothing outside it gets built first.

The revamp covers the work planned on this branch:

- [target-architecture.md](target-architecture.md), the 16 build steps
- [inbox-ui.md](inbox-ui.md), the UI plan
- [band-redesign.md](band-redesign.md) and the 2026-10-09 decisions
- [desktop-look.md](desktop-look.md), the desktop design
- [revamp-handoff.md](revamp-handoff.md), its live checks and known gaps

It does not cover the cross-client work in the main checkout's `docs/plans/clients.md`, Claude mode, or the shared HTML view. Those come after the merge.

## Where it stands

All 16 build steps and every 2026-10-09 decision are built and tested. Three things are left:

- **Live checks.** Only terminal delivery and four desktop probes have been seen working in a real session. That covers focus, button edges, tab clicks and scrolling.
- **Fixes the audit found.** These are defects in the branch's own code and docs.
- **Most of the desktop design.** Only the focus repair, the tab region and the removed desktop leave bar are built.

## 1. Fixes, no input needed

These are built in a separate worktree, `revamp-build`. Your sessions load the `revamp` worktree and hot-reload it, so unfinished edits there would reach your live inbox. Each step moves to `revamp` once `check.sh` passes.

- **[Resume] double send.** A second press on "Resuming…" sends "Continue" again. Guard `resume()` while a send is in flight.
- **The inbox model's band sentence.** `systemText` says the person always sees the open items in the band, but the band now shows only counts. Rewrite it, measured with the A/B in AGENTS.md.
- **Docs that describe the old design.**
  - `band-redesign.md` says nothing is built.
  - `GLOSSARY.md` defines the band as the session's status.
  - `inbox-ui.md` and `action-feedback.md` cite `withLastAction`, which no longer exists.
  - `inbox-ui.md:291` says the whole stop line is red, but only the prefix is.
- **Known gaps from the handoff.** Each is built here only if its fix keeps every saved shape and wire payload. A fix that would change one moves to section 3, with the conversion it needs.
  - A pending open or copy can stay on "Opening x…" after a reload mid-call.
  - A reload after a prompt can lose an unreadable saved session.
  - The Codex tab warns that hooks were not heard only when Needs you is empty.
  - An `inbox_press` call from the Codex tab has no timeout.
- **Desktop design steps marked ready** (desktop-look.md, build order):
  - Tabs: the hit test checks y, and hover text uses `raisedText` (step 4).
  - The band's "Not sent" gets its own row on desktop (step 5).
  - The empty-state line budget (step 6).
  - Action buttons: " (recommended)" on the primary option, and two-line groups with no dot (step 7).
  - The fold-line clip and the settled ask clip on desktop (components 13 and 14).

## 2. Live checks, with you

Each takes a minute or two of clicking in the app. They run after section 1 lands, because section 1 changes the desktop drawing and the Codex tab. That way each check tests the code that ships.

- **Desktop** (handoff check 2): typing and Enter, the dimmed guard, the recommended option, Markdown, and the layout at 50 columns.
- **Codex** (handoff check 3): the tab opens from the side panel, `inbox` answers in text only, and Explain goes Sending, then Queued, then ✓. Reinstall the plugin first.
- **The desktop probes that gate design steps:**
  - 2 (settling check) and 1 (row-Client part): whether rows and the fold become Clients
  - 3 and 4: row sizing and many Clients
  - 5, 6, 7, 8 and 11: colors, text width, the tab tone line and Box fills
  - 9, 10, 13, 14, 15, 17, 19 and 20: one capture each

## 3. Decisions, yours

- Approvals A1 to A8 in desktop-look.md.
- Whether the row and fold Clients ship, after their probes.
- The wording list and smaller questions in revamp-handoff.md.
- What to do with the main checkout's uncommitted `architecture.md` and `clients.md`.

## 4. Build what the probes and decisions allow

The rest of the desktop-look build order runs in this phase:

- the tab colors, bold label and tone line
- tab sizing
- the status-line constant
- Box fills
- `titleGap`
- the row and fold Clients, if approved
- approved changes A1 to A8
- tree rails or the indent fallback
- the spec pass

## 5. Merge

This doc assumes the merge comes last, after section 4. The other choice is to merge after sections 1 to 3 and finish the desktop design on main right after.

- Merge `revamp` to main, with your OK.
- Point `CLAUDE_CODE_PLUGIN_DIRS` back at the main checkout, and remove `CLAUDE_CODE_PLUGIN_DIR_WATCH`.
- Restart open sessions, and reinstall the Codex plugin.
