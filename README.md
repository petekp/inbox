# Inbox

I have ADHD. Working with an agent in a chat thread format is very cognitively taxing. The number of things you're having to hold in your head begins to compound the longer the session goes on. The questions, bugs, ideas, and tasks all begin to pile up and intermix making it difficult to keep everything in line.

Inbox provides immediately apparent relief here by giving your agent an organized, stable place to surface everything that needs a decision. Inbox also makes sure your agent always provides a proactive, anticipatory set of quick actions on each item, including a recommended action.

Even better, Inbox provides your agent a place to surface latent issues and opportunities, ones that it might otherwise gloss over in the interest of exclusively addressing the task at hand.

Inbox is available for Claude Code in the terminal and desktop app, Codex in the ChatGPT desktop app, and omp in the terminal. Each variant is uniquely crafted for each platform, but works in same fundamental way in all of them.

## How it works
https://github.com/user-attachments/assets/a493119c-4d8b-46e0-a18a-bd0ecf041b6b


## Install

If you're like me, just paste a link to this Github repo to your agent and ask it to install.

If you want to do things the old way, proceed...

### Claude Code

In a Claude Code session in the terminal, type:

```
/plugin install inbox --marketplace petekp/inbox
```

Answer `y` to add the marketplace, then choose a scope. It starts working in
that session. A user-scope install also covers Code sessions in the Claude
desktop app on this machine.

To install from the Claude desktop app instead, open a Code session:

1. Click **+** beside the prompt, then **Add plugins**.
2. In the Directory, click **+** at the top right, then **Add from a
   repository**.
3. Enter `petekp/inbox` and click **Sync**.
4. Click **+** on Inbox.

This installs it for your user account, so it works in the terminal too.
`/plugin` does not run in the desktop app, and the inbox does not reach the
app's cloud sessions.

If your organization manages Claude Code, an inbox you install yourself
works only in part. Claude Code skips the hooks it uses to add to what Claude
reads, so Claude gets neither the inbox's instructions nor its list of what
waits on you. The inbox also keeps the old conversation's list after `/clear`
or a resume, and shows no permission prompts or failed turns. Questions,
tasks and findings still reach it. To get everything, ask an admin to list
the inbox in your organization's managed settings.

To update, run these, then `/reload-plugins` in any session that's already
open:

```sh
claude plugin marketplace update inbox
claude plugin update inbox
```

- It makes two Sonnet calls after each of Claude's replies, one for the list and one for the results. See [Cost](#cost).
- It was built and tested with Claude Code 2.1.300.

### Codex

```sh
codex plugin marketplace add petekp/inbox
codex plugin add inbox@inbox
```

Then, in the ChatGPT desktop app, trust the plugin's hooks: click the hook icon
beside the prompt's approval setting, then Allow all. Codex runs a plugin's
hooks only after you trust them. On Codex 0.164.0 and later, an update stops
the hooks until you trust them again: after each update, click the hook icon
and choose Allow all. To open the inbox, press + at the top right of the window, then choose
More tools, then Inbox.

[codex/README.md](codex/README.md) covers updating and running the `codex`
command from inside the app.

### omp

```sh
omp plugin marketplace add petekp/inbox
omp plugin install inbox@inbox-omp
```

The inbox starts working in the next omp session. `omp plugin list` shows it
as `inbox@inbox-omp`. It reads `.omp-plugin/marketplace.json`, which omp looks
for before the `.claude-plugin/` folder that Claude Code reads.

To update, run these, then restart omp:

```sh
omp plugin marketplace update inbox-omp
omp plugin upgrade inbox@inbox-omp
```

After each reply, the inbox makes two model calls, one to update the list and one to write the results. It uses
the first of these that your omp can run:

1. The model your `@inbox` role names.
2. The newest Sonnet from your providers, `anthropic` first.
3. Your `@smol` role.

To set `@inbox`, add it under `modelRoles` in omp's `config.yml`, then restart
omp:

```yaml
modelRoles:
  inbox: anthropic/claude-sonnet-5-5
```

Only Sonnet is tested. Another model may work, but nobody has checked how well.

Your provider bills each call at that model's rate.

If `@inbox` is unset, or names a model omp cannot use, such as an unknown model
or one you are not signed in to, the inbox uses the next choice. The panel's
footer shows the model it uses. A model that omp can use but that fails when
called does not fall through: that update fails, and the next reply retries it.
Without a usable model, the footer says "no inbox model: set @inbox" and the
inbox cannot update.

### For all

The PRs tab needs the GitHub CLI, `gh`, signed in.

## Using it

Type `/inbox` in Claude Code or omp, or open the Inbox tab in the ChatGPT app. The
inbox has four tabs.

### Overview

A guide to the session's work. It says what the session is doing, how it is
going, what changed since you last looked, and what is next. When you step away
and come back, it is the page to read first.

After each reply, a second model call rewrites the page from the exchange and
the agent's own task list. It keeps a direction line until the work changes
direction. It shows the work, a pointer to what waits on you in Needs you, what
works now, what is still open and what is next. It is not a log: it lists no
events, and it leaves out what you have already seen.

