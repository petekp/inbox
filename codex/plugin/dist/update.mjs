// Built by codex/build.mjs from codex/src and hooks/. Do not edit.

// src/update-main.ts
import { dirname as dirname2 } from "node:path";
import { fileURLToPath } from "node:url";

// src/state.ts
import { mkdir, readFile, rename, rmdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// ../hooks/ledger.ts
var EMPTY = {
  card: null,
  items: [],
  closed: [],
  findings: [],
  closedFindings: [],
  prs: [],
  nextId: 1,
  turn: 0,
  batchTurn: 0
};
var NL = "\n";
var MAX_OPEN = 20;
var STALE_AFTER = 12;
var MAX_CLOSED = 12;
var EXPIRED = "expired, unanswered";
var MAX_HELPS = 3;
var MODEL_KIND = { question: "decide", task: "do" };
function readKind(kind) {
  return kind === "task" || kind === "do" ? "task" : "question";
}
function upgradeLedger(ledger) {
  const { notes, decided, ...rest } = ledger;
  return {
    ...rest,
    findings: [...rest.findings ?? [], ...notes ?? []],
    // reopenFinding puts these back, so a conversion added for findings must run on them too.
    closedFindings: rest.closedFindings ?? [],
    items: rest.items.map(upgradeItem),
    closed: (rest.closed ?? decided ?? []).map((d) => ({
      ...d,
      kind: readKind(d.kind),
      how: d.how ?? howFromOutcome(d.outcome),
      ...d.item ? { item: upgradeItem(d.item) } : {}
    }))
  };
}
function upgradeItem(item) {
  return { ...item, kind: readKind(item.kind), at: item.at ?? null, rec: recommendedOption(item.options, item.rec) };
}
function words(text) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
function recommendedOption(options, rec) {
  if (!rec) return null;
  const named = new Set(words(rec));
  let best = null;
  for (const option of options) {
    const w = words(option);
    if (w.length > words(best ?? "").length && w.every((x) => named.has(x))) best = option;
  }
  return best;
}
function howFromOutcome(outcome) {
  if (outcome === "dismissed") return "dismissed";
  if (outcome === EXPIRED) return "expired";
  if (outcome === "done" || outcome === "you ran it") return "done";
  if (outcome.startsWith(CLOSED_BY_CLAUDE)) return "claude";
  return "update";
}
var NEEDS_PERSON = /\b(login|logout|auth|signin|sign-in|sudo|passwd|ssh-add|ssh-keygen|configure|init --interactive)\b/i;
function systemText(host) {
  const band = host.band ? ` They always see the items in <open> in ${host.band}.` : "";
  return `You keep a short ledger for a person who works with a coding agent across many parallel sessions. They glance at your ledger between tasks, or after time away, to see where this session stands. You read one exchange and update the ledger.

Input:
- <card>: the ledger before this exchange (may be empty)
- <open>: items still waiting on the person, each with an id
- <findings>: findings the agent recorded for the person to review later, outside the current task, each with an id
- <decided>: items the person already settled, and how. Never add one of these again as NEW, even when the reply asks it again.
- <person>: what the person just sent, and the commands they ran themselves: "$ cmd" for a shell command, with its output, and "/name" for a slash command
- <activity>: what the agent did this turn (files edited, commands, URLs)
- <reply>: the agent's final reply
- <screen>: what the person has on screen besides the conversation.${band}

Answer with lines only, each starting with one of these keys. No other text.

GOAL: what this session is for, at most 12 words. Keep the previous goal unless the person clearly changed direction. "-" until the person has asked for something.
DONE: one finished outcome, at most 8 words. Up to 4 DONE lines, oldest first, keeping the most recent. Outcomes, not activity: "PR #12 opened", not "ran gh".
NOW: where the work stands at the end of this reply, at most 12 words. Name what it waits on, if anything. "-" when no work has started.
RUNNING: something still running that the person may open, as "name: URL or port". Dev servers, simulators, background jobs. Omit anything the agent stopped. Zero or more lines.
CLOSED: <id> | what was decided, at most 8 words. For each item in <open> the person answered in <person> (including "all recommended", "go", "yes to all", numbered answers), or that the reply or <activity> shows is done or no longer applies. A person asking what an item means has not answered it, and a reply explaining it does not close it. When <person> asks to run an item's command and the reply says it ran, that item is done. So is an item whose command the person ran themselves, per <person>, when its output shows it worked. Also one line for each finding in <findings> that the reply or <activity> shows was fixed, or that the person dealt with or set aside.
NEW: <kind> | <label> | <ask> | <options> | <rec>
  One line per thing in <reply> that waits on the person and is not already in <open> or <findings>. A finding the agent recorded is not NEW unless the reply asks the person to decide on it now. When the reply restates, rewords or narrows an item in <open>, it is not new: add HELP lines to that item's id instead.
  kind: "decide" (a choice, approval, or information only the person has, explicitly put to them, without which the agent cannot go on with its task) or "do" (an action only the person can take, without which the agent cannot continue or finish: sign in, run a command needing their password, test on their device, reply to a teammate).
  label: the reply's own number or id for it ("1", "D3"), or "-".
  ask: plain words, readable without the reply, at most 12 words, or up to 16 when 12 would lose meaning. Keep the question's meaning and every alternative it names. Replace any term the reply coined with what it means.
  options: the answers the person can pick, separated by " / ", at most 5 words each; "-" for kind "do". For kind "decide", always at least one, so one press can answer. Use the choices the reply offers, plus the answer it recommends when that is not one of them. When the reply offers none, predict the answers the person would most likely give: the yes and the no for an approval or a yes-or-no question ("Approve / Not yet"); the 1 to 3 likeliest answers to an open question, from the conversation; or, when the conversation suggests no answer, what the person would most likely ask the agent to do instead ("List the choices", "Pick one for me").
  rec: the option the reply states it recommends for this question ("I'd go with X", "I recommend X"), copied from options, or "-" when it states none for this question.
  Skip: rhetorical questions; offers to continue ("Want me to start?") when continuing is the obvious default; FYIs; generic "let me know"; invitations to look at, try or check finished work ("Open X to see it", "reload to check") unless the agent waits on the person's verdict before going on; optional suggestions; anything the person already has on screen, per <screen>; questions asking the person to describe what they saw, did or meant, even when the answer would help diagnose a problem ("What happens when you click it?", "Which file did you mean?"). The person answers those by replying.
HELP: <item> | <kind> | <value> | <name>
  A step that does part of an item's work in one press, when the reply or activity already spells it out: the file to edit, the text to paste, the command to run, the page to visit. Not background reading. Up to 3 per item, most useful first.
  item: "new N" for the Nth NEW line in your answer, or an id from <open>.
  kind and value:
    open | a file or folder the person needs to open or edit, the path as written
    copy | text for the person to paste into a file or form, never a command: "block N" for the code block marked [block N] in <reply>, or one line of text
    run | a shell command the reply asks the person to run or approve: "block N" or the command
    link | an https URL the person needs to visit
  name: what a copy, command or link is, at most 3 words ("settings snippet", "removal command", "token page"), or "-".
  Use only paths, commands, text and URLs that appear in <reply> or <activity>. Never invent one.

Write plainly. No jargon, no filler, no markdown.`;
}
var FENCE = /```[^\n]*\n([\s\S]*?)```/g;
function codeBlocks(reply) {
  return [...reply.matchAll(FENCE)].map((m) => (m[1] ?? "").replace(/\n$/, ""));
}
function numberBlocks(reply) {
  let n = 0;
  return reply.replace(FENCE, (block) => `[block ${n += 1}]${NL}${block}`);
}
function readHelp(kind, value, name, blocks, source) {
  const isQuoted = (text) => source === null || source.includes(text);
  const block = value.match(/^block\s+(\d+)$/i);
  const quoted = block ? blocks[Number(block[1]) - 1] ?? "" : value.replace(/^`|`$/g, "");
  const isFromReply = (text) => block !== null || isQuoted(text);
  if (kind === "open") {
    const path = value.replace(/^`|`$/g, "");
    return path !== "" && path.length <= 300 && !/^[a-z]+:/i.test(path) && isQuoted(path) ? { kind, path } : null;
  }
  if (kind === "copy") {
    return quoted.trim() !== "" && quoted.length <= 8e3 && isFromReply(quoted) ? { kind, text: quoted, name } : null;
  }
  if (kind === "run") {
    const command = commandText(quoted);
    const isUsable = command !== "" && command.length <= 4e3 && isFromReply(command);
    return isUsable ? { kind: NEEDS_PERSON.test(command) ? "terminal" : "run", command, name } : null;
  }
  if (kind === "link") {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && isQuoted(value) ? { kind, url: url.href, name } : null;
    } catch {
      return null;
    }
  }
  return null;
}
function commandText(text) {
  return text.trim().replace(/^!\s*/, "");
}
function commandOf(help) {
  if (isCommand(help)) return help.command;
  if (help.kind === "copy") return commandText(help.text);
  return null;
}
function isCommand(help) {
  return help.kind === "run" || help.kind === "terminal";
}
function helpTarget(help) {
  if (help.kind === "open") return `open ${help.path}`;
  if (help.kind === "link") return `link ${help.url}`;
  return `command ${commandOf(help)}`;
}
function withHelp(helps, help) {
  const command = commandOf(help);
  const kept = isCommand(help) ? helps.filter((h) => h.kind !== "copy" || commandOf(h) !== command) : helps;
  const isCovered = kept.some((h) => helpTarget(h) === helpTarget(help));
  return isCovered || kept.length >= MAX_HELPS ? kept : [...kept, help];
}
function clip(text, max) {
  return text.length <= max ? text : text.slice(0, max) + " \u2026[cut]";
}
function ledgerBlocks(ledger) {
  const card = ledger.card ? [
    `GOAL: ${ledger.card.goal}`,
    ...ledger.card.done.map((d) => `DONE: ${d}`),
    `NOW: ${ledger.card.now}`,
    ...ledger.card.running.map((r) => `RUNNING: ${r}`)
  ].join(NL) : "";
  const open = ledger.items.map((i) => `${i.id} | ${MODEL_KIND[i.kind]} | ${i.label ?? "-"} | ${i.ask}`).join(NL);
  const findings = ledger.findings.map((f) => `${f.id} | ${f.kind}: ${f.title}`).join(NL);
  const closed = ledger.closed.filter((d) => d.how !== "expired").slice(-8).map((d) => `${d.ask} \u2192 ${outcomeText(d)}`).join(NL);
  return [
    `<card>${NL}${card}${NL}</card>`,
    `<open>${NL}${open}${NL}</open>`,
    `<findings>${NL}${findings}${NL}</findings>`,
    `<decided>${NL}${closed}${NL}</decided>`
  ];
}
function buildPrompt(ledger, ex) {
  const person = ex.person ?? `(The person sent nothing. The turn was started by: ${ex.trigger ?? "unknown"}.)`;
  return [
    ...ledgerBlocks(ledger),
    `<person>${NL}${clip(person, 4e3)}${NL}</person>`,
    `<activity>${NL}${clip(ex.activity.join(NL), 2500)}${NL}</activity>`,
    `<reply>${NL}${clip(numberBlocks(ex.reply), 12e3)}${NL}</reply>`,
    `<screen>${NL}${ex.screen}${NL}</screen>`
  ].join(NL);
}
function dash(value) {
  const v = (value ?? "").trim();
  return v === "" || v === "-" ? null : v;
}
function parseReply(text, source = null) {
  const blocks = source === null ? [] : codeBlocks(source);
  const card = { goal: "", done: [], now: "", running: [] };
  const closed = [];
  const added = [];
  const helped = [];
  const helps = [];
  let seen = 0;
  for (const raw of text.split(NL)) {
    const m = raw.match(/^\s*[-*]?\s*(GOAL|DONE|NOW|RUNNING|CLOSED|NEW|HELP)\s*:\s*(.*)$/);
    if (!m) continue;
    seen += 1;
    const key = m[1];
    const value = dash(m[2]) ?? "";
    if (key === "GOAL") card.goal = value;
    else if (key === "NOW") card.now = value;
    else if (key === "DONE" && value) card.done.push(value);
    else if (key === "RUNNING" && value) card.running.push(value);
    else if (key === "CLOSED") {
      const [id, outcome] = value.split("|").map((s) => s.trim());
      if (id) closed.push({ id, outcome: outcome ?? "" });
    } else if (key === "NEW") {
      const [kind, label, ask, ...rest] = value.split("|").map(dash);
      const rec = rest.length > 1 ? rest.pop() : null;
      if (!ask) continue;
      const options = rest.flatMap((o) => o?.split(/\s+\/\s+/) ?? []).filter(Boolean);
      added.push({
        kind: readKind(kind),
        label: label ?? null,
        ask,
        options,
        rec: recommendedOption(options, rec ?? null),
        helps: []
      });
    } else if (key === "HELP") {
      const [target, kind, help, name] = value.split("|").map((s) => s.trim());
      const parsed = readHelp(kind ?? "", help ?? "", dash(name), blocks, source);
      if (parsed && target) helps.push({ target, help: parsed });
    }
  }
  for (const { target, help } of helps) {
    const n = target.match(/\bnew\s*(\d+)\b/i);
    const id = target.match(/\b(i\d+)\b/)?.[1];
    const item = n ? added[Number(n[1]) - 1] : void 0;
    if (item) item.helps = withHelp(item.helps, help);
    else if (!n && id) helped.push({ id, help });
  }
  return seen === 0 ? null : { card: { ...card, done: card.done.slice(-4) }, closed, added, helped };
}
var FILLER = /* @__PURE__ */ new Set([
  "the",
  "and",
  "for",
  "with",
  "use",
  "into",
  "from",
  "that",
  "this",
  "your",
  "you",
  "should",
  "make",
  "add",
  "all"
]);
function keyWords(text) {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2 && !FILLER.has(w)));
}
function restates(a, b) {
  const x = keyWords(a);
  const y = keyWords(b);
  const fewer = Math.min(x.size, y.size);
  const shared = [...x].filter((w) => y.has(w)).length;
  return fewer >= 2 ? shared / fewer >= 0.7 : sameAsk(a, b);
}
function sameAsk(a, b) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return norm(a) === norm(b);
}
function matchOpen(items, a) {
  return items.findIndex(
    (i) => i.id === a.label || sameAsk(i.ask, a.ask) || i.kind === a.kind && restates(i.ask, a.ask)
  );
}
function repeatsRecentlyClosed(closed, a, since) {
  const recent = closed.filter((c) => c.at >= since);
  return matchOpen(recent, a) >= 0 || a.label !== null && recent.some((c) => c.label === a.label);
}
function closedRecord(item, closing, now) {
  const { id, kind, ask, label } = item;
  return { id, kind, ask, ...label ? { label } : {}, ...closing, at: now, item };
}
function closedFindingRecord(finding, closing, now) {
  return { ...finding, ...closing, closedAt: now };
}
var CLOSED_BY_CLAUDE = "closed by Claude";
function applyUpdate(ledger, u, now, turn, promptAt = now) {
  const prev = ledger.card;
  const card = {
    goal: u.card.goal || prev?.goal || "",
    done: u.card.done.length > 0 ? u.card.done : prev?.done ?? [],
    now: u.card.now || prev?.now || "",
    running: u.card.running,
    updatedAt: now
  };
  const closing = new Map(u.closed.map((c) => [c.id, c.outcome]));
  const closed = [...ledger.closed];
  const items = [];
  for (const item of ledger.items) {
    const outcome = closing.get(item.id);
    const helps = u.helped.filter((h) => h.id === item.id).reduce((all, h) => withHelp(all, h.help), item.helps);
    if (outcome === void 0) items.push({ ...item, helps });
    else closed.push(closedRecord(item, { outcome, how: "update" }, now));
  }
  let nextId = ledger.nextId;
  let added = 0;
  for (const a of u.added) {
    if (repeatsRecentlyClosed(ledger.closed, a, promptAt)) continue;
    const at = matchOpen(items, a);
    const restated = items[at];
    if (restated) {
      items[at] = { ...restated, helps: a.helps.reduce((all, h) => withHelp(all, h), restated.helps) };
      continue;
    }
    items.push({ ...a, id: `i${nextId}`, turn, at: now });
    nextId += 1;
    added += 1;
  }
  const kept = items.filter((i) => turn - i.turn <= STALE_AFTER).slice(-MAX_OPEN);
  for (const i of items) if (!kept.includes(i)) closed.push(closedRecord(i, { outcome: EXPIRED, how: "expired" }, now));
  return {
    ...ledger,
    card,
    items: kept,
    closed: closed.slice(-MAX_CLOSED),
    findings: ledger.findings.filter((f) => !closing.has(f.id)),
    closedFindings: [
      ...ledger.closedFindings,
      ...ledger.findings.flatMap((f) => {
        const outcome = closing.get(f.id);
        return outcome === void 0 ? [] : [closedFindingRecord(f, { outcome, how: "update" }, now)];
      })
    ].slice(-MAX_CLOSED),
    nextId,
    batchTurn: added > 0 ? turn : ledger.batchTurn
  };
}
function outcomeText(d) {
  if (d.how === "dismissed") return "dismissed by the user";
  if (d.how === "expired") return "expired before the user answered";
  return d.outcome;
}
var TOLD_NOTHING = { inbox: null, closed: [] };

