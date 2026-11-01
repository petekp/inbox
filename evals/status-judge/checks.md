## The checks

The examples come from one invented session. It adds two-factor sign-in to a web app. Its pieces are SMS codes, authenticator setup, recovery codes and the 3.0 release. A subagent checks the recovery code tests. The person set the goal "Two-factor sign-in in 3.0", with the milestones SMS codes work, Recovery codes shown and 3.0 shipped. A pricing page tweak is work the goal does not need. The open question "Offer SMS codes outside the US?" holds up SMS codes. A finding says the password reset link expires too fast. The person has a task: add the SMS provider's key to staging. A standing rule says no deploys on Fridays. The examples write a row on one line, as `Name: where it stands`.

**`n/a`.** A check has nothing to judge in these cases and no others. Its answer is then `n/a`, never `pass`:

- `rows-are-work`, `each-once`, `marks` and `where-it-stands`: the page has no subject rows.
- `child-labels`: the page has no child rows.
- `no-restating`: the facts have no open ask and no finding.
- `was-lines`: the page has no was line under a subject row.
- `goal`: the page shows no goal and no proposed goal.
- `milestones`: the page shows no milestone rows.
- `split`: no goal is set, so nothing is split. A proposed goal alone splits nothing.

`head` is never `n/a`: a page with no head while the facts give a focus fails it.

### head

The head tells the person what the session is focused on now, in the person's own words. Compare it with `Focus now` in the facts.

The head passes when it names that focus, in any words. While a goal is set, the head is the one `Now:` line. The goal above it already names the aim, so the `Now:` line names the part of the focus underway now: one piece, one step of a piece, or the next few steps. It passes when that part serves the focus. It fails when it names work outside the focus, or only repeats the goal. In the two-line form, the title names the focus in a few words, like a row's name, and the description says what the session is doing about it. When the focus is work that has finished and the facts give no newer focus, a head that names that finished work passes.

The head fails when it does any of these:

- It names a focus the session has moved past.
- It names one small part of the work: a step on the way, or one stream of a coordinator whose focus covers more.
- It names where one piece stands in place of the focus.
- It names the focus by an id or a tool's handle, in place of the person's words.
- In the two-line form, the description only repeats the title, or the title is a sentence.
- The page has no head while the facts give a focus.

Examples:

- Pass: `Two-factor sign-in` over `Adding SMS and app codes to sign-in`, while the agent fixes a typo on the way.
- Pass: `Now: Adding recovery codes to sign-in`, under the goal `Two-factor sign-in in 3.0`.
- Pass: `Now: Showing recovery codes, then the SMS check`, when the focus is two-factor sign-in as a whole.
- Fail: `Now: Two-factor sign-in in 3.0`, which repeats the goal while the session works on recovery codes.
- Pass: `3.0 release` over `Shipping two-factor sign-in in 3.0`, after 3.0 shipped, when the person asked for nothing more and the focus is still the release.
- Fail: the same head after the focus moved to a billing bug.
- Fail: `Typo fix` over `Fixing a typo on the sign-in form`, while the focus is two-factor sign-in.
- Fail: a coordinator's focus is the 5.0 release and its offline mode, and its head reads `Logo update`, a small stream it also runs.
- Fail: `Two-factor sign-in` over `Recovery codes in review`.
- Fail: `Two-factor sign-in` over `Two-factor sign-in`.
- Fail: the title `Let people sign in with a code sent to their phone`.

### rows-are-work

Each subject row is one piece of the session's work: something the session builds, fixes, ships or hands to a delegate. Its name is a short handle the person could say aloud.

The check passes when every subject row stands for a piece of work in the facts, or for a part of one, under a name the person could say.

The check fails when a row stands for any of these:

- A question or other ask for the person.
- A task that only the person can do.
- A finding: a problem or a chance outside the task.
- A standing rule.
- An option, a check on a PR, a step, a file or a command.
- Nothing in the facts.

