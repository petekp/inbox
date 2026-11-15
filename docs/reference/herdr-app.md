# The Herdr app

Facts about the Herdr app that the inbox relies on, with how each was checked. The Herdr look's plan in [docs/plans/herdr-look.md](../plans/herdr-look.md) holds the facts its spike found.

## `terminal.list` through `hc connect`

Checked live on 2026-11-11 by sending the request `hooks/herdr-sweep.ts:labelledSessions` sends, `{"jsonrpc":"2.0","id":1,"method":"terminal.list","params":{}}` and a newline, to `hc connect` on its standard input.

- `hc connect` answered and exited 0 at the end of its input. It does not stay open.
- The answer is one line: `{"id": …, "jsonrpc": "2.0", "result": {"hidden_finished": …, "terminals": [...]}}`.
- Each entry in `terminals` has a `labels` object, empty when the terminal has no labels. A terminal's id, the value of `HC_TERMINAL_ID` in it, is the entry's `address`, such as `t3`.
- The terminal the request came from was in the list.
- Every entry had `state: "live"`. Finished terminals are left out of the list, and `hidden_finished` counts them.

The sweep relies on the last three facts. It removes nothing unless the list holds its own terminal's `address` and every entry has a `labels` object.