### Needs you

Questions the agent asked you, and tasks only you can do.

The agent doesn't have to do anything special to put a question here. After
each reply, a model reads what the agent wrote and records each question in
it, with its possible answers. The agent's recommended answer comes first.
Press an answer and it goes to the agent as your message. You can also type
your own reply, or press Explain to have the agent say more before you decide.

When a question is a design choice, such as two layouts or two ways to build a
feature, Compare has the agent try each answer against your
code and reply with a table of how they differ. For a visual
choice it also makes a page that shows them side by side, which opens from the
question. Where the agent can run a subagent in the background, the
comparison runs there, so you can keep working. The question reads
"Comparing…" until the agent reports back. After 30 minutes with no report, it
reads "No comparison came back", and you can press Compare again.

A task is something like signing in or adding an API key. It comes with
buttons for its steps, such as copying a command or opening a file. In Claude
Code, running the command with `!` closes the task once it succeeds.

### Findings

Bugs, risks and ideas the agent noticed outside the task it's working on. The
agent records them and carries on with its task, and you decide later which
ones to act on. Fix on an issue, or Do it on an idea, hands it to the agent.
File issue has the agent file it in your issue tracker, such as Linear or
GitHub, or link the issue that already covers it. Reply sends your own words
about it. Explain has the agent say why it matters and what fixing it would
involve, without acting. Discuss talks it through, and Dismiss drops it.

### PRs

Pull requests from this session and your current branch. Each one is marked
Blocked, Ready or Waiting, and lists what blocks it: review comments waiting
on you, failing checks and merge conflicts. Buttons hand the work to the
agent: address one review comment or all of them, draft a reply, fix a
failing check, resolve conflicts, or merge.

### It keeps itself up to date

When you answer a question in your own message, a task gets done, or the
agent fixes a finding, the inbox closes the item. Closed items fold away under
the open ones, each with how it ended.

The agent reads the inbox too. Beside each of your prompts, it sees what's
still open and what you answered, even after the conversation is compacted.

Every press shows what it did right away. Discuss reads "Discussing…" until
the agent replies, then "✓ Discussed".

### In each app

- **Terminal:** each action shows the letter that runs it. `1` to `4`
  switch tabs, and `j` and `k` move up and down. ctrl+x tab moves focus from
  the prompt to the line above it, then to the panel, then back to the prompt.
- **Claude desktop app:** you click. Type `/inbox` to open the pane.
- **ChatGPT app:** you click, or press the same keys as in the terminal. The
  tab shows no letters.
- **omp:** `/inbox` opens the panel over the conversation, and esc closes it.
  Each action shows the letter that runs it, and Reply is `r`. Arrow keys move
  between rows and between a row's buttons, and enter presses the focused
  button. Tab, or `1` to `4`, switch tabs.

In Claude Code, a line above your prompt counts what needs you and the
findings waiting, with a button that opens the panel. When Claude stops on an
error, a second line says why, with a Resume button after an API error. The
ChatGPT app has no such line. omp has a line with the same counts. It says
`/inbox` opens the panel, and it has no stop line.

Inside a Herdr pane, Claude Code, omp and the Codex CLI also report to Herdr's
sidebar, as pane tokens:

| Token | Holds |
|---|---|
| `inbox` | What waits on you, in one line |
| `inbox-needs-you`, `inbox-findings`, `inbox-prs` | The tab's symbol and count, such as `🙋 2`. Empty when the tab has nothing waiting. |
| `inbox-stop` | Why the agent stopped |

To show the counts in each tab's color, add this row to `rows` under
`[ui.sidebar.agents]` in Herdr's config:

```toml
[
  { token = "$inbox-stop", fg = "#ffa3b0" },
  { token = "$inbox-needs-you", fg = "#ffc107" },
  { token = "$inbox-findings", fg = "#cab0ff" },
  { token = "$inbox-prs", fg = "#8cc8c0" },
],
```

Herdr puts ` · ` between the tokens that have a value, and leaves the line out
when none has one.

To see every part with sample items in Claude Code, run `/inbox demo`. Presses
on them change only the samples and send nothing. Press Hide demo, or run the
command again, to go back to your own items. `/inbox demo recording` shows the
same samples without the notices that mark them, for recording a video. Run
`/inbox demo` to end it.

## Cost

In Claude Code, the inbox adds two things:

| What the inbox adds | Tokens | Cost at API prices |
|---|---|---|
| A Sonnet call after each of Claude's replies, to update the inbox | 3–4k in, about 2k of it cached. 100–250 out. | About 0.5¢ per reply, or 1¢ after 5 idle minutes |
| A second Sonnet call, to write the results | About 1.2k in and 14–44 out on a short exchange (three eval runs: 1,175–1,214 in). A catch-up over a conversation reads more: 1,358 in and 100 out in the one run. | Less than the first call, which reads about 3k in |
| Its instructions and tools, sent with every request Claude makes | About 1,350, cached | Under 0.1¢ per request |

On a Claude plan, these count toward your usage limits.

