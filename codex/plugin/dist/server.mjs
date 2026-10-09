// Built by codex/build.mjs from codex/src and hooks/. Do not edit.

// src/server-main.ts
import { dirname as dirname2 } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

// src/server.ts
import { constants } from "node:fs";
import { access, stat as stat2 } from "node:fs/promises";

// ../hooks/presses.ts
function clipLabel(text2, max) {
  return text2.length > max ? `${text2.slice(0, max - 1)}\u2026` : text2;
}
function baseName(path) {
  return path.replace(/\/+$/, "").split("/").pop() ?? path;
}
function helpLabel(help) {
  const label = help.kind === "open" ? `Open ${baseName(help.path)}` : help.kind === "copy" ? `Copy ${help.name ?? "snippet"}` : help.kind === "run" ? `Run ${help.name ?? help.command}` : help.kind === "terminal" ? `Copy ${help.name ?? help.command}` : `Open ${help.name ?? new URL(help.url).host}`;
  return clipLabel(label, 32);
}
function localPath(raw, root, home) {
  if (raw.startsWith("~/")) return home + raw.slice(1);
  if (raw.startsWith("/")) return raw;
  return `${root.replace(/\/$/, "")}/${raw.replace(/^\.\//, "")}`;
}
var LAUNCHES = /\.(app|command|tool|terminal|workflow|scpt|scptd|applescript|pkg|mpkg|dmg|webloc|inetloc|fileloc|prefpane|kext)$/i;
function openCommands(path, isFile, isExecutable) {
  if (!isFile || isExecutable || LAUNCHES.test(path)) return { argv: ["open", "-R", path], fallback: null };
  return { argv: ["open", path], fallback: ["open", "-t", path] };
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
function isTaskHandedOff(last, turns) {
  const pressed = last?.isHandoff === true ? last.turnsStarted : void 0;
  return pressed !== void 0 && pressed <= turns.turnsStarted && turns.turnsApplied <= pressed;
}
function findingBody(finding) {
  return [
    `${finding.kind === "issue" ? "Issue" : "Opportunity"}: ${finding.title}`,
    finding.detail,
    ...finding.path ? [`File: ${finding.path}`] : []
  ];
}
var messages = {
  answer: (item, answer) => `Re "${item.ask}": ${answer}`,
  /** Asks what an item is about. The item stays open, since nothing was decided. */
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
  taskReply: (item, words2) => `Re the task you left for me, "${item.ask}": ${words2}`,
  /** Sends a finding back to the agent: to fix it, to talk it through first, or with the person's own words. */
  finding: (finding, how, words2 = "") => {
    const opening = how === "address" ? "Please address this finding you recorded:" : how === "discuss" ? "Let's talk through this finding you recorded before changing anything:" : "About this finding you recorded:";
    return [opening, ...findingBody(finding), ...how === "typed" ? ["", words2] : []].join("\n");
  }
};

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
var EXPIRED = "expired, unanswered";
var MAX_FINDINGS = 30;
function readKind(kind) {
  return kind === "task" || kind === "do" ? "task" : "question";
}
function upgradeLedger(ledger) {
  const { notes, decided, ...rest } = ledger;
  return {
    ...rest,
    findings: [...rest.findings ?? [], ...notes ?? []],
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
function words(text2) {
  return text2.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
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
function sameAsk(a, b) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return norm(a) === norm(b);
}
function closedRecord(item, closing, now) {
  const { id, kind, ask, label } = item;
  return { id, kind, ask, ...label ? { label } : {}, ...closing, at: now };
}
var CLOSED_BY_CLAUDE = "closed by Claude";
function closeByAgent(host, ledger, id, how, now) {
  const closing = "answer" in how ? { how: "answered", outcome: how.answer } : { how: "claude", outcome: `closed by ${host.agent}: ${how.reason}` };
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
function isLapsed(d) {
  if (d.how === "dismissed" || d.how === "expired" || d.how === "claude") return true;
  return d.how === "update" && /^(no longer applies|replaced|superseded|moot)/i.test(d.outcome);
}
var TOLD_NOTHING = { inbox: null, closed: [] };

// ../hooks/tools.ts
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
function findingDescription(host) {
  return `Record a finding for the user. It waits in ${host.findingsIn} until it is closed, and from there the user can ask you to address it or discuss it. Record what a careful senior engineer would flag to a teammate, and leave out style nits and anything the user already decided.`;
}
var CLOSE_DESCRIPTION = `Close an open item or finding by its id, such as i35 or f12, as listed in the latest "inbox:" text beside the user's prompt. Pass the user's answer when their message answered it, and a reason otherwise.`;
function cut(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function recordFinding(host, ledger, input, now) {
  const title = cut(input.title, 120);
  const detail = cut(input.detail, 600);
  if (title === "" || detail === "") return { ledger, result: "Not recorded: a finding needs a title and a detail." };
  const path = cut(input.path, 300);
  const r = addFinding(ledger, {
    kind: input.kind === "opportunity" ? "opportunity" : "issue",
    title,
    detail,
    path: path || null,
    at: now
  });
  return {
    ledger: r.ledger,
    result: r.isAdded ? `Recorded as ${r.id}. The user sees it in ${host.findingsIn}.` : `Already recorded as ${r.id}.`
  };
}
function recordClose(host, ledger, input, now) {
  const id = cut(input.id, 80).replace(/^\[|\]$/g, "");
  const answer = cut(input.answer, 80);
  const reason = cut(input.reason, 80);
  if (id === "" || answer === "" && reason === "")
    return { ledger, result: "Not closed: give the id, and the user's answer or a reason." };
  const r = closeByAgent(host, ledger, id, answer ? { answer } : { reason }, now);
  if (r.closed === "item")
    return { ledger: r.ledger, result: `Closed ${id}. The user sees it in ${host.surface} with its outcome.` };
  if (r.closed === "finding") return { ledger: r.ledger, result: `Closed finding ${id}.` };
  return {
    ledger,
    result: `Not closed: no open item or finding has the id ${id}. The open ones are listed beside the user's latest message.`
  };
}

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

// src/texts.ts
var CODEX = {
  agent: "Codex",
  surface: "the Inbox tab",
  band: null,
  findingsIn: "the Findings section of the Inbox tab"
};
var TAB_DESCRIPTION = "Open the Inbox tab beside this conversation. Call it only when the user asks to see the inbox.";

// src/core.ts
var SETTLED_MS = 5120;
var CLOSED_SHOWN = 3;
var MAX_SENT = 20;
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
    const words2 = p.action === "typedFinding" ? p.text.trim() : "";
    if (p.action === "typedFinding" && !words2) return null;
    const how = p.action === "typedFinding" ? "typed" : p.action;
    const text2 = how === "address" ? finding.kind === "issue" ? "Sent to Codex to fix" : "Sent to Codex to act on" : how === "discuss" ? "Discuss sent" : "Reply sent";
    return send(
      withLast(removed, p.id, { action: p.action, text: text2, title: finding.title }, now),
      messages.finding(finding, how, words2),
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
      const words2 = p.text.trim();
      if (!words2) return null;
      if (item.kind === "question")
        return send(close(words2, "answered"), messages.answer(item, words2), { id: item.id, action: "answer" });
      const last = { action: "typed", text: "Reply sent", isHandoff: true, turnsStarted: s.presence.turnsStarted };
      return send(withLast(s, item.id, last, now), messages.taskReply(item, words2), null);
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

// ../hooks/demo.ts
var MIN = 6e4;
var REPO = "https://github.com/petekp/inbox";
function demoView(now) {
  return {
    ledger: {
      card: {
        goal: "Give the inbox pane keyboard shortcuts and a cleaner tab bar",
        done: ["Tabs switch with 1, 2 and 3", "Answer keys moved to letters", "PR #31 opened"],
        now: "Waiting on where the Keys list goes and a gh sign-in",
        running: ["live test session: tmux attach -t inbox-live"],
        updatedAt: now - 2 * MIN
      },
      items: [
        {
          id: "d11",
          kind: "question",
          label: "1",
          ask: "Show the Keys list in a footer, or under the tab bar?",
          options: ["Footer", "Under the tab bar"],
          rec: "Footer",
          helps: [],
          turn: 14,
          at: now - 12 * MIN
        },
        {
          id: "d12",
          kind: "question",
          label: "2",
          ask: "Keep findings open until you confirm a fix?",
          options: ["Keep it open", "Close it"],
          rec: "Keep it open",
          helps: [],
          turn: 14,
          at: now - 12 * MIN
        },
        {
          id: "d13",
          kind: "question",
          label: "3",
          ask: "Expire questions after 20 prompts, not 12?",
          options: ["Yes", "No"],
          rec: "No",
          helps: [],
          turn: 14,
          at: now - 12 * MIN
        },
        {
          id: "d14",
          kind: "task",
          label: null,
          ask: "Sign in to gh for the PRs tab",
          options: [],
          rec: null,
          helps: [{ kind: "terminal", command: "gh auth login", name: "gh auth login" }],
          turn: 14,
          at: now - 5 * MIN
        },
        {
          id: "d15",
          kind: "question",
          label: null,
          ask: "Which theme should the README screenshot use?",
          options: [],
          rec: null,
          helps: [],
          turn: 11,
          at: now - 40 * MIN
        },
        {
          id: "d16",
          kind: "task",
          label: null,
          ask: "Check the pane in the light theme",
          options: [],
          rec: null,
          helps: [{ kind: "copy", text: "/theme", name: "theme command" }],
          turn: 14,
          at: now - 5 * MIN
        },
        {
          id: "d18",
          kind: "task",
          label: null,
          ask: "Run the load script and send back its output lines",
          options: [],
          rec: null,
          helps: [{ kind: "run", command: "./scripts/load.sh", name: "load script" }],
          turn: 14,
          at: now - 4 * MIN
        },
        {
          id: "d17",
          kind: "task",
          label: null,
          ask: "Run /reload-plugins in your other sessions",
          options: [],
          rec: null,
          helps: [],
          turn: 12,
          at: now - 25 * MIN
        }
      ],
      closed: [
        {
          id: "d5",
          kind: "question",
          ask: "Rename the Waiting tab?",
          outcome: "Needs you",
          how: "answered",
          at: now - 90 * MIN
        },
        {
          id: "d6",
          kind: "question",
          ask: "Commit the reload fix and the rename as two commits?",
          outcome: "yes",
          how: "answered",
          at: now - 60 * MIN
        },
        {
          id: "d9",
          kind: "task",
          ask: "Update Claude Code to 2.1.292",
          outcome: "done",
          how: "done",
          at: now - 45 * MIN
        },
        {
          id: "d7",
          kind: "question",
          ask: "Keep the darker body behind the section cards?",
          outcome: "closed by Claude: no longer applies: the body matches the tab bar",
          how: "claude",
          at: now - 30 * MIN
        },
        {
          id: "d8",
          kind: "question",
          ask: "Add a fourth Session tab?",
          outcome: "dismissed",
          how: "dismissed",
          at: now - 20 * MIN
        },
        {
          id: "d10",
          kind: "question",
          ask: "Draw the tabs on the pane\u2019s own background?",
          outcome: "Yes, as part of the title bar",
          how: "answered",
          at: now
        }
      ],
      findings: [
        {
          id: "d20",
          kind: "opportunity",
          title: "One contrast check could cover all six themes",
          detail: "A capture of the pane in each theme holds every cell\u2019s colors. A script could flag any text under 4.5:1 and run in check.sh.",
          path: "scripts/check.sh",
          at: now - 3 * 60 * MIN
        },
        {
          id: "d21",
          kind: "opportunity",
          title: "Catch-up could read only the turns it missed",
          detail: "After a reload, the catch-up call reads the whole conversation. Starting from the last turn the ledger applied would cut its tokens on long sessions.",
          path: "hooks/ledger.ts",
          at: now - 90 * MIN
        },
        {
          id: "d22",
          kind: "issue",
          title: "Hotkeys vanish on selected rows in ANSI",
          detail: "The engine draws hotkeys in the same blue the selected row uses as its background, so a: and b: disappear there.",
          path: "hooks/register.tsx",
          at: now - 45 * MIN
        },
        {
          id: "d23",
          kind: "issue",
          title: "Selected tab is unreadable in dark ANSI",
          detail: "The selected tab is drawn on ANSI white with the default light text. Its name needs a dark color there, or an inverse style.",
          path: "hooks/register.tsx",
          at: now - 30 * MIN
        }
      ],
      prs: ["petekp/inbox#31", "petekp/inbox#29", "petekp/inbox#33"],
      nextId: 24,
      turn: 14,
      batchTurn: 14
    },
    stop: null,
    checks: {
      repos: [],
      results: [
        {
          name: "prettier",
          kind: "lint",
          folder: null,
          target: { paths: [], filters: [] },
          result: "pass",
          summary: "",
          ranAt: now - 20 * MIN,
          command: "npx -y prettier@3.9.9 --check .",
          failures: [],
          repo: null,
          isStale: true,
          isLeftFailing: false,
          isDismissed: false,
          isSentBack: false,
          fixSentAt: null
        },
        {
          name: "claude plugin test",
          kind: "tests",
          folder: null,
          target: { paths: [], filters: [] },
          result: "pass",
          summary: "64 pass, 0 fail",
          ranAt: now - 6 * MIN,
          command: "claude plugin test .",
          failures: [],
          repo: null,
          isStale: false,
          isLeftFailing: false,
          isDismissed: false,
          isSentBack: false,
          fixSentAt: null
        },
        {
          name: "tsc",
          kind: "types",
          folder: null,
          target: { paths: [], filters: [] },
          result: "fail",
          summary: "hooks/register.tsx(2310,7): error TS2322",
          ranAt: now - 5 * MIN,
          command: "npx -y -p typescript tsc --noEmit -p .",
          failures: [
            "hooks/register.tsx(2310,7): error TS2322: Type 'string | undefined' is not assignable to type 'string'."
          ],
          repo: null,
          isStale: false,
          isLeftFailing: true,
          isDismissed: false,
          isSentBack: false,
          fixSentAt: null
        },
        {
          name: "vitest",
          kind: "tests",
          folder: null,
          target: { paths: [], filters: ["tests/parse.test.ts"] },
          result: "fail",
          summary: "1 failed | 11 passed",
          ranAt: now - 3 * MIN,
          command: "npx vitest run tests/parse.test.ts",
          failures: ["\xD7 parses a dated heading 2ms", "FAIL  tests/parse.test.ts > headings > parses a dated heading"],
          repo: null,
          isStale: false,
          isLeftFailing: true,
          isDismissed: false,
          isSentBack: false,
          fixSentAt: now - 1 * MIN
        }
      ]
    },
    settled: [
      {
        id: "d10",
        ask: "Draw the tabs on the pane\u2019s own background?",
        outcome: "Yes, as part of the title bar",
        how: "answered",
        at: now,
        kind: "question",
        index: 1
      }
    ],
    prViews: {
      branchRef: "petekp/inbox#31",
      isFetching: false,
      views: {
        "petekp/inbox#31": {
          ref: "petekp/inbox#31",
          number: 31,
          title: "Switch tabs with 1, 2 and 3, and letter the answers",
          url: `${REPO}/pull/31`,
          isDraft: false,
          state: "OPEN",
          base: "main",
          mergeable: "CONFLICTING",
          reviewDecision: "CHANGES_REQUESTED",
          checks: [
            { name: "prettier", bucket: "pass", url: `${REPO}/actions/runs/1` },
            { name: "plugin tests", bucket: "fail", url: `${REPO}/actions/runs/2` },
            { name: "lint", bucket: "fail", url: `${REPO}/actions/runs/3` },
            { name: "plugin validate", bucket: "pending", url: null }
          ],
          threads: [
            {
              id: "DT1",
              author: "sam",
              reply: null,
              isWaiting: true,
              isOutdated: false,
              isLinesChanged: false,
              path: "hooks/register.tsx",
              line: 1147,
              body: "Why do the answer keys skip d? A question has no Done action.",
              replies: 0,
              url: `${REPO}/pull/31#discussion_r1`,
              at: now - 3 * 60 * MIN
            },
            {
              id: "DT2",
              author: "sam",
              reply: {
                author: "robin",
                body: "Agreed, the footer reads better than a list under the tabs.",
                url: `${REPO}/pull/31#discussion_r3`,
                at: now - 5 * 60 * MIN
              },
              isWaiting: true,
              isOutdated: true,
              isLinesChanged: false,
              path: "README.md",
              line: 87,
              body: "Should the Keys list live in the footer?",
              replies: 1,
              url: `${REPO}/pull/31#discussion_r2`,
              at: now - 26 * 60 * MIN
            },
            {
              id: "DT3",
              author: "robin",
              reply: {
                author: "you",
                body: "Done in the latest push.",
                url: `${REPO}/pull/31#discussion_r5`,
                at: now - 2 * 60 * MIN
              },
              isWaiting: false,
              isOutdated: false,
              isLinesChanged: false,
              path: "hooks/register.tsx",
              line: 2296,
              body: "Can the tab width come from the label alone now?",
              replies: 1,
              url: `${REPO}/pull/31#discussion_r4`,
              at: now - 26 * 60 * MIN
            },
            {
              id: "DT4",
              author: "review-bot",
              reply: null,
              isWaiting: true,
              isOutdated: true,
              isLinesChanged: true,
              path: "hooks/prs.ts",
              line: 114,
              body: "Outdated threads still count as waiting on the person.",
              replies: 0,
              url: `${REPO}/pull/31#discussion_r6`,
              at: now - 50 * MIN
            }
          ],
          fetchedAt: now - MIN,
          error: null
        },
        "petekp/inbox#29": {
          ref: "petekp/inbox#29",
          number: 29,
          title: "Count turns to tell when a reload cut off an update",
          url: `${REPO}/pull/29`,
          isDraft: false,
          state: "OPEN",
          base: "main",
          mergeable: "MERGEABLE",
          reviewDecision: "APPROVED",
          checks: [
            { name: "prettier", bucket: "pass", url: null },
            { name: "plugin tests", bucket: "pass", url: null }
          ],
          threads: [],
          fetchedAt: now - MIN,
          error: null
        },
        "petekp/inbox#33": {
          ref: "petekp/inbox#33",
          number: 33,
          title: "Draw the tabs on the pane\u2019s own background",
          url: `${REPO}/pull/33`,
          isDraft: true,
          state: "OPEN",
          base: "main",
          mergeable: "MERGEABLE",
          reviewDecision: "",
          checks: [
            { name: "prettier", bucket: "pass", url: null },
            { name: "plugin tests", bucket: "pending", url: null }
          ],
          threads: [],
          fetchedAt: now - MIN,
          error: null
        }
      }
    },
    prFixesSent: {
      "petekp/inbox#31 check lint": { at: now - 2 * MIN, url: `${REPO}/actions/runs/3` }
    },
    lastActions: {
      d18: {
        action: "help-d18-0",
        text: "Run load script",
        at: now - 1 * MIN,
        isHandoff: true,
        turnsStarted: 14,
        tab: "needsYou",
        title: "Run the load script and send back its output lines",
        index: 0
      },
      "petekp/inbox#31 thread DT1": {
        action: "address-DT1",
        text: "Address",
        at: now - 2 * MIN,
        isHandoff: true,
        turnsStarted: 14,
        tab: "prs",
        title: "hooks/register.tsx:1147",
        index: 0
      }
    },
    turns: { turnsStarted: 14, turnsApplied: 14 }
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
    told: TOLD_NOTHING,
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
    // The ledger's shape is the mod's, so a saved one converts the way the mod's does. It converts
    // before the defaults fill in, since an empty `closed` would hide an old `decided`.
    ledger: saved.ledger ? { ...base.ledger, ...upgradeLedger({ ...saved.ledger, items: saved.ledger.items ?? [] }) } : base.ledger,
    turn: { ...base.turn, ...saved.turn },
    told: { ...base.told, ...saved.told },
    presence: { ...base.presence, ...saved.presence },
    snapshots: upgradeSnapshots(saved.snapshots ?? base.snapshots)
  };
}
function upgradeSnapshots(snapshots) {
  return Object.fromEntries(
    Object.entries(snapshots).map(([repo, s]) => [
      repo,
      {
        ...s,
        dirty: Object.fromEntries(Object.entries(s.dirty).map(([p, id]) => [p, id === "directory" ? "dir" : id]))
      }
    ])
  );
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

// src/demo.ts
function demoState(now) {
  const d = demoView(now);
  const s = emptyState("demo");
  return {
    ...s,
    root: "/demo",
    ledger: d.ledger,
    checks: d.checks,
    lastActions: d.lastActions,
    presence: { ...s.presence, ...d.turns }
  };
}

// src/server.ts
var TAB_URI = "ui://inbox/tab";
var TAB_MIME = "text/html;profile=mcp-app";
var APP_ONLY = { ui: { visibility: ["app"] } };
var TOOLS = [
  { name: "record_finding", description: findingDescription(CODEX), inputSchema: FINDING_SCHEMA },
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
    description: "What the Inbox tab shows for this conversation, or its demo.",
    inputSchema: { type: "object", properties: { demo: { type: "boolean" } } },
    _meta: APP_ONLY
  },
  {
    name: "inbox_press",
    description: "A press in the Inbox tab.",
    inputSchema: {
      type: "object",
      properties: { press: { type: "object" }, demo: { type: "boolean" } },
      required: ["press"]
    },
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
    for (const target of opens) error = await open(s, target) ?? error;
    return { view: viewOf(s, now()), copy, error };
  }
  async function open(s, target) {
    const run2 = (argv2) => deps.exec(argv2, { cwd: "/", timeoutMs: 1e4 });
    if (/^https:\/\//.test(target)) return (await run2(["open", target])).code === 0 ? null : `Could not open ${target}`;
    const path = localPath(target, s.root || "/", s.home);
    const info = await stat2(path).catch(() => null);
    if (!info) return `${baseName(path)} is not there anymore`;
    const isExecutable = info.isFile() && await access(path, constants.X_OK).then(
      () => true,
      () => false
    );
    const { argv, fallback } = openCommands(path, info.isFile(), isExecutable);
    const r = await run2(argv);
    const retry = r.code !== 0 && fallback ? await run2(fallback) : r;
    return retry.code === 0 ? null : `Could not open ${baseName(path)}: ${retry.stderr.trim()}`;
  }
  const demos = /* @__PURE__ */ new Map();
  const demoOf = (id) => {
    const s = demos.get(id) ?? demoState(now());
    demos.set(id, s);
    return s;
  };
  function onDemoPress(id, p) {
    const r = press(demoOf(id), p, now());
    if (r) demos.set(id, r.state);
    const copy = r?.effects.find((e) => e.kind === "copy");
    return { view: viewOf(demoOf(id), now()), copy: copy ? { text: copy.text, name: copy.name } : null, error: null };
  }
  async function callTool(name, args, id) {
    if (!id) return { ...text("Not done: this call carries no session id."), isError: true };
    switch (name) {
      case "record_finding":
      case "close": {
        let result = "";
        await updateState(dir, id, (s) => {
          const r = (name === "close" ? recordClose : recordFinding)(CODEX, s.ledger, args, now());
          result = r.result;
          return { ...s, ledger: r.ledger };
        });
        return text(result);
      }
      case "inbox": {
        const s = await readState(dir, id);
        return { ...text("Opened the Inbox tab beside the conversation."), structuredContent: viewOf(s, now()) };
      }
      case "inbox_view": {
        if (args.demo === true) return { ...text("Inbox demo"), structuredContent: viewOf(demoOf(id), now()) };
        const s = await updateState(dir, id, (s2) => ({ ...s2, tabSeenAt: now() }));
        return { ...text("Inbox view"), structuredContent: viewOf(s, now()) };
      }
      case "inbox_press": {
        const r = args.demo === true ? onDemoPress(id, args.press) : await onPress(id, args.press);
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
var tab_default = '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>Inbox</title>\n    <style>\n      /* The host\'s variables when Codex passes them; otherwise the pane\'s own colors. */\n      :root {\n        color-scheme: light;\n        --bg: var(--color-background-primary, #ffffff);\n        --text: var(--color-text-primary, #1f1f1f);\n        --muted: var(--color-text-secondary, #595959);\n        --key: #243bf5;\n        --needs-you: #745417;\n        --findings: #7b00e8;\n        --done: #25652f;\n        --error: #a5293d;\n        --error-mark: #a5293d;\n        --sans: var(--font-sans, -apple-system, system-ui, sans-serif);\n        --mono: var(--font-mono, ui-monospace, \'SF Mono\', Menlo, monospace);\n        /* Surfaces are mixed from the host\'s colors, so they follow its theme. */\n        --card: color-mix(in srgb, var(--text) 4.5%, var(--bg));\n        --raised: color-mix(in srgb, var(--text) 9%, var(--bg));\n        --selected: color-mix(in srgb, #4c9aff 20%, var(--card));\n        --tree: color-mix(in srgb, var(--text) 30%, var(--bg));\n        --divider: color-mix(in srgb, var(--text) 9%, var(--bg));\n        --hover: color-mix(in srgb, var(--key) 14%, transparent);\n        /* The tree\'s grid: its line, where a row\'s mark sits, and where its text starts. */\n        --tree-x: 15px;\n        --mark-x: 30px;\n        --text-x: 52px;\n      }\n      @media (prefers-color-scheme: dark) {\n        :root:not([data-theme=\'light\']) {\n          color-scheme: dark;\n          --bg: var(--color-background-primary, #171717);\n          --text: var(--color-text-primary, #ececec);\n          --muted: var(--color-text-secondary, #a8a8a8);\n          --key: #b1b9f9;\n          --needs-you: #ffc107;\n          --findings: #cab0ff;\n          --done: #7ecd8f;\n          --error: #ffa3b0;\n          --error-mark: #ff6b80;\n          --card: color-mix(in srgb, var(--text) 5.5%, var(--bg));\n          --raised: color-mix(in srgb, var(--text) 11%, var(--bg));\n          --selected: color-mix(in srgb, #7fa6d9 15%, var(--card));\n          --tree: color-mix(in srgb, var(--text) 32%, var(--bg));\n          --divider: color-mix(in srgb, var(--text) 8%, var(--bg));\n        }\n      }\n      :root[data-theme=\'dark\'] {\n        color-scheme: dark;\n        --key: #b1b9f9;\n        --needs-you: #ffc107;\n        --findings: #cab0ff;\n        --done: #7ecd8f;\n        --error: #ffa3b0;\n        --error-mark: #ff6b80;\n        --card: color-mix(in srgb, var(--text) 5.5%, var(--bg));\n        --raised: color-mix(in srgb, var(--text) 11%, var(--bg));\n        --selected: color-mix(in srgb, #7fa6d9 15%, var(--card));\n        --tree: color-mix(in srgb, var(--text) 32%, var(--bg));\n        --divider: color-mix(in srgb, var(--text) 8%, var(--bg));\n      }\n      * {\n        box-sizing: border-box;\n      }\n      body {\n        margin: 0;\n        background: var(--bg);\n        color: var(--text);\n        font: 13px/20px var(--sans);\n        -webkit-font-smoothing: antialiased;\n      }\n      button {\n        font: inherit;\n        color: inherit;\n        background: none;\n        border: none;\n        padding: 0;\n        cursor: pointer;\n        text-align: left;\n      }\n      :focus-visible {\n        outline: 1.5px solid var(--key);\n        outline-offset: 1px;\n        border-radius: 4px;\n      }\n      kbd {\n        font: 12px/20px var(--mono);\n        color: var(--key);\n      }\n      .muted {\n        color: var(--muted);\n      }\n      .tone-needsYou {\n        color: var(--needs-you);\n      }\n      .tone-findings {\n        color: var(--findings);\n      }\n      .tone-done {\n        color: var(--done);\n      }\n      .tone-error {\n        color: var(--error);\n      }\n      .notice {\n        padding: 10px 16px;\n        color: var(--error);\n      }\n\n      /* Tabs: the shown one a raised panel, the others text on the background. */\n      nav {\n        display: flex;\n        flex-wrap: wrap;\n        align-items: flex-end;\n        justify-content: space-between;\n        gap: 4px 16px;\n        padding: 12px 12px 0;\n      }\n      .tabs {\n        display: flex;\n        gap: 4px;\n      }\n      .tab {\n        padding: 6px 12px;\n        border-radius: 6px;\n        color: var(--muted);\n      }\n      .tab:hover {\n        color: var(--text);\n      }\n      .tab.shown {\n        background: var(--raised);\n        color: var(--text);\n        font-weight: 600;\n      }\n      .tab .count {\n        font-weight: 600;\n        margin-left: 6px;\n      }\n      .status {\n        padding: 6px 4px;\n        color: var(--muted);\n        font-size: 12px;\n      }\n\n      main {\n        display: flex;\n        flex-direction: column;\n        gap: 8px;\n        padding: 12px 12px 4px;\n      }\n      section {\n        background: var(--card);\n        border-radius: 8px;\n        padding: 10px 0;\n      }\n      .group-title {\n        padding: 0 14px 0 calc(var(--tree-x) + 4px);\n        font-weight: 500;\n      }\n      .group-title .count {\n        color: var(--muted);\n        margin-left: 6px;\n      }\n\n      /* The tree: a hairline from the group\'s title, an elbow to each row, and a rounded last elbow. */\n      .tree {\n        position: relative;\n        padding-top: 8px;\n      }\n      .tree::before {\n        content: \'\';\n        position: absolute;\n        left: var(--tree-x);\n        top: 0;\n        height: 8px;\n        border-left: 1px solid var(--tree);\n      }\n      .entry {\n        position: relative;\n        --elbow: 16px;\n      }\n      .entry:has(> .row.selected) {\n        --elbow: 22px;\n      }\n      .tree > .entry::before {\n        content: \'\';\n        position: absolute;\n        left: var(--tree-x);\n        top: 0;\n        bottom: 0;\n        border-left: 1px solid var(--tree);\n        z-index: 1;\n      }\n      .tree > .entry::after {\n        content: \'\';\n        position: absolute;\n        left: var(--tree-x);\n        top: var(--elbow);\n        width: 11px;\n        border-top: 1px solid var(--tree);\n        z-index: 1;\n      }\n      .tree > .entry:last-child::before {\n        bottom: auto;\n        height: calc(var(--elbow) + 1px);\n        width: 11px;\n        border-bottom: 1px solid var(--tree);\n        border-bottom-left-radius: 7px;\n      }\n      .tree > .entry:last-child::after {\n        display: none;\n      }\n      .flat {\n        --mark-x: 18px;\n        --text-x: 40px;\n      }\n\n      /* Rows. A divider runs from the text column to the edge, under the tree\'s line. */\n      .row {\n        display: flex;\n        padding: 6px 14px 6px var(--mark-x);\n      }\n      .entry + .entry > .row {\n        background-image: linear-gradient(var(--divider), var(--divider));\n        background-repeat: no-repeat;\n        background-size: calc(100% - var(--text-x)) 1px;\n        background-position: right top;\n      }\n      .row.selected {\n        background-color: var(--selected);\n        padding-top: 12px;\n        padding-bottom: 12px;\n      }\n      .mark {\n        flex: none;\n        width: calc(var(--text-x) - var(--mark-x));\n        font: 12px/20px var(--mono);\n        color: var(--muted);\n      }\n      .mark.done,\n      .mark.error {\n        font-size: 13px;\n      }\n      .mark.done {\n        color: var(--done);\n      }\n      .mark.error {\n        color: var(--error-mark);\n      }\n      .content {\n        flex: 1;\n        min-width: 0;\n        display: flex;\n        flex-direction: column;\n        gap: 8px;\n      }\n      .content > .tight,\n      .content.tight {\n        display: flex;\n        flex-direction: column;\n        gap: 0;\n      }\n      .line {\n        display: flex;\n        width: 100%;\n        min-width: 0;\n      }\n      .line .text {\n        min-width: 0;\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .line .text.two {\n        white-space: normal;\n        display: -webkit-box;\n        -webkit-line-clamp: 2;\n        -webkit-box-orient: vertical;\n      }\n      .line .after {\n        flex: none;\n        white-space: pre;\n        color: var(--muted);\n      }\n      .line .after.tone-done {\n        color: var(--done);\n      }\n      .line:hover .text {\n        color: color-mix(in srgb, var(--text) 80%, var(--key));\n      }\n      .title {\n        font-weight: 600;\n      }\n      .title .after {\n        font-weight: 400;\n        color: var(--muted);\n      }\n      .meta {\n        font-size: 12px;\n      }\n      .body {\n        overflow-wrap: anywhere;\n      }\n      .body p {\n        margin: 0;\n      }\n      .body p + p {\n        margin-top: 4px;\n      }\n      .failure,\n      .command {\n        font: 12px/18px var(--mono);\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .command {\n        color: var(--muted);\n        white-space: normal;\n        overflow-wrap: anywhere;\n      }\n\n      /* Keys are text, as the pane draws them: "a: Fix". */\n      .keys {\n        display: flex;\n        flex-wrap: wrap;\n        align-items: center;\n        gap: 2px 8px;\n        margin-left: -6px;\n      }\n      .key {\n        padding: 1px 6px;\n        border-radius: 5px;\n        white-space: nowrap;\n      }\n      .key:hover {\n        background: var(--hover);\n      }\n      .key .note {\n        color: var(--muted);\n      }\n      .key-dot {\n        color: var(--muted);\n      }\n      form {\n        display: flex;\n        align-items: center;\n        gap: 8px;\n      }\n      input {\n        flex: 1;\n        min-width: 0;\n        font: inherit;\n        color: inherit;\n        background: var(--bg);\n        border: 1px solid var(--tree);\n        border-radius: 6px;\n        padding: 4px 8px;\n      }\n      input:focus {\n        outline: none;\n        border-color: var(--key);\n      }\n      textarea {\n        width: 100%;\n        font: 12px var(--mono);\n        color: inherit;\n        background: var(--bg);\n        border: 1px solid var(--tree);\n        border-radius: 6px;\n      }\n\n      .empty-line {\n        color: var(--muted);\n      }\n      .fold {\n        display: block;\n        margin: 8px 0 0 calc(var(--mark-x) - 2px);\n        padding: 1px 4px;\n        border-radius: 5px;\n        color: var(--muted);\n      }\n      .fold:hover {\n        color: var(--text);\n      }\n      .fold-mark {\n        display: inline-block;\n        width: 14px;\n        font-family: var(--mono);\n      }\n      /* The closed items hang from the fold\'s arrow. */\n      .tree.closed-tree {\n        --tree-x: 36px;\n        --mark-x: 52px;\n        --text-x: 72px;\n        padding-top: 4px;\n      }\n      .tree.closed-tree::before {\n        height: 4px;\n      }\n      .tree.closed-tree .entry + .entry > .row {\n        background-image: none;\n      }\n      .outcome {\n        font-weight: 600;\n      }\n      .outcome.lapsed {\n        font-weight: 400;\n        color: var(--muted);\n      }\n      .settled .what {\n        color: var(--muted);\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .leave {\n        width: 96px;\n        height: 1.5px;\n        margin-top: 4px;\n        border-radius: 1px;\n        overflow: hidden;\n      }\n      .leave div {\n        height: 100%;\n        background: var(--done);\n        animation-name: leave;\n        animation-timing-function: linear;\n        animation-fill-mode: forwards;\n      }\n      @keyframes leave {\n        from {\n          width: 100%;\n        }\n        to {\n          width: 0;\n        }\n      }\n      .empty {\n        padding: 56px 32px;\n        text-align: center;\n      }\n      .empty .title {\n        margin-bottom: 4px;\n      }\n      footer {\n        display: flex;\n        flex-wrap: wrap;\n        justify-content: space-between;\n        gap: 4px 16px;\n        padding: 8px 16px 16px;\n        color: var(--muted);\n        font-size: 12px;\n      }\n      .demo-toggle {\n        padding: 0 6px;\n        border-radius: 5px;\n        color: var(--muted);\n      }\n      .demo-toggle:hover {\n        color: var(--text);\n        background: var(--hover);\n      }\n      .demo-note {\n        margin: 12px 12px 0;\n        padding: 6px 12px;\n        border-radius: 6px;\n        background: var(--raised);\n        color: var(--text);\n      }\n      footer kbd {\n        margin-right: 4px;\n      }\n      footer .sep {\n        margin: 0 8px;\n      }\n      @media (prefers-reduced-motion: reduce) {\n        .leave div {\n          animation: none;\n        }\n      }\n    </style>\n  </head>\n  <body>\n    <div id="app" class="notice muted">Loading\u2026</div>\n    <script>\n      "use strict";(()=>{var ee,g,Re,it,A,Ce,Ee,Le,ce,Y,W,Ne,pe,de,ue,rt,Q={},J=[],ot=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,te=Array.isArray;function T(e,t){for(var n in t)e[n]=t[n];return e}function fe(e){e&&e.parentNode&&e.parentNode.removeChild(e)}function at(e,t,n){var i,r,s,l={};for(s in t)s=="key"?i=t[s]:s=="ref"?r=t[s]:l[s]=t[s];if(arguments.length>2&&(l.children=arguments.length>3?ee.call(arguments,2):n),typeof e=="function"&&e.defaultProps!=null)for(s in e.defaultProps)l[s]===void 0&&(l[s]=e.defaultProps[s]);return X(e,l,i,r,null)}function X(e,t,n,i,r){var s={type:e,props:t,key:n,ref:i,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:r??++Re,__i:-1,__u:0};return r==null&&g.vnode!=null&&g.vnode(s),s}function R(e){return e.children}function z(e,t){this.props=e,this.context=t}function I(e,t){if(t==null)return e.__?I(e.__,e.__i+1):null;for(var n;t<e.__k.length;t++)if((n=e.__k[t])!=null&&n.__e!=null)return n.__e;return typeof e.type=="function"?I(e):null}function lt(e){if(e.__P&&e.__d){var t=e.__v,n=t.__e,i=[],r=[],s=T({},t);s.__v=t.__v+1,g.vnode&&g.vnode(s),me(e.__P,s,t,e.__n,e.__P.namespaceURI,32&t.__u?[n]:null,i,n??I(t),!!(32&t.__u),r),s.__v=t.__v,s.__.__k[s.__i]=s,Fe(i,s,r),t.__e=t.__=null,s.__e!=n&&Ie(s)}}function Ie(e){if((e=e.__)!=null&&e.__c!=null)return e.__e=e.__c.base=null,e.__k.some(function(t){if(t!=null&&t.__e!=null)return e.__e=e.__c.base=t.__e}),Ie(e)}function Se(e){(!e.__d&&(e.__d=!0)&&A.push(e)&&!Z.__r++||Ce!=g.debounceRendering)&&((Ce=g.debounceRendering)||Ee)(Z)}function Z(){try{for(var e,t=1;A.length;)A.length>t&&A.sort(Le),e=A.shift(),t=A.length,lt(e)}finally{A.length=Z.__r=0}}function Oe(e,t,n,i,r,s,l,d,p,c,u){var m,a,f,y,w,b,k=i&&i.__k||J,h=t.length;for(p=ct(n,t,k,p,h),m=0;m<h;m++)(f=n.__k[m])!=null&&(a=f.__i!=-1&&k[f.__i]||Q,f.__i=m,b=me(e,f,a,r,s,l,d,p,c,u),y=f.__e,f.ref&&a.ref!=f.ref&&(a.ref&&he(a.ref,null,f),u.push(f.ref,f.__c||y,f)),w==null&&y!=null&&(w=y),4&f.__u?(p=Pe(f,p,e),a.__e&&(a.__e=null)):typeof f.type=="function"&&b!==void 0?p=b:y&&(p=y.nextSibling),f.__u&=-7);return n.__e=w,p}function ct(e,t,n,i,r){var s,l,d,p,c,u=n.length,m=u,a=0;for(e.__k=new Array(r),s=0;s<r;s++)(l=t[s])!=null&&typeof l!="boolean"&&typeof l!="function"?(typeof l=="string"||typeof l=="number"||typeof l=="bigint"||l.constructor==String?l=e.__k[s]=X(null,l,null,null,null):te(l)?l=e.__k[s]=X(R,{children:l},null,null,null):l.constructor===void 0&&l.__b>0?l=e.__k[s]=X(l.type,l.props,l.key,l.ref?l.ref:null,l.__v):e.__k[s]=l,p=s+a,l.__=e,l.__b=e.__b+1,d=null,(c=l.__i=dt(l,n,p,m))!=-1&&(m--,(d=n[c])&&(d.__u|=2)),d==null||d.__v==null?(c==-1&&(r>u?a--:r<u&&a++),typeof l.type!="function"&&(l.__u|=4)):c!=p&&(c==p-1?a--:c==p+1?a++:(c>p?a--:a++,l.__u|=4))):e.__k[s]=null;if(m)for(s=0;s<u;s++)(d=n[s])!=null&&(2&d.__u)==0&&(d.__e==i&&(i=I(d)),He(d,d));return i}function Pe(e,t,n){var i,r;if(typeof e.type=="function"){for(i=e.__k,r=0;i&&r<i.length;r++)i[r]&&(i[r].__=e,t=Pe(i[r],t,n));return t}e.__e!=t&&(t&&e.type&&!t.parentNode&&(t=I(e)),t=n.insertBefore(e.__e,t||null));do t=t&&t.nextSibling;while(t!=null&&t.nodeType==8);return t}function dt(e,t,n,i){var r,s,l,d=e.key,p=e.type,c=t[n],u=c!=null&&(2&c.__u)==0;if(c===null&&d==null||u&&d==c.key&&p==c.type)return n;if(i>(u?1:0)){for(r=n-1,s=n+1;r>=0||s<t.length;)if((c=t[l=r>=0?r--:s++])!=null&&(2&c.__u)==0&&d==c.key&&p==c.type)return l}return-1}function Te(e,t,n){t[0]=="-"?e.setProperty(t,n??""):e[t]=n==null?"":typeof n!="number"||ot.test(t)?n:n+"px"}function V(e,t,n,i,r){var s,l;e:if(t=="style")if(typeof n=="string")e.style.cssText=n;else{if(typeof i=="string"&&(e.style.cssText=i=""),i)for(t in i)n&&t in n||Te(e.style,t,"");if(n)for(t in n)i&&n[t]==i[t]||Te(e.style,t,n[t])}else if(t[0]=="o"&&t[1]=="n")s=t!=(t=t.replace(Ne,"$1")),l=t.toLowerCase(),t=l in e||t=="onFocusOut"||t=="onFocusIn"?l.slice(2):t.slice(2),e.l||(e.l={}),e.l[t+s]=n,n?i?n[W]=i[W]:(n[W]=pe,e.addEventListener(t,s?ue:de,s)):e.removeEventListener(t,s?ue:de,s);else{if(r=="http://www.w3.org/2000/svg")t=t.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(t!="width"&&t!="height"&&t!="href"&&t!="list"&&t!="form"&&t!="tabIndex"&&t!="download"&&t!="rowSpan"&&t!="colSpan"&&t!="role"&&t!="popover"&&t in e)try{e[t]=n??"";break e}catch{}typeof n=="function"||(n==null||n===!1&&t[4]!="-"?e.removeAttribute(t):e.setAttribute(t,t=="popover"&&n==1?"":n))}}function Ae(e){return function(t){if(this.l){var n=this.l[t.type+e];if(t[Y]==null)t[Y]=pe++;else if(t[Y]<n[W])return;return n(g.event?g.event(t):t)}}}function me(e,t,n,i,r,s,l,d,p,c){var u,m,a,f,y,w,b,k,h,v,H,N,U,$e,G,le,$=t.type;if(t.constructor!==void 0)return null;128&n.__u&&(p=!!(32&n.__u),s=[d=t.__e=n.__e]),(u=g.__b)&&u(t);e:if(typeof $=="function"){m=l.length;try{if(h=t.props,v=$.prototype&&$.prototype.render,H=(u=$.contextType)&&i[u.__c],N=u?H?H.props.value:u.__:i,n.__c?k=(a=t.__c=n.__c).__=a.__E:(v?t.__c=a=new $(h,N):(t.__c=a=new z(h,N),a.constructor=$,a.render=pt),H&&H.sub(a),a.state||(a.state={}),a.__n=i,f=a.__d=!0,a.__h=[],a._sb=[]),v&&a.__s==null&&(a.__s=a.state),v&&$.getDerivedStateFromProps!=null&&(a.__s==a.state&&(a.__s=T({},a.__s)),T(a.__s,$.getDerivedStateFromProps(h,a.__s))),y=a.props,w=a.state,a.__v=t,f)v&&$.getDerivedStateFromProps==null&&a.componentWillMount!=null&&a.componentWillMount(),v&&a.componentDidMount!=null&&a.__h.push(a.componentDidMount);else{if(v&&$.getDerivedStateFromProps==null&&h!==y&&a.componentWillReceiveProps!=null&&a.componentWillReceiveProps(h,N),t.__v==n.__v||!a.__e&&a.shouldComponentUpdate!=null&&a.shouldComponentUpdate(h,a.__s,N)===!1){t.__v!=n.__v&&(a.props=h,a.state=a.__s,a.__d=!1),t.__e=n.__e,t.__k=n.__k,t.__k.some(function(D){D&&(D.__=t)}),J.push.apply(a.__h,a._sb),a._sb=[],a.__h.length&&l.push(a),d=I(n);break e}a.componentWillUpdate!=null&&a.componentWillUpdate(h,a.__s,N),v&&a.componentDidUpdate!=null&&a.__h.push(function(){a.componentDidUpdate(y,w,b)})}if(a.context=N,a.props=h,a.__P=e,a.__e=!1,U=g.__r,$e=0,v)a.state=a.__s,a.__d=!1,U&&U(t),u=a.render(a.props,a.state,a.context),J.push.apply(a.__h,a._sb),a._sb=[];else do a.__d=!1,U&&U(t),u=a.render(a.props,a.state,a.context),a.state=a.__s;while(a.__d&&++$e<25);a.state=a.__s,a.getChildContext!=null&&(i=T(T({},i),a.getChildContext())),v&&!f&&a.getSnapshotBeforeUpdate!=null&&(b=a.getSnapshotBeforeUpdate(y,w)),G=u!=null&&u.type===R&&u.key==null?Me(u.props.children):u,d=Oe(e,te(G)?G:[G],t,n,i,r,s,l,d,p,c),a.base=t.__e,t.__u&=-161,a.__h.length&&l.push(a),k&&(a.__E=a.__=null)}catch(D){if(l.length=m,t.__v=null,p||s!=null){if(D.then){for(t.__u|=p?160:128;d&&d.nodeType==8&&d.nextSibling;)d=d.nextSibling;s!=null&&(s[s.indexOf(d)]=null),t.__e=d}else if(s!=null)for(le=s.length;le--;)fe(s[le])}else t.__e=n.__e;t.__k==null&&(t.__k=n.__k||[]),D.then||De(t),g.__e(D,t,n)}}else s==null&&t.__v==n.__v?(t.__k=n.__k,t.__e=n.__e):d=t.__e=ut(n.__e,t,n,i,r,s,l,p,c);return(u=g.diffed)&&u(t),128&t.__u?void 0:d}function De(e){e&&(e.__c&&(e.__c.__e=!0),e.__k&&e.__k.some(De))}function Fe(e,t,n){for(var i=0;i<n.length;i++)he(n[i],n[++i],n[++i]);g.__c&&g.__c(t,e),e.some(function(r){try{e=r.__h,r.__h=[],e.some(function(s){s.call(r)})}catch(s){g.__e(s,r.__v)}})}function Me(e){return typeof e!="object"||e==null||e.__b>0?e:te(e)?e.map(Me):e.constructor!==void 0?null:T({},e)}function ut(e,t,n,i,r,s,l,d,p){var c,u,m,a,f,y,w,b=n.props||Q,k=t.props,h=t.type;if(h=="svg"?r="http://www.w3.org/2000/svg":h=="math"?r="http://www.w3.org/1998/Math/MathML":r||(r="http://www.w3.org/1999/xhtml"),s!=null){for(c=0;c<s.length;c++)if((f=s[c])&&"setAttribute"in f==!!h&&(h?f.localName==h:f.nodeType==3)){e=f,s[c]=null;break}}if(e==null){if(h==null)return document.createTextNode(k);e=document.createElementNS(r,h,k.is&&k),d&&(g.__m&&g.__m(t,s),d=!1),s=null}if(h==null)b===k||d&&e.data==k||(e.data=k);else{if(s=h=="textarea"&&k.defaultValue!=null?null:s&&ee.call(e.childNodes),!d&&s!=null)for(b={},c=0;c<e.attributes.length;c++)b[(f=e.attributes[c]).name]=f.value;for(c in b)f=b[c],c=="dangerouslySetInnerHTML"?m=f:c=="children"||c in k||c=="value"&&"defaultValue"in k||c=="checked"&&"defaultChecked"in k||V(e,c,null,f,r);for(c in k)f=k[c],c=="children"?a=f:c=="dangerouslySetInnerHTML"?u=f:c=="value"?y=f:c=="checked"?w=f:d&&typeof f!="function"||b[c]===f||V(e,c,f,b[c],r);if(u)d||m&&(u.__html==m.__html||u.__html==e.innerHTML)||(e.innerHTML=u.__html),t.__k=[];else if(m&&(e.innerHTML=""),Oe(t.type=="template"?e.content:e,te(a)?a:[a],t,n,i,h=="foreignObject"?"http://www.w3.org/1999/xhtml":r,s,l,s?s[0]:n.__k&&I(n,0),d,p),s!=null)for(c=s.length;c--;)fe(s[c]);d&&h!="textarea"||(c="value",h=="progress"&&y==null?e.removeAttribute("value"):y!=null&&(y!==e[c]||h=="progress"&&!y||h=="option"&&y!=b[c])&&V(e,c,y,b[c],r),c="checked",w!=null&&w!=e[c]&&V(e,c,w,b[c],r))}return e}function he(e,t,n){try{if(typeof e=="function"){var i=typeof e.__u=="function";i&&e.__u(),i&&t==null||(e.__u=e(t))}else e.current=t}catch(r){g.__e(r,n)}}function He(e,t,n){var i,r;if(g.unmount&&g.unmount(e),(i=e.ref)&&(i.current&&i.current!=e.__e||he(i,null,t)),(i=e.__c)!=null){if(i.componentWillUnmount)try{i.componentWillUnmount()}catch(s){g.__e(s,t)}i.base=i.__P=i.__n=null}if(i=e.__k)for(r=0;r<i.length;r++)i[r]&&He(i[r],t,n||typeof e.type!="function");n||fe(e.__e),e.__c=e.__=e.__e=void 0}function pt(e,t,n){return this.constructor(e,n)}function Ue(e,t,n){var i,r,s,l;t==document&&(t=document.documentElement),g.__&&g.__(e,t),r=(i=typeof n=="function")?null:n&&n.__k||t.__k,s=[],l=[],me(t,e=(!i&&n||t).__k=at(R,null,[e]),r||Q,Q,t.namespaceURI,!i&&n?[n]:r?null:t.firstChild?ee.call(t.childNodes):null,s,!i&&n?n:r?r.__e:t.firstChild,i,l),Fe(s,e,l),e.props.children=null}ee=J.slice,g={__e:function(e,t,n,i){for(var r,s,l;t=t.__;)if((r=t.__c)&&!r.__)try{if((s=r.constructor)&&s.getDerivedStateFromError!=null&&(r.setState(s.getDerivedStateFromError(e)),l=r.__d),r.componentDidCatch!=null&&(r.componentDidCatch(e,i||{}),l=r.__d),l)return r.__E=r}catch(d){e=d}throw e}},Re=0,it=function(e){return e!=null&&e.constructor===void 0},z.prototype.setState=function(e,t){var n;n=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=T({},this.state),typeof e=="function"&&(e=e(T({},n),this.props)),e&&T(n,e),e!=null&&this.__v&&(t&&this._sb.push(t),Se(this))},z.prototype.forceUpdate=function(e){this.__v&&(this.__e=!0,e&&this.__h.push(e),Se(this))},z.prototype.render=R,A=[],Ee=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,Le=function(e,t){return e.__v.__b-t.__v.__b},Z.__r=0,ce=Math.random().toString(8),Y="__d"+ce,W="__a"+ce,Ne=/(PointerCapture)$|Capture$/i,pe=0,de=Ae(!1),ue=Ae(!0),rt=0;function C(e){let t=Math.round(e/6e4);if(t<1)return"just now";if(t<60)return`${t}m ago`;let n=Math.round(t/60);return n<48?`${n}h ago`:`${Math.round(n/24)}d ago`}var ft=String.raw`(?:-{1,2}[\\w-]+(?:=\\S+|\\s+(?!-|(?:run|test|build|lint)\\b)\\S+)?\\s+)*`,ne=(e,t)=>new RegExp(String.raw`\\b(${e})\\s+${ft}(?:run\\s+)?(?:${t})(:[\\w.:-]*\\w)?\\b`),Ft=[{kind:"tests",pattern:/\\bclaude\\s+plugin\\s+test\\b/,name:()=>"plugin tests"},{kind:"validate",pattern:/\\bclaude\\s+plugin\\s+validate\\b/,name:()=>"plugin validate"},{kind:"tests",pattern:ne("bun|npm|pnpm|yarn|deno","test"),name:e=>`${e[1]} test${e[2]??""}`},{kind:"tests",pattern:/\\bnode\\s+(?:-{1,2}[\\w-]+(?:=\\S+)?\\s+)*--test\\b/,name:()=>"node --test"},{kind:"tests",pattern:/\\b(vitest|jest|pytest|rspec|mocha|phpunit|ava|tap)\\b/,name:e=>e[1]??"tests"},{kind:"tests",pattern:/\\b(go|cargo|swift|mix|dotnet)\\s+test\\b/,name:e=>`${e[1]} test`},{kind:"tests",pattern:/\\bplaywright\\s+test\\b/,name:()=>"playwright"},{kind:"tests",pattern:/\\bxcodebuild\\b[^|;&]*\\btest\\b/,name:()=>"xcodebuild test"},{kind:"tests",pattern:/\\bmake\\s+(?:check|test)\\b/,name:e=>e[0]},{kind:"types",pattern:/\\btsc\\b/,name:()=>"tsc"},{kind:"types",pattern:/\\b(mypy|pyright)\\b/,name:e=>e[1]??"types"},{kind:"types",pattern:ne("bun|npm|pnpm|yarn","typecheck|type-check|check-types"),name:e=>`typecheck${e[2]??""}`},{kind:"types",pattern:/\\bcargo\\s+check\\b/,name:()=>"cargo check"},{kind:"lint",pattern:/\\b(eslint|biome|ruff|shellcheck|swiftlint|clippy|golangci-lint|stylelint)\\b/,name:e=>e[1]??"lint"},{kind:"lint",pattern:ne("bun|npm|pnpm|yarn","lint"),name:e=>`lint${e[2]??""}`},{kind:"lint",pattern:/\\bprettier\\b[^|;&]*--check\\b/,name:()=>"prettier"},{kind:"build",pattern:ne("bun|npm|pnpm|yarn","build"),name:e=>`${e[1]} build${e[2]??""}`},{kind:"build",pattern:/\\b(cargo|go|swift)\\s+build\\b/,name:e=>`${e[1]} build`},{kind:"build",pattern:/\\bxcodebuild\\b(?![^|;&]*\\btest\\b)/,name:()=>"xcodebuild"},{kind:"build",pattern:/\\b(?:next|vite)\\s+build\\b/,name:e=>e[0]},{kind:"validate",pattern:/(?:^|\\s)(?:\\S*\\/)?[\\w.-]*(?:validate|doctor)[\\w.-]*\\.sh\\b/,name:e=>e[0].trim().replace(/^.*\\//,"")},{kind:"all",pattern:/(?:^|\\s)(?:\\S*\\/)?checks?\\.sh\\b/,name:e=>e[0].trim().replace(/^.*\\//,"")}];var mt=new Set(["--prefix","-C","--cwd","--dir","--directory","--package-path","--manifest-path"]),Mt=new Set([...mt,"-p","--project"]);var We=String.raw`\\(fail\\)|FAIL(?:ED)?\\b|\u2717|\u2716(?! failing tests:)|\xD7|\u2718`,Ht=new RegExp(String.raw`^\\s*(?:${We})|\\berror\\s+TS\\d+\\b|^\\s*(?:[A-Z]\\w*Error|error)(?:\\[\\w+\\])?:`);var Ut=new RegExp(String.raw`^\\s*(?:${We}|\u276F)\\s*`);var se=5120;var gt=0;function o(e,t,n,i,r,s){t||(t={});var l,d,p=t;if("ref"in p)for(d in p={},t)d=="ref"?l=t[d]:p[d]=t[d];var c={type:e,props:p,key:n,ref:l,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--gt,__i:-1,__u:0,__source:r,__self:s};if(typeof e=="function"&&(l=e.defaultProps))for(d in l)p[d]===void 0&&(p[d]=l[d]);return g.vnode&&g.vnode(c),c}var je=[..."abcfghilm"],Ve=[{id:"needsYou",label:"Needs you",hotkey:"1"},{id:"findings",label:"Findings",hotkey:"2"}],yt=3e3,E=null,P=!1,K=!1,O="needsYou",oe={needsYou:null,findings:null},L=null,ye=!1,q=new Map,F=new Set,ge=new Set,ae=new Set,M=new Map,B=new Map,ke=new Map,S=[],ie={check:[],question:[],task:[],finding:[]},_e=0,qe=0,be=!1,kt=0,re=new Map;function Ye(e,t){return new Promise((n,i)=>{let r=++kt;re.set(r,{resolve:n,reject:i}),parent.postMessage({jsonrpc:"2.0",id:r,method:e,params:t},"*")})}window.addEventListener("message",e=>{let t=e.data;if(!(!t||t.jsonrpc!=="2.0")){if(t.id!=null&&!t.method&&re.has(t.id)){let n=re.get(t.id);re.delete(t.id),t.error?n.reject(t.error):n.resolve(t.result);return}t.method==="ui/notifications/host-context-changed"&&Xe(t.params??{}),t.id!=null&&t.method&&parent.postMessage({jsonrpc:"2.0",id:t.id,result:{}},"*")}});function Xe(e){e.theme&&(document.documentElement.dataset.theme=e.theme);for(let[t,n]of Object.entries(e.styles?.variables??{}))document.documentElement.style.setProperty(t,n)}async function we(e,t={}){return(await Ye("tools/call",{name:e,arguments:t}))?.structuredContent}function bt(e){return{check:e.checks.map(t=>`check:${t.key}`),question:e.questions.map(t=>t.id),task:e.tasks.map(t=>t.id),finding:[...e.findings].reverse().map(t=>t.id)}}function _t(e,t,n,i){if(n==="check"){let s=e.checks.find(l=>`check:${l.key}`===i);return s&&!t.dismissedChecks.includes(s.key)?{what:s.name,outcome:"Passed"}:null}if(n==="finding"){let s=t.leaving.find(l=>l.id===i);return s?{what:s.title,outcome:s.text}:null}let r=t.closed.find(s=>s.id===i);return r?{what:r.ask,outcome:Qe(r.outcome)}:null}function xe(e,t){if(t<qe)return;qe=t,K=!1;let n=Date.now(),i=bt(e),r=[];if(E)for(let s of Object.keys(ie))ie[s].forEach((l,d)=>{if(i[s].includes(l)||S.some(c=>c.id===l))return;let p=_t(E,e,s,l);p&&r.push({id:l,group:s,index:d,...p,at:n})});S=[...S.filter(s=>!i[s.group].includes(s.id)),...r],r.length>0&&setTimeout(_,se+50),ie=i,E=e,_()}async function ze(){if(!be){let e=++_e;try{let t=await we("inbox_view",{demo:P});t&&xe(t,e)}catch{K=!0,_()}}setTimeout(ze,yt)}async function x(e,t,n){ae.add(e),M.delete(e),B.delete(e),_(),be=!0;let i=++_e;try{let r=await we("inbox_press",{press:t,demo:P});r?.error?M.set(e,r.error):n?.(),r?.copy&&await wt(e,r.copy),r?.view&&xe(r.view,i)}catch{M.set(e,"Not sent: the inbox did not answer.")}finally{be=!1,ae.delete(e),_()}}async function wt(e,t){try{await navigator.clipboard.writeText(t.text),B.set(e,`Copied ${t.name}`)}catch{ke.set(e,t)}}function Qe(e){return e.charAt(0).toUpperCase()+e.slice(1)}function xt(e,t){return e.length>t?`${e.slice(0,t-1)}\\u2026`:e}function Je(e){L=e,ye=!0,_()}function Be(e,t,n){let i=t.last,r=t.kind==="question",s=(u,m)=>i?.action===m?`${u} again`:u,l=t.id,d=[...r?t.options.map((u,m)=>({label:xt(u.text,32),...u.isRec?{note:"(recommended)"}:{},run:()=>{x(l,{action:"answer",id:l,option:m})}})):[],...t.steps.map((u,m)=>({label:s(u,`step-${m}`),run:()=>{x(l,{action:"step",id:l,step:m})}}))].slice(0,je.length).map((u,m)=>({...u,hotkey:je[m]})),p={hotkey:"t",label:r?"Type an answer":"Type a reply",run:()=>Je(l)},c={hotkey:"e",label:s("Explain","explain"),run:()=>{x(l,{action:"explain",id:l})}};return{id:l,handle:t.isHandedOff?"\\u2713":n,handleTone:t.isHandedOff?"done":void 0,...t.isHandedOff?{fold:{}}:{},title:t.ask,titleAfter:t.at===null?void 0:` \\xB7 ${C(e.at-t.at)}`,hasSecondLine:r,keys:r?d:[...d,{hotkey:"d",label:"Done",run:()=>{x(l,{action:"done",id:l})}}],more:r?[p,c,{hotkey:"x",label:"Dismiss",run:()=>{x(l,{action:"dismiss",id:l})}}]:[p,c],typing:{hint:r?"Your answer":"Your reply to Codex",send:u=>{x(l,{action:"type",id:l,text:u},()=>q.delete(l))}},last:i}}function vt(e,t){let n=`check:${t.key}`,i=C(e.at-t.ranAt),r=t.fixSentAt===null?null:C(e.at-t.fixSentAt);return{id:n,handle:r?"\\u2713":"\\u2717",handleTone:r?"done":"error",...r?{fold:{note:`Fix sent \\xB7 ${r}`}}:{},title:`${t.name} \\xB7 ${t.outcome}`,subtitle:o("div",{class:"muted",children:[i,t.isStale?o("span",{class:"tone-needsYou",children:", before the last edit"}):null]}),line:r?{text:t.name,after:` \\xB7 fix sent ${r}`,afterTone:"done"}:{text:t.name,after:`${t.brief?` \\xB7 ${t.brief}`:""} \\xB7 ${i}`},body:o("div",{children:[t.failures.map(s=>o("div",{class:"failure",title:s,children:s})),t.command?o("div",{class:"command",children:["$ ",t.command]}):null]}),keys:[{hotkey:"a",label:r?"Fix again":"Fix",run:()=>{x(n,{action:"fix",key:t.key})}}],more:[{hotkey:"x",label:"Dismiss",run:()=>{x(n,{action:"dismissCheck",key:t.key})}}]}}var $t={issue:{label:"Issue",mark:"\\u25B2",tone:"needsYou"},opportunity:{label:"Opportunity",mark:"\\u2726",tone:"done"}};function Ct(e,t){let n=$t[t.kind],i=t.id;return{id:i,handle:"\\u2022",title:t.title,meta:o("div",{children:[o("span",{class:`tone-${n.tone}`,children:[n.mark," ",n.label]}),o("span",{class:"muted",children:[" ",C(e.at-t.at)]})]}),line:{text:t.title,after:` \\xB7 ${C(e.at-t.at)}`},body:o("div",{children:[o("p",{children:t.detail}),t.path?o("p",{children:[o("span",{class:"muted",children:"Relevant file: "}),t.path]}):null]}),keys:[{hotkey:"a",label:"Address it",run:()=>{x(i,{action:"address",id:i})}}],more:[{hotkey:"t",label:"Type a reply",run:()=>Je(i)},{hotkey:"e",label:"Discuss",run:()=>{x(i,{action:"discuss",id:i})}},{hotkey:"x",label:"Dismiss",run:()=>{x(i,{action:"dismissFinding",id:i})}}],typing:{hint:"Your reply to Codex",send:r=>{x(i,{action:"typedFinding",id:i,text:r},()=>q.delete(i))}},last:t.last}}function Ze(e){let t=e.checks.map(s=>vt(e,s)),n=e.questions.map((s,l)=>Be(e,s,`${l+1})`)),i=e.tasks.map(s=>Be(e,s,"\\u2022")),r=[...e.findings].reverse().map(s=>Ct(e,s));return{checks:t,questions:n,tasks:i,findings:r,byTab:{needsYou:[...t,...n,...i],findings:r}}}function et(e,t){let n=oe[t];if(!n)return e.length>0?0:-1;let i=e.findIndex(r=>r.id===n.id);return i>=0?i:Math.min(n.index,e.length-1)}function tt(e,t,n){let i=t[n];i&&(oe[e]={id:i.id,index:n},_())}function nt(e){let t={hotkey:"v",label:F.has(e.id)?"Hide details":"Details",run:()=>{F.has(e.id)?F.delete(e.id):F.add(e.id),_()}};return e.fold&&!F.has(e.id)?{keys:[t],more:[]}:e.fold?{keys:e.keys,more:[...e.more,t]}:{keys:e.keys,more:e.more}}function Ke({k:e}){return o("button",{type:"button",class:"key",onClick:e.run,children:[o("kbd",{children:e.hotkey}),": ",e.label,e.note?o("span",{class:"note",children:[" ",e.note]}):null]})}function St({row:e}){let t=e.typing;return o("form",{onSubmit:i=>{i.preventDefault();let r=(q.get(e.id)??"").trim();r&&(L=null,t.send(r))},children:[o("input",{id:`type-${e.id}`,value:q.get(e.id)??"",placeholder:t.hint,"aria-label":t.hint,onInput:i=>q.set(e.id,i.currentTarget.value)}),o("button",{type:"submit",class:"key",children:[o("kbd",{children:"\\u21B5"}),": Send"]}),o("button",{type:"button",class:"key",onClick:()=>{L=null,_()},children:[o("kbd",{children:"esc"}),": Cancel"]})]})}function Tt(e,t){return e.last?`${e.last.text} \\xB7 ${C(t-e.last.at)}`:null}function At({row:e,isSelected:t,onSelect:n,now:i}){let r=e.handleTone==="done"?"tone-done":"muted",s=o("span",{class:`mark ${e.handleTone??""}`,children:e.handle});if(!t){let m=e.line??{text:e.title,after:e.titleAfter},a=e.last?{...m,after:` \\xB7 ${e.last.text.charAt(0).toLowerCase()}${e.last.text.slice(1)} ${C(i-e.last.at)}`,afterTone:e.handleTone==="done"?"done":void 0}:m;return o("div",{class:"row",children:[s,o("button",{type:"button",class:"line",onClick:n,children:[o("span",{class:e.hasSecondLine?"text two":"text",children:a.text}),a.after?o("span",{class:`after ${a.afterTone?`tone-${a.afterTone}`:""}`,children:a.after}):null]})]})}let l=!e.fold||F.has(e.id),{keys:d,more:p}=nt(e),c=[e.fold?.note,Tt(e,i)],u=ke.get(e.id);return o("div",{class:"row selected",children:[s,o("div",{class:"content",children:[o("div",{class:"tight",children:[e.meta?o("div",{class:"meta",children:e.meta}):null,o("div",{class:"title",children:[e.title,e.titleAfter?o("span",{class:"after",children:e.titleAfter}):null]}),e.subtitle]}),l&&e.body?o("div",{class:"body",children:e.body}):null,c.some(Boolean)||ae.has(e.id)||B.has(e.id)||M.has(e.id)?o("div",{class:"tight",children:[c.filter(Boolean).map(m=>o("div",{class:r,children:m})),ae.has(e.id)?o("div",{class:"muted",children:"Sending\\u2026"}):null,B.has(e.id)?o("div",{class:"muted",children:B.get(e.id)}):null,M.has(e.id)?o("div",{class:"tone-error",children:M.get(e.id)}):null]}):null,o("div",{class:"keys",children:[d.map(m=>o(Ke,{k:m})),d.length>0&&p.length>0?o("span",{class:"key-dot",children:"\\xB7"}):null,p.map(m=>o(Ke,{k:m}))]}),e.typing&&L===e.id?o(St,{row:e}):null,u?o("div",{children:[o("div",{class:"muted",children:["Copy ",u.name," from here:"]}),o("textarea",{rows:3,readOnly:!0,value:u.text,onFocus:m=>m.currentTarget.select()}),o("button",{type:"button",class:"key",onClick:()=>{ke.delete(e.id),_()},children:"Close"})]}):null]})]})}function Rt({s:e}){return o("div",{class:"row settled",children:[o("span",{class:"mark done",children:"\\u2713"}),o("div",{class:"content tight",children:[o("div",{class:"what",children:e.what}),o("div",{class:"tone-done",children:e.outcome}),o("div",{class:"leave",children:o("div",{style:{animationDuration:`${se}ms`},ref:t=>{t&&!t.style.animationDelay&&(t.style.animationDelay=`-${Math.max(0,Date.now()-e.at)}ms`)}})})]})]})}function ve({rows:e,group:t,all:n,now:i,empty:r}){let s=t==="finding"?"findings":"needsYou",l=et(n,s),d=e.map(p=>({row:p}));for(let p of S.filter(c=>c.group===t).sort((c,u)=>c.index-u.index))d.splice(Math.min(p.index,d.length),0,{settled:p});return o("div",{class:t==="finding"?"flat":"tree",children:[d.length===0&&r?o("div",{class:"entry",children:o("div",{class:"row",children:[o("span",{class:"mark"}),o("span",{class:"empty-line",children:r})]})}):null,d.map(p=>"row"in p?o("div",{class:"entry",children:o(At,{row:p.row,now:i,isSelected:n.indexOf(p.row)===l,onSelect:()=>tt(s,n,n.indexOf(p.row))})},p.row.id):o("div",{class:"entry",children:o(Rt,{s:p.settled})},`settled-${p.settled.id}`))]})}function st({title:e,count:t}){return o("div",{class:"group-title",children:[e,t>0?o("span",{class:"count",children:t}):null]})}function Ge({v:e,kind:t,rows:n,all:i,now:r}){let s=t==="question"?"Questions":"Your tasks",l=t==="question"?"No questions are waiting on you.":"No tasks are waiting on you.",d=new Set(S.map(u=>u.id)),p=e.closed.filter(u=>u.kind===t&&!d.has(u.id)),c=ge.has(t);return o("section",{children:[o(st,{title:s,count:n.filter(u=>!u.fold).length}),o(ve,{rows:n,group:t,all:i,now:r,empty:l}),p.length>0?o("button",{type:"button",class:"fold",onClick:()=>{c?ge.delete(t):ge.add(t),_()},children:[o("span",{class:"fold-mark",children:c?"\\u25BE":"\\u25B8"}),p.length," Closed"]}):null,c&&p.length>0?o("div",{class:"tree closed-tree",children:p.map(u=>o("div",{class:"entry",children:o("div",{class:"row",children:[o("span",{class:"mark",children:"\\u25C7"}),o("div",{class:"content tight",children:[o("div",{class:"muted",children:u.ask}),o("div",{children:[o("span",{class:u.isLapsed?"outcome lapsed":"outcome",children:Qe(u.outcome)}),o("span",{class:"muted",children:[" \\xB7 ",C(r-u.at)]})]})]})]})},`closed-${u.id}`))}):null]})}function Et({v:e,lists:t,now:n}){let i=t.byTab.needsYou,r=t.checks.length>0||S.some(s=>s.group==="check");return o("main",{children:[r?o("section",{children:[o(st,{title:"Failing checks",count:t.checks.filter(s=>!s.fold).length}),o(ve,{rows:t.checks,group:"check",all:i,now:n})]}):null,o(Ge,{v:e,kind:"question",rows:t.questions,all:i,now:n}),o(Ge,{v:e,kind:"task",rows:t.tasks,all:i,now:n})]})}function Lt({lists:e,now:t}){return e.findings.length===0&&!S.some(n=>n.group==="finding")?o("div",{class:"empty",children:[o("div",{class:"title",children:"No findings yet"}),o("div",{class:"muted",children:"Codex flags issues and opportunities it spots beyond your task."})]}):o("main",{children:o("section",{children:o(ve,{rows:e.findings,group:"finding",all:e.findings,now:t})})})}function Nt({v:e,lists:t,now:n}){let i={needsYou:e.waiting,findings:t.findings.length},r=e.updating?"Updating\\u2026":e.updatedAt!==null?`Updated ${C(n-e.updatedAt)}`:"Not updated yet";return o("nav",{children:[o("div",{class:"tabs",children:Ve.map(s=>o("button",{type:"button",class:`tab ${O===s.id?"shown":""}`,onClick:()=>{O=s.id,_()},children:[s.label,i[s.id]>0?o("span",{class:`count tone-${s.id}`,children:i[s.id]}):null]}))}),o("div",{class:"status",children:[r,e.failed&&!e.updating?o("span",{class:"tone-error",children:" \\xB7 update failed, items from that reply are missing"}):null]})]})}async function It(){P=!P,E=null,S=[],ie={check:[],question:[],task:[],finding:[]},oe.needsYou=null,oe.findings=null,L=null;let e=++_e;_();try{let t=await we("inbox_view",{demo:P});t&&xe(t,e)}catch{K=!0,_()}}function Ot(){if(!E)return o("div",{class:"notice",children:K?"Could not read the inbox.":o("span",{class:"muted",children:"Loading\\u2026"})});let e=E,t=e.at,n=Ze(e);return o(R,{children:[K?o("div",{class:"notice",children:"Could not read the inbox."}):null,P?o("div",{class:"demo-note",children:"Showing sample entries. Presses here send nothing to Codex."}):null,o(Nt,{v:e,lists:n,now:t}),O==="needsYou"?o(Et,{v:e,lists:n,now:t}):o(Lt,{lists:n,now:t}),o("footer",{children:[o("span",{children:[o("kbd",{children:"1 2"}),"Switch tabs",o("span",{class:"sep",children:"\\xB7"}),o("kbd",{children:"j k"}),"Select the next or previous row"]}),o("button",{type:"button",class:"demo-toggle",onClick:()=>{It()},children:P?"Hide demo":"Show demo"})]})]})}var j=document.getElementById("app");function _(){S=S.filter(e=>Date.now()-e.at<se),j.className&&(j.className="",j.textContent=""),Ue(o(Ot,{}),j),ye&&L&&(ye=!1,document.getElementById(`type-${L}`)?.focus())}document.addEventListener("keydown",e=>{if(e.metaKey||e.ctrlKey||e.altKey||!E)return;let t=e.target;if(t?.closest("input, textarea")){e.key==="Escape"&&t.tagName==="INPUT"&&(L=null,_());return}let n=Ve.find(u=>u.hotkey===e.key);if(n){O=n.id,_();return}let i=Ze(E).byTab[O],r=et(i,O),s=e.key==="j"||e.key==="ArrowDown"?1:e.key==="k"||e.key==="ArrowUp"?-1:0;if(s!==0){e.preventDefault(),tt(O,i,Math.max(0,Math.min(i.length-1,r+s))),document.querySelector(".row.selected")?.scrollIntoView({block:"nearest"});return}let l=i[r];if(!l)return;let{keys:d,more:p}=nt(l),c=[...d,...p].find(u=>u.hotkey===e.key);c&&(e.preventDefault(),c.run())});Ye("ui/initialize",{protocolVersion:"2026-01-26",appInfo:{name:"inbox",version:"0.1.0"},appCapabilities:{tools:{}}}).then(e=>{Xe(e?.hostContext??{}),parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/initialized",params:{}},"*"),ze()}).catch(()=>{j.textContent="The inbox could not connect to Codex."});})();\n\n    </script>\n  </body>\n</html>\n';

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
