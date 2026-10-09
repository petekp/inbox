// Built by codex/build.mjs from codex/src and hooks/. Do not edit.

// src/hook-main.ts
import { dirname as dirname2, join as join2 } from "node:path";
import { fileURLToPath } from "node:url";

// src/hook.ts
import { spawn } from "node:child_process";
import { resolve } from "node:path";

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
var EXPIRED = "expired, unanswered";
function readKind(kind) {
  return kind === "task" || kind === "do" ? "task" : "question";
}
function upgradeLedger(ledger) {
  const { notes, decided, ...rest } = ledger;
  return {
    ...rest,
    findings: [...rest.findings ?? [], ...notes ?? []],
    closedFindings: rest.closedFindings ?? [],
    items: rest.items.map((i) => ({
      ...i,
      kind: readKind(i.kind),
      at: i.at ?? null,
      rec: recommendedOption(i.options, i.rec)
    })),
    closed: (rest.closed ?? decided ?? []).map((d) => ({
      ...d,
      kind: readKind(d.kind),
      how: d.how ?? howFromOutcome(d.outcome)
    }))
  };
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
function toolActivity(tool, input) {
  const text = (key) => typeof input[key] === "string" ? input[key] : "";
  switch (tool) {
    case "Bash":
      return `${input.run_in_background ? "started in background" : "ran"}: ${text("command").slice(0, 140)}`;
    case "Edit":
    case "Write":
      return `edited ${text("file_path")}`;
    case "Skill":
      return `used skill ${text("skill")}`;
    case "Agent":
      return `started agent: ${text("description")}`;
  }
  return tool.startsWith("mcp__") ? `called ${tool.slice(5)}` : null;
}
function surfaceAtStart(host) {
  return host.surface.charAt(0).toUpperCase() + host.surface.slice(1);
}
function screenText(host, isOpen, tab) {
  return isOpen ? `${surfaceAtStart(host)} is open beside the conversation, ${tab ? `on its ${tab} tab, ` : ""}listing every open item.` : `${surfaceAtStart(host)} is closed.`;
}
var CLOSED_BY_CLAUDE = "closed by Claude";
function latestBatch(ledger) {
  return ledger.batchTurn === 0 ? [] : ledger.items.filter((i) => i.turn === ledger.batchTurn);
}
function describe(item) {
  const parts = [`"${item.ask}"`];
  if (item.options.length > 0) parts.push(`options: ${item.options.join(" / ")}`);
  if (item.rec) parts.push(`recommended: ${item.rec}`);
  if (item.kind === "task") parts.push("an action for the user");
  return parts.join("; ");
}
function numberOf(label) {
  const m = label?.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}
function answerableBatch(ledger, promptTurn) {
  return ledger.batchTurn === promptTurn - 1 ? latestBatch(ledger) : [];
}
function batchNumbers(batch) {
  const hasLabels = batch.some((i) => numberOf(i.label) !== null);
  const byNumber = /* @__PURE__ */ new Map();
  batch.forEach((item, at) => {
    const n = hasLabels ? numberOf(item.label) : at + 1;
    if (n !== null && !byNumber.has(n)) byNumber.set(n, item);
  });
  return byNumber;
}
var LINE_ANSWER = /(?:^|\n)\s*(?:[QqDd#]\s?)?(\d{1,2})\s*[.):\-–]\s*\S/g;
var INLINE_ANSWER = /\s(?:[QqDd#]\s?)?(\d{1,2})\s*[.)]\s+\S/g;
var ACCEPT_ALL = /^\s*(go|go ahead|yes|yep|yeah|sure|ok|okay|sgtm|lgtm|sounds good|do it|proceed|all good|ship it)\s*[.!]*\s*$/i;
var ACCEPT_RECS = /\b(all|both|everything|your)\b[^.\n]{0,40}\b(recommend\w*|recs?|suggest\w*|picks?|calls?)\b/i;
function answerNote(ledger, text) {
  const lines = [];
  const batch = answerableBatch(ledger, ledger.turn);
  if (batch.length > 0) {
    const numbers = /* @__PURE__ */ new Set();
    for (const m of text.matchAll(LINE_ANSWER)) numbers.add(Number(m[1]));
    if (/^\s*(?:[QqDd#]\s?)?\d{1,2}\s*[.):\-–]\s/.test(text)) {
      for (const m of text.matchAll(INLINE_ANSWER)) numbers.add(Number(m[1]));
    }
    const byNumber = batchNumbers(batch);
    for (const n of [...numbers].sort((a, b) => a - b)) {
      const item = byNumber.get(n);
      if (item) lines.push(`- ${n} \u2192 ${describe(item)}`);
    }
    if (lines.length === 0 && (ACCEPT_ALL.test(text) || ACCEPT_RECS.test(text))) {
      const withRecs = batch.filter((i) => i.rec);
      if (withRecs.length > 0) {
        return [
          "inbox: if the user is accepting your recommendations, these are the open ones:",
          ...withRecs.map((i) => `- ${i.label ?? "\u2022"} \u2192 ${describe(i)}`)
        ].join(NL);
      }
    }
  }
  return lines.length === 0 ? null : ["inbox: the user's message answers these open items from your earlier replies:", ...lines].join(NL);
}
function itemLine(item, withId) {
  return `- ${withId ? `[${item.id}] ` : ""}${item.label ? `(${item.label}) ` : ""}${describe(item)}`;
}
function findingLine(finding, withId) {
  return `- ${withId ? `[${finding.id}] ` : ""}${finding.kind}: ${finding.title}`;
}
function carryText(ledger, title, isOwn = false) {
  const findings = ledger.findings;
  if (!ledger.card && ledger.items.length === 0 && findings.length === 0) return null;
  const out = [title];
  if (ledger.card) {
    if (ledger.card.goal) out.push(`Goal: ${ledger.card.goal}`);
    if (ledger.card.done.length > 0) out.push(`Done: ${ledger.card.done.join("; ")}`);
    if (ledger.card.now) out.push(`Now: ${ledger.card.now}`);
    if (ledger.card.running.length > 0) out.push(`Running: ${ledger.card.running.join("; ")}`);
  }
  if (ledger.items.length > 0) {
    out.push("Waiting on the user:");
    for (const item of ledger.items) out.push(itemLine(item, isOwn));
  }
  if (findings.length > 0) {
    out.push(isOwn ? "Findings you recorded, still open:" : "Findings that session recorded, still open:");
    for (const f of findings) out.push(findingLine(f, isOwn));
  }
  if (ledger.closed.length > 0) {
    out.push("Recently closed:");
    for (const d of ledger.closed.slice(-6)) out.push(`- "${d.ask}" \u2192 ${outcomeText(d)}`);
  }
  return out.join(NL);
}
function inboxText(host, ledger, isOpen) {
  const out = ["inbox: what waits on the user, as of your last reply. Anything not listed here is closed."];
  if (ledger.items.length > 0) {
    out.push("Waiting on the user:");
    for (const item of ledger.items) out.push(itemLine(item, true));
  } else {
    out.push("Nothing is waiting on the user.");
  }
  if (ledger.findings.length > 0) {
    out.push("Findings you recorded, still open:");
    for (const f of ledger.findings) out.push(findingLine(f, true));
  }
  out.push(isOpen ? `The user has ${host.surface} open beside the conversation.` : `${surfaceAtStart(host)} is closed.`);
  return out.join(NL);
}
function outcomeText(d) {
  if (d.how === "dismissed") return "dismissed by the user";
  if (d.how === "expired") return "expired before the user answered";
  return d.outcome;
}
function closedText(closed) {
  if (closed.length === 0) return null;
  const advice = (d) => d.how === "dismissed" ? ". Ask it again only if the user brings it up." : d.how === "expired" ? ". Ask it again if it still matters." : "";
  return [
    "Closed since you last read the inbox:",
    ...closed.map((d) => `- "${d.ask}" \u2192 ${outcomeText(d)}${advice(d)}`)
  ].join(NL);
}
var TOLD_NOTHING = { inbox: null, closed: [] };
function promptNotes(host, ledger, prompt, told) {
  const notes = [];
  const answer = prompt.isPress ? null : answerNote(ledger, prompt.text);
  if (answer) notes.push(answer);
  const inbox = inboxText(host, ledger, prompt.isOpen);
  const toldClosed = new Set(told.closed);
  const closed = closedText(ledger.closed.filter((d) => !toldClosed.has(d.id)));
  const isEmpty = ledger.items.length === 0 && ledger.findings.length === 0;
  if (!closed && (inbox === told.inbox || isEmpty && told.inbox === null)) return { notes, told };
  notes.push(closed ? `${inbox}${NL}${closed}` : inbox);
  return { notes, told: { inbox, closed: ledger.closed.map((d) => d.id) } };
}

// src/texts.ts
var CODEX = {
  agent: "Codex",
  surface: "the Inbox tab",
  band: null,
  findingsIn: "the Findings section of the Inbox tab"
};
var GUIDANCE = `# Inbox
The inbox plugin shows the user what waits on them: your open questions and the tasks only they can do, and your findings, in the Inbox tab beside the conversation.

A finding is something you noticed that deserves the user's attention but is outside the current task: a bug, a risk, missing tests, tech debt, or a chance to improve something. Record it with mcp__inbox__record_finding the moment you notice it, then go on with the task; fixing it waits until the user asks. Record one too at two moments that are easy to pass over while focused on the task:
- You work around a problem instead of fixing it, such as copying files by hand because a tool does not reach them.
- Part of your change could not be tested or verified.
State those two in your reply as well. Mention any other finding only when it bears on what the user asked.

The latest "inbox:" text beside the user's prompt is the current state. It lists every open item and finding with its id, such as [i35] or [f12], and anything it does not list is closed. Check it before telling the user that something is open or waits on them.

Close with mcp__inbox__close:
- When the user's message answers an open item, close it first, before other work, with their answer.
- When an item or finding is done or no longer applies, close it with a short reason, without waiting to be asked.
The answer to a question is the user's to give. Close a question with their answer, or once it no longer applies, and never with an answer of your own.`;
var START_TITLE = 'inbox: where this session stands, as of the last reply. An "inbox:" text beside a later prompt replaces this.';

// src/core.ts
var TAB_OPEN_MS = 15e3;
var MAX_ACTIVITY = 40;
function isTabOpen(s, now) {
  return now - s.tabSeenAt < TAB_OPEN_MS;
}
function startContext(s, source) {
  const carried = carryText(s.ledger, START_TITLE, true);
  const parts = [source === "resume" ? null : GUIDANCE, carried].filter((x) => x !== null);
  return parts.length > 0 ? parts.join("\n\n") : null;
}
function cleared(s) {
  return {
    ...s,
    ledger: EMPTY,
    turn: { person: null, activity: [], press: null },
    told: { inbox: null, closed: [] },
    pending: [],
    lastActions: {}
  };
}
function notePrompt(s, text, now) {
  const sentAt = s.sent.findIndex((x) => x.text === text);
  const sentBy = sentAt >= 0 ? s.sent[sentAt]?.press ?? null : null;
  const ledger = { ...s.ledger, turn: s.ledger.turn + 1 };
  const r = promptNotes(CODEX, ledger, { text, isPress: sentAt >= 0, isOpen: isTabOpen(s, now) }, s.told);
  const person = s.turn.person === null ? text : `${s.turn.person}

${text}`;
  return {
    state: {
      ...s,
      ledger,
      told: r.told,
      sent: sentAt >= 0 ? s.sent.filter((_x, i) => i !== sentAt) : s.sent,
      turn: { ...s.turn, person, press: sentBy ?? s.turn.press },
      presence: { ...s.presence, turnsStarted: s.presence.turnsStarted + 1 }
    },
    notes: r.notes
  };
}
function noteActivity(s, line) {
  const activity = s.turn.activity;
  if (!line || activity.length >= MAX_ACTIVITY || activity.includes(line)) return s;
  return { ...s, turn: { ...s.turn, activity: [...activity, line] } };
}
function activityOf(tool, input) {
  return toolActivity(tool === "Bash" ? "Bash" : tool, input);
}
function patchFiles(patch) {
  return [...patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) => (m[1] ?? "").trim()).filter(Boolean);
}
function endTurn(s, reply, now) {
  const base = { ...s, turn: { person: null, activity: [], press: null } };
  if (reply.trim() === "") return base;
  const ex = {
    person: s.turn.person,
    trigger: s.turn.person === null ? "unknown" : null,
    activity: s.turn.activity,
    reply,
    turn: s.ledger.turn,
    press: s.turn.press,
    screen: screenText(CODEX, isTabOpen(s, now), null)
  };
  return { ...base, pending: [...base.pending, { ex, turnsStarted: s.presence.turnsStarted }] };
}

// src/state.ts
import { mkdir, readFile, rename, rmdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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
var sleep = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms));
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

// src/transcript.ts
import { open } from "node:fs/promises";
async function isExecRun(path) {
  if (!path) return false;
  try {
    const file = await open(path, "r");
    try {
      const buf = Buffer.alloc(64 * 1024);
      const { bytesRead } = await file.read(buf, 0, buf.length, 0);
      const first = buf.subarray(0, bytesRead).toString("utf8").split("\n")[0] ?? "";
      const meta = JSON.parse(first);
      return meta.type === "session_meta" && (meta.payload?.originator === "codex_exec" || meta.payload?.source === "exec");
    } finally {
      await file.close();
    }
  } catch {
    return false;
  }
}

// src/hook.ts
async function handleHook(input, deps) {
  const id = input.session_id;
  const { dir, env, now } = deps;
  if (!id || !env.INBOX_IN_EXEC && await isExecRun(input.transcript_path)) return null;
  const cliPath = env.CODEX_CLI_PATH || null;
  const withCli = (s) => cliPath && s.cliPath !== cliPath ? { ...s, cliPath } : s;
  switch (input.hook_event_name) {
    case "SessionStart": {
      const root = input.cwd ?? "";
      const s = await updateState(dir, id, (s2) => withCli({ ...input.source === "clear" ? cleared(s2) : s2, root }));
      const context = startContext(s, input.source);
      return context ? { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } } : null;
    }
    case "UserPromptSubmit": {
      let notes = [];
      await updateState(dir, id, (s) => {
        const r = notePrompt(withCli(s), input.prompt ?? "", now());
        notes = r.notes;
        return r.state;
      });
      return notes.length === 0 ? null : { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: notes.join("\n\n") } };
    }
    case "PreToolUse": {
      const tool = input.tool_name ?? "";
      const toolInput = input.tool_input ?? {};
      const command = typeof toolInput.command === "string" ? toolInput.command : "";
      if (tool === "apply_patch") {
        const files = patchFiles(command).map((f) => resolve(input.cwd || "/", f));
        await updateState(dir, id, (s) => files.reduce((x, f) => noteActivity(x, `edited ${f}`), s));
        return null;
      }
      const line = activityOf(tool, toolInput);
      if (line) await updateState(dir, id, (s) => noteActivity(s, line));
      return null;
    }
    case "Stop":
      return stop(input, deps, withCli);
  }
  return null;
}
async function stop(input, deps, withCli) {
  const { dir, now } = deps;
  const id = input.session_id;
  const reply = input.last_assistant_message ?? "";
  const written = await updateState(dir, id, (current) => endTurn(withCli(current), reply, now()));
  if (written.pending.length > 0) deps.startUpdate(id);
  return null;
}
function detachedUpdate(dir, env, script) {
  return (sessionId) => {
    const child = spawn(process.execPath, [script, sessionId], {
      detached: true,
      stdio: "ignore",
      env: { ...env, INBOX_DATA: dir }
    });
    child.unref();
  };
}

// src/hook-main.ts
async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const dist = dirname2(fileURLToPath(import.meta.url));
  const dir = dataDir(process.env, dirname2(dist));
  const out = await handleHook(JSON.parse(raw), {
    dir,
    env: process.env,
    now: Date.now,
    startUpdate: detachedUpdate(dir, process.env, join2(dist, "update.mjs"))
  });
  if (out) process.stdout.write(JSON.stringify(out));
}
main().catch(() => process.exit(0));