It also fails when a row's name is a sentence, ends cut off with `…`, or is an id.

Examples:

- Pass: `SMS codes`, `Recovery codes` and `3.0 release`.
- Fail: `Pick SMS countries`, a row for the open question.
- Fail: `Add provider key`, a row for the person's task.
- Fail: `Reset link expiry`, a row for the finding.
- Fail: `Friday deploy freeze`, a row for the standing rule.
- Fail: `auth_test.ts` or `Run unit tests`.
- Fail: `Let people who lost their phone get back in with a…`.

### each-once

Each piece shows on one row, whatever names the conversation used for it. Finished work does not come back as new work under another name.

The check passes when no piece has two rows. Rows for different parts of one piece pass, when the facts give those parts different states.

The check fails when any of these is on the page:

- Two rows that stand for one piece. They may use its name, its other names, or other words for the same work, such as one row for the piece and one for its PR.
- An open row for work the facts say is delivered, dropped or filed, under a name that is none of that piece's names and not the name its row had on the previous page.
- A row of its own for a piece that the facts say merged into another.

Examples:

- Pass: one row, `● Recovery codes: generated, not shown yet`, though the person calls them "backup codes".
- Pass: `● SMS in the US: works` and `● SMS in the EU: codes never arrive`, when the facts give SMS codes those two parts.
- Fail: `● Recovery codes` and `○ Backup codes`, both open.
- Fail: the facts say recovery codes are delivered, and the person asks about "backup codes". The page now has a new open row, `● Backup codes`.

### marks

Each mark on a subject row fits its piece's state in the facts, and every open piece is on the page.

Judge it in two steps:

1. Check the mark of each row of work against the list of marks above. For a `◆` row, check only that an open ask in the facts holds up that piece. Do not compare a `◆` row's mark with the piece's state.
2. List the open pieces in the facts that have no row on the page. The `○ N more` fold accounts for them. The check fails when that list is not empty and the page has no `○ N more` fold, or the fold counts fewer pieces than the list holds.

The check fails when any of these is on the page:

- A mark that does not fit its piece's state.
- An open mark on a row for a piece the facts say is closed, under one of the piece's names or the name its row had on the previous page.
- `✓` or an open mark on filed work.
- `◆` on a piece that no open ask holds up.
- Open pieces that are missing, as step 2 finds.

Examples:

- Pass: `✓ SMS codes: live in the US` beside `● Recovery codes: generated, not shown yet`.
- Pass: `○ Authenticator setup: QR code works`, set aside while the agent fixes SMS codes.
- Pass: `◌ 3.0 release: in security review`, while another team reviews it.
- Pass: `◆ SMS codes: US numbers work`, while "Offer SMS codes outside the US?" holds up SMS codes.
- Pass: `✗ Email codes: dropped, too easy to phish`.
- Fail: `● 3.0 release: live, billing bug next`, when the facts say the release is delivered.
- Fail: `✓ Passkeys: filed for later`. Filed work is not delivered.
- Fail: `○ Passkeys: filed for later`. Filed work is closed.
- Fail: `◆ Recovery codes`, when no open ask holds up recovery codes.
- Fail: the facts list nine open pieces. The page shows six open rows and no `○ N more` fold.

### where-it-stands

Where it stands is the few words after a subject row's name. They say the state of the work in the work's own terms: what works, what is left, or what it waits on. When the facts give a piece parts in different states, the words keep each part, or each part has a row of its own.

The check passes when every row's words say its piece's state and agree with the facts. Words the facts neither confirm nor contradict are not a failure.

The check fails when a row's words do any of these:

- They say what the agent is doing in place of where the work stands, in any words: `edits underway`, `being edited`, `in progress` and `working on it` all fail alike.
- They name the step that ran, or the tool or command that runs now.
- They name an id, such as a PR or ticket number, a hash or a file.
- They report what was said in the conversation.
- They only repeat the row's name.
- They contradict the facts.
- They put parts that the facts give different states into one word, or leave out such a part.
- They repeat what a child row under the same piece already shows.

