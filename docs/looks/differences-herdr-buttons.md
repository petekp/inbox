# Differences on purpose: the Herdr look's row buttons

Part of [the look map](../looks.md#differences-on-purpose).

This part of the Herdr look's table covers the buttons on a question, task or finding. Like [the rest of the table](differences-herdr.md), it compares the Herdr look with the Codex tab.

| Topic | Herdr look | Why | Where |
| --- | --- | --- | --- |
| Show explanation (`show-explanation`) | Never drawn, as in the Codex tab. After a press in the terminal, the row reads "✓ Shown in the conversation", as the terminal's row does. | The Herdr app runs apart from the Claude Code terminal, so it cannot scroll that conversation. | `herdr/src/screen.ts` |
| Undo's emptying fill in a light theme | The text color at 20% of its strength. In a dark theme it is 12%, as in the Codex tab. | The Codex tab uses 8% in a light theme. In Herdr's light themes 8% and 12% were too faint to see against the panel, and 20% was the smallest share that showed. | `herdr/src/paint-theme.ts:timeLeftFillOf` |
| Go to session (`stopped-session-send`) | A row whose message Claude Code held after the person stopped the session reads "Not sent: you stopped this session. Type in it, then press Send again." It offers Go to session first among its buttons, which gives focus to the session's terminal, as Escape does. Once the person types there, Claude Code sends plugin messages again, and Send works. | A press in the Herdr look reaches the mod through a press file, so Claude Code cannot count it as the person's input. The Codex tab is inside the session it shows, and Codex holds no message after a stop. | `core/view/action-plan.ts:rowKeyPlan`, `herdr/src/draw.ts:rowButtons`, `herdr/src/main.ts` |
