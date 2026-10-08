# Feedback for every action

Status: built. Terms follow `GLOSSARY.md`.

## The problem

A person pressed Discuss on a PR review thread, saw nothing happen, and sent the
same message to Claude four or five times. These actions sent a message to
Claude and changed nothing the person could see: a PR thread's Address, Draft
reply and Discuss; Address all; Explain on a question or task; a task's Run
help; and a typed reply to a task.

These already showed their effect:

- **Answer, Done, Dismiss on an item.** The row stays in place for 8 seconds with
  a ✓ and the outcome.
- **Fix on a check.** The row says "Fix sent · 2m ago" and the key becomes "Fix again".
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
  row records it: what happened and when. It keeps only the latest, for the
  session. Reason: the "Fix sent" row already works this way.
- **Where it shows.** Selected, the row shows "Discuss sent · just now" in the
  done color, under its body. Unselected, it replaces the row's age, as
  "discuss sent 1m ago". A PR block shows it under its buttons. Reason: the
  same places "Fix sent" uses.
- **The key after a press.** The action reads "Discuss again". Reason: as with
  "Fix again", a second press is then a choice, not a retry.
- **Wording.** It says "<action> sent", as in "Draft reply sent". Reason: the
  person reads the action they pressed, in the form "Fix sent" set.
- **Opens and copies record nothing.** The browser, app or toast they bring up
  is the feedback, and a note in the pane would only repeat it.
- **A finding that leaves.** Address, Discuss and a typed reply send the finding
  to Claude and remove it, so it stays in place for 8 seconds with a ✓ and its
  last action, as a closed item does. Dismiss only hides, so its row leaves at
  once.
- **A review thread folds once sent.** After Address, Draft reply, Discuss or
  Address all, the thread shows a ✓ and the first line of its latest comment,
  with the full comment behind a click-only `▸ Details`. A comment newer than
  the send unfolds it. Reason: as with an answered question, the person has
  done their part, and the long comment no longer needs to be read. The thread
  stays in the list, since GitHub still shows it open.
- **Resolve conflicts.** A PR that conflicts with its base branch gets a
  Resolve conflicts button. It asks Claude to update the branch, resolve the
  conflicts and verify, and to ask before pushing.

In `/inbox demo` a press still sends nothing and records nothing. The demo's
toast says so.

## Enforcement

- **The type.** Every `Action` declares `done`: the text its press records, or
  `null` when the press shows itself (it closes or settles the row, opens the
  text field, moves the selection, or brings up a page, an app or a toast).
  Leaving it out fails the type check, so a new action has to decide. The type covers only buttons built
  as an `Action`. The pane's other buttons switch tabs, select a row, fold a
  group, open the Keys list, or act on the resume card, and each changes the
  pane by itself.
- **One wrapper.** `withLastAction()` wraps each action's press to record its
  last action and relabels it "again". Row buttons, the hidden hotkeys and the
  PR block all draw through it. The one handler that records its own is
  Address all, which also records Address on each thread it sent.
- **A test.** The PR test presses Resolve conflicts on the block, Discuss by
  hotkey and Address by click, and checks each shows "… sent" and reads
  "again". It fails when a render path skips the wrapper, which the type
  cannot catch.
- **Agent guidance.** `AGENTS.md` states the rule and points at `done` and
  `withLastAction()`.

## Not covered

- Whether Claude has started on a sent message. The engine queues a message sent
  while Claude works, and the mod cannot see when it is delivered. The row
  says "sent" either way.