// src/state.ts
function emptyState(sessionId) {
  return {
    version: 1,
    sessionId,
    root: "",
    home: homedir(),
    cliPath: null,
    ledger: EMPTY,
    turn: { person: null, activity: [], press: null },
    told: TOLD_NOTHING,
    presence: { turnsStarted: 0, turnsApplied: 0, ledgerState: "current", isUpdating: false },
    pending: [],
    sent: [],
    lastActions: {},
    tabSeenAt: 0
  };
}
function dataDir(env, pluginRoot) {
  const fromEnv = env.INBOX_DATA || env.PLUGIN_DATA;
  if (fromEnv) return fromEnv;
  const m = pluginRoot.match(/^(.*)\/plugins\/cache\/([^/]+)\/([^/]+)\/[^/]+$/);
  if (m) return `${m[1]}/plugins/data/${m[3]}-${m[2]}`;
  return join(homedir(), ".codex", "inbox-dev");
}
function fileName(sessionId) {
  if (!/^[\w-]{1,100}$/.test(sessionId)) throw new Error(`Not a session id: ${sessionId}`);
  return sessionId;
}
function statePath(dir, sessionId) {
  return join(dir, "sessions", `${fileName(sessionId)}.json`);
}
function upgraded(saved, sessionId) {
  const base = emptyState(sessionId);
  const { checks: _checks, snapshots: _snapshots, recordedRuns: _runs, top: _top, ...kept } = saved;
  const { sentBack: _sentBack, ...turn } = saved.turn ?? {};
  return {
    ...base,
    ...kept,
    // The ledger's shape is the mod's, so a saved one converts the way the mod's does. It converts
    // before the defaults fill in, since an empty `closed` would hide an old `decided`.
    ledger: saved.ledger ? { ...base.ledger, ...upgradeLedger({ ...saved.ledger, items: saved.ledger.items ?? [] }) } : base.ledger,
    turn: { ...base.turn, ...turn },
    told: { ...base.told, ...saved.told },
    presence: { ...base.presence, ...saved.presence },
    pending: (saved.pending ?? []).map(({ ex: { checks: _exChecks, ...ex }, ...p }) => ({ ...p, ex }))
  };
}
async function readState(dir, sessionId) {
  const saved = await readFile(statePath(dir, sessionId), "utf8").catch((err) => {
    if (err.code === "ENOENT") return null;
    throw err;
  });
  return saved === null ? emptyState(sessionId) : upgraded(JSON.parse(saved), sessionId);
}
var LOCK_WAIT_MS = 1e4;
var LOCK_STALE_MS = 15e3;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function withLock(path, fn, waitMs = LOCK_WAIT_MS) {
  await mkdir(dirname(path), { recursive: true });
  const until = Date.now() + waitMs;
  for (; ; ) {
    try {
      await mkdir(path);
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      const age = await stat(path).then(
        (s) => Date.now() - s.mtimeMs,
        () => 0
      );
      if (age > LOCK_STALE_MS) await rmdir(path).catch(() => void 0);
      else if (Date.now() > until) throw new Error(`Timed out waiting for ${path}`);
      else await sleep(15);
    }
  }
  try {
    return await fn();
  } finally {
    await rmdir(path).catch(() => void 0);
  }
}
async function updateState(dir, sessionId, change) {
  const path = statePath(dir, sessionId);
  return withLock(`${path}.lock`, async () => {
    const current = await readState(dir, sessionId).catch(async () => {
      await rename(path, `${path}.unreadable-${Date.now()}`);
      return emptyState(sessionId);
    });
    const next = await change(current);
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(next));
    await rename(tmp, path);
    return next;
  });
}

