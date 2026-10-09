# Feedback for every action

Status: built. Terms follow `GLOSSARY.md`.

## The problem

A person pressed Discuss on a PR review thread, saw nothing happen, and sent the
same message to Claude four or five times. These actions sent a message to
Claude and changed nothing the person could see: a PR thread's Address, Draft
reply and Discuss; Address all; Explain on a question or task; a task's Run
help; and a typed reply to a task.

These already showed their effect:

- **Answer, Done, Dismiss on an item.** The row stays in place for 5.12 seconds with
  a ✓ and the outcome.
- **Fix on a check.** In Failing checks, the row stays in place for 5.12
  seconds with a ✓ and "Fix", then leaves. On a PR, the row says
  "Fix · 2m ago" beside its ✓, and the key becomes "Fix again".
- **Dismiss on a finding, a check or a PR.** The row or block leaves the list.
- **Copy helps.** A toast says what was copied.
- **Opens.** Open PR, Open log, a thread's Open and a task's Open help bring up
  the browser or another app. A toast says when an open fails.
- **Selection, tabs, the closed fold, the Keys list, `t`.** The pane changes.

## The rule

Every action shows what it did as soon as it is pressed: in the pane, in words
that say what happened, or in the browser, app or toast it brings up. Pressing
it again must look deliberate.

## Design

- **A last action per row.** When an action that keeps its row is pressed, the
  row records it: which action and when. It keeps only the latest, for the
  session. Reason: a PR check's Fix already works this way.
- **Where it shows.** Selected, the row shows "✓ Discuss · just now" under its
  body. Unselected, it replaces the row's age, as "✓ Discuss 1m ago". A PR
  block shows it under its buttons. Reason: the same places a PR check's Fix
  uses.
- **The key after a press.** The action reads "Discuss again". Reason: as with
  "Fix again", a second press is then a choice, not a retry.
- **Wording.** It says a ✓ and the label of the action pressed, as in
  "✓ Draft reply". Reason: the person sees the choice they made, checked off.
  "Draft reply sent" read as a label, and "Sent to Claude to fix" was long.
  A row whose own mark is already a ✓, such as a folded thread, leaves out
  the second one.
- **Opens and copies record nothing.** The browser, app or toast they bring up
  is the feedback, and a note in the pane would only repeat it.
- **A finding that leaves.** Address, Discuss and a typed reply send the finding
  to Claude and remove it, so it stays in place for 5.12 seconds with a ✓ and its
  last action, as a closed item does. Dismiss only hides, so its row leaves at
  once.
- **A leave bar.** A row that stays in place after it closes shows a thin
  bar under its outcome, 12 cells of `─`, that empties by half cells as its
  5.12 seconds run out. Reason: the person sees when the row will move to
  Closed.
- **A failing check that passes.** When a run of the check passes, its row in
  Failing checks stays in place for 5.12 seconds with a ✓, the check's name,
  "Passed" and the leave bar. Dismiss on a check leaves at once, as on a
  finding, since both only hide the row.
- **Fix on a failing check.** The row stays in place for 5.12 seconds with a
  ✓, the check's name, "Fix" and the leave bar, then leaves Failing checks
  until a run of the check fails again. See [sent-rows.md](sent-rows.md).
- **A row handed to Claude folds.** After Address or Address all on a review
  thread, Fix on a PR's failing check, or a Run step or typed reply on a task, the
  row shows a ✓ and what was sent, with its body and keys behind Details. It
  leaves the "waiting on you" counts. Discuss, Draft reply and Explain record
  their last action but don't fold. See [sent-rows.md](sent-rows.md).
- **Resolve conflicts.** A PR that conflicts with its base branch gets a
  Resolve conflicts button. It asks Claude to update the branch, resolve the
  conflicts and verify, and to ask before pushing.

In `/inbox demo` a press still sends nothing and records nothing. The demo's
toast says so.

## Enforcement

- **The type.** Every `Action` declares its `kind`, a `PressKind`: Talk,
  Hand-off, Local, Mark or View. A Talk or Hand-off press leaves "✓ <label>"
  on its row. A Local press, an open or a copy, shows "Opening x…" and then
  its result. A Mark or View press shows itself: it closes or settles the row,
  or opens the text field. Leaving `kind` out fails the type check, so a new
  action has to decide. The type covers only buttons built
  as an `Action`. The pane's other buttons switch tabs, select a row, fold a
  group, open the Keys list, or act on the resume card, and each changes the
  pane by itself.
- **One press path.** Every action's press, by click or hotkey, runs
  `runPress()` in `hooks/register.tsx`. It applies a row press with
  `applyPress()` in `hooks/presses.ts` and a PR press with `applyPrPress()`,
  then records the row's last action. A button reads "… again" when its row's
  last press was that action. Address all also records Address on each thread
  it sent.
- **A test.** The PR test presses Resolve conflicts on the block, Discuss by
  hotkey and Address by click, and checks each shows "✓ <label>" and reads
  "again". It fails when a render path skips `runPress()`, which the type
  cannot catch.
- **Agent guidance.** `AGENTS.md` states the rule and points at `kind`,
  `runPress()` and `applyPress()`.

## Not covered

- Whether Claude has started on a sent message. The engine queues a message sent
  while Claude works, and the mod cannot see when it is delivered. The row
  shows the ✓ either way.
