# Differences on purpose: the Herdr look's open gaps

Part of [the look map](../looks.md#differences-on-purpose).

These rows are drift. The Herdr look lacks each feature and no Herdr limit explains it. Each has an open issue, and `core/domain/clients-herdr.ts` points to it. The rows are here so the parity record can tie each gap to a row. Fix the gap or record its real reason in another part, then delete the row. Like [the rest of the table](differences-herdr.md), these rows compare the Herdr look with the Codex tab.

| Topic | Herdr look | Why | Where |
| --- | --- | --- | --- |
| Stop rows (`band-and-stop-rows`) | Draws no stop row and no Resume. Only the Herdr sidebar shows a stop. The published session carries it. | No reason recorded: [#674](https://github.com/petekp/inbox/issues/674). | `herdr/src/draw.ts:tabBlocks` |
| Hook trust (`hooks-need-trust`) | Shows nothing when Codex is not running the inbox's hooks. The Codex tab shows a banner that says why and how to trust them. | No reason recorded: [#681](https://github.com/petekp/inbox/issues/681). The session Codex publishes carries no trust state. | `core/remote/herdr-app.ts` |