// src/run.ts
import { execFile } from "node:child_process";
var run = (args, { cwd, stdin, timeoutMs }) => new Promise((resolve) => {
  const [file = "", ...rest] = args;
  const child = execFile(
    file,
    rest,
    { cwd, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" },
    (err, stdout, stderr) => {
      const code = err ? typeof err.code === "number" ? err.code : -1 : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    }
  );
  if (stdin !== void 0) child.stdin?.end(stdin);
  else child.stdin?.end();
});

// src/update.ts
import { randomUUID } from "node:crypto";
import { mkdir as mkdir2, readFile as readFile2, rm, writeFile as writeFile2 } from "node:fs/promises";
import { join as join2 } from "node:path";

// src/texts.ts
var CODEX = {
  agent: "Codex",
  surface: "the Inbox tab",
  band: null,
  findingsIn: "the Findings section of the Inbox tab"
};

// src/update.ts
var MODEL = "gpt-6.1-sol";
var TIMEOUT_MS = 12e4;
var OFF = [
  "shell_tool",
  "unified_exec",
  "code_mode_host",
  "apps",
  "plugins",
  "memories",
  "multi_agent",
  "image_generation",
  "browser_use",
  "computer_use",
  "tool_suggest",
  "skill_search",
  "view_image",
  "goals",
  "sleep_tool",
  "personality"
];
function codexAsk(exec, cli, dir, model = MODEL) {
  return async (prompt) => {
    const work = join2(dir, "exec");
    const system = join2(dir, "inbox-system.md");
    const out = join2(work, `reply-${randomUUID()}.txt`);
    await mkdir2(work, { recursive: true });
    const instructions = systemText(CODEX);
    if (await readFile2(system, "utf8").catch(() => "") !== instructions) await writeFile2(system, instructions);
    let off = [...OFF];
    for (let tries = 0; tries <= OFF.length; tries += 1) {
      await rm(out, { force: true });
      const r = await exec(
        [
          cli,
          "exec",
          "--ephemeral",
          "--ignore-user-config",
          "--ignore-rules",
          "--skip-git-repo-check",
          "-s",
          "read-only",
          "-C",
          work,
          "-m",
          model,
          "-c",
          'model_reasoning_effort="low"',
          "-c",
          `model_instructions_file=${JSON.stringify(system)}`,
          "-c",
          "project_doc_max_bytes=0",
          ...off.flatMap((f) => ["--disable", f]),
          "-o",
          out,
          prompt
        ],
        { cwd: work, timeoutMs: TIMEOUT_MS }
      );
      const unknown = r.stderr.match(/Unknown feature flag: (\S+)/)?.[1];
      if (r.code !== 0 && unknown && off.includes(unknown)) {
        off = off.filter((f) => f !== unknown);
        continue;
      }
      if (r.code !== 0) return null;
      const text = await readFile2(out, "utf8").catch(() => null);
      await rm(out, { force: true });
      return text;
    }
    return null;
  };
}
function applied(s, reply, now, promptAt) {
  const next = s.pending[0];
  if (!next) return s;
  const { ex } = next;
  const parsed = reply === null ? null : parseReply(reply, [ex.reply, ...ex.activity].join("\n"));
  const explained = ex.press?.action === "explain" ? ex.press.id : null;
  const ledger = parsed ? applyUpdate(
    s.ledger,
    { ...parsed, closed: parsed.closed.filter((c) => c.id !== explained) },
    now,
    ex.turn,
    promptAt
  ) : s.ledger;
  return {
    ...s,
    ledger,
    pending: s.pending.slice(1),
    presence: {
      ...s.presence,
      ledgerState: parsed ? "current" : "failed",
      // A failed turn counts as summarized too: with no catch-up yet, a task
      // handed to Codex would otherwise stay folded for good.
      turnsApplied: Math.max(s.presence.turnsApplied, next.turnsStarted)
    }
  };
}
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
async function takeUpdateLock(path) {
  for (let tries = 0; tries < 2; tries += 1) {
    try {
      await mkdir2(path);
      await writeFile2(join2(path, "pid"), String(process.pid));
      return true;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      const pid = Number(await readFile2(join2(path, "pid"), "utf8").catch(() => ""));
      if (!pid || isAlive(pid)) return false;
      await rm(path, { recursive: true, force: true });
    }
  }
  return false;
}
async function runUpdates(dir, sessionId, ask, now) {
  const lock = `${statePath(dir, sessionId)}.updating`;
  while ((await readState(dir, sessionId)).pending.length > 0) {
    if (!await takeUpdateLock(lock)) return;
    try {
      for (; ; ) {
        const s = await updateState(dir, sessionId, (x) => ({
          ...x,
          presence: { ...x.presence, isUpdating: x.pending.length > 0 }
        }));
        const next = s.pending[0];
        if (!next) break;
        const promptAt = now();
        const reply = await ask(buildPrompt(s.ledger, next.ex)).catch(() => null);
        await updateState(
          dir,
          sessionId,
          (x) => (
            // A cleared conversation dropped the exchange while the model ran.
            x.pending[0]?.turnsStarted === next.turnsStarted && x.pending[0].ex.turn === next.ex.turn ? applied(x, reply, now(), promptAt) : x
          )
        );
      }
    } finally {
      await updateState(dir, sessionId, (x) => ({ ...x, presence: { ...x.presence, isUpdating: false } }));
      await rm(lock, { recursive: true, force: true });
    }
  }
}

// src/update-main.ts
async function main() {
  const sessionId = process.argv[2] ?? "";
  const dir = dataDir(process.env, dirname2(dirname2(fileURLToPath(import.meta.url))));
  const { cliPath } = await readState(dir, sessionId);
  await runUpdates(dir, sessionId, codexAsk(run, cliPath ?? "codex", dir), Date.now);
}
main().catch(() => process.exit(0));
