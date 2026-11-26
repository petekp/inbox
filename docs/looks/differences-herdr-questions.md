# Differences on purpose: the Herdr look's questions

Part of [the look map](../looks.md#differences-on-purpose).

This part of the Herdr look's table covers an open question's lines. Like [the rest of the table](differences-herdr.md), it compares the Herdr look with the Codex tab.

| Topic | Herdr look | Why | Where |
| --- | --- | --- | --- |
| A question's earlier answer (`earlier-answers`) and option notes | The earlier answer draws in one muted tone, with the answer in the same weight as the rest. An option's note draws at the supporting level under the option's button, as in every look that draws that level (`supporting-text`). The Codex tab draws the answer bold. | gpui-kit has no inline text span, so one word of a line cannot take its own weight. The earlier answer and the other muted lines draw as one wrapping row with an item for each word, so the colors flow as one paragraph. | `herdr/src/draw.ts:rowBody`, `herdr/src/paint-body-line.ts:bodyLineEl` |
| Answers side by side before they first measure (`answers-side-by-side`) | A row whose answers may sit side by side draws them so while the buttons that have reported their widths fit the row. If they then do not fit, the next draw stacks them. Answers added to ones that did not fit, as "All N options" adds them, draw stacked at once. | gpui-kit reports a size only after a draw, and the Codex tab measures before its page paints. Short answers, the common case, draw in their final form at once. | `herdr/src/paint-tree.ts:isSideBySide` |
