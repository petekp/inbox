# Scripted release pass: mod test follow-ups

Part of [Scripted release pass: follow-ups](release-pass-follow-ups.md).

Status: building. Each item stays until the change that does it lands.

The mod's tests in `tests/hooks-*.test.ts` run the mod against the plugin test kit. These are the ways they pass while the terminal pane fails.

- **No test covers where the terminal pane's focus ring goes after a reply field closes.** A test in `tests/hooks-*.test.ts` cannot see the mod's own `$.ui.focus` calls: the plugin test kit answers them with "no implementation for ui.focus", even with a `ui.focus` hook registered. So a change that drops the move to the hidden Button in `matchPaneEscape` would bring back #1049, a reverse-video mark left on a row while the selection moves, and pass every test. A test kit that routes a plugin's `ui.focus` calls to the test's hook, and a test that sends a reply and checks the focused key, would catch it.