In Codex, the update after each reply runs through the `codex` binary inside
the desktop app, with your Codex sign-in. It makes two calls per reply. Each
carries about 12,000 input tokens of base instructions, which every
`codex exec` call includes, plus its own prompt. The earlier single call came
to about 16,000. It counts toward your plan's usage.

## What it runs, sends and changes

This covers the Claude Code mod. [codex/README.md](codex/README.md) covers
the Codex plugin. The omp extension runs the same `gh` queries. Its update
request goes through omp's own connection to the provider of the model it
uses, and holds the same things as the Claude Code request.

**What leaves your machine.** Three things, and nothing else:

- After each of Claude's replies, the inbox sends two Sonnet requests to
  Anthropic through Claude Code's own model connection. Both hold your last
  prompt, Claude's reply, the inbox's open items, and a line for each tool
  Claude ran. A tool line reads like `ran: npm test` or
  `edited src/app.ts`. [Cost](#cost) gives the request's size.
- When the inbox may have missed a turn, it asks the same model, with the same two calls, to update it
  from the whole conversation. It forks the conversation for this, or reads
  the transcript after a resume.
- To fill the PRs tab, it runs read-only `gh` queries: `gh pr view`, and
  `gh api graphql` for review threads. They reach GitHub under your own `gh`
  sign-in. The inbox never reads your GitHub token.

**Programs it starts.**

| Program | When |
|---|---|
| `gh` | To fill the PRs tab |
| `open` | When you press a button that opens a link, file or folder |
| `test -x` | Before opening a file. An executable file is shown in Finder, not run. |
| `herdr pane report-metadata` | Only inside a Herdr pane, to show what waits on you and each tab's count in Herdr's sidebar |

**Messages it sends as you.** When you press an answer or action button, the
inbox sends Claude a message in your name. The message is the answer you
chose, or a request about the item, such as asking Claude to fix a finding.
Resume, on a stopped turn, sends `Continue`. Every message it sends starts
from a press. When you mark a task Done that Claude is waiting on, the inbox
tells Claude a few seconds later, or once Claude's running turn ends.

**What it adds to Claude's context.**

- Its instructions, about 1,350 tokens, in every request.
- A note beside your prompt when you answer one of Claude's numbered
  questions, or when the inbox changed since Claude last saw it.
- Its open items after the conversation is compacted, so Claude keeps them.

**What its hooks see.**

- Tool calls. The inbox reads each call to write the tool lines above, to
  show a question while Claude's question dialog is open, and to find a PR
  this session opens with `gh pr create`. It passes every call on unchanged,
  except calls to its own two tools. `record` saves a question, a task or a
  finding and `close` closes an item. The inbox answers these itself, so they run
  without a permission prompt.
- Permission prompts. While Claude Code asks you to approve a tool call, the
  inbox shows a row for it, then passes the request on unchanged. It never
  approves or denies a permission prompt.
- Tool descriptions. It lists its own two tools to Claude up front, instead
  of behind tool search. It leaves other tools' descriptions alone.
- Shell commands you run with `!`, and their output. A command that runs
  with nothing on stderr closes a task that asked you to run it.
- Session starts. After `/clear`, a resume or a fork, the inbox loads that
  conversation's items. It passes the event on unchanged.
- Your theme setting, to match its colors.

**What it keeps.** The inbox saves each session's items, and the PRs it
tracks, in Claude Code's plugin storage on this machine. It keeps the 40
most recent sessions and deletes older ones. An item can summarize part of
the conversation, so it may name the people in it. Nothing goes to the
plugin's author.

It also adds the `/inbox` command.

## Developing

Read [AGENTS.md](AGENTS.md) first. [docs/looks.md](docs/looks.md) says which
file owns each rule and where the four looks differ on purpose.

Run the mod from a clone:

```sh
claude --plugin-dir /path/to/inbox
```

The session reloads the mod when you change one of its files.

The Codex plugin shares the rules in `hooks/` with the mod. Rebuild its
bundles after changing either:

```sh
npm --prefix codex ci         # once
npm --prefix codex run build
```

[codex/README.md](codex/README.md) covers trying a build in Codex.

The omp extension in `omp/` shares the rules in `hooks/` too. It runs on Bun,
and omp installs it from a bundle, so rebuild the bundle after changing
`omp/src` or the shared modules:

```sh
bun install --cwd omp --frozen-lockfile --ignore-scripts   # once
npm --prefix omp run build
```

Bun's bundler writes different output in different Bun versions. So the build
runs the Bun version that `omp/package.json` pins, whichever Bun starts it, and
the install above puts that Bun in `omp/node_modules`. The pin covers macOS on
Apple silicon only. On another platform, add the matching `@oven/bun-*` package
at the same version to the `devDependencies` in `omp/package.json`, or build
with that Bun version installed.

Try a build in omp with a fresh `HOME`, so it cannot touch your own omp
settings or inbox: `env HOME=/path/to/empty/folder omp -e omp/src/host.ts`.

`./scripts/check.sh` runs Prettier, `claude plugin validate`, a type check and
the tests, and checks the Codex bundles and the omp bundle are current. The type check needs the
types Claude Code writes to `.claude-plugin/types/` the first time it loads
the mod.
