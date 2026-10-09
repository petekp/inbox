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

- It makes one Sonnet call after each of Claude's replies. See [Cost](#cost).
- The PRs tab needs the GitHub CLI, `gh`, signed in.
- It was built and tested with Claude Code 2.1.292.

To update, run `claude plugin update inbox`, then `/reload-plugins` in any
session that's already open.

## Using it

A line above your prompt shows what the session is working on and how many
things are waiting on you.

Type `/inbox` to see them. It opens a panel with three tabs:

- **Needs you**: questions Claude asked you, and tasks only you can do.
- **Findings**: bugs, risks and ideas Claude noticed outside the task it's
  working on.
- **PRs**: pull requests from this session and your current branch, what's
  blocking each one, and review comments waiting on you.

Each item shows what you can do with it. To answer a question, press the
letter next to the answer you want, and it goes to Claude as your message. You
can also have Claude fix a finding, mark a task done, or dismiss anything you
don't need.

In the panel, `1`, `2` and `3` switch tabs, `j` and `k` move up and down, and
an action's letter runs it. You can also click. ctrl+x tab moves focus from the
prompt to the line above it, then to the panel, then back to the prompt. When
the tab you're on is empty and something new
arrives on another tab, the panel switches to it.

After 15 minutes with no activity, or when you resume a session, the line
above the prompt expands into a short summary of where things stand.

To see every part with sample items, run `/inbox demo`. Presses on them change
only the samples and send nothing. Press Hide demo, or run the command again,
to go back to your own items.

## Cost

You might be wondering how many extra tokens the inbox uses. It adds two
things:

| What the inbox adds | Tokens | Cost at API prices |
|---|---|---|
| A Sonnet call after each of Claude's replies, to update the inbox | 3–4k in, about 2k of it cached. 100–250 out. | About 0.5¢ per reply, or 1¢ after 5 idle minutes |
| Its instructions and tools, sent with every request Claude makes | About 1,350, cached | Under 0.1¢ per request |

In one long Opus session, this came to about 1% of the total cost. A shorter
or cheaper session pays a larger share. On a Claude plan, these count toward
your usage limits.

## Developing

Run the mod from a clone:

```sh
claude --plugin-dir /path/to/inbox
```

The session reloads the mod when you change one of its files.
`./scripts/check.sh` runs Prettier, `claude plugin validate`, a type check and
the tests. The type check needs the types Claude Code writes to
`.claude-plugin/types/` the first time it loads the mod.
