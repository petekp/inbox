# Differences on purpose: the Herdr look's open gaps

Part of [the look map](../looks.md#differences-on-purpose).

These rows are drift. The Herdr look lacks each feature and no Herdr limit explains it. Each has an open issue, and `hooks/clients-herdr.ts` points to it. The rows are here so the parity record can tie each gap to a row. Fix the gap or record its real reason in another part, then delete the row. Like [the rest of the table](differences-herdr.md), these rows compare the Herdr look with the Codex tab.

| Topic | Herdr look | Why | Where |
| --- | --- | --- | --- |
| Stop rows (`band-and-stop-rows`) | Draws no stop row and no Resume. Only the Herdr sidebar shows a stop. The published session carries it. | No reason recorded: [#674](https://github.com/petekp/inbox/issues/674). | `herdr/src/draw.ts:tabBlocks` |
| A finished press's age (`done-press-age`) | A row whose press finished, such as a hand-off whose turn ended, keeps showing when it arrived. The Codex tab shows how long ago the press finished. The PRs tab does show it. | No reason recorded: [#677](https://github.com/petekp/inbox/issues/677). | `herdr/src/draw.ts:rowBlock` |
| Tab names in a narrow pane (`tab-symbols`) | The tab row wraps its words onto a second line and never switches to symbols. | No reason recorded: [#672](https://github.com/petekp/inbox/issues/672). | `herdr/src/paint-chrome.ts:tabsEl` |
| Hook trust (`hooks-need-trust`) | Shows nothing when Codex is not running the inbox's hooks. The Codex tab shows a banner that says why and how to trust them. | No reason recorded: [#681](https://github.com/petekp/inbox/issues/681). The session Codex publishes carries no trust state. | `hooks/herdr-app.ts` |
