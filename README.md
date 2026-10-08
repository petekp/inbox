# inbox, for claude code

A Claude Code mod that gathers and intelligently manages outstanding questions, tasks, issues, and opportunities into one nicely organized place alongside your session. Just use `/inbox`.

https://github.com/user-attachments/assets/560f80be-e6fb-484e-8a3f-7b4828b98fb2

## Install

In a Claude Code session, type:

```
/plugin install inbox --marketplace petekp/inbox
```

Answer `y` to add the marketplace, then choose a scope. It starts working in
that session.

- It costs one Sonnet call after each of Claude's replies, about 3k tokens in
  and 500 out.
- The PRs tab needs the GitHub CLI, `gh`, signed in.
- It was built and tested with Claude Code 2.1.292.

To update, run `claude plugin update inbox`, then `/reload-plugins` in any
session that's already open.

## Using it

A line above your prompt shows what the session is working on and how many
things are waiting on you.

Type `/inbox` to see them. It opens a panel with three tabs:

- **Needs you**: questions Claude asked you, tasks only you can do, and tests
  or builds that failed.
- **Findings**: bugs, risks and ideas Claude noticed outside the task it's
  working on.
- **PRs**: pull requests from this session and your current branch, what's
  blocking each one, and review comments waiting on you.

Each item shows what you can do with it. To answer a question, press the
letter next to the answer you want, and it goes to Claude as your message. You
can also have Claude fix a finding, mark a task done, or dismiss anything you
don't need.

In the panel, `1`, `2` and `3` switch tabs, `j` and `k` move up and down, and
an action's letter runs it. You can also click. ctrl+x tab moves between the
panel and the prompt.

After 15 minutes with no activity, or when you resume a session, the line
above the prompt expands into a short summary of where things stand.

The mod also tracks the tests and builds Claude runs. If Claude says something
passes when the last run failed, or hasn't run since an edit, the mod asks
Claude to run it again or say the change is untested.

To see every part with sample items, run `/inbox demo`. Run it again to go
back to your own.

## Limits

- A model writes the summary and picks what goes in the inbox, so it can be
  wrong.
- If you answer within a few seconds of a reply, the inbox may not have the
  question yet. Claude still sees your answer.
- A question or task you never answer closes after 12 of your messages.

## Developing

Run the mod from a clone:

```sh
claude --plugin-dir /path/to/inbox
```

The session reloads the mod when you change one of its files.
`./scripts/check.sh` runs Prettier, `claude plugin validate`, a type check and
the tests. The type check needs the types Claude Code writes to
`.claude-plugin/types/` the first time it loads the mod.
