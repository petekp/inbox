# Differences on purpose: the Herdr look's open gaps

Part of [the look map](../looks.md#differences-on-purpose).

These rows are drift. The Herdr look lacks each feature and no Herdr limit explains it. Each has an open issue, and `core/domain/clients-herdr.ts` points to it. The rows are here so the parity record can tie each gap to a row. Fix the gap or record its real reason in another part, then delete the row. Like [the rest of the table](differences-herdr.md), these rows compare the Herdr look with the Codex tab.

| Topic | Herdr look | Why | Where |
| --- | --- | --- | --- |
| Tab names in a narrow pane (`tab-symbols`) | The tab row wraps its words onto a second line and never switches to symbols. | No reason recorded: [#672](https://github.com/petekp/inbox/issues/672). | `herdr/src/paint-chrome.ts:tabsEl` |
