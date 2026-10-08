// Built by codex/build.mjs from codex/src and hooks/. Do not edit.

// src/server-main.ts
import { dirname as dirname2 } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

// src/server.ts
import { isAbsolute, join as join2 } from "node:path";

// ../hooks/checks.ts
var PM_OPTIONS = String.raw`(?:-{1,2}[\w-]+(?:=\S+|\s+(?!-|(?:run|test|build|lint)\b)\S+)?\s+)*`;
var pm = (managers, script) => new RegExp(String.raw`\b(${managers})\s+${PM_OPTIONS}(?:run\s+)?(?:${script})(:[\w.:-]*\w)?\b`);
var CHECKS = [
  { kind: "tests", pattern: /\bclaude\s+plugin\s+test\b/, name: () => "plugin tests" },
  { kind: "validate", pattern: /\bclaude\s+plugin\s+validate\b/, name: () => "plugin validate" },
  { kind: "tests", pattern: pm("bun|npm|pnpm|yarn|deno", "test"), name: (m) => `${m[1]} test${m[2] ?? ""}` },
  { kind: "tests", pattern: /\bnode\s+(?:-{1,2}[\w-]+(?:=\S+)?\s+)*--test\b/, name: () => "node --test" },
  { kind: "tests", pattern: /\b(vitest|jest|pytest|rspec|mocha|phpunit|ava|tap)\b/, name: (m) => m[1] ?? "tests" },
  { kind: "tests", pattern: /\b(go|cargo|swift|mix|dotnet)\s+test\b/, name: (m) => `${m[1]} test` },
  { kind: "tests", pattern: /\bplaywright\s+test\b/, name: () => "playwright" },
  { kind: "tests", pattern: /\bxcodebuild\b[^|;&]*\btest\b/, name: () => "xcodebuild test" },
  { kind: "tests", pattern: /\bmake\s+(?:check|test)\b/, name: (m) => m[0] },
  { kind: "types", pattern: /\btsc\b/, name: () => "tsc" },
  { kind: "types", pattern: /\b(mypy|pyright)\b/, name: (m) => m[1] ?? "types" },
  {
    kind: "types",
    pattern: pm("bun|npm|pnpm|yarn", "typecheck|type-check|check-types"),
    name: (m) => `typecheck${m[2] ?? ""}`
  },
  { kind: "types", pattern: /\bcargo\s+check\b/, name: () => "cargo check" },
  {
    kind: "lint",
    pattern: /\b(eslint|biome|ruff|shellcheck|swiftlint|clippy|golangci-lint|stylelint)\b/,
    name: (m) => m[1] ?? "lint"
  },
  { kind: "lint", pattern: pm("bun|npm|pnpm|yarn", "lint"), name: (m) => `lint${m[2] ?? ""}` },
  { kind: "lint", pattern: /\bprettier\b[^|;&]*--check\b/, name: () => "prettier" },
  { kind: "build", pattern: pm("bun|npm|pnpm|yarn", "build"), name: (m) => `${m[1]} build${m[2] ?? ""}` },
  { kind: "build", pattern: /\b(cargo|go|swift)\s+build\b/, name: (m) => `${m[1]} build` },
  { kind: "build", pattern: /\bxcodebuild\b(?![^|;&]*\btest\b)/, name: () => "xcodebuild" },
  { kind: "build", pattern: /\b(?:next|vite)\s+build\b/, name: (m) => m[0] },
  {
    kind: "validate",
    pattern: /(?:^|\s)(?:\S*\/)?[\w.-]*(?:validate|doctor)[\w.-]*\.sh\b/,
    name: (m) => m[0].trim().replace(/^.*\//, "")
  },
  { kind: "all", pattern: /(?:^|\s)(?:\S*\/)?checks?\.sh\b/, name: (m) => m[0].trim().replace(/^.*\//, "") }
];
var FOLDER_OPTIONS = /* @__PURE__ */ new Set(["--prefix", "-C", "--cwd", "--dir", "--directory", "--package-path", "--manifest-path"]);
var TSC_FOLDER_OPTIONS = /* @__PURE__ */ new Set([...FOLDER_OPTIONS, "-p", "--project"]);
var FAIL_MARK = String.raw`\(fail\)|FAIL(?:ED)?\b|✗|✖(?! failing tests:)|×|✘`;
var FAILURE_LINE = new RegExp(
  String.raw`^\s*(?:${FAIL_MARK})|\berror\s+TS\d+\b|^\s*(?:[A-Z]\w*Error|error)(?:\[\w+\])?:`
);
function targetText(check, root) {
  const base = check.folder ?? root;
  const paths = check.target.paths.map((p) => p.startsWith(`${base}/`) ? p.slice(base.length + 1) : p);
  return [...paths, ...check.target.filters].join(" ");
}
function checkName(check, root) {
  const target = targetText(check, root);
  const name = target ? `${check.name} ${target}` : check.name;
  return check.folder ? `${name} in ${check.folder.replace(/^.*\//, "")}` : name;
}
function distinctSummary(check) {
  const isRepeated = check.failures.some((f) => f.includes(check.summary) || check.summary.includes(f));
  return check.summary && !isRepeated ? check.summary : null;
}
function outputLines(check) {
  const summary = distinctSummary(check);
  return [...check.failures, ...summary ? [summary] : []];
}
var LEADING_MARK = new RegExp(String.raw`^\s*(?:${FAIL_MARK}|❯)\s*`);
function fixMessage(check, root) {
  const output = outputLines(check);
  const target = targetText(check, root);
  return [
    `${check.name}${target ? ` ${target}` : ""} failed when you last ran it${check.folder ? ` in ${check.folder}` : ""}.`,
    ...check.command ? [`Command: ${check.command}`] : [],
    ...output.length > 0 ? ["Output:", ...output] : [],
    "Find the cause, fix it, and run it again to verify."
  ].join("\n");
}

// ../hooks/check-tracking.ts
var NO_CHECKS = { results: [], repos: [] };
function checkKey(check) {
  const { paths, filters } = check.target;
  const key = `${check.folder ?? "."}:${check.name}`;
  return paths.length === 0 && filters.length === 0 ? key : `${key}:${JSON.stringify([[...paths].sort(), [...filters].sort()])}`;
}
function dismissed(checks, check) {
  const key = checkKey(check);
  return { ...checks, results: checks.results.map((c) => checkKey(c) === key ? { ...c, isDismissed: true } : c) };
}
function fixSent(checks, check, at) {
  const key = checkKey(check);
  return {
    ...checks,
    results: checks.results.map((c) => checkKey(c) === key && c.ranAt === check.ranAt ? { ...c, fixSentAt: at } : c)
  };
}
function counts(checks, c, root) {
  if (c.repo !== null) return checks.repos.includes(c.repo);
  return c.folder === null || c.folder === root || c.folder.startsWith(`${root}/`);
}
function needsYou(checks, root) {
  const rows = checks.results.filter((c) => counts(checks, c, root) && c.isLeftFailing && !c.isDismissed);
  return { rows, count: rows.filter((c) => c.fixSentAt === null).length };
}

// ../hooks/ledger.ts
var EMPTY = {
  card: null,
  items: [],
  closed: [],
  findings: [],
  prs: [],
  nextId: 1,
  turn: 0,
  batchTurn: 0
};
var MAX_CLOSED = 12;
var MAX_FINDINGS = 30;
function sameAsk(a, b) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return norm(a) === norm(b);
}
function closedRecord(item, closing, now) {
  const { id, kind, ask, label } = item;
  return { id, kind, ask, ...label ? { label } : {}, ...closing, at: now };
}
var CLOSED_BY_CLAUDE = "closed by Claude";
function closeByClaude(ledger, id, how, now) {
  const closing = "answer" in how ? { how: "answered", outcome: how.answer } : { how: "claude", outcome: `${CLOSED_BY_CLAUDE}: ${how.reason}` };
  if (ledger.items.some((i) => i.id === id)) return { ledger: closeItem(ledger, id, closing, now), closed: "item" };
  if (ledger.findings.some((f) => f.id === id))
    return { ledger: { ...ledger, findings: ledger.findings.filter((f) => f.id !== id) }, closed: "finding" };
  return { ledger, closed: null };
}
function closeItem(ledger, id, closing, now) {
  return {
    ...ledger,
    items: ledger.items.filter((i) => i.id !== id),
    closed: [...ledger.closed, ...ledger.items.filter((i) => i.id === id).map((i) => closedRecord(i, closing, now))].slice(
      -MAX_CLOSED
    )
  };
}
function addFinding(ledger, finding) {
  const findings = ledger.findings;
  const same = findings.find((f) => sameAsk(f.title, finding.title));
  if (same) return { ledger, id: same.id, isAdded: false };
  const id = `f${ledger.nextId}`;
  return {
    ledger: {
      ...ledger,
      findings: [...findings, { ...finding, id }].slice(-MAX_FINDINGS),
      nextId: ledger.nextId + 1
    },
    id,
    isAdded: true
  };
}

// src/texts.ts
var FINDING_DESCRIPTION = `Record a finding for the user. It waits in the Findings section of the Inbox tab until it is closed, and from there the user can ask you to address it or discuss it. Record what a careful senior engineer would flag to a teammate, and leave out style nits and anything the user already decided.`;
var CLOSE_DESCRIPTION = `Close an open item or finding by its id, such as i35 or f12, as listed in the latest "inbox:" text beside the user's prompt. Pass the user's answer when their message answered it, and a reason otherwise.`;
var TAB_DESCRIPTION = "Open the Inbox tab beside this conversation. Call it only when the user asks to see the inbox.";
var CLOSED_BY = "closed by Codex";
var messages = {
  answer: (item, answer) => `Re "${item.ask}": ${answer}`,
  explain: (item) => {
    const what = item.kind === "task" ? "this task you left for me" : "this question you asked me";
    const options = item.options.length > 0 ? `
Options: ${item.options.join(" / ")}` : "";
    return `Remind me what ${what} is about: why it came up, and what each choice would mean. Don't act on it yet.
"${item.ask}"${options}`;
  },
  run: (item, command) => `For "${item.ask}", run this:
\`\`\`
${command}
\`\`\``,
  taskReply: (item, words) => `Re the task you left for me, "${item.ask}": ${words}`,
  finding: (finding, how, words = "") => {
    const opening = how === "address" ? "Please address this finding you recorded:" : how === "discuss" ? "Let's talk through this finding you recorded before changing anything:" : "About this finding you recorded:";
    const body = [
      `${finding.kind === "issue" ? "Issue" : "Opportunity"}: ${finding.title}`,
      finding.detail,
      ...finding.path ? [`File: ${finding.path}`] : []
    ];
    return [opening, ...body, ...how === "typed" ? ["", words] : []].join("\n");
  }
};

// src/core.ts
var SETTLED_MS = 5120;
var MAX_SENT = 20;
function cut(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function recordFinding(s, input, now) {
  const title = cut(input.title, 120);
  const detail = cut(input.detail, 600);
  if (title === "" || detail === "") return { state: s, result: "Not recorded: a finding needs a title and a detail." };
  const path = cut(input.path, 300);
  const r = addFinding(s.ledger, {
    kind: input.kind === "opportunity" ? "opportunity" : "issue",
    title,
    detail,
    path: path || null,
    at: now
  });
  return {
    state: { ...s, ledger: r.ledger },
    result: r.isAdded ? `Recorded as ${r.id}. The user sees it in the Findings section of the Inbox tab.` : `Already recorded as ${r.id}.`
  };
}
function recordClose(s, input, now) {
  const text2 = (key) => cut(input[key], 80);
  const id = text2("id").replace(/^\[|\]$/g, "");
  const answer = text2("answer");
  const reason = text2("reason");
  if (id === "" || answer === "" && reason === "")
    return { state: s, result: "Not closed: give the id, and the user's answer or a reason." };
  const r = closeByClaude(s.ledger, id, answer ? { answer } : { reason }, now);
  const ledger = {
    ...r.ledger,
    closed: r.ledger.closed.map(
      (d) => d.id === id && d.how === "claude" ? { ...d, outcome: d.outcome.replace(CLOSED_BY_CLAUDE, CLOSED_BY) } : d
    )
  };
  const state = { ...s, ledger };
  if (r.closed === "item") return { state, result: `Closed ${id}. The user sees it in the Inbox tab with its outcome.` };
  if (r.closed === "finding") return { state, result: `Closed finding ${id}.` };
  return {
    state: s,
    result: `Not closed: no open item or finding has the id ${id}. The open ones are listed beside the user's latest message.`
  };
}
function isTaskHandedOff(last, p) {
  const pressed = last?.isHandoff === true ? last.turnsStarted : void 0;
  return pressed !== void 0 && pressed <= p.turnsStarted && p.turnsApplied <= pressed;
}
function baseName(path) {
  return path.replace(/\/+$/, "").split("/").pop() ?? path;
}
function clipLabel(text2, max) {
  return text2.length > max ? `${text2.slice(0, max - 1)}\u2026` : text2;
}
function helpLabel(help) {
  const label = help.kind === "open" ? `Open ${baseName(help.path)}` : help.kind === "copy" ? `Copy ${help.name ?? "snippet"}` : help.kind === "run" ? `Run ${help.name ?? help.command}` : help.kind === "terminal" ? `Copy ${help.name ?? help.command}` : `Open ${help.name ?? new URL(help.url).host}`;
  return clipLabel(label, 32);
}
function steps(helps) {
  const copy = helps.find((h) => h.kind === "copy");
  const open = helps.find((h) => h.kind === "open");
  if (!copy || !open || copy.kind !== "copy" || open.kind !== "open")
    return helps.map((h) => ({ label: helpLabel(h), step: [h] }));
  return helps.filter((h) => h !== copy).map(
    (h) => h === open ? { label: clipLabel(`Copy ${copy.name ?? "snippet"} and open ${baseName(open.path)}`, 48), step: [copy, open] } : { label: helpLabel(h), step: [h] }
  );
}
function withLast(s, id, last, now) {
  return { ...s, lastActions: { ...s.lastActions, [id]: { ...last, at: now } } };
}
function sent(s, text2, press2, now) {
  return { ...s, sent: [...s.sent, { text: text2, press: press2, at: now }].slice(-MAX_SENT) };
}
function press(s, p, now) {
  const send = (state, text2, by) => ({
    state: sent(state, text2, by, now),
    effects: [{ kind: "send", text: text2, press: by }]
  });
  if (p.action === "fix" || p.action === "dismissCheck") {
    const check = s.checks.results.find((c) => checkKey(c) === p.key);
    if (!check) return null;
    if (p.action === "dismissCheck") return { state: { ...s, checks: dismissed(s.checks, check) }, effects: [] };
    const withFix = withLast(
      { ...s, checks: fixSent(s.checks, check, now) },
      `check:${p.key}`,
      { action: "fix", text: "Fix sent", isHandoff: true },
      now
    );
    return send(withFix, fixMessage(check, s.root), null);
  }
  if (p.action === "address" || p.action === "discuss" || p.action === "dismissFinding" || p.action === "typedFinding") {
    const finding = s.ledger.findings.find((f) => f.id === p.id);
    if (!finding) return null;
    const removed = { ...s, ledger: { ...s.ledger, findings: s.ledger.findings.filter((f) => f.id !== p.id) } };
    if (p.action === "dismissFinding") return { state: removed, effects: [] };
    const words = p.action === "typedFinding" ? p.text.trim() : "";
    if (p.action === "typedFinding" && !words) return null;
    const how = p.action === "typedFinding" ? "typed" : p.action;
    const text2 = how === "address" ? "Address sent" : how === "discuss" ? "Discuss sent" : "Reply sent";
    return send(
      withLast(removed, p.id, { action: p.action, text: text2, title: finding.title }, now),
      messages.finding(finding, how, words),
      null
    );
  }
  const item = s.ledger.items.find((i) => i.id === p.id);
  if (!item) return null;
  const close = (outcome, how) => ({
    ...s,
    ledger: closeItem(s.ledger, item.id, { how, outcome }, now)
  });
  switch (p.action) {
    case "answer": {
      const answer = item.options[p.option];
      if (answer === void 0) return null;
      return send(close(answer, "answered"), messages.answer(item, answer), { id: item.id, action: "answer" });
    }
    case "type": {
      const words = p.text.trim();
      if (!words) return null;
      if (item.kind === "question")
        return send(close(words, "answered"), messages.answer(item, words), { id: item.id, action: "answer" });
      const last = { action: "typed", text: "Reply sent", isHandoff: true, turnsStarted: s.presence.turnsStarted };
      return send(withLast(s, item.id, last, now), messages.taskReply(item, words), null);
    }
    case "explain":
      return send(withLast(s, item.id, { action: "explain", text: "Explain sent" }, now), messages.explain(item), {
        id: item.id,
        action: "explain"
      });
    case "done":
      return { state: close("done", "done"), effects: [] };
    case "dismiss":
      return { state: close("dismissed", "dismissed"), effects: [] };
    case "step": {
      const found = steps(item.helps)[p.step];
      if (!found) return null;
      const effects = [];
      let state = s;
      for (const help of found.step) {
        if (help.kind === "run") {
          const text2 = messages.run(item, help.command);
          state = sent(state, text2, { id: item.id, action: "run" }, now);
          effects.push({ kind: "send", text: text2, press: { id: item.id, action: "run" } });
        } else if (help.kind === "open") effects.push({ kind: "open", target: help.path });
        else if (help.kind === "link") effects.push({ kind: "open", target: help.url });
        else if (help.kind === "copy") effects.push({ kind: "copy", text: help.text, name: help.name ?? "snippet" });
        else effects.push({ kind: "copy", text: help.command, name: help.name ?? "the command" });
      }
      if (found.step.some((h) => h.kind === "run"))
        state = withLast(
          state,
          item.id,
          {
            action: `step-${p.step}`,
            text: `${found.label} sent`,
            isHandoff: true,
            turnsStarted: s.presence.turnsStarted
          },
          now
        );
      return { state, effects };
    }
  }
}
function viewOf(s, now) {
  const l = s.ledger;
  const row = (i) => ({
    id: i.id,
    kind: i.kind,
    ask: i.ask,
    label: i.label,
    options: i.options.map((o) => ({ text: o, isRec: o === i.rec })),
    steps: steps(i.helps).map((x) => x.label),
    at: i.at,
    last: s.lastActions[i.id] ?? null,
    isHandedOff: i.kind === "task" && isTaskHandedOff(s.lastActions[i.id], s.presence)
  });
  const questions = l.items.filter((i) => i.kind === "question").sort((a, b) => b.turn - a.turn).map(row);
  const tasks = l.items.filter((i) => i.kind === "task").map(row);
  const failing = needsYou(s.checks, s.root);
  const open = new Set(l.findings.map((f) => f.id));
  return {
    goal: l.card?.goal ?? "",
    now: l.card?.now ?? "",
    done: l.card?.done ?? [],
    running: l.card?.running ?? [],
    updating: s.presence.isUpdating || s.pending.length > 0,
    failed: s.presence.ledgerState === "failed",
    waiting: questions.length + tasks.filter((t) => !t.isHandedOff).length + failing.count,
    questions,
    tasks,
    checks: failing.rows.map((c) => ({
      key: checkKey(c),
      name: checkName(c, s.root),
      summary: c.summary,
      failures: c.failures,
      fixSent: c.fixSentAt !== null,
      last: s.lastActions[`check:${checkKey(c)}`] ?? null
    })),
    findings: l.findings.map((f) => ({ ...f, last: s.lastActions[f.id] ?? null })),
    leaving: Object.entries(s.lastActions).filter(([id, a]) => a.title !== void 0 && !open.has(id) && now - a.at < SETTLED_MS).map(([id, a]) => ({ id, title: a.title ?? "", text: a.text, at: a.at })),
    closed: l.closed.slice(-3).reverse().map((d) => ({ ask: d.ask, outcome: d.outcome, how: d.how, at: d.at })),
    at: now
  };
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
    top: null,
    home: homedir(),
    cliPath: null,
    ledger: EMPTY,
    checks: NO_CHECKS,
    snapshots: {},
    turn: { person: null, activity: [], press: null, sentBack: [] },
    told: { inbox: null, closed: [] },
    presence: { turnsStarted: 0, turnsApplied: 0, ledgerState: "current", isUpdating: false },
    pending: [],
    sent: [],
    lastActions: {},
    recordedRuns: [],
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
  return {
    ...base,
    ...saved,
    turn: { ...base.turn, ...saved.turn },
    told: { ...base.told, ...saved.told },
    presence: { ...base.presence, ...saved.presence }
  };
}
async function readState(dir, sessionId) {
  try {
    return upgraded(JSON.parse(await readFile(statePath(dir, sessionId), "utf8")), sessionId);
  } catch {
    return emptyState(sessionId);
  }
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
    const next = await change(await readState(dir, sessionId));
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(next));
    await rename(tmp, path);
    return next;
  });
}