An open row with no words after its name also fails.

Examples:

- Pass: `Recovery codes: generated, not shown yet`.
- Pass: `SMS codes: US works, EU codes never arrive`.
- Pass: `3.0 release: after recovery codes`.
- Fail: `SMS codes: partly working`, when US numbers work and EU codes never arrive.
- Fail: `Recovery codes: tests running`.
- Fail: `Recovery codes: edits underway`.
- Fail: `Recovery codes: in review, subagent checking tests`, while that subagent shows as a child row under it.
- Fail: `SMS codes: PR #212`.
- Fail: `Authenticator setup: compared three QR libraries`.
- Fail: `Recovery codes: recovery codes built`.
- Fail: `SMS codes: works everywhere`, when the facts say EU codes never arrive.

### child-labels

A child row shows running work. Its label says in a few plain words what the work does. It sits under the row of the piece it serves.

Match each child row to a line under `Running work` by what it does. Then judge its label and its place.

The check passes when every child row's label says what its work does, in words a person would use, and every child sits under the row of the piece it serves. A child at the top of the list passes its place when the piece it serves has no row on the page. The check passes when the page has no child rows.

The check fails when any of these is on the page:

- A label that is an id or a handle a tool made up, such as a short code, or words joined by `-` or `_`.
- A label that says nothing about the work, such as `Subagent` or `Background task`.
- A label that says the child does something other than what the facts say.
- A child under the row of a piece other than the one it serves.
- A child at the top of the list, with no `├` or `└`, while the piece it serves has a row on the page.

Examples:

- Pass: `└ ● Check the recovery code tests`, under `Recovery codes`.
- Fail: `└ ● rc-tests-2`.
- Fail: `└ ● Subagent`.
- Fail: `└ ● Check the recovery code tests`, under `SMS codes`.

### no-restating

Asks and Finds are the person's to-dos, in tabs of their own. The Status shows the work. A row that an ask holds up says where its work stands. It does not repeat the ask.

Compare the words of each row's text and was line with each quoted ask under `Open asks`, and with each `finding` under `Not work`.

The check passes when no text repeats an open ask or a finding, and no text says its piece waits on the person.

The check fails when a row's text or was line does any of these:

- It repeats an open ask, in the ask's words or in other words, such as the question with its options.
- It repeats a finding.
- It says the piece waits on the person's decision, answer, approval or action, such as "needs your call" or "waiting on you".

Examples:

- Pass: `◆ SMS codes: US numbers work`, while "Offer SMS codes outside the US?" is open.
- Fail: `◆ SMS codes: waiting on your call`.
- Fail: `◆ SMS codes: US only, or every country?`.
- Fail: `● Recovery codes: reset link expires too fast`, which puts the finding on a row of work.

### was-lines

When the session drops one plan for another, the row shows the plan it replaced on a was line, until the person has looked. When one piece merges into another, the row names the merged piece by its short name.

Compare each was line with the facts' `Plan changed; it was …` and `Merged into it: …` for that row's piece.

A row needs a was line when the facts give its piece a plan change or a merge, and the row sits above the Seen line or the facts say the piece changed at this step.

The check passes when every was line names the plan that the facts say was replaced, or the piece that the facts say merged in, by its short name, and every row that needs a was line has one. The check passes when the page has no was lines and no row needs one.

The check fails when any of these is on the page:

- A was line on a row whose piece has no plan change and no merge in the facts, such as a row that only made progress.
- A was line that names something other than the replaced plan or the merged piece, such as the new plan or a step of progress.
- A was line that is a sentence, or ends cut off with `…`.
- A row that needs a was line and has none that names the replaced plan or the merged piece.

Examples:

- Pass: `● Recovery codes: printable sheet`, with `was: codes by email` under it.
- Pass: `● Authenticator setup: QR code works`, with `merged in: Manual key entry` under it.
- Fail: `● SMS codes: US works`, with `was: US not started`. The piece only made progress.
- Fail: `● Recovery codes: printable sheet`, with `was: printable sheet`.
- Fail: `merged in: Let people type the setup key by hand when the…`.
- Fail: the facts say recovery codes changed from email to a printable sheet at this step, and the row has no was line.

### goal

The goal is the one outcome the person is working toward. The person owns it. The model may only propose one, from the person's own words.

A goal the person set passes in any words. Judge it only for `was:`: a `was:` line under the goal names the goal it replaced.

A proposed goal passes when all of these hold:

- The facts say the person stated a goal, at this step or before, and the proposal names that outcome. Its words may differ.
- It is an outcome someone could check as met or not, with a finish line, such as `3.0 shipped` or `Sign-in ready to demo`.

A proposed goal fails when it does any of these:

- It comes from the agent's words, or from a summary of the work, when the facts give no goal the person stated.
- It names a direction with no finish line, such as `Better sign-in security` or `Keep the code clean`.
- It names an activity in place of an outcome, such as `Reviewing sign-in`.
- It names a different outcome from the one the person stated, or adds an aim the person did not state.
- It proposes the goal already set, in other words.

Examples:

- Pass: the goal `Two-factor sign-in in 3.0`, which the person set.
- Pass: `Proposed goal · from your message` over `Recovery codes ready to demo`, when the person stated: get recovery codes ready to demo.
- Fail: the same proposal when the person stated no goal and the agent wrote "the goal now is a recovery code demo".
- Fail: a proposal of `Stronger account security`, when the person asked to make sign-in safer.
- Fail: a proposal of `Recovery codes and SMS outside the US ready`, when the person stated only the recovery code demo.

### milestones

Milestones are the outcomes the goal needs, in order. Each is something that is either true or not yet, such as `SMS codes work`, never a step or a task such as `Write SMS tests`. Compare each with the facts' `Milestones:` lines. A proposal's milestones have no `Milestones:` lines: compare them with what the person stated, and judge their marks by the pieces of work that would make each one true.

The check passes when every milestone row is an outcome the goal needs, its mark fits its state as the marks list says, and together the rows show what is done, what is left and what is held up. A milestone held up by an open ask shows `◆` and `waiting`, as a subject row does.

The check fails when any of these hold:

- A milestone names a task, a step, a tool or a file, in place of an outcome.
- A milestone names something the goal does not need.
- A milestone's mark does not fit its state in the facts, such as `○ SMS codes work` when the facts say SMS codes work is delivered.
- A milestone in the facts has no row, or two rows stand for one milestone.
- An open ask holds up a milestone, or a piece that serves it, and the milestone shows no `◆`.

Examples:

- Pass: `✓ SMS codes work`, `● Recovery codes shown`, `○ 3.0 shipped`, matching the facts.
- Fail: `● Write recovery code tests`, a task.
- Fail: `○ SMS codes work`, when the facts say it is delivered.
- Fail: `● SMS codes work`, while the open question "Offer SMS codes outside the US?" holds up SMS codes, which serves it.

### split

While a goal is set, the subject rows above `── Other work` are the work the goal needs, and the rows under it are work the goal does not need. Compare each row with its piece's line in the facts: `It serves the milestone …` or `The goal does not need it.`

The check passes when every row sits on the side its piece's facts give. A piece whose facts say neither may sit on either side.

The check fails when any of these hold:

- A row under `── Other work` stands for a piece that serves a milestone.
- A row above `── Other work` stands for a piece the goal does not need.

Examples:

- Pass: `● Recovery codes: generated, not shown yet` above the rule, and `● Pricing page: new plan names` under it.
- Fail: `● Recovery codes: generated, not shown yet` under `── Other work`.
- Fail: `● Pricing page: new plan names` above the rule, when the facts say the goal does not need it.
