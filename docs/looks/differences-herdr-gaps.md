# Differences on purpose: the Herdr look's open gaps

Part of [the look map](../looks.md#differences-on-purpose).

These rows are drift. The Herdr look lacks each feature and no Herdr limit explains it. Each has an open issue, and `hooks/clients-herdr.ts` points to it. The rows are here so the parity record can tie each gap to a row. Fix the gap or record its real reason in another part, then delete the row. Like [the rest of the table](differences-herdr.md), these rows compare the Herdr look with the Codex tab.

| Topic | Herdr look | Why | Where |
| --- | --- | --- | --- |
| A new PR in an empty tab (`pr-arrivals`) | Records a new PR as a new row in the tab it shows, and stays on an empty tab when one arrives. The Codex tab moves to PRs. | No reason recorded: [#675](https://github.com/petekp/inbox/issues/675). | `herdr/src/keys.ts:withArrivals` |
| Stop rows (`band-and-stop-rows`) | Draws no stop row and no Resume. Only the Herdr sidebar shows a stop. The published session carries it. | No reason recorded: [#674](https://github.com/petekp/inbox/issues/674). | `herdr/src/draw.ts:tabBlocks` |
| What holds a due fold (`fold-waits-for-list-use`) | A press, a key or a selection holds a row due to fold. A scroll and a pointer on the list do not. In the Codex tab both do. | No reason recorded: [#673](https://github.com/petekp/inbox/issues/673). | `herdr/src/main.ts` |
| A finished press's age (`done-press-age`) | A row whose press finished, such as a hand-off whose turn ended, keeps showing when it arrived. The Codex tab shows how long ago the press finished. The PRs tab does show it. | No reason recorded: [#677](https://github.com/petekp/inbox/issues/677). | `herdr/src/draw.ts:rowBlock` |
| Tab names in a narrow pane (`tab-symbols`) | The tab row wraps its words onto a second line and never switches to symbols. | No reason recorded: [#672](https://github.com/petekp/inbox/issues/672). | `herdr/src/paint-chrome.ts:tabsEl` |