// src/server.ts
var TAB_URI = "ui://inbox/tab";
var TAB_MIME = "text/html;profile=mcp-app";
var FINDING_SCHEMA = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["issue", "opportunity"],
      description: "issue: something wrong or risky. opportunity: something that could be better."
    },
    title: { type: "string", description: "What it is, in at most 12 plain words." },
    detail: { type: "string", description: "Why it matters and what you would do, in one or two sentences." },
    path: { type: "string", description: "The file it is about, if one." }
  },
  required: ["kind", "title", "detail"]
};
var CLOSE_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "The id of the open item or finding, such as i35 or f32." },
    answer: {
      type: "string",
      description: "The user's answer, in their words and at most 8, when their own message answered it."
    },
    reason: {
      type: "string",
      description: 'Otherwise, why it is closed, in at most 8 words, such as "no longer applies: Inbox kept".'
    }
  },
  required: ["id"]
};
var APP_ONLY = { ui: { visibility: ["app"] } };
var TOOLS = [
  { name: "record_finding", description: FINDING_DESCRIPTION, inputSchema: FINDING_SCHEMA },
  { name: "close", description: CLOSE_DESCRIPTION, inputSchema: CLOSE_SCHEMA },
  {
    name: "inbox",
    title: "Inbox",
    description: TAB_DESCRIPTION,
    inputSchema: { type: "object", properties: {} },
    _meta: { ui: { resourceUri: TAB_URI }, "openai/ui": { entrypoints: [{ type: "thread" }] } }
  },
  {
    name: "inbox_view",
    description: "What the Inbox tab shows for this conversation.",
    inputSchema: { type: "object", properties: {} },
    _meta: APP_ONLY
  },
  {
    name: "inbox_press",
    description: "A press in the Inbox tab.",
    inputSchema: { type: "object", properties: { press: { type: "object" } }, required: ["press"] },
    _meta: APP_ONLY
  }
];
function sessionOf(params) {
  const meta = params?._meta ?? {};
  const turn = meta["x-codex-turn-metadata"] ?? {};
  const id = turn.session_id ?? meta.thread_id ?? meta.threadId;
  return typeof id === "string" && id ? id : null;
}
var text = (t) => ({ content: [{ type: "text", text: t }] });
function makeServer(deps) {
  const { dir, now } = deps;
  async function queue(s, message) {
    const cli = s.cliPath ?? await deps.fallbackCli();
    const r = await deps.exec([cli, "queue", "--thread", s.sessionId, "--message", message], {
      cwd: s.root || "/",
      timeoutMs: 15e3
    });
    if (r.code !== 0) throw new Error(r.stderr.trim() || `codex queue exited ${r.code}`);
  }
  async function onPress(id, p) {
    let copy = null;
    const opens = [];
    let error = null;
    const s = await updateState(dir, id, async (s2) => {
      const r = press(s2, p, now());
      if (!r) return s2;
      for (const e of r.effects) {
        if (e.kind === "send") await queue(r.state, e.text);
        else if (e.kind === "open") opens.push(e.target);
        else copy = { text: e.text, name: e.name };
      }
      return r.state;
    }).catch(async (err) => {
      error = `Not sent: ${err instanceof Error ? err.message : String(err)}`;
      return readState(dir, id);
    });
    for (const target of opens) {
      const path = /^https:\/\//.test(target) || isAbsolute(target) ? target : join2(s.root || "/", target);
      await deps.exec(["open", path], { cwd: "/", timeoutMs: 1e4 });
    }
    return { view: viewOf(s, now()), copy, error };
  }
  async function callTool(name, args, id) {
    if (!id) return { ...text("Not done: this call carries no session id."), isError: true };
    switch (name) {
      case "record_finding":
      case "close": {
        let result = "";
        await updateState(dir, id, (s) => {
          const r = (name === "close" ? recordClose : recordFinding)(s, args, now());
          result = r.result;
          return r.state;
        });
        return text(result);
      }
      case "inbox": {
        const s = await readState(dir, id);
        return { ...text("Opened the Inbox tab beside the conversation."), structuredContent: viewOf(s, now()) };
      }
      case "inbox_view": {
        const s = await updateState(dir, id, (s2) => ({ ...s2, tabSeenAt: now() }));
        return { ...text("Inbox view"), structuredContent: viewOf(s, now()) };
      }
      case "inbox_press": {
        const r = await onPress(id, args.press);
        return { ...text(r.error ?? "Done"), structuredContent: r };
      }
    }
    return { ...text(`Unknown tool: ${name}`), isError: true };
  }
  return async (m) => {
    const { id, method, params } = m;
    const ok = (result) => ({ jsonrpc: "2.0", id, result });
    switch (method) {
      case "initialize":
        return ok({
          protocolVersion: params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: "inbox", version: "0.1.0" }
        });
      case "tools/list":
        return ok({ tools: TOOLS });
      case "tools/call": {
        const name = String(params?.name ?? "");
        const args = params?.arguments ?? {};
        try {
          return ok(await callTool(name, args, sessionOf(params)));
        } catch (err) {
          return ok({ ...text(`Failed: ${err instanceof Error ? err.message : String(err)}`), isError: true });
        }
      }
      case "resources/list":
        return ok({ resources: [{ uri: TAB_URI, name: "Inbox", mimeType: TAB_MIME }] });
      case "resources/templates/list":
        return ok({ resourceTemplates: [] });
      case "resources/read":
        return ok({ contents: [{ uri: TAB_URI, mimeType: TAB_MIME, text: deps.tabHtml }] });
      case "ping":
        return ok({});
    }
    if (id === void 0) return null;
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
  };
}

