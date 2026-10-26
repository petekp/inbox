# Visual alignment across looks

Status: proposed. Shared row content, action order, labels, navigation and fold counts are built. The remaining visual proposals need product decisions and native measurements.

The three looks use shared row and action descriptions. [looks.md](../looks.md) lists their current owners and deliberate differences. [inbox-ui.md](inbox-ui.md) describes the built behavior. [three-looks.md](three-looks.md) tracks architecture and verification work.

This proposal concerns the hierarchy and fitting of native drawings. A shared description can say which mark, title, feedback and actions a row has. Terminal cells, desktop proportional text and browser layout determine how those parts fit.

## Current structure

- Asks has Questions and Tasks. Finds has Issues and Opportunities. Each group has its own Closed fold.
- Shared helpers choose row marks, reply hints, action labels and feedback. Fold labels count all closed rows outside the settle window and say how many earlier rows are not shown.
- Action emphasis and action order are separate fields. Retry leads a failed row. Options or help steps precede Done or Fix. The desktop renderer follows the shared key plan.
- The recommended option says "(recommended)" in every look. Done, Fix and Do it have primary emphasis on desktop and Codex. A terminal Button uses its plain native form.
- The first waiting row opens by default. New rows above it arrive closed. A close or handoff opens the next waiting row. New rows have no arrival bar; Codex animates entry.
- Both hosts have PRs. Their shared rules fetch and track the same branch and linked PRs, compute readiness and apply presses. Native PR drawing still has adapter composition.
- The desktop row Client reserves a side column for its age at narrow widths. Other drawings place the same age in their own row frame or header.

These rules are current behavior. Their implementation does not depend on a new layout system.

## Remaining visual proposals

| Proposal | Reason and decision needed |
| --- | --- |
| Remove terminal tree rails and per-row rules | They add indentation and separators to a dense list. The current decision keeps them. A change needs a separate decision after checking docked and inline terminal lists. |
| Collapse a PR's failing checks to one line | A large failed-check group can hide review threads below it. Decide whether a summary with Open log preserves enough detail before changing the group. |
| Align row marks and metadata across native drawings | Compare selected, handed-off, settled and closed forms in the current apps. Adjust each adapter only where a measured mismatch makes the hierarchy harder to read. |
| Further align section separators and selected fills | Match each host's controls and appearance. Native desktop capabilities must come from the platform reference or a live probe. A shared CSS shape cannot establish a native requirement. |

The Asks count currently excludes PRs. A proposal to include blocked PRs changes the count's meaning and the text the models read. It is a separate product decision, followed by model evaluations if the text changes.

Explain remains available by key in terminal and Codex. Desktop has no action keys, so it draws Explain. Reply uses the shared intent and order. Desktop draws that follow-up in a Client region because native Buttons fill and pad only their labels; Codex draws a normal button.

Keep shared dimensions where both drawings have a measured need, such as `ROW_PAD_PT` in `hooks/layout.ts`. Breakpoints, wrapping and unit conversion stay with the adapter they affect. A new common dimension needs evidence from each affected look. The current work does not require a universal column, spacing or widget schema.

## Verification

The structure checker protects dependency boundaries and references. Mounted Codex action tests protect the production controls' order, emphasis, reply mode, draft and press outcomes. They do not establish full-page selection, PR drawing, native focus or pixels.

Verify a visual change in its affected native drawings:

- Capture the same row states at useful narrow and wide widths in both appearances.
- Check pending press, settle, Undo, failure, exit and interrupted moves. Measure Codex frames and reduced motion in the local page, then check the app.
- Check terminal keys and desktop Client hit areas and focus. Confirm the desktop pane has redrawn the current build before relying on a capture.
- Compare tone contrast against the actual host surfaces where the text or mark appears.

Extend renderer tests only for a distinct contract that existing coverage cannot reach. Check content, action identities and observable outcomes. Avoid frozen DOM trees, class lists or a second presentation model created only for tests.

[claude-mode.md](claude-mode.md) is a separate proposal. Its card, full view, item source and send capabilities are not built. They do not change the current three-look contract.
