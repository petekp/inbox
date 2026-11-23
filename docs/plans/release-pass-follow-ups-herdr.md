# Scripted release pass: Herdr frame harness follow-ups

Part of [Scripted release pass: follow-ups](release-pass-follow-ups.md).

Status: building. Each item stays until the change that does it lands.

The Herdr frame harness, `herdr/tests/frames.ts`, draws the Herdr pane frame by frame with a stand-in for gpui-kit. These are the ways it passes while the app fails.

- **The Herdr frame harness read a tree row's mark as its title.** Until the title fade change, the harness took `node.kids[1]` as a row's title text. In a tree row that node is the row's mark, so the title tests in `herdr/tests/glide.spec.ts` checked the mark and passed while every wrapped title was cut. The harness now finds the title by its text and its layer's id. No check fails when the harness reads the wrong node: a spec that asserts the title text it read is the row's title would catch it.
- **The Herdr frame harness draws only every 16 ms.** `framesOf` in `herdr/tests/frames.ts` draws on a fixed grid, but the app also draws at each time the mod schedules, such as a closing panel's `panelHeldUntil`. Drawing at those times too would have caught a row reopened 150 ms into its close: the box lets go at 136 ms in the app and keeps its speed, so the panel shows nothing at full height for about 300 ms. The harness let go at 156 ms instead, where the reopen came first and passed.
- **The Herdr frame harness finds gaps in tree lines that have faded out.** `gapsOf` in `herdr/tests/frames.ts` reads where each line starts and ends, but not its opacity. As a Status subject's fold shuts, its nested rows' lines fade to 0 before their space closes. The harness then reports a gap in the depth-1 column, in the space of the first nested row, where nothing shows. So the fold test in `herdr/tests/glide.spec.ts` checks jumps but not gaps. A gap check that skips a line whose shown opacity is 0 would let that test check gaps too. It would then catch a tree line that breaks while a fold shuts. The harness keeps no fade state for lines, or for anything placed absolutely, so it would first need each line's own fade.