// src/tab.html
var tab_default = "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n    <title>Inbox</title>\n    <style>\n      :root {\n        --bg: var(--color-background-primary, #ffffff);\n        --text: var(--color-text-primary, #1f1f1f);\n        --muted: var(--color-text-secondary, #6b6b6b);\n        --line: var(--color-border-default, rgba(0, 0, 0, 0.12));\n        --button: var(--color-background-secondary, rgba(0, 0, 0, 0.05));\n        --accent: #8a5a00;\n        --done: #25652f;\n        --error: #a5293d;\n        --findings: #7b00e8;\n      }\n      @media (prefers-color-scheme: dark) {\n        :root:not([data-theme='light']) {\n          --bg: var(--color-background-primary, #1e1e1e);\n          --text: var(--color-text-primary, #ececec);\n          --muted: var(--color-text-secondary, #9a9a9a);\n          --line: var(--color-border-default, rgba(255, 255, 255, 0.12));\n          --button: var(--color-background-secondary, rgba(255, 255, 255, 0.07));\n          --accent: #ffc107;\n          --done: #7ecd8f;\n          --error: #ffa3b0;\n          --findings: #cab0ff;\n        }\n      }\n      :root[data-theme='dark'] {\n        --accent: #ffc107;\n        --done: #7ecd8f;\n        --error: #ffa3b0;\n        --findings: #cab0ff;\n      }\n      body {\n        margin: 0;\n        padding: 12px 16px 24px;\n        background: var(--bg);\n        color: var(--text);\n        font: 13px/1.45 var(--font-sans, system-ui, sans-serif);\n      }\n      h2 {\n        margin: 20px 0 6px;\n        font-size: 12px;\n        font-weight: 600;\n        color: var(--muted);\n      }\n      .goal {\n        font-size: 14px;\n        font-weight: 600;\n      }\n      .muted {\n        color: var(--muted);\n      }\n      .status {\n        margin-top: 4px;\n        color: var(--muted);\n      }\n      .waiting {\n        color: var(--accent);\n        font-weight: 600;\n      }\n      .row {\n        border-top: 1px solid var(--line);\n        padding: 10px 0;\n      }\n      .ask {\n        font-weight: 500;\n      }\n      .detail {\n        margin-top: 2px;\n        white-space: pre-wrap;\n      }\n      .actions {\n        display: flex;\n        flex-wrap: wrap;\n        gap: 6px;\n        margin-top: 8px;\n      }\n      button {\n        font: inherit;\n        color: inherit;\n        background: var(--button);\n        border: 1px solid var(--line);\n        border-radius: 7px;\n        padding: 3px 9px;\n        cursor: pointer;\n      }\n      button.primary {\n        border-color: var(--accent);\n      }\n      button.link {\n        background: none;\n        border: none;\n        padding: 0;\n        color: var(--muted);\n        text-decoration: underline;\n      }\n      .last {\n        margin-top: 6px;\n        color: var(--muted);\n      }\n      .ok {\n        color: var(--done);\n      }\n      .error {\n        color: var(--error);\n      }\n      .badge-issue {\n        color: var(--accent);\n      }\n      .badge-opportunity {\n        color: var(--findings);\n      }\n      form {\n        display: flex;\n        gap: 6px;\n        margin-top: 8px;\n      }\n      input {\n        flex: 1;\n        min-width: 0;\n        font: inherit;\n        color: inherit;\n        background: transparent;\n        border: 1px solid var(--line);\n        border-radius: 7px;\n        padding: 3px 8px;\n      }\n      textarea {\n        width: 100%;\n        box-sizing: border-box;\n        margin-top: 6px;\n        font: 12px var(--font-mono, ui-monospace, monospace);\n        color: inherit;\n        background: var(--button);\n        border: 1px solid var(--line);\n        border-radius: 7px;\n      }\n      .empty {\n        color: var(--muted);\n        padding: 6px 0;\n      }\n    </style>\n  </head>\n  <body>\n    <div id=\"app\" class=\"muted\">Loading\u2026</div>\n    <script>\n      let nextId = 0\n      let view = null\n      let isPressing = false\n      // Per-row state the server doesn't keep: an open text field, shown details, a press in flight, a copy to show.\n      const typing = new Set()\n      const details = new Set()\n      const sending = new Map()\n      const copies = new Map()\n      let notice = null\n      const pending = new Map()\n\n      function request(method, params) {\n        return new Promise((resolve, reject) => {\n          const id = ++nextId\n          pending.set(id, { resolve, reject })\n          parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*')\n        })\n      }\n\n      window.addEventListener('message', e => {\n        const m = e.data\n        if (!m || m.jsonrpc !== '2.0') return\n        if (m.id != null && !m.method && pending.has(m.id)) {\n          const p = pending.get(m.id)\n          pending.delete(m.id)\n          if (m.error) p.reject(m.error)\n          else p.resolve(m.result)\n          return\n        }\n        if (m.method === 'ui/notifications/host-context-changed') applyHost(m.params || {})\n        if (m.id != null && m.method) parent.postMessage({ jsonrpc: '2.0', id: m.id, result: {} }, '*')\n      })\n\n      function applyHost(ctx) {\n        if (ctx.theme) document.documentElement.dataset.theme = ctx.theme\n        const vars = ctx.styles && ctx.styles.variables\n        if (vars) for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v)\n      }\n\n      async function callTool(name, args) {\n        const r = await request('tools/call', { name, arguments: args || {} })\n        return r && r.structuredContent\n      }\n\n      async function refresh() {\n        if (isPressing) return\n        try {\n          view = await callTool('inbox_view')\n          render()\n        } catch (e) {\n          notice = { kind: 'error', text: 'Could not read the inbox.' }\n          render()\n        }\n      }\n\n      async function act(rowId, label, press) {\n        sending.set(rowId, label)\n        notice = null\n        render()\n        isPressing = true\n        try {\n          const r = await callTool('inbox_press', { press })\n          if (r && r.view) view = r.view\n          if (r && r.error) notice = { kind: 'error', text: r.error }\n          if (r && r.copy) await copy(rowId, r.copy)\n        } catch (e) {\n          notice = { kind: 'error', text: 'The press did not reach the inbox.' }\n        } finally {\n          isPressing = false\n          sending.delete(rowId)\n          render()\n        }\n      }\n\n      async function copy(rowId, c) {\n        try {\n          await navigator.clipboard.writeText(c.text)\n          notice = { kind: 'ok', text: `Copied ${c.name}.` }\n        } catch (e) {\n          // The tab's frame may not get the clipboard, so the text shows for a manual copy.\n          copies.set(rowId, c)\n        }\n      }\n\n      function ago(ms) {\n        const min = Math.round(ms / 60000)\n        if (min < 1) return 'just now'\n        if (min < 60) return `${min}m ago`\n        const h = Math.round(min / 60)\n        return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`\n      }\n\n      function h(tag, props, ...children) {\n        const el = document.createElement(tag)\n        for (const [k, v] of Object.entries(props || {})) {\n          if (k === 'onclick' || k === 'onsubmit') el[k] = v\n          else if (k === 'class') el.className = v\n          else if (v !== false && v != null) el.setAttribute(k, v)\n        }\n        for (const c of children.flat()) if (c != null && c !== false) el.append(c)\n        return el\n      }\n\n      function button(label, onclick, cls) {\n        return h('button', { class: cls || '', onclick }, label)\n      }\n\n      /** What the row's last press did, and a label for pressing it again. */\n      function lastLine(rowId, last) {\n        if (sending.has(rowId)) return h('div', { class: 'last' }, `${sending.get(rowId)}\u2026`)\n        if (!last) return null\n        return h(\n          'div',\n          { class: last.isHandoff ? 'last ok' : 'last' },\n          `${last.isHandoff ? '\u2713 ' : ''}${last.text} \xB7 ${ago(view.at - last.at)}`,\n        )\n      }\n\n      function again(label, last, action) {\n        return last && last.action === action ? `${label} again` : label\n      }\n\n      function textField(rowId, placeholder, onSend) {\n        const input = h('input', { placeholder, 'aria-label': placeholder })\n        setTimeout(() => input.focus(), 0)\n        return h(\n          'form',\n          {\n            onsubmit: e => {\n              e.preventDefault()\n              const t = input.value.trim()\n              if (!t) return\n              typing.delete(rowId)\n              onSend(t)\n            },\n          },\n          input,\n          h('button', { type: 'submit' }, 'Send'),\n          button('Cancel', () => {\n            typing.delete(rowId)\n            render()\n          }),\n        )\n      }\n\n      function copyBox(rowId) {\n        const c = copies.get(rowId)\n        if (!c) return null\n        const area = h('textarea', { rows: '3', readonly: true })\n        area.value = c.text\n        setTimeout(() => area.select(), 0)\n        return h(\n          'div',\n          {},\n          h('div', { class: 'last' }, `Copy ${c.name} from here:`),\n          area,\n          button('Close', () => {\n            copies.delete(rowId)\n            render()\n          }),\n        )\n      }\n\n      function itemRow(item) {\n        const last = item.last\n        if (item.isHandedOff && !details.has(item.id))\n          return h(\n            'div',\n            { class: 'row' },\n            h('div', { class: 'ok' }, `\u2713 ${last.text} \xB7 ${ago(view.at - last.at)}`),\n            h('div', { class: 'muted' }, item.ask),\n            h(\n              'div',\n              { class: 'actions' },\n              button('Details', () => (details.add(item.id), render()), 'link'),\n            ),\n          )\n        const isQuestion = item.kind === 'question'\n        const options = isQuestion\n          ? item.options.map((o, n) =>\n              button(\n                o.isRec ? `${o.text} (recommended)` : o.text,\n                () => act(item.id, `Sending \"${o.text}\"`, { action: 'answer', id: item.id, option: n }),\n                o.isRec ? 'primary' : '',\n              ),\n            )\n          : []\n        const stepButtons = item.steps.map((label, n) =>\n          button(again(label, last, `step-${n}`), () => act(item.id, label, { action: 'step', id: item.id, step: n })),\n        )\n        const more = [\n          ...(isQuestion ? [] : [button('Done', () => act(item.id, 'Marking done', { action: 'done', id: item.id }))]),\n          button(isQuestion ? 'Type an answer' : 'Type a reply', () => (typing.add(item.id), render())),\n          button(again('Explain', last, 'explain'), () =>\n            act(item.id, 'Sending Explain', { action: 'explain', id: item.id }),\n          ),\n          ...(isQuestion\n            ? [button('Dismiss', () => act(item.id, 'Dismissing', { action: 'dismiss', id: item.id }))]\n            : []),\n          ...(item.isHandedOff ? [button('Hide details', () => (details.delete(item.id), render()), 'link')] : []),\n        ]\n        return h(\n          'div',\n          { class: 'row' },\n          h('div', { class: 'ask' }, item.label && item.label !== '-' ? `${item.label}. ${item.ask}` : item.ask),\n          options.length + stepButtons.length > 0 ? h('div', { class: 'actions' }, options, stepButtons) : null,\n          h('div', { class: 'actions' }, more),\n          typing.has(item.id)\n            ? textField(item.id, isQuestion ? 'Your answer' : 'Your reply', t =>\n                act(item.id, 'Sending your words', { action: 'type', id: item.id, text: t }),\n              )\n            : null,\n          copyBox(item.id),\n          lastLine(item.id, last),\n        )\n      }\n\n      function checkRow(c) {\n        const rowId = `check:${c.key}`\n        if (c.fixSent && !details.has(rowId))\n          return h(\n            'div',\n            { class: 'row' },\n            h('div', { class: 'ok' }, `\u2713 Fix sent${c.last ? ` \xB7 ${ago(view.at - c.last.at)}` : ''}`),\n            h('div', { class: 'muted' }, `${c.name} failed`),\n            h(\n              'div',\n              { class: 'actions' },\n              button('Details', () => (details.add(rowId), render()), 'link'),\n            ),\n          )\n        return h(\n          'div',\n          { class: 'row' },\n          h(\n            'div',\n            { class: 'ask' },\n            h('span', { class: 'error' }, '\u2717 '),\n            `${c.name} failed${c.summary ? `: ${c.summary}` : ''}`,\n          ),\n          c.failures.length > 0 ? h('div', { class: 'detail muted' }, c.failures.join('\\n')) : null,\n          h(\n            'div',\n            { class: 'actions' },\n            button(\n              c.fixSent ? 'Fix again' : 'Fix',\n              () => act(rowId, 'Sending Fix', { action: 'fix', key: c.key }),\n              'primary',\n            ),\n            button('Dismiss', () => act(rowId, 'Dismissing', { action: 'dismissCheck', key: c.key })),\n            c.fixSent ? button('Hide details', () => (details.delete(rowId), render()), 'link') : null,\n          ),\n          lastLine(rowId, c.last),\n        )\n      }\n\n      function findingRow(f) {\n        return h(\n          'div',\n          { class: 'row' },\n          h(\n            'div',\n            { class: 'ask' },\n            h('span', { class: `badge-${f.kind}` }, f.kind === 'issue' ? '\u25B2 ' : '\u2726 '),\n            f.title,\n          ),\n          h('div', { class: 'detail muted' }, f.detail),\n          f.path ? h('div', { class: 'muted' }, f.path) : null,\n          h(\n            'div',\n            { class: 'actions' },\n            button('Address', () => act(f.id, 'Sending Address', { action: 'address', id: f.id }), 'primary'),\n            button('Discuss', () => act(f.id, 'Sending Discuss', { action: 'discuss', id: f.id })),\n            button('Type a reply', () => (typing.add(f.id), render())),\n            button('Dismiss', () => act(f.id, 'Dismissing', { action: 'dismissFinding', id: f.id })),\n          ),\n          typing.has(f.id)\n            ? textField(f.id, 'Your reply', t =>\n                act(f.id, 'Sending your words', { action: 'typedFinding', id: f.id, text: t }),\n              )\n            : null,\n          lastLine(f.id, f.last),\n        )\n      }\n\n      function leavingRow(x) {\n        return h(\n          'div',\n          { class: 'row' },\n          h('div', { class: 'ok' }, `\u2713 ${x.text}`),\n          h('div', { class: 'muted' }, x.title),\n        )\n      }\n\n      function render() {\n        const app = document.getElementById('app')\n        if (!view) return\n        const v = view\n        const header = [\n          v.goal ? h('div', { class: 'goal' }, v.goal) : h('div', { class: 'goal muted' }, 'Nothing summarized yet.'),\n          v.now ? h('div', {}, v.now) : null,\n          v.done.length > 0 ? h('div', { class: 'muted' }, `Done: ${v.done.join(' \xB7 ')}`) : null,\n          v.running.length > 0 ? h('div', { class: 'muted' }, `Running: ${v.running.join(' \xB7 ')}`) : null,\n          h(\n            'div',\n            { class: 'status' },\n            v.waiting > 0 ? h('span', { class: 'waiting' }, `${v.waiting} waiting on you`) : 'Nothing waiting on you',\n            v.updating ? ' \xB7 updating\u2026' : v.failed ? h('span', { class: 'error' }, ' \xB7 the last update failed') : null,\n          ),\n          notice ? h('div', { class: notice.kind === 'error' ? 'last error' : 'last ok' }, notice.text) : null,\n        ]\n        const needsYou = [...v.questions.map(itemRow), ...v.tasks.map(itemRow), ...v.checks.map(checkRow)]\n        const findings = [...v.leaving.map(leavingRow), ...v.findings.map(findingRow)]\n        app.className = ''\n        app.replaceChildren(\n          ...header.filter(Boolean),\n          h('h2', {}, 'Needs you'),\n          ...(needsYou.length > 0 ? needsYou : [h('div', { class: 'empty' }, 'No questions or tasks for you.')]),\n          h('h2', {}, 'Findings'),\n          ...(findings.length > 0\n            ? findings\n            : [\n                h(\n                  'div',\n                  { class: 'empty' },\n                  'No findings. Codex records bugs, risks and opportunities it notices outside the task here.',\n                ),\n              ]),\n          ...(v.closed.length > 0\n            ? [\n                h('h2', {}, 'Recently closed'),\n                ...v.closed.map(d => h('div', { class: 'row muted' }, `${d.ask} \u2192 ${d.outcome}`)),\n              ]\n            : []),\n        )\n      }\n\n      request('ui/initialize', {\n        protocolVersion: '2026-01-26',\n        appInfo: { name: 'inbox', version: '0.1.0' },\n        appCapabilities: { tools: {} },\n      })\n        .then(r => {\n          applyHost((r && r.hostContext) || {})\n          parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} }, '*')\n          refresh()\n          setInterval(refresh, 3000)\n        })\n        .catch(() => {\n          document.getElementById('app').textContent = 'The inbox could not connect to Codex.'\n        })\n    </script>\n  </body>\n</html>\n";

// src/tree.ts
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

// src/server-main.ts
async function appCli() {
  if (process.env.CODEX_CLI_PATH) return process.env.CODEX_CLI_PATH;
  const r = await run(["ps", "-o", "comm=", "-p", String(process.ppid)], { cwd: "/", timeoutMs: 5e3 });
  const path = r.stdout.trim();
  return r.code === 0 && /(^|\/)codex$/.test(path) ? path : "codex";
}
var handle = makeServer({
  dir: dataDir(process.env, dirname2(dirname2(fileURLToPath(import.meta.url)))),
  now: Date.now,
  exec: run,
  tabHtml: tab_default,
  fallbackCli: appCli
});
createInterface({ input: process.stdin, crlfDelay: Infinity }).on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  void handle(message).then((reply) => {
    if (reply) process.stdout.write(`${JSON.stringify(reply)}
`);
  });
});
