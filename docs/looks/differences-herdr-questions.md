# Differences on purpose: the Herdr look's questions

Part of [the look map](../looks.md#differences-on-purpose).

This part of the Herdr look's table covers an open question's lines. Like [the rest of the table](differences-herdr.md), it compares the Herdr look with the Codex tab.

| Topic | Herdr look | Why | Where |
| --- | --- | --- | --- |
| A question's earlier answer (`earlier-answers`) and option notes | The earlier answer draws in one muted tone, with the answer in the same weight as the rest. An option's note draws in the muted color under the option's button, as in every other look. The Codex tab draws the answer bold. | gpui-kit has no inline text span, so one word of a line cannot take its own weight. The earlier answer and the other muted lines draw as one wrapping row with an item for each word, so the colors flow as one paragraph. | `herdr/src/draw.ts:rowBody`, `herdr/src/paint-blocks.ts:bodyLineEl` |
