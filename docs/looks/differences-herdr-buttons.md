# Differences on purpose: the Herdr look's row buttons

Part of [the look map](../looks.md#differences-on-purpose).

This part of the Herdr look's table covers the buttons on a question, task or finding. Like [the rest of the table](differences-herdr.md), it compares the Herdr look with the Codex tab.

| Topic | Herdr look | Why | Where |
| --- | --- | --- | --- |
| Show explanation (`show-explanation`) | Never drawn, as in the Codex tab. After a press in the terminal, the row reads "✓ Shown in the conversation", as the terminal's row does. | The Herdr app runs apart from the Claude Code terminal, so it cannot scroll that conversation. | `herdr/src/screen.ts` |
