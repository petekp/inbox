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
var LOCATION = /((?:[\w@.~-]*\/)*[\w@~-][\w@.~-]*\.[A-Za-z]\w{0,5})(?:\((\d+),\d+\)|:(\d+)(?::\d+)?)?(?![\w/])/g;
var LEADING_MARK = new RegExp(String.raw`^\s*(?:${FAIL_MARK}|❯)\s*`);
function failureList(check) {
  const list = [];
  for (const failure of check.failures) {
    const found = [...failure.matchAll(LOCATION)].find((m) => m[2] ?? m[3] ?? m[1]?.includes("/"));
    const line = found?.[2] ?? found?.[3];
    const file = found?.[1] ? `${found[1].replace(/^.*\//, "")}${line ? `:${line}` : ""}` : null;
    const text2 = failure.replace(found?.[0] ?? "", "").replace(LEADING_MARK, "").replace(/^\|[\w-]+\|\s*/, "").replace(/^[\s:>-]*(?:error(?:\s+TS\d+|\[\w+\])?:\s*)?/i, "").replace(/\s*[[(]?\d+(?:\.\d+)?\s?m?s[\])]?$/, "").trim();
    const earlier = list.find((f) => text2.endsWith(f.text));
    if (earlier) earlier.file ??= file;
    else if (text2) list.push({ file, text: text2 });
  }
  return list;
}
function failCount(check) {
  const m = check.summary.match(/^(\d+) pass, (\d+) fail$/);
  return m ? { fail: Number(m[2]), total: Number(m[1]) + Number(m[2]) } : null;
}
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
var CLOSED_SHOWN = 3;
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
    const text2 = how === "address" ? finding.kind === "issue" ? "Sent to Codex to fix" : "Sent to Codex to act on" : how === "discuss" ? "Discuss sent" : "Reply sent";
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
function isLapsed(d) {
  if (d.how === "dismissed" || d.how === "expired" || d.how === "claude") return true;
  return d.how === "update" && /^(no longer applies|replaced|superseded|moot)/i.test(d.outcome);
}
function checkRow(c, root) {
  const count = failCount(c);
  const failed = failureList(c);
  return {
    key: checkKey(c),
    name: checkName(c, root),
    outcome: count ? `${count.fail} of ${count.total} failed` : distinctSummary(c) ?? "failed",
    brief: count ? `${count.fail} failed` : failed.find((f) => f.file)?.file ?? null,
    ranAt: c.ranAt,
    isStale: c.isStale,
    failures: failed.map((f) => f.file ? `${f.file}: ${f.text}` : f.text),
    command: c.command,
    fixSentAt: c.fixSentAt
  };
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
    updatedAt: l.card?.updatedAt ?? null,
    waiting: questions.length + tasks.filter((t) => !t.isHandedOff).length + failing.count,
    questions,
    tasks,
    checks: failing.rows.map((c) => checkRow(c, s.root)),
    dismissedChecks: s.checks.results.filter((c) => c.isDismissed).map(checkKey),
    findings: l.findings.map((f) => ({ ...f, last: s.lastActions[f.id] ?? null })),
    leaving: Object.entries(s.lastActions).filter(([id, a]) => a.title !== void 0 && !open.has(id) && now - a.at < SETTLED_MS).map(([id, a]) => ({ id, title: a.title ?? "", text: a.text, at: a.at })),
    closed: ["question", "task"].flatMap(
      (kind) => l.closed.filter((d) => d.kind === kind).slice(-CLOSED_SHOWN).reverse().map((d) => ({ id: d.id, kind, ask: d.ask, outcome: d.outcome, isLapsed: isLapsed(d), at: d.at }))
    ),
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
var tab_default = '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>Inbox</title>\n    <style>\n      /* The host\'s variables when Codex passes them; otherwise the pane\'s own colors. */\n      :root {\n        --bg: var(--color-background-primary, #ffffff);\n        --text: var(--color-text-primary, #1f1f1f);\n        --muted: var(--color-text-secondary, #595959);\n        --line: var(--color-border-default, rgba(0, 0, 0, 0.12));\n        --card: var(--color-background-secondary, rgba(0, 0, 0, 0.035));\n        --key: #243bf5;\n        --needs-you: #745417;\n        --findings: #7b00e8;\n        --done: #25652f;\n        --error: #a5293d;\n        --error-mark: #a5293d;\n      }\n      @media (prefers-color-scheme: dark) {\n        :root:not([data-theme=\'light\']) {\n          --bg: var(--color-background-primary, #1e1e1e);\n          --text: var(--color-text-primary, #ececec);\n          --muted: var(--color-text-secondary, #bdbdbd);\n          --line: var(--color-border-default, rgba(255, 255, 255, 0.12));\n          --card: var(--color-background-secondary, rgba(255, 255, 255, 0.045));\n          --key: #b1b9f9;\n          --needs-you: #ffc107;\n          --findings: #cab0ff;\n          --done: #7ecd8f;\n          --error: #ffa3b0;\n          --error-mark: #ff6b80;\n        }\n      }\n      :root[data-theme=\'dark\'] {\n        --key: #b1b9f9;\n        --needs-you: #ffc107;\n        --findings: #cab0ff;\n        --done: #7ecd8f;\n        --error: #ffa3b0;\n        --error-mark: #ff6b80;\n      }\n      * {\n        box-sizing: border-box;\n      }\n      body {\n        margin: 0;\n        background: var(--bg);\n        color: var(--text);\n        font: 13px/1.45 var(--font-sans, system-ui, sans-serif);\n      }\n      button {\n        font: inherit;\n        color: inherit;\n        background: none;\n        border: none;\n        padding: 0;\n        cursor: pointer;\n        text-align: left;\n      }\n      .muted {\n        color: var(--muted);\n      }\n      .tone-needsYou {\n        color: var(--needs-you);\n      }\n      .tone-findings {\n        color: var(--findings);\n      }\n      .tone-done {\n        color: var(--done);\n      }\n      .tone-error {\n        color: var(--error);\n      }\n      .mark-error {\n        color: var(--error-mark);\n      }\n      .notice {\n        padding: 8px 16px;\n        color: var(--error);\n      }\n      header {\n        padding: 12px 16px 4px;\n      }\n      .goal {\n        font-weight: 600;\n      }\n      .goal-mark {\n        color: var(--muted);\n        margin-right: 6px;\n      }\n      .card-line {\n        padding-left: 18px;\n      }\n      nav {\n        display: flex;\n        flex-wrap: wrap;\n        align-items: flex-end;\n        justify-content: space-between;\n        gap: 4px 16px;\n        padding: 8px 16px 0;\n        border-bottom: 1px solid var(--line);\n      }\n      .tabs {\n        display: flex;\n        gap: 16px;\n      }\n      .tab {\n        padding: 6px 0;\n        border-bottom: 2px solid transparent;\n        margin-bottom: -1px;\n        color: var(--muted);\n      }\n      .tab.shown {\n        color: var(--text);\n        font-weight: 600;\n      }\n      .tab.shown.needsYou {\n        border-color: var(--needs-you);\n      }\n      .tab.shown.findings {\n        border-color: var(--findings);\n      }\n      .status {\n        padding: 6px 0;\n        color: var(--muted);\n      }\n      main {\n        display: flex;\n        flex-direction: column;\n        gap: 10px;\n        padding: 12px 12px 8px;\n      }\n      section {\n        background: var(--card);\n        border-radius: 8px;\n        padding: 8px 0;\n      }\n      .group-title {\n        padding: 2px 12px 6px;\n        font-weight: 600;\n      }\n      .group-title .count {\n        font-weight: normal;\n        color: var(--muted);\n        margin-left: 6px;\n      }\n      .entry + .entry {\n        border-top: 1px solid var(--line);\n      }\n      .row {\n        display: flex;\n        gap: 8px;\n        padding: 6px 12px 6px 9px;\n        border-left: 3px solid transparent;\n      }\n      .row.selected {\n        border-left-color: var(--key);\n        background: color-mix(in srgb, var(--key) 12%, transparent);\n        padding-top: 10px;\n        padding-bottom: 10px;\n      }\n      .handle {\n        flex: none;\n        width: 22px;\n        color: var(--muted);\n        font-variant-numeric: tabular-nums;\n      }\n      .handle.tone-done {\n        color: var(--done);\n      }\n      .handle.mark-error {\n        color: var(--error-mark);\n      }\n      .content {\n        flex: 1;\n        min-width: 0;\n        display: flex;\n        flex-direction: column;\n        gap: 6px;\n      }\n      .line {\n        display: flex;\n        gap: 0;\n        width: 100%;\n        min-width: 0;\n      }\n      .line .text {\n        min-width: 0;\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .line .text.two {\n        white-space: normal;\n        display: -webkit-box;\n        -webkit-line-clamp: 2;\n        -webkit-box-orient: vertical;\n      }\n      .line .after {\n        flex: none;\n        white-space: pre;\n        color: var(--muted);\n      }\n      .line .after.tone-done {\n        color: var(--done);\n      }\n      .line:hover .text {\n        text-decoration: underline;\n        text-decoration-color: var(--line);\n      }\n      .title {\n        font-weight: 600;\n      }\n      .title .after {\n        font-weight: normal;\n        color: var(--muted);\n      }\n      .body {\n        overflow-wrap: anywhere;\n      }\n      .body p {\n        margin: 0 0 4px;\n      }\n      .failure {\n        font: 12px var(--font-mono, ui-monospace, monospace);\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .command {\n        font: 12px var(--font-mono, ui-monospace, monospace);\n        color: var(--muted);\n        overflow-wrap: anywhere;\n      }\n      .keys {\n        display: flex;\n        flex-wrap: wrap;\n        align-items: center;\n        gap: 4px 6px;\n      }\n      .key {\n        border: 1px solid var(--line);\n        border-radius: 6px;\n        padding: 2px 8px;\n        background: var(--bg);\n      }\n      .key:hover {\n        border-color: var(--muted);\n      }\n      .key.primary {\n        border-color: var(--needs-you);\n      }\n      .key kbd {\n        font: inherit;\n        color: var(--key);\n        margin-right: 6px;\n      }\n      .key-dot {\n        color: var(--muted);\n        padding: 0 2px;\n      }\n      form {\n        display: flex;\n        gap: 6px;\n      }\n      input {\n        flex: 1;\n        min-width: 0;\n        font: inherit;\n        color: inherit;\n        background: var(--bg);\n        border: 1px solid var(--line);\n        border-radius: 6px;\n        padding: 3px 8px;\n      }\n      form button {\n        border: 1px solid var(--line);\n        border-radius: 6px;\n        padding: 2px 8px;\n        background: var(--bg);\n      }\n      textarea {\n        width: 100%;\n        font: 12px var(--font-mono, ui-monospace, monospace);\n        color: inherit;\n        background: var(--bg);\n        border: 1px solid var(--line);\n        border-radius: 6px;\n      }\n      .empty-line {\n        padding: 2px 12px 4px 42px;\n        color: var(--muted);\n      }\n      .fold {\n        padding: 6px 12px 2px 42px;\n        color: var(--muted);\n      }\n      .closed {\n        display: flex;\n        gap: 8px;\n        padding: 4px 12px 4px 42px;\n      }\n      .closed .ask {\n        color: var(--muted);\n      }\n      .closed .outcome {\n        font-weight: 600;\n      }\n      .closed .outcome.lapsed {\n        font-weight: normal;\n        color: var(--muted);\n      }\n      .settled .what {\n        color: var(--muted);\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .leave {\n        width: 96px;\n        height: 2px;\n        margin-top: 4px;\n      }\n      .leave div {\n        height: 100%;\n        background: var(--done);\n        animation-name: leave;\n        animation-timing-function: linear;\n        animation-fill-mode: forwards;\n      }\n      @keyframes leave {\n        from {\n          width: 100%;\n        }\n        to {\n          width: 0;\n        }\n      }\n      .empty {\n        padding: 48px 32px;\n        text-align: center;\n      }\n      .empty .title {\n        margin-bottom: 6px;\n      }\n      footer {\n        padding: 4px 16px 16px;\n        color: var(--muted);\n      }\n      footer kbd {\n        font: inherit;\n        color: var(--key);\n      }\n    </style>\n  </head>\n  <body>\n    <div id="app" class="notice muted">Loading\u2026</div>\n    <script>\n      "use strict";(()=>{var Q,g,$e,it,R,_e,Se,Ce,re,K,U,Te,le,oe,ae,rt,V={},X=[],ot=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,J=Array.isArray;function T(e,t){for(var n in t)e[n]=t[n];return e}function ce(e){e&&e.parentNode&&e.parentNode.removeChild(e)}function at(e,t,n){var i,r,s,a={};for(s in t)s=="key"?i=t[s]:s=="ref"?r=t[s]:a[s]=t[s];if(arguments.length>2&&(a.children=arguments.length>3?Q.call(arguments,2):n),typeof e=="function"&&e.defaultProps!=null)for(s in e.defaultProps)a[s]===void 0&&(a[s]=e.defaultProps[s]);return Y(e,a,i,r,null)}function Y(e,t,n,i,r){var s={type:e,props:t,key:n,ref:i,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:r??++$e,__i:-1,__u:0};return r==null&&g.vnode!=null&&g.vnode(s),s}function A(e){return e.children}function G(e,t){this.props=e,this.context=t}function L(e,t){if(t==null)return e.__?L(e.__,e.__i+1):null;for(var n;t<e.__k.length;t++)if((n=e.__k[t])!=null&&n.__e!=null)return n.__e;return typeof e.type=="function"?L(e):null}function lt(e){if(e.__P&&e.__d){var t=e.__v,n=t.__e,i=[],r=[],s=T({},t);s.__v=t.__v+1,g.vnode&&g.vnode(s),de(e.__P,s,t,e.__n,e.__P.namespaceURI,32&t.__u?[n]:null,i,n??L(t),!!(32&t.__u),r),s.__v=t.__v,s.__.__k[s.__i]=s,Ne(i,s,r),t.__e=t.__=null,s.__e!=n&&Ae(s)}}function Ae(e){if((e=e.__)!=null&&e.__c!=null)return e.__e=e.__c.base=null,e.__k.some(function(t){if(t!=null&&t.__e!=null)return e.__e=e.__c.base=t.__e}),Ae(e)}function we(e){(!e.__d&&(e.__d=!0)&&R.push(e)&&!z.__r++||_e!=g.debounceRendering)&&((_e=g.debounceRendering)||Se)(z)}function z(){try{for(var e,t=1;R.length;)R.length>t&&R.sort(Ce),e=R.shift(),t=R.length,lt(e)}finally{R.length=z.__r=0}}function Re(e,t,n,i,r,s,a,d,p,c,u){var f,o,h,y,w,b,k=i&&i.__k||X,m=t.length;for(p=ct(n,t,k,p,m),f=0;f<m;f++)(h=n.__k[f])!=null&&(o=h.__i!=-1&&k[h.__i]||V,h.__i=f,b=de(e,h,o,r,s,a,d,p,c,u),y=h.__e,h.ref&&o.ref!=h.ref&&(o.ref&&ue(o.ref,null,h),u.push(h.ref,h.__c||y,h)),w==null&&y!=null&&(w=y),4&h.__u?(p=Ee(h,p,e),o.__e&&(o.__e=null)):typeof h.type=="function"&&b!==void 0?p=b:y&&(p=y.nextSibling),h.__u&=-7);return n.__e=w,p}function ct(e,t,n,i,r){var s,a,d,p,c,u=n.length,f=u,o=0;for(e.__k=new Array(r),s=0;s<r;s++)(a=t[s])!=null&&typeof a!="boolean"&&typeof a!="function"?(typeof a=="string"||typeof a=="number"||typeof a=="bigint"||a.constructor==String?a=e.__k[s]=Y(null,a,null,null,null):J(a)?a=e.__k[s]=Y(A,{children:a},null,null,null):a.constructor===void 0&&a.__b>0?a=e.__k[s]=Y(a.type,a.props,a.key,a.ref?a.ref:null,a.__v):e.__k[s]=a,p=s+o,a.__=e,a.__b=e.__b+1,d=null,(c=a.__i=dt(a,n,p,f))!=-1&&(f--,(d=n[c])&&(d.__u|=2)),d==null||d.__v==null?(c==-1&&(r>u?o--:r<u&&o++),typeof a.type!="function"&&(a.__u|=4)):c!=p&&(c==p-1?o--:c==p+1?o++:(c>p?o--:o++,a.__u|=4))):e.__k[s]=null;if(f)for(s=0;s<u;s++)(d=n[s])!=null&&(2&d.__u)==0&&(d.__e==i&&(i=L(d)),Oe(d,d));return i}function Ee(e,t,n){var i,r;if(typeof e.type=="function"){for(i=e.__k,r=0;i&&r<i.length;r++)i[r]&&(i[r].__=e,t=Ee(i[r],t,n));return t}e.__e!=t&&(t&&e.type&&!t.parentNode&&(t=L(e)),t=n.insertBefore(e.__e,t||null));do t=t&&t.nextSibling;while(t!=null&&t.nodeType==8);return t}function dt(e,t,n,i){var r,s,a,d=e.key,p=e.type,c=t[n],u=c!=null&&(2&c.__u)==0;if(c===null&&d==null||u&&d==c.key&&p==c.type)return n;if(i>(u?1:0)){for(r=n-1,s=n+1;r>=0||s<t.length;)if((c=t[a=r>=0?r--:s++])!=null&&(2&c.__u)==0&&d==c.key&&p==c.type)return a}return-1}function xe(e,t,n){t[0]=="-"?e.setProperty(t,n??""):e[t]=n==null?"":typeof n!="number"||ot.test(t)?n:n+"px"}function B(e,t,n,i,r){var s,a;e:if(t=="style")if(typeof n=="string")e.style.cssText=n;else{if(typeof i=="string"&&(e.style.cssText=i=""),i)for(t in i)n&&t in n||xe(e.style,t,"");if(n)for(t in n)i&&n[t]==i[t]||xe(e.style,t,n[t])}else if(t[0]=="o"&&t[1]=="n")s=t!=(t=t.replace(Te,"$1")),a=t.toLowerCase(),t=a in e||t=="onFocusOut"||t=="onFocusIn"?a.slice(2):t.slice(2),e.l||(e.l={}),e.l[t+s]=n,n?i?n[U]=i[U]:(n[U]=le,e.addEventListener(t,s?ae:oe,s)):e.removeEventListener(t,s?ae:oe,s);else{if(r=="http://www.w3.org/2000/svg")t=t.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(t!="width"&&t!="height"&&t!="href"&&t!="list"&&t!="form"&&t!="tabIndex"&&t!="download"&&t!="rowSpan"&&t!="colSpan"&&t!="role"&&t!="popover"&&t in e)try{e[t]=n??"";break e}catch{}typeof n=="function"||(n==null||n===!1&&t[4]!="-"?e.removeAttribute(t):e.setAttribute(t,t=="popover"&&n==1?"":n))}}function ve(e){return function(t){if(this.l){var n=this.l[t.type+e];if(t[K]==null)t[K]=le++;else if(t[K]<n[U])return;return n(g.event?g.event(t):t)}}}function de(e,t,n,i,r,s,a,d,p,c){var u,f,o,h,y,w,b,k,m,v,F,E,M,be,q,ie,$=t.type;if(t.constructor!==void 0)return null;128&n.__u&&(p=!!(32&n.__u),s=[d=t.__e=n.__e]),(u=g.__b)&&u(t);e:if(typeof $=="function"){f=a.length;try{if(m=t.props,v=$.prototype&&$.prototype.render,F=(u=$.contextType)&&i[u.__c],E=u?F?F.props.value:u.__:i,n.__c?k=(o=t.__c=n.__c).__=o.__E:(v?t.__c=o=new $(m,E):(t.__c=o=new G(m,E),o.constructor=$,o.render=pt),F&&F.sub(o),o.state||(o.state={}),o.__n=i,h=o.__d=!0,o.__h=[],o._sb=[]),v&&o.__s==null&&(o.__s=o.state),v&&$.getDerivedStateFromProps!=null&&(o.__s==o.state&&(o.__s=T({},o.__s)),T(o.__s,$.getDerivedStateFromProps(m,o.__s))),y=o.props,w=o.state,o.__v=t,h)v&&$.getDerivedStateFromProps==null&&o.componentWillMount!=null&&o.componentWillMount(),v&&o.componentDidMount!=null&&o.__h.push(o.componentDidMount);else{if(v&&$.getDerivedStateFromProps==null&&m!==y&&o.componentWillReceiveProps!=null&&o.componentWillReceiveProps(m,E),t.__v==n.__v||!o.__e&&o.shouldComponentUpdate!=null&&o.shouldComponentUpdate(m,o.__s,E)===!1){t.__v!=n.__v&&(o.props=m,o.state=o.__s,o.__d=!1),t.__e=n.__e,t.__k=n.__k,t.__k.some(function(P){P&&(P.__=t)}),X.push.apply(o.__h,o._sb),o._sb=[],o.__h.length&&a.push(o),d=L(n);break e}o.componentWillUpdate!=null&&o.componentWillUpdate(m,o.__s,E),v&&o.componentDidUpdate!=null&&o.__h.push(function(){o.componentDidUpdate(y,w,b)})}if(o.context=E,o.props=m,o.__P=e,o.__e=!1,M=g.__r,be=0,v)o.state=o.__s,o.__d=!1,M&&M(t),u=o.render(o.props,o.state,o.context),X.push.apply(o.__h,o._sb),o._sb=[];else do o.__d=!1,M&&M(t),u=o.render(o.props,o.state,o.context),o.state=o.__s;while(o.__d&&++be<25);o.state=o.__s,o.getChildContext!=null&&(i=T(T({},i),o.getChildContext())),v&&!h&&o.getSnapshotBeforeUpdate!=null&&(b=o.getSnapshotBeforeUpdate(y,w)),q=u!=null&&u.type===A&&u.key==null?Ie(u.props.children):u,d=Re(e,J(q)?q:[q],t,n,i,r,s,a,d,p,c),o.base=t.__e,t.__u&=-161,o.__h.length&&a.push(o),k&&(o.__E=o.__=null)}catch(P){if(a.length=f,t.__v=null,p||s!=null){if(P.then){for(t.__u|=p?160:128;d&&d.nodeType==8&&d.nextSibling;)d=d.nextSibling;s!=null&&(s[s.indexOf(d)]=null),t.__e=d}else if(s!=null)for(ie=s.length;ie--;)ce(s[ie])}else t.__e=n.__e;t.__k==null&&(t.__k=n.__k||[]),P.then||Le(t),g.__e(P,t,n)}}else s==null&&t.__v==n.__v?(t.__k=n.__k,t.__e=n.__e):d=t.__e=ut(n.__e,t,n,i,r,s,a,p,c);return(u=g.diffed)&&u(t),128&t.__u?void 0:d}function Le(e){e&&(e.__c&&(e.__c.__e=!0),e.__k&&e.__k.some(Le))}function Ne(e,t,n){for(var i=0;i<n.length;i++)ue(n[i],n[++i],n[++i]);g.__c&&g.__c(t,e),e.some(function(r){try{e=r.__h,r.__h=[],e.some(function(s){s.call(r)})}catch(s){g.__e(s,r.__v)}})}function Ie(e){return typeof e!="object"||e==null||e.__b>0?e:J(e)?e.map(Ie):e.constructor!==void 0?null:T({},e)}function ut(e,t,n,i,r,s,a,d,p){var c,u,f,o,h,y,w,b=n.props||V,k=t.props,m=t.type;if(m=="svg"?r="http://www.w3.org/2000/svg":m=="math"?r="http://www.w3.org/1998/Math/MathML":r||(r="http://www.w3.org/1999/xhtml"),s!=null){for(c=0;c<s.length;c++)if((h=s[c])&&"setAttribute"in h==!!m&&(m?h.localName==m:h.nodeType==3)){e=h,s[c]=null;break}}if(e==null){if(m==null)return document.createTextNode(k);e=document.createElementNS(r,m,k.is&&k),d&&(g.__m&&g.__m(t,s),d=!1),s=null}if(m==null)b===k||d&&e.data==k||(e.data=k);else{if(s=m=="textarea"&&k.defaultValue!=null?null:s&&Q.call(e.childNodes),!d&&s!=null)for(b={},c=0;c<e.attributes.length;c++)b[(h=e.attributes[c]).name]=h.value;for(c in b)h=b[c],c=="dangerouslySetInnerHTML"?f=h:c=="children"||c in k||c=="value"&&"defaultValue"in k||c=="checked"&&"defaultChecked"in k||B(e,c,null,h,r);for(c in k)h=k[c],c=="children"?o=h:c=="dangerouslySetInnerHTML"?u=h:c=="value"?y=h:c=="checked"?w=h:d&&typeof h!="function"||b[c]===h||B(e,c,h,b[c],r);if(u)d||f&&(u.__html==f.__html||u.__html==e.innerHTML)||(e.innerHTML=u.__html),t.__k=[];else if(f&&(e.innerHTML=""),Re(t.type=="template"?e.content:e,J(o)?o:[o],t,n,i,m=="foreignObject"?"http://www.w3.org/1999/xhtml":r,s,a,s?s[0]:n.__k&&L(n,0),d,p),s!=null)for(c=s.length;c--;)ce(s[c]);d&&m!="textarea"||(c="value",m=="progress"&&y==null?e.removeAttribute("value"):y!=null&&(y!==e[c]||m=="progress"&&!y||m=="option"&&y!=b[c])&&B(e,c,y,b[c],r),c="checked",w!=null&&w!=e[c]&&B(e,c,w,b[c],r))}return e}function ue(e,t,n){try{if(typeof e=="function"){var i=typeof e.__u=="function";i&&e.__u(),i&&t==null||(e.__u=e(t))}else e.current=t}catch(r){g.__e(r,n)}}function Oe(e,t,n){var i,r;if(g.unmount&&g.unmount(e),(i=e.ref)&&(i.current&&i.current!=e.__e||ue(i,null,t)),(i=e.__c)!=null){if(i.componentWillUnmount)try{i.componentWillUnmount()}catch(s){g.__e(s,t)}i.base=i.__P=i.__n=null}if(i=e.__k)for(r=0;r<i.length;r++)i[r]&&Oe(i[r],t,n||typeof e.type!="function");n||ce(e.__e),e.__c=e.__=e.__e=void 0}function pt(e,t,n){return this.constructor(e,n)}function Pe(e,t,n){var i,r,s,a;t==document&&(t=document.documentElement),g.__&&g.__(e,t),r=(i=typeof n=="function")?null:n&&n.__k||t.__k,s=[],a=[],de(t,e=(!i&&n||t).__k=at(A,null,[e]),r||V,V,t.namespaceURI,!i&&n?[n]:r?null:t.firstChild?Q.call(t.childNodes):null,s,!i&&n?n:r?r.__e:t.firstChild,i,a),Ne(s,e,a),e.props.children=null}Q=X.slice,g={__e:function(e,t,n,i){for(var r,s,a;t=t.__;)if((r=t.__c)&&!r.__)try{if((s=r.constructor)&&s.getDerivedStateFromError!=null&&(r.setState(s.getDerivedStateFromError(e)),a=r.__d),r.componentDidCatch!=null&&(r.componentDidCatch(e,i||{}),a=r.__d),a)return r.__E=r}catch(d){e=d}throw e}},$e=0,it=function(e){return e!=null&&e.constructor===void 0},G.prototype.setState=function(e,t){var n;n=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=T({},this.state),typeof e=="function"&&(e=e(T({},n),this.props)),e&&T(n,e),e!=null&&this.__v&&(t&&this._sb.push(t),we(this))},G.prototype.forceUpdate=function(e){this.__v&&(this.__e=!0,e&&this.__h.push(e),we(this))},G.prototype.render=A,R=[],Se=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,Ce=function(e,t){return e.__v.__b-t.__v.__b},z.__r=0,re=Math.random().toString(8),K="__d"+re,U="__a"+re,Te=/(PointerCapture)$|Capture$/i,le=0,oe=ve(!1),ae=ve(!0),rt=0;function S(e){let t=Math.round(e/6e4);if(t<1)return"just now";if(t<60)return`${t}m ago`;let n=Math.round(t/60);return n<48?`${n}h ago`:`${Math.round(n/24)}d ago`}var ft=String.raw`(?:-{1,2}[\\w-]+(?:=\\S+|\\s+(?!-|(?:run|test|build|lint)\\b)\\S+)?\\s+)*`,Z=(e,t)=>new RegExp(String.raw`\\b(${e})\\s+${ft}(?:run\\s+)?(?:${t})(:[\\w.:-]*\\w)?\\b`),Dt=[{kind:"tests",pattern:/\\bclaude\\s+plugin\\s+test\\b/,name:()=>"plugin tests"},{kind:"validate",pattern:/\\bclaude\\s+plugin\\s+validate\\b/,name:()=>"plugin validate"},{kind:"tests",pattern:Z("bun|npm|pnpm|yarn|deno","test"),name:e=>`${e[1]} test${e[2]??""}`},{kind:"tests",pattern:/\\bnode\\s+(?:-{1,2}[\\w-]+(?:=\\S+)?\\s+)*--test\\b/,name:()=>"node --test"},{kind:"tests",pattern:/\\b(vitest|jest|pytest|rspec|mocha|phpunit|ava|tap)\\b/,name:e=>e[1]??"tests"},{kind:"tests",pattern:/\\b(go|cargo|swift|mix|dotnet)\\s+test\\b/,name:e=>`${e[1]} test`},{kind:"tests",pattern:/\\bplaywright\\s+test\\b/,name:()=>"playwright"},{kind:"tests",pattern:/\\bxcodebuild\\b[^|;&]*\\btest\\b/,name:()=>"xcodebuild test"},{kind:"tests",pattern:/\\bmake\\s+(?:check|test)\\b/,name:e=>e[0]},{kind:"types",pattern:/\\btsc\\b/,name:()=>"tsc"},{kind:"types",pattern:/\\b(mypy|pyright)\\b/,name:e=>e[1]??"types"},{kind:"types",pattern:Z("bun|npm|pnpm|yarn","typecheck|type-check|check-types"),name:e=>`typecheck${e[2]??""}`},{kind:"types",pattern:/\\bcargo\\s+check\\b/,name:()=>"cargo check"},{kind:"lint",pattern:/\\b(eslint|biome|ruff|shellcheck|swiftlint|clippy|golangci-lint|stylelint)\\b/,name:e=>e[1]??"lint"},{kind:"lint",pattern:Z("bun|npm|pnpm|yarn","lint"),name:e=>`lint${e[2]??""}`},{kind:"lint",pattern:/\\bprettier\\b[^|;&]*--check\\b/,name:()=>"prettier"},{kind:"build",pattern:Z("bun|npm|pnpm|yarn","build"),name:e=>`${e[1]} build${e[2]??""}`},{kind:"build",pattern:/\\b(cargo|go|swift)\\s+build\\b/,name:e=>`${e[1]} build`},{kind:"build",pattern:/\\bxcodebuild\\b(?![^|;&]*\\btest\\b)/,name:()=>"xcodebuild"},{kind:"build",pattern:/\\b(?:next|vite)\\s+build\\b/,name:e=>e[0]},{kind:"validate",pattern:/(?:^|\\s)(?:\\S*\\/)?[\\w.-]*(?:validate|doctor)[\\w.-]*\\.sh\\b/,name:e=>e[0].trim().replace(/^.*\\//,"")},{kind:"all",pattern:/(?:^|\\s)(?:\\S*\\/)?checks?\\.sh\\b/,name:e=>e[0].trim().replace(/^.*\\//,"")}];var ht=new Set(["--prefix","-C","--cwd","--dir","--directory","--package-path","--manifest-path"]),Ft=new Set([...ht,"-p","--project"]);var De=String.raw`\\(fail\\)|FAIL(?:ED)?\\b|\u2717|\u2716(?! failing tests:)|\xD7|\u2718`,Mt=new RegExp(String.raw`^\\s*(?:${De})|\\berror\\s+TS\\d+\\b|^\\s*(?:[A-Z]\\w*Error|error)(?:\\[\\w+\\])?:`);var Ut=new RegExp(String.raw`^\\s*(?:${De}|\u276F)\\s*`);var ee=5120;var gt=0;function l(e,t,n,i,r,s){t||(t={});var a,d,p=t;if("ref"in p)for(d in p={},t)d=="ref"?a=t[d]:p[d]=t[d];var c={type:e,props:p,key:n,ref:a,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--gt,__i:-1,__u:0,__source:r,__self:s};if(typeof e=="function"&&(a=e.defaultProps))for(d in a)p[d]===void 0&&(p[d]=a[d]);return g.vnode&&g.vnode(c),c}var Fe=[..."abcfghilm"],qe=[{id:"needsYou",label:"Needs you",hotkey:"1"},{id:"findings",label:"Findings",hotkey:"2"}],yt=3e3,I=null,ne=!1,N="needsYou",Be={needsYou:null,findings:null},O=null,he=!1,H=new Map,D=new Set,pe=new Set,me=new Set,W=new Map,se=new Map,ge=new Map,C=[],fe={check:[],question:[],task:[],finding:[]},Ke=0,Me=0,ye=!1,kt=0,te=new Map;function Ye(e,t){return new Promise((n,i)=>{let r=++kt;te.set(r,{resolve:n,reject:i}),parent.postMessage({jsonrpc:"2.0",id:r,method:e,params:t},"*")})}window.addEventListener("message",e=>{let t=e.data;if(!(!t||t.jsonrpc!=="2.0")){if(t.id!=null&&!t.method&&te.has(t.id)){let n=te.get(t.id);te.delete(t.id),t.error?n.reject(t.error):n.resolve(t.result);return}t.method==="ui/notifications/host-context-changed"&&Ge(t.params??{}),t.id!=null&&t.method&&parent.postMessage({jsonrpc:"2.0",id:t.id,result:{}},"*")}});function Ge(e){e.theme&&(document.documentElement.dataset.theme=e.theme);for(let[t,n]of Object.entries(e.styles?.variables??{}))document.documentElement.style.setProperty(t,n)}async function Ve(e,t={}){return(await Ye("tools/call",{name:e,arguments:t}))?.structuredContent}function bt(e){return{check:e.checks.map(t=>`check:${t.key}`),question:e.questions.map(t=>t.id),task:e.tasks.map(t=>t.id),finding:[...e.findings].reverse().map(t=>t.id)}}function _t(e,t,n,i){if(n==="check"){let s=e.checks.find(a=>`check:${a.key}`===i);return s&&!t.dismissedChecks.includes(s.key)?{what:s.name,outcome:"Passed"}:null}if(n==="finding"){let s=t.leaving.find(a=>a.id===i);return s?{what:s.title,outcome:s.text}:null}let r=t.closed.find(s=>s.id===i);return r?{what:r.ask,outcome:Qe(r.outcome)}:null}function Xe(e,t){if(t<Me)return;Me=t,ne=!1;let n=Date.now(),i=bt(e),r=[];if(I)for(let s of Object.keys(fe))fe[s].forEach((a,d)=>{if(i[s].includes(a)||C.some(c=>c.id===a))return;let p=_t(I,e,s,a);p&&r.push({id:a,group:s,index:d,...p,at:n})});C=[...C.filter(s=>!i[s.group].includes(s.id)),...r],r.length>0&&setTimeout(_,ee+50),fe=i,I=e,_()}async function ze(){if(!ye){let e=++Ke;try{let t=await Ve("inbox_view");t&&Xe(t,e)}catch{ne=!0,_()}}setTimeout(ze,yt)}async function x(e,t,n){me.add(e),W.delete(e),se.delete(e),_(),ye=!0;let i=++Ke;try{let r=await Ve("inbox_press",{press:t});r?.error?W.set(e,r.error):n?.(),r?.copy&&await wt(e,r.copy),r?.view&&Xe(r.view,i)}catch{W.set(e,"Not sent: the inbox did not answer.")}finally{ye=!1,me.delete(e),_()}}async function wt(e,t){try{await navigator.clipboard.writeText(t.text),se.set(e,`Copied ${t.name}`)}catch{ge.set(e,t)}}function Qe(e){return e.charAt(0).toUpperCase()+e.slice(1)}function Ue(e,t){return e.length>t?`${e.slice(0,t-1)}\\u2026`:e}function Je(e){O=e,he=!0,_()}function je(e,t,n){let i=t.last,r=t.kind==="question",s=(u,f)=>i?.action===f?`${u} again`:u,a=t.id,d=[...r?t.options.map((u,f)=>({label:u.isRec?`${Ue(u.text,32)} (recommended)`:Ue(u.text,32),isPrimary:u.isRec,run:()=>{x(a,{action:"answer",id:a,option:f})}})):[],...t.steps.map((u,f)=>({label:s(u,`step-${f}`),run:()=>{x(a,{action:"step",id:a,step:f})}}))].slice(0,Fe.length).map((u,f)=>({...u,hotkey:Fe[f]})),p={hotkey:"t",label:r?"Type an answer":"Type a reply",run:()=>Je(a)},c={hotkey:"e",label:s("Explain","explain"),run:()=>{x(a,{action:"explain",id:a})}};return{id:a,handle:t.isHandedOff?"\\u2713":n,handleTone:t.isHandedOff?"done":void 0,...t.isHandedOff?{fold:{}}:{},title:t.ask,titleAfter:t.at===null?void 0:` \\xB7 ${S(e.at-t.at)}`,hasSecondLine:r,keys:r?d:[...d,{hotkey:"d",label:"Done",run:()=>{x(a,{action:"done",id:a})}}],more:r?[p,c,{hotkey:"x",label:"Dismiss",run:()=>{x(a,{action:"dismiss",id:a})}}]:[p,c],typing:{hint:r?"Your answer":"Your reply to Codex",send:u=>{x(a,{action:"type",id:a,text:u},()=>H.delete(a))}},last:i}}function xt(e,t){let n=`check:${t.key}`,i=S(e.at-t.ranAt),r=t.fixSentAt===null?null:S(e.at-t.fixSentAt);return{id:n,handle:r?"\\u2713":"\\u2717",handleTone:r?"done":"error",...r?{fold:{note:`Fix sent \\xB7 ${r}`}}:{},title:`${t.name} \\xB7 ${t.outcome}`,subtitle:l("div",{class:"muted",children:[i,t.isStale?l("span",{class:"tone-needsYou",children:", before the last edit"}):null]}),line:r?{text:t.name,after:` \\xB7 fix sent ${r}`,afterTone:"done"}:{text:t.name,after:`${t.brief?` \\xB7 ${t.brief}`:""} \\xB7 ${i}`},body:l("div",{children:[t.failures.map(s=>l("div",{class:"failure",title:s,children:s})),t.command?l("div",{class:"command",children:["$ ",t.command]}):null]}),keys:[{hotkey:"a",label:r?"Fix again":"Fix",run:()=>{x(n,{action:"fix",key:t.key})}}],more:[{hotkey:"x",label:"Dismiss",run:()=>{x(n,{action:"dismissCheck",key:t.key})}}]}}var vt={issue:{label:"Issue",mark:"\\u25B2",tone:"needsYou"},opportunity:{label:"Opportunity",mark:"\\u2726",tone:"done"}};function $t(e,t){let n=vt[t.kind],i=t.id;return{id:i,handle:"\\u2022",title:t.title,meta:l("div",{children:[l("span",{class:`tone-${n.tone}`,children:[n.mark," ",n.label]}),l("span",{class:"muted",children:[" ",S(e.at-t.at)]})]}),line:{text:t.title,after:` \\xB7 ${S(e.at-t.at)}`},body:l("div",{children:[l("p",{children:t.detail}),t.path?l("p",{children:[l("span",{class:"muted",children:"Relevant file: "}),t.path]}):null]}),keys:[{hotkey:"a",label:"Address it",run:()=>{x(i,{action:"address",id:i})}}],more:[{hotkey:"t",label:"Type a reply",run:()=>Je(i)},{hotkey:"e",label:"Discuss",run:()=>{x(i,{action:"discuss",id:i})}},{hotkey:"x",label:"Dismiss",run:()=>{x(i,{action:"dismissFinding",id:i})}}],typing:{hint:"Your reply to Codex",send:r=>{x(i,{action:"typedFinding",id:i,text:r},()=>H.delete(i))}},last:t.last}}function Ze(e){let t=e.checks.map(s=>xt(e,s)),n=e.questions.map((s,a)=>je(e,s,`${a+1})`)),i=e.tasks.map(s=>je(e,s,"\\u2022")),r=[...e.findings].reverse().map(s=>$t(e,s));return{checks:t,questions:n,tasks:i,findings:r,byTab:{needsYou:[...t,...n,...i],findings:r}}}function et(e,t){let n=Be[t];if(!n)return e.length>0?0:-1;let i=e.findIndex(r=>r.id===n.id);return i>=0?i:Math.min(n.index,e.length-1)}function tt(e,t,n){let i=t[n];i&&(Be[e]={id:i.id,index:n},_())}function nt(e){let t={hotkey:"v",label:D.has(e.id)?"Hide details":"Details",run:()=>{D.has(e.id)?D.delete(e.id):D.add(e.id),_()}};return e.fold&&!D.has(e.id)?{keys:[t],more:[]}:e.fold?{keys:e.keys,more:[...e.more,t]}:{keys:e.keys,more:e.more}}function He({k:e}){return l("button",{type:"button",class:e.isPrimary?"key primary":"key",onClick:e.run,children:[l("kbd",{children:e.hotkey}),e.label]})}function St({row:e}){let t=e.typing;return l("form",{onSubmit:i=>{i.preventDefault();let r=(H.get(e.id)??"").trim();r&&(O=null,t.send(r))},children:[l("input",{id:`type-${e.id}`,value:H.get(e.id)??"",placeholder:t.hint,"aria-label":t.hint,onInput:i=>H.set(e.id,i.currentTarget.value)}),l("button",{type:"submit",children:"Send"}),l("button",{type:"button",onClick:()=>{O=null,_()},children:"Cancel"})]})}function Ct(e,t){return e.last?`${e.last.text} \\xB7 ${S(t-e.last.at)}`:null}function Tt({row:e,isSelected:t,onSelect:n,now:i}){let r=e.handleTone==="done"?"tone-done":"muted",s=l("span",{class:`handle ${e.handleTone?`mark-${e.handleTone} tone-${e.handleTone}`:""}`,children:e.handle});if(!t){let f=e.line??{text:e.title,after:e.titleAfter},o=e.last?{...f,after:` \\xB7 ${e.last.text.charAt(0).toLowerCase()}${e.last.text.slice(1)} ${S(i-e.last.at)}`,afterTone:e.handleTone==="done"?"done":void 0}:f;return l("div",{class:"row",children:[s,l("button",{type:"button",class:"line",onClick:n,children:[l("span",{class:e.hasSecondLine?"text two":"text",children:o.text}),o.after?l("span",{class:`after ${o.afterTone?`tone-${o.afterTone}`:""}`,children:o.after}):null]})]})}let a=!e.fold||D.has(e.id),{keys:d,more:p}=nt(e),c=[e.fold?.note,Ct(e,i)],u=ge.get(e.id);return l("div",{class:"row selected",children:[s,l("div",{class:"content",children:[e.meta,l("div",{class:"title",children:[e.title,e.titleAfter?l("span",{class:"after",children:e.titleAfter}):null]}),e.subtitle,a&&e.body?l("div",{class:"body",children:e.body}):null,c.filter(Boolean).map(f=>l("div",{class:r,children:f})),me.has(e.id)?l("div",{class:"muted",children:"Sending\\u2026"}):null,se.has(e.id)?l("div",{class:"muted",children:se.get(e.id)}):null,W.has(e.id)?l("div",{class:"tone-error",children:W.get(e.id)}):null,l("div",{class:"keys",children:[d.map(f=>l(He,{k:f})),d.length>0&&p.length>0?l("span",{class:"key-dot",children:"\\xB7"}):null,p.map(f=>l(He,{k:f}))]}),e.typing&&O===e.id?l(St,{row:e}):null,u?l("div",{children:[l("div",{class:"muted",children:["Copy ",u.name," from here:"]}),l("textarea",{rows:3,readOnly:!0,value:u.text,onFocus:f=>f.currentTarget.select()}),l("button",{type:"button",class:"key",onClick:()=>{ge.delete(e.id),_()},children:"Close"})]}):null]})]})}function At({s:e}){return l("div",{class:"row settled",children:[l("span",{class:"handle tone-done",children:"\\u2713"}),l("div",{class:"content",style:{gap:"0"},children:[l("div",{class:"what",children:e.what}),l("div",{class:"tone-done",children:e.outcome}),l("div",{class:"leave",children:l("div",{style:{animationDuration:`${ee}ms`},ref:t=>{t&&!t.style.animationDelay&&(t.style.animationDelay=`-${Math.max(0,Date.now()-e.at)}ms`)}})})]})]})}function ke({rows:e,group:t,all:n,now:i}){let r=t==="finding"?"findings":"needsYou",s=et(n,r),a=e.map(d=>({row:d}));for(let d of C.filter(p=>p.group===t).sort((p,c)=>p.index-c.index))a.splice(Math.min(d.index,a.length),0,{settled:d});return l(A,{children:a.map(d=>"row"in d?l("div",{class:"entry",children:l(Tt,{row:d.row,now:i,isSelected:n.indexOf(d.row)===s,onSelect:()=>tt(r,n,n.indexOf(d.row))})},d.row.id):l("div",{class:"entry",children:l(At,{s:d.settled})},`settled-${d.settled.id}`))})}function st({title:e,count:t}){return l("div",{class:"group-title",children:[e,t>0?l("span",{class:"count",children:t}):null]})}function We({v:e,kind:t,rows:n,all:i,now:r}){let s=t==="question"?"Questions":"Your tasks",a=t==="question"?"No questions are waiting on you.":"No tasks are waiting on you.",d=new Set(C.map(f=>f.id)),p=e.closed.filter(f=>f.kind===t&&!d.has(f.id)),c=pe.has(t),u=n.length>0||C.some(f=>f.group===t);return l("section",{children:[l(st,{title:s,count:n.filter(f=>!f.fold).length}),u?l(ke,{rows:n,group:t,all:i,now:r}):l("div",{class:"empty-line",children:a}),p.length>0?l("button",{type:"button",class:"fold",onClick:()=>{c?pe.delete(t):pe.add(t),_()},children:[c?"\\u25BE":"\\u25B8"," ",p.length," Closed"]}):null,c?p.map(f=>l("div",{class:"closed",children:[l("span",{class:"muted",children:"\\u25C7"}),l("div",{children:[l("div",{class:"ask",children:f.ask}),l("div",{children:[l("span",{class:f.isLapsed?"outcome lapsed":"outcome",children:Qe(f.outcome)}),l("span",{class:"muted",children:[" \\xB7 ",S(r-f.at)]})]})]})]},`closed-${f.id}`)):null]})}function Rt({v:e,lists:t,now:n}){let i=t.byTab.needsYou,r=t.checks.length>0||C.some(s=>s.group==="check");return l("main",{children:[r?l("section",{children:[l(st,{title:"Failing checks",count:t.checks.filter(s=>!s.fold).length}),l(ke,{rows:t.checks,group:"check",all:i,now:n})]}):null,l(We,{v:e,kind:"question",rows:t.questions,all:i,now:n}),l(We,{v:e,kind:"task",rows:t.tasks,all:i,now:n})]})}function Et({lists:e,now:t}){return e.findings.length===0&&!C.some(n=>n.group==="finding")?l("div",{class:"empty",children:[l("div",{class:"title",children:"No findings yet"}),l("div",{class:"muted",children:"Codex flags issues and opportunities it spots beyond your task."})]}):l("main",{children:l("section",{children:l(ke,{rows:e.findings,group:"finding",all:e.findings,now:t})})})}function Lt({v:e}){return e.goal?l("header",{children:[l("div",{class:"goal",children:[l("span",{class:"goal-mark",children:"\\u25C6"}),e.goal]}),e.now?l("div",{class:"card-line muted",children:["Now ",e.now]}):null,e.running.slice(0,3).map(t=>l("div",{class:"card-line muted",children:[l("span",{class:"tone-done",children:"\\u25CF"})," ",t]}))]}):null}function Nt({v:e,lists:t,now:n}){let i={needsYou:e.waiting,findings:t.findings.length},r=e.updating?"Updating\\u2026":e.updatedAt!==null?`Updated ${S(n-e.updatedAt)}`:"Not updated yet";return l("nav",{children:[l("div",{class:"tabs",children:qe.map(s=>l("button",{type:"button",class:`tab ${s.id} ${N===s.id?"shown":""}`,onClick:()=>{N=s.id,_()},children:[s.label,i[s.id]>0?l("span",{class:`tone-${s.id}`,children:[" ",i[s.id]]}):null]}))}),l("div",{class:"status",children:[r,e.failed&&!e.updating?l("span",{class:"tone-error",children:" \\xB7 update failed, retries after the next reply"}):null]})]})}function It(){if(!I)return l("div",{class:"notice",children:ne?"Could not read the inbox.":l("span",{class:"muted",children:"Loading\\u2026"})});let e=I,t=e.at,n=Ze(e);return l(A,{children:[ne?l("div",{class:"notice",children:"Could not read the inbox."}):null,l(Lt,{v:e}),l(Nt,{v:e,lists:n,now:t}),N==="needsYou"?l(Rt,{v:e,lists:n,now:t}):l(Et,{lists:n,now:t}),l("footer",{children:[l("kbd",{children:"1 2"})," Switch tabs \\xB7 ",l("kbd",{children:"j k"})," Select the next or previous row"]})]})}var j=document.getElementById("app");function _(){C=C.filter(e=>Date.now()-e.at<ee),j.className&&(j.className="",j.textContent=""),Pe(l(It,{}),j),he&&O&&(he=!1,document.getElementById(`type-${O}`)?.focus())}document.addEventListener("keydown",e=>{if(e.metaKey||e.ctrlKey||e.altKey||!I)return;let t=e.target;if(t?.closest("input, textarea")){e.key==="Escape"&&t.tagName==="INPUT"&&(O=null,_());return}let n=qe.find(u=>u.hotkey===e.key);if(n){N=n.id,_();return}let i=Ze(I).byTab[N],r=et(i,N),s=e.key==="j"||e.key==="ArrowDown"?1:e.key==="k"||e.key==="ArrowUp"?-1:0;if(s!==0){e.preventDefault(),tt(N,i,Math.max(0,Math.min(i.length-1,r+s))),document.querySelector(".row.selected")?.scrollIntoView({block:"nearest"});return}let a=i[r];if(!a)return;let{keys:d,more:p}=nt(a),c=[...d,...p].find(u=>u.hotkey===e.key);c&&(e.preventDefault(),c.run())});Ye("ui/initialize",{protocolVersion:"2026-01-26",appInfo:{name:"inbox",version:"0.1.0"},appCapabilities:{tools:{}}}).then(e=>{Ge(e?.hostContext??{}),parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/initialized",params:{}},"*"),ze()}).catch(()=>{j.textContent="The inbox could not connect to Codex."});})();\n\n    </script>\n  </body>\n</html>\n';

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
