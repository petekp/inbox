# Differences on purpose: the Herdr look's questions

Part of [the look map](../looks.md#differences-on-purpose).

This part of the Herdr look's table covers an open question's lines. Like [the rest of the table](differences-herdr.md), it compares the Herdr look with the Codex tab.

| Topic | Herdr look | Why | Where |
| --- | --- | --- | --- |
| A question's earlier answer (`earlier-answers`) and option notes | The earlier answer draws in one muted tone, with the answer in the same weight as the rest. An option's label draws in the foreground color and its note in the muted color, and the note moves whole to the next line when it does not fit after the label. The Codex tab draws the answer bold, and every other look runs an option's note on from its label. | gpui-kit has no inline text span, so one word of a line cannot take its own weight, and a label and its note are two parts of a wrapping row. | `herdr/src/draw.ts:rowBody`, `herdr/src/paint-blocks.ts:bodyLineEl` |
