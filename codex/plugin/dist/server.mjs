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
function stepsOf(item, extraSteps) {
  return [...steps(item.helps), ...extraSteps];
}
function isHandedOff(last, turns) {
  const pressed = last?.kind === "handoff" ? last.turnsStarted : void 0;
  return pressed !== void 0 && pressed <= turns.turnsStarted && turns.turnsApplied <= pressed;
}
function actionId(p) {
  return p.action === "step" ? `step-${p.step}` : p.action;
}
function pressText(p) {
  switch (p.action) {
    case "answer":
      return p.option;
    case "type":
      return "Reply";
    case "step":
      return p.label;
    default:
      return capitalized(p.action);
  }
}
function capitalized(text2) {
  return text2.charAt(0).toUpperCase() + text2.slice(1);
}
var HANDOFF_IDS = /^(address|type|step-\d+|thread-address|pr-conflicts|pr-address-all)$/;
function upgradedLastAction(key, old) {
  const a = old.action;
  const action = key.startsWith("pr:") ? a.startsWith("address-all-") ? "pr-address-all" : a.startsWith("resolve-") ? "pr-conflicts" : null : key.includes(" thread ") ? a.startsWith("address-") ? "thread-address" : a.startsWith("draft-") ? "thread-draft" : a.startsWith("discuss-") ? "thread-discuss" : null : /^explain(-|$)/.test(a) ? "explain" : /^(help-.+-|step-)\d+$/.test(a) ? `step-${a.split("-").pop()}` : a === "typed" ? "type" : /^address(-|$)/.test(a) ? "address" : /^discuss(-|$)/.test(a) ? "discuss" : null;
  if (action === null) return null;
  const { isHandoff, ...kept } = old;
  const isHandedOff2 = isHandoff ?? HANDOFF_IDS.test(action);
  return {
    ...kept,
    kind: isHandedOff2 ? "handoff" : "talk",
    action,
    // Earlier builds saved "Explain sent" or "Sent to Claude to fix"; a last action is now the label pressed.
    text: /^Sent to (Claude|Codex) to /.test(old.text) ? "Address" : old.text.replace(/ sent$/, "")
  };
}
function upgradeLastActions(saved) {
  return Object.fromEntries(
    Object.entries(saved).flatMap(([key, last]) => {
      if ("kind" in last && last.kind) return [[key, last]];
      const upgraded2 = upgradedLastAction(key, last);
      return upgraded2 ? [[key, upgraded2]] : [];
    })
  );
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
  closedFindings: [],
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
  return { id, kind, ask, ...label ? { label } : {}, ...closing, at: now, item };
}
function closedFindingRecord(finding, closing, now) {
  return { ...finding, ...closing, closedAt: now };
}
var CLOSED_BY_CLAUDE = "closed by Claude";
function closeByAgent(host, ledger, id, how, now) {
  const closing = "answer" in how ? { how: "answered", outcome: how.answer } : { how: "claude", outcome: `closed by ${host.agent}: ${how.reason}` };
  if (ledger.items.some((i) => i.id === id)) return { ledger: closeItem(ledger, id, closing, now), closed: "item" };
  if (ledger.findings.some((f) => f.id === id))
    return { ledger: closeFinding(ledger, id, closing, now), closed: "finding" };
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
function closeFinding(ledger, id, closing, now) {
  return {
    ...ledger,
    findings: ledger.findings.filter((f) => f.id !== id),
    closedFindings: [
      ...ledger.closedFindings,
      ...ledger.findings.filter((f) => f.id === id).map((f) => closedFindingRecord(f, closing, now))
    ].slice(-MAX_CLOSED)
  };
}
function latestBatch(ledger) {
  return ledger.batchTurn === 0 ? [] : ledger.items.filter((i) => i.turn === ledger.batchTurn);
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
function questionNumbers(ledger, promptTurn) {
  const numbers = /* @__PURE__ */ new Map();
  for (const [n, item] of batchNumbers(answerableBatch(ledger, promptTurn)))
    if (item.kind === "question") numbers.set(item.id, n);
  return numbers;
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

// ../hooks/view.ts
var OPTIONS_FOLD_AT = 5;
var UPDATE_FAILED = "Last update failed. Items from that reply may be missing.";
var UPDATE_RETRIES = " It retries after your next message.";
function needsYouOrder(ledger) {
  const latest = new Set(latestBatch(ledger).map((i) => i.id));
  const questions = ledger.items.filter((i) => i.kind === "question");
  return {
    questions: [
      ...questions.filter((i) => latest.has(i.id)),
      ...questions.filter((i) => !latest.has(i.id)).sort((a, b) => b.turn - a.turn)
    ],
    tasks: ledger.items.filter((i) => i.kind === "task").sort((a, b) => a.turn - b.turn)
  };
}
function feedbackOf(last) {
  return last && last.kind !== "local" ? { is: "done", label: last.text, at: last.at } : null;
}
function stepKind(step) {
  return step.step.some((h) => h.kind === "run") ? "handoff" : "local";
}
function actionsOf(row, last) {
  const { id, item, steps: steps2 } = row;
  const action = (press2, label, kind, flags = {}) => ({
    press: press2,
    // The type action opens a field for new words each time, so it never reads "again".
    label: press2.action !== "type" && last?.action === actionId(press2) ? `${label} again` : label,
    kind,
    isPrimary: flags.isPrimary ?? false,
    isFolded: flags.isFolded ?? false
  });
  const stepActions = steps2.map((s, n) => action({ action: "step", id, step: n, label: s.label }, s.label, stepKind(s)));
  if (!item)
    return [
      action({ action: "address", id }, "Address", "handoff"),
      action({ action: "discuss", id }, "Discuss", "talk"),
      action({ action: "type", id, text: "" }, "Type a reply", "handoff"),
      action({ action: "dismiss", id }, "Dismiss", "mark")
    ];
  if (item.kind === "task")
    return [
      ...stepActions,
      action({ action: "done", id }, "Done", "mark"),
      action({ action: "type", id, text: "" }, "Type a reply", "handoff"),
      action({ action: "explain", id }, "Explain", "talk")
    ];
  const isFolding = item.options.length > OPTIONS_FOLD_AT;
  return [
    ...item.options.map(
      (option, n) => action({ action: "answer", id, option }, clipLabel(option, 32), "mark", {
        isPrimary: option === item.rec,
        isFolded: isFolding && n >= OPTIONS_FOLD_AT - 1
      })
    ),
    ...stepActions,
    action({ action: "type", id, text: "" }, "Type an answer", "mark"),
    action({ action: "explain", id }, "Explain", "talk"),
    action({ action: "dismiss", id }, "Dismiss", "mark")
  ];
}
function inboxView({ ledger, lastActions, turns, extraSteps, status }) {
  const { questions, tasks } = needsYouOrder(ledger);
  const numbers = questionNumbers(ledger, ledger.turn + 1);
  const stateOf = (id) => isHandedOff(lastActions[id], turns) ? { is: "handedOff" } : { is: "open" };
  const itemRow = (item) => {
    const n = numbers.get(item.id);
    const steps2 = stepsOf(item, extraSteps[item.id] ?? []);
    return {
      id: item.id,
      type: item.kind,
      handle: item.kind === "task" ? "\u2022" : n === void 0 ? "?" : `${n})`,
      title: item.ask,
      at: item.at,
      item,
      finding: null,
      steps: steps2,
      // Questions never fold.
      state: item.kind === "task" ? stateOf(item.id) : { is: "open" },
      feedback: feedbackOf(lastActions[item.id]),
      actions: actionsOf({ id: item.id, item, steps: steps2 }, lastActions[item.id])
    };
  };
  const questionRows = questions.map(itemRow);
  const taskRows = tasks.map(itemRow);
  const counted = [...questionRows, ...taskRows].filter((r) => r.state.is === "open");
  const findingRows = [...ledger.findings].reverse().map((finding) => ({
    id: finding.id,
    type: "finding",
    handle: "\u2022",
    title: finding.title,
    at: finding.at,
    item: null,
    finding,
    steps: [],
    state: stateOf(finding.id),
    feedback: feedbackOf(lastActions[finding.id]),
    actions: actionsOf({ id: finding.id, item: null, steps: [] }, lastActions[finding.id])
  }));
  return {
    needsYou: { count: counted.length, topId: counted[0]?.id ?? null, questions: questionRows, tasks: taskRows },
    findings: { count: findingRows.filter((r) => r.state.is === "open").length, rows: findingRows },
    status
  };
}
function perTurnStatus(ledger, update) {
  const times = [
    ledger.card?.updatedAt,
    ...ledger.items.map((i) => i.at),
    ...ledger.closed.map((d) => d.at),
    ...ledger.findings.map((f) => f.at),
    ...ledger.closedFindings.map((f) => f.closedAt)
  ].filter((t) => typeof t === "number");
  return {
    changedAt: times.length === 0 ? null : Math.max(...times),
    isUpdating: update.isUpdating,
    error: update.isFailed && !update.isUpdating ? UPDATE_FAILED + (update.retries ? UPDATE_RETRIES : "") : null
  };
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
function withLast(s, p, kind, now, extra = {}) {
  const last = {
    kind,
    action: actionId(p),
    text: pressText(p),
    at: now,
    turnsStarted: s.presence.turnsStarted,
    ...extra
  };
  return { ...s, lastActions: { ...s.lastActions, [p.id]: last } };
}
function sent(s, text2, press2, now) {
  return { ...s, sent: [...s.sent, { text: text2, press: press2, at: now }].slice(-MAX_SENT) };
}
function press(s, p, now) {
  const send = (state, text2, by) => ({
    state: sent(state, text2, by, now),
    effects: [{ kind: "send", text: text2, press: by }]
  });
  if (p.action === "address" || p.action === "discuss" || p.action === "dismissFinding" || p.action === "typedFinding") {
    const finding = s.ledger.findings.find((f) => f.id === p.id);
    if (!finding) return null;
    const removed = { ...s, ledger: { ...s.ledger, findings: s.ledger.findings.filter((f) => f.id !== p.id) } };
    if (p.action === "dismissFinding") return { state: removed, effects: [] };
    const words2 = p.action === "typedFinding" ? p.text.trim() : "";
    if (p.action === "typedFinding" && !words2) return null;
    const how = p.action === "typedFinding" ? "typed" : p.action;
    const last = how === "typed" ? withLast(removed, { action: "type", id: p.id, text: words2 }, "handoff", now, { title: finding.title }) : withLast(removed, { action: how, id: p.id }, how === "address" ? "handoff" : "talk", now, {
      title: finding.title
    });
    return send(last, messages.finding(finding, how, words2), null);
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
      return send(
        withLast(s, { action: "type", id: item.id, text: words2 }, "handoff", now),
        messages.taskReply(item, words2),
        null
      );
    }
    case "explain":
      return send(withLast(s, { action: "explain", id: item.id }, "talk", now), messages.explain(item), {
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
        state = withLast(state, { action: "step", id: item.id, step: p.step, label: found.label }, "handoff", now);
      return { state, effects };
    }
  }
}
function viewOf(s, now) {
  const l = s.ledger;
  const open = new Set(l.findings.map((f) => f.id));
  const update = {
    isUpdating: s.presence.isUpdating || s.pending.length > 0,
    isFailed: s.presence.ledgerState === "failed",
    // applied() drops a failed exchange; nothing reruns it.
    retries: false
  };
  return {
    ...inboxView({
      ledger: l,
      lastActions: s.lastActions,
      turns: s.presence,
      extraSteps: {},
      status: perTurnStatus(l, update)
    }),
    goal: l.card?.goal ?? "",
    now: l.card?.now ?? "",
    done: l.card?.done ?? [],
    running: l.card?.running ?? [],
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
      closedFindings: [],
      prs: ["petekp/inbox#31", "petekp/inbox#29", "petekp/inbox#33"],
      nextId: 24,
      turn: 14,
      batchTurn: 14
    },
    stop: null,
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
    lastActions: {
      d18: {
        kind: "handoff",
        action: "step-0",
        text: "Run load script",
        at: now - 1 * MIN,
        turnsStarted: 14,
        tab: "needsYou",
        title: "Run the load script and send back its output lines",
        index: 0
      },
      "petekp/inbox#31 thread DT1": {
        kind: "handoff",
        action: "thread-address",
        text: "Address",
        at: now - 2 * MIN,
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
    pending: (saved.pending ?? []).map(({ ex: { checks: _exChecks, ...ex }, ...p }) => ({ ...p, ex })),
    lastActions: upgradeLastActions(saved.lastActions ?? {})
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

// src/demo.ts
function demoState(now) {
  const d = demoView(now);
  const s = emptyState("demo");
  return {
    ...s,
    root: "/demo",
    ledger: d.ledger,
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
var tab_default = '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>Inbox</title>\n    <style>\n      /* The host\'s variables when Codex passes them; otherwise the pane\'s own colors. */\n      :root {\n        color-scheme: light;\n        --bg: var(--color-background-primary, #ffffff);\n        --text: var(--color-text-primary, #1f1f1f);\n        --muted: var(--color-text-secondary, #595959);\n        --key: #243bf5;\n        --needs-you: #745417;\n        --findings: #7b00e8;\n        --done: #25652f;\n        --error: #a5293d;\n        --error-mark: #a5293d;\n        --sans: var(--font-sans, -apple-system, system-ui, sans-serif);\n        --mono: var(--font-mono, ui-monospace, \'SF Mono\', Menlo, monospace);\n        /* Surfaces are mixed from the host\'s colors, so they follow its theme. */\n        --card: color-mix(in srgb, var(--text) 4.5%, var(--bg));\n        --raised: color-mix(in srgb, var(--text) 9%, var(--bg));\n        --selected: color-mix(in srgb, #4c9aff 20%, var(--card));\n        --tree: color-mix(in srgb, var(--text) 30%, var(--bg));\n        --divider: color-mix(in srgb, var(--text) 9%, var(--bg));\n        --hover: color-mix(in srgb, var(--key) 14%, transparent);\n        /* The tree\'s grid: its line, where a row\'s mark sits, and where its text starts. */\n        --tree-x: 15px;\n        --mark-x: 30px;\n        --text-x: 52px;\n      }\n      @media (prefers-color-scheme: dark) {\n        :root:not([data-theme=\'light\']) {\n          color-scheme: dark;\n          --bg: var(--color-background-primary, #171717);\n          --text: var(--color-text-primary, #ececec);\n          --muted: var(--color-text-secondary, #a8a8a8);\n          --key: #b1b9f9;\n          --needs-you: #ffc107;\n          --findings: #cab0ff;\n          --done: #7ecd8f;\n          --error: #ffa3b0;\n          --error-mark: #ff6b80;\n          --card: color-mix(in srgb, var(--text) 5.5%, var(--bg));\n          --raised: color-mix(in srgb, var(--text) 11%, var(--bg));\n          --selected: color-mix(in srgb, #7fa6d9 15%, var(--card));\n          --tree: color-mix(in srgb, var(--text) 32%, var(--bg));\n          --divider: color-mix(in srgb, var(--text) 8%, var(--bg));\n        }\n      }\n      :root[data-theme=\'dark\'] {\n        color-scheme: dark;\n        --key: #b1b9f9;\n        --needs-you: #ffc107;\n        --findings: #cab0ff;\n        --done: #7ecd8f;\n        --error: #ffa3b0;\n        --error-mark: #ff6b80;\n        --card: color-mix(in srgb, var(--text) 5.5%, var(--bg));\n        --raised: color-mix(in srgb, var(--text) 11%, var(--bg));\n        --selected: color-mix(in srgb, #7fa6d9 15%, var(--card));\n        --tree: color-mix(in srgb, var(--text) 32%, var(--bg));\n        --divider: color-mix(in srgb, var(--text) 8%, var(--bg));\n      }\n      * {\n        box-sizing: border-box;\n      }\n      body {\n        margin: 0;\n        background: var(--bg);\n        color: var(--text);\n        font: 13px/20px var(--sans);\n        -webkit-font-smoothing: antialiased;\n      }\n      button {\n        font: inherit;\n        color: inherit;\n        background: none;\n        border: none;\n        padding: 0;\n        cursor: pointer;\n        text-align: left;\n      }\n      :focus-visible {\n        outline: 1.5px solid var(--key);\n        outline-offset: 1px;\n        border-radius: 4px;\n      }\n      kbd {\n        font: 12px/20px var(--mono);\n        color: var(--key);\n      }\n      .muted {\n        color: var(--muted);\n      }\n      .tone-needsYou {\n        color: var(--needs-you);\n      }\n      .tone-findings {\n        color: var(--findings);\n      }\n      .tone-done {\n        color: var(--done);\n      }\n      .tone-error {\n        color: var(--error);\n      }\n      .notice {\n        padding: 10px 16px;\n        color: var(--error);\n      }\n\n      /* Tabs: the shown one a raised panel, the others text on the background. */\n      nav {\n        display: flex;\n        flex-wrap: wrap;\n        align-items: flex-end;\n        justify-content: space-between;\n        gap: 4px 16px;\n        padding: 12px 12px 0;\n      }\n      .tabs {\n        display: flex;\n        gap: 4px;\n      }\n      .tab {\n        padding: 6px 12px;\n        border-radius: 6px;\n        color: var(--muted);\n      }\n      .tab:hover {\n        color: var(--text);\n      }\n      .tab.shown {\n        background: var(--raised);\n        color: var(--text);\n        font-weight: 600;\n      }\n      .tab .count {\n        font-weight: 600;\n        margin-left: 6px;\n      }\n      .status {\n        padding: 6px 4px;\n        color: var(--muted);\n        font-size: 12px;\n      }\n\n      main {\n        display: flex;\n        flex-direction: column;\n        gap: 8px;\n        padding: 12px 12px 4px;\n      }\n      section {\n        background: var(--card);\n        border-radius: 8px;\n        padding: 10px 0;\n      }\n      .group-title {\n        padding: 0 14px 0 calc(var(--tree-x) + 4px);\n        font-weight: 500;\n      }\n      .group-title .count {\n        color: var(--muted);\n        margin-left: 6px;\n      }\n\n      /* The tree: a hairline from the group\'s title, an elbow to each row, and a rounded last elbow. */\n      .tree {\n        position: relative;\n        padding-top: 8px;\n      }\n      .tree::before {\n        content: \'\';\n        position: absolute;\n        left: var(--tree-x);\n        top: 0;\n        height: 8px;\n        border-left: 1px solid var(--tree);\n      }\n      .entry {\n        position: relative;\n        --elbow: 16px;\n      }\n      .entry:has(> .row.selected) {\n        --elbow: 22px;\n      }\n      .tree > .entry::before {\n        content: \'\';\n        position: absolute;\n        left: var(--tree-x);\n        top: 0;\n        bottom: 0;\n        border-left: 1px solid var(--tree);\n        z-index: 1;\n      }\n      .tree > .entry::after {\n        content: \'\';\n        position: absolute;\n        left: var(--tree-x);\n        top: var(--elbow);\n        width: 11px;\n        border-top: 1px solid var(--tree);\n        z-index: 1;\n      }\n      .tree > .entry:last-child::before {\n        bottom: auto;\n        height: calc(var(--elbow) + 1px);\n        width: 11px;\n        border-bottom: 1px solid var(--tree);\n        border-bottom-left-radius: 7px;\n      }\n      .tree > .entry:last-child::after {\n        display: none;\n      }\n      .flat {\n        --mark-x: 18px;\n        --text-x: 40px;\n      }\n\n      /* Rows. A divider runs from the text column to the edge, under the tree\'s line. */\n      .row {\n        display: flex;\n        padding: 6px 14px 6px var(--mark-x);\n      }\n      .entry + .entry > .row {\n        background-image: linear-gradient(var(--divider), var(--divider));\n        background-repeat: no-repeat;\n        background-size: calc(100% - var(--text-x)) 1px;\n        background-position: right top;\n      }\n      .row.selected {\n        background-color: var(--selected);\n        padding-top: 12px;\n        padding-bottom: 12px;\n      }\n      .mark {\n        flex: none;\n        width: calc(var(--text-x) - var(--mark-x));\n        font: 12px/20px var(--mono);\n        color: var(--muted);\n      }\n      .mark.done,\n      .mark.error {\n        font-size: 13px;\n      }\n      .mark.done {\n        color: var(--done);\n      }\n      .mark.error {\n        color: var(--error-mark);\n      }\n      .content {\n        flex: 1;\n        min-width: 0;\n        display: flex;\n        flex-direction: column;\n        gap: 8px;\n      }\n      .content > .tight,\n      .content.tight {\n        display: flex;\n        flex-direction: column;\n        gap: 0;\n      }\n      .line {\n        display: flex;\n        width: 100%;\n        min-width: 0;\n      }\n      .line .text {\n        min-width: 0;\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .line .text.two {\n        white-space: normal;\n        display: -webkit-box;\n        -webkit-line-clamp: 2;\n        -webkit-box-orient: vertical;\n      }\n      .line .after {\n        flex: none;\n        white-space: pre;\n        color: var(--muted);\n      }\n      .line .after.tone-done {\n        color: var(--done);\n      }\n      .line:hover .text {\n        color: color-mix(in srgb, var(--text) 80%, var(--key));\n      }\n      .title {\n        font-weight: 600;\n      }\n      .title .after {\n        font-weight: 400;\n        color: var(--muted);\n      }\n      .meta {\n        font-size: 12px;\n      }\n      .body {\n        overflow-wrap: anywhere;\n      }\n      .body p {\n        margin: 0;\n      }\n      .body p + p {\n        margin-top: 4px;\n      }\n      /* Keys are text, as the pane draws them: "a: Fix". */\n      .keys {\n        display: flex;\n        flex-wrap: wrap;\n        align-items: center;\n        gap: 2px 8px;\n        margin-left: -6px;\n      }\n      .key {\n        padding: 1px 6px;\n        border-radius: 5px;\n        white-space: nowrap;\n      }\n      .key:hover {\n        background: var(--hover);\n      }\n      /* The option Claude recommended. */\n      .key.primary {\n        font-weight: 600;\n      }\n      .key-dot {\n        color: var(--muted);\n      }\n      form {\n        display: flex;\n        align-items: center;\n        gap: 8px;\n      }\n      input {\n        flex: 1;\n        min-width: 0;\n        font: inherit;\n        color: inherit;\n        background: var(--bg);\n        border: 1px solid var(--tree);\n        border-radius: 6px;\n        padding: 4px 8px;\n      }\n      input:focus {\n        outline: none;\n        border-color: var(--key);\n      }\n      textarea {\n        width: 100%;\n        font: 12px var(--mono);\n        color: inherit;\n        background: var(--bg);\n        border: 1px solid var(--tree);\n        border-radius: 6px;\n      }\n\n      .empty-line {\n        color: var(--muted);\n      }\n      .fold {\n        display: block;\n        margin: 8px 0 0 calc(var(--mark-x) - 2px);\n        padding: 1px 4px;\n        border-radius: 5px;\n        color: var(--muted);\n      }\n      .fold:hover {\n        color: var(--text);\n      }\n      .fold-mark {\n        display: inline-block;\n        width: 14px;\n        font-family: var(--mono);\n      }\n      /* The closed items hang from the fold\'s arrow. */\n      .tree.closed-tree {\n        --tree-x: 36px;\n        --mark-x: 52px;\n        --text-x: 72px;\n        padding-top: 4px;\n      }\n      .tree.closed-tree::before {\n        height: 4px;\n      }\n      .tree.closed-tree .entry + .entry > .row {\n        background-image: none;\n      }\n      .outcome {\n        font-weight: 600;\n      }\n      .outcome.lapsed {\n        font-weight: 400;\n        color: var(--muted);\n      }\n      .settled .what {\n        color: var(--muted);\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .leave {\n        width: 96px;\n        height: 1.5px;\n        margin-top: 4px;\n        border-radius: 1px;\n        overflow: hidden;\n      }\n      .leave div {\n        height: 100%;\n        background: var(--done);\n        animation-name: leave;\n        animation-timing-function: linear;\n        animation-fill-mode: forwards;\n      }\n      @keyframes leave {\n        from {\n          width: 100%;\n        }\n        to {\n          width: 0;\n        }\n      }\n      .empty {\n        padding: 56px 32px;\n        text-align: center;\n      }\n      .empty .title {\n        margin-bottom: 4px;\n      }\n      footer {\n        display: flex;\n        flex-wrap: wrap;\n        justify-content: space-between;\n        gap: 4px 16px;\n        padding: 8px 16px 16px;\n        color: var(--muted);\n        font-size: 12px;\n      }\n      .demo-toggle {\n        padding: 0 6px;\n        border-radius: 5px;\n        color: var(--muted);\n      }\n      .demo-toggle:hover {\n        color: var(--text);\n        background: var(--hover);\n      }\n      .demo-note {\n        margin: 12px 12px 0;\n        padding: 6px 12px;\n        border-radius: 6px;\n        background: var(--raised);\n        color: var(--text);\n      }\n      footer kbd {\n        margin-right: 4px;\n      }\n      footer .sep {\n        margin: 0 8px;\n      }\n      @media (prefers-reduced-motion: reduce) {\n        .leave div {\n          animation: none;\n        }\n      }\n    </style>\n  </head>\n  <body>\n    <div id="app" class="notice muted">Loading\u2026</div>\n    <script>\n      "use strict";(()=>{var ee,g,Ae,st,A,xe,Ce,Re,le,K,V,Pe,ue,de,ce,it,z={},J=[],ot=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,te=Array.isArray;function S(e,t){for(var n in t)e[n]=t[n];return e}function pe(e){e&&e.parentNode&&e.parentNode.removeChild(e)}function rt(e,t,n){var i,o,s,a={};for(s in t)s=="key"?i=t[s]:s=="ref"?o=t[s]:a[s]=t[s];if(arguments.length>2&&(a.children=arguments.length>3?ee.call(arguments,2):n),typeof e=="function"&&e.defaultProps!=null)for(s in e.defaultProps)a[s]===void 0&&(a[s]=e.defaultProps[s]);return X(e,a,i,o,null)}function X(e,t,n,i,o){var s={type:e,props:t,key:n,ref:i,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:o??++Ae,__i:-1,__u:0};return o==null&&g.vnode!=null&&g.vnode(s),s}function T(e){return e.children}function Q(e,t){this.props=e,this.context=t}function N(e,t){if(t==null)return e.__?N(e.__,e.__i+1):null;for(var n;t<e.__k.length;t++)if((n=e.__k[t])!=null&&n.__e!=null)return n.__e;return typeof e.type=="function"?N(e):null}function at(e){if(e.__P&&e.__d){var t=e.__v,n=t.__e,i=[],o=[],s=S({},t);s.__v=t.__v+1,g.vnode&&g.vnode(s),fe(e.__P,s,t,e.__n,e.__P.namespaceURI,32&t.__u?[n]:null,i,n??N(t),!!(32&t.__u),o),s.__v=t.__v,s.__.__k[s.__i]=s,Oe(i,s,o),t.__e=t.__=null,s.__e!=n&&Le(s)}}function Le(e){if((e=e.__)!=null&&e.__c!=null)return e.__e=e.__c.base=null,e.__k.some(function(t){if(t!=null&&t.__e!=null)return e.__e=e.__c.base=t.__e}),Le(e)}function $e(e){(!e.__d&&(e.__d=!0)&&A.push(e)&&!Z.__r++||xe!=g.debounceRendering)&&((xe=g.debounceRendering)||Ce)(Z)}function Z(){try{for(var e,t=1;A.length;)A.length>t&&A.sort(Re),e=A.shift(),t=A.length,at(e)}finally{A.length=Z.__r=0}}function Ee(e,t,n,i,o,s,a,c,u,d,f){var h,r,p,y,k,b,_=i&&i.__k||J,m=t.length;for(u=lt(n,t,_,u,m),h=0;h<m;h++)(p=n.__k[h])!=null&&(r=p.__i!=-1&&_[p.__i]||z,p.__i=h,b=fe(e,p,r,o,s,a,c,u,d,f),y=p.__e,p.ref&&r.ref!=p.ref&&(r.ref&&he(r.ref,null,p),f.push(p.ref,p.__c||y,p)),k==null&&y!=null&&(k=y),4&p.__u?(u=Ne(p,u,e),r.__e&&(r.__e=null)):typeof p.type=="function"&&b!==void 0?u=b:y&&(u=y.nextSibling),p.__u&=-7);return n.__e=k,u}function lt(e,t,n,i,o){var s,a,c,u,d,f=n.length,h=f,r=0;for(e.__k=new Array(o),s=0;s<o;s++)(a=t[s])!=null&&typeof a!="boolean"&&typeof a!="function"?(typeof a=="string"||typeof a=="number"||typeof a=="bigint"||a.constructor==String?a=e.__k[s]=X(null,a,null,null,null):te(a)?a=e.__k[s]=X(T,{children:a},null,null,null):a.constructor===void 0&&a.__b>0?a=e.__k[s]=X(a.type,a.props,a.key,a.ref?a.ref:null,a.__v):e.__k[s]=a,u=s+r,a.__=e,a.__b=e.__b+1,c=null,(d=a.__i=dt(a,n,u,h))!=-1&&(h--,(c=n[d])&&(c.__u|=2)),c==null||c.__v==null?(d==-1&&(o>f?r--:o<f&&r++),typeof a.type!="function"&&(a.__u|=4)):d!=u&&(d==u-1?r--:d==u+1?r++:(d>u?r--:r++,a.__u|=4))):e.__k[s]=null;if(h)for(s=0;s<f;s++)(c=n[s])!=null&&(2&c.__u)==0&&(c.__e==i&&(i=N(c)),Fe(c,c));return i}function Ne(e,t,n){var i,o;if(typeof e.type=="function"){for(i=e.__k,o=0;i&&o<i.length;o++)i[o]&&(i[o].__=e,t=Ne(i[o],t,n));return t}e.__e!=t&&(t&&e.type&&!t.parentNode&&(t=N(e)),t=n.insertBefore(e.__e,t||null));do t=t&&t.nextSibling;while(t!=null&&t.nodeType==8);return t}function dt(e,t,n,i){var o,s,a,c=e.key,u=e.type,d=t[n],f=d!=null&&(2&d.__u)==0;if(d===null&&c==null||f&&c==d.key&&u==d.type)return n;if(i>(f?1:0)){for(o=n-1,s=n+1;o>=0||s<t.length;)if((d=t[a=o>=0?o--:s++])!=null&&(2&d.__u)==0&&c==d.key&&u==d.type)return a}return-1}function Se(e,t,n){t[0]=="-"?e.setProperty(t,n??""):e[t]=n==null?"":typeof n!="number"||ot.test(t)?n:n+"px"}function G(e,t,n,i,o){var s,a;e:if(t=="style")if(typeof n=="string")e.style.cssText=n;else{if(typeof i=="string"&&(e.style.cssText=i=""),i)for(t in i)n&&t in n||Se(e.style,t,"");if(n)for(t in n)i&&n[t]==i[t]||Se(e.style,t,n[t])}else if(t[0]=="o"&&t[1]=="n")s=t!=(t=t.replace(Pe,"$1")),a=t.toLowerCase(),t=a in e||t=="onFocusOut"||t=="onFocusIn"?a.slice(2):t.slice(2),e.l||(e.l={}),e.l[t+s]=n,n?i?n[V]=i[V]:(n[V]=ue,e.addEventListener(t,s?ce:de,s)):e.removeEventListener(t,s?ce:de,s);else{if(o=="http://www.w3.org/2000/svg")t=t.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(t!="width"&&t!="height"&&t!="href"&&t!="list"&&t!="form"&&t!="tabIndex"&&t!="download"&&t!="rowSpan"&&t!="colSpan"&&t!="role"&&t!="popover"&&t in e)try{e[t]=n??"";break e}catch{}typeof n=="function"||(n==null||n===!1&&t[4]!="-"?e.removeAttribute(t):e.setAttribute(t,t=="popover"&&n==1?"":n))}}function Te(e){return function(t){if(this.l){var n=this.l[t.type+e];if(t[K]==null)t[K]=ue++;else if(t[K]<n[V])return;return n(g.event?g.event(t):t)}}}function fe(e,t,n,i,o,s,a,c,u,d){var f,h,r,p,y,k,b,_,m,x,H,E,M,ve,B,ae,$=t.type;if(t.constructor!==void 0)return null;128&n.__u&&(u=!!(32&n.__u),s=[c=t.__e=n.__e]),(f=g.__b)&&f(t);e:if(typeof $=="function"){h=a.length;try{if(m=t.props,x=$.prototype&&$.prototype.render,H=(f=$.contextType)&&i[f.__c],E=f?H?H.props.value:f.__:i,n.__c?_=(r=t.__c=n.__c).__=r.__E:(x?t.__c=r=new $(m,E):(t.__c=r=new Q(m,E),r.constructor=$,r.render=ut),H&&H.sub(r),r.state||(r.state={}),r.__n=i,p=r.__d=!0,r.__h=[],r._sb=[]),x&&r.__s==null&&(r.__s=r.state),x&&$.getDerivedStateFromProps!=null&&(r.__s==r.state&&(r.__s=S({},r.__s)),S(r.__s,$.getDerivedStateFromProps(m,r.__s))),y=r.props,k=r.state,r.__v=t,p)x&&$.getDerivedStateFromProps==null&&r.componentWillMount!=null&&r.componentWillMount(),x&&r.componentDidMount!=null&&r.__h.push(r.componentDidMount);else{if(x&&$.getDerivedStateFromProps==null&&m!==y&&r.componentWillReceiveProps!=null&&r.componentWillReceiveProps(m,E),t.__v==n.__v||!r.__e&&r.shouldComponentUpdate!=null&&r.shouldComponentUpdate(m,r.__s,E)===!1){t.__v!=n.__v&&(r.props=m,r.state=r.__s,r.__d=!1),t.__e=n.__e,t.__k=n.__k,t.__k.some(function(D){D&&(D.__=t)}),J.push.apply(r.__h,r._sb),r._sb=[],r.__h.length&&a.push(r),c=N(n);break e}r.componentWillUpdate!=null&&r.componentWillUpdate(m,r.__s,E),x&&r.componentDidUpdate!=null&&r.__h.push(function(){r.componentDidUpdate(y,k,b)})}if(r.context=E,r.props=m,r.__P=e,r.__e=!1,M=g.__r,ve=0,x)r.state=r.__s,r.__d=!1,M&&M(t),f=r.render(r.props,r.state,r.context),J.push.apply(r.__h,r._sb),r._sb=[];else do r.__d=!1,M&&M(t),f=r.render(r.props,r.state,r.context),r.state=r.__s;while(r.__d&&++ve<25);r.state=r.__s,r.getChildContext!=null&&(i=S(S({},i),r.getChildContext())),x&&!p&&r.getSnapshotBeforeUpdate!=null&&(b=r.getSnapshotBeforeUpdate(y,k)),B=f!=null&&f.type===T&&f.key==null?De(f.props.children):f,c=Ee(e,te(B)?B:[B],t,n,i,o,s,a,c,u,d),r.base=t.__e,t.__u&=-161,r.__h.length&&a.push(r),_&&(r.__E=r.__=null)}catch(D){if(a.length=h,t.__v=null,u||s!=null){if(D.then){for(t.__u|=u?160:128;c&&c.nodeType==8&&c.nextSibling;)c=c.nextSibling;s!=null&&(s[s.indexOf(c)]=null),t.__e=c}else if(s!=null)for(ae=s.length;ae--;)pe(s[ae])}else t.__e=n.__e;t.__k==null&&(t.__k=n.__k||[]),D.then||Ie(t),g.__e(D,t,n)}}else s==null&&t.__v==n.__v?(t.__k=n.__k,t.__e=n.__e):c=t.__e=ct(n.__e,t,n,i,o,s,a,u,d);return(f=g.diffed)&&f(t),128&t.__u?void 0:c}function Ie(e){e&&(e.__c&&(e.__c.__e=!0),e.__k&&e.__k.some(Ie))}function Oe(e,t,n){for(var i=0;i<n.length;i++)he(n[i],n[++i],n[++i]);g.__c&&g.__c(t,e),e.some(function(o){try{e=o.__h,o.__h=[],e.some(function(s){s.call(o)})}catch(s){g.__e(s,o.__v)}})}function De(e){return typeof e!="object"||e==null||e.__b>0?e:te(e)?e.map(De):e.constructor!==void 0?null:S({},e)}function ct(e,t,n,i,o,s,a,c,u){var d,f,h,r,p,y,k,b=n.props||z,_=t.props,m=t.type;if(m=="svg"?o="http://www.w3.org/2000/svg":m=="math"?o="http://www.w3.org/1998/Math/MathML":o||(o="http://www.w3.org/1999/xhtml"),s!=null){for(d=0;d<s.length;d++)if((p=s[d])&&"setAttribute"in p==!!m&&(m?p.localName==m:p.nodeType==3)){e=p,s[d]=null;break}}if(e==null){if(m==null)return document.createTextNode(_);e=document.createElementNS(o,m,_.is&&_),c&&(g.__m&&g.__m(t,s),c=!1),s=null}if(m==null)b===_||c&&e.data==_||(e.data=_);else{if(s=m=="textarea"&&_.defaultValue!=null?null:s&&ee.call(e.childNodes),!c&&s!=null)for(b={},d=0;d<e.attributes.length;d++)b[(p=e.attributes[d]).name]=p.value;for(d in b)p=b[d],d=="dangerouslySetInnerHTML"?h=p:d=="children"||d in _||d=="value"&&"defaultValue"in _||d=="checked"&&"defaultChecked"in _||G(e,d,null,p,o);for(d in _)p=_[d],d=="children"?r=p:d=="dangerouslySetInnerHTML"?f=p:d=="value"?y=p:d=="checked"?k=p:c&&typeof p!="function"||b[d]===p||G(e,d,p,b[d],o);if(f)c||h&&(f.__html==h.__html||f.__html==e.innerHTML)||(e.innerHTML=f.__html),t.__k=[];else if(h&&(e.innerHTML=""),Ee(t.type=="template"?e.content:e,te(r)?r:[r],t,n,i,m=="foreignObject"?"http://www.w3.org/1999/xhtml":o,s,a,s?s[0]:n.__k&&N(n,0),c,u),s!=null)for(d=s.length;d--;)pe(s[d]);c&&m!="textarea"||(d="value",m=="progress"&&y==null?e.removeAttribute("value"):y!=null&&(y!==e[d]||m=="progress"&&!y||m=="option"&&y!=b[d])&&G(e,d,y,b[d],o),d="checked",k!=null&&k!=e[d]&&G(e,d,k,b[d],o))}return e}function he(e,t,n){try{if(typeof e=="function"){var i=typeof e.__u=="function";i&&e.__u(),i&&t==null||(e.__u=e(t))}else e.current=t}catch(o){g.__e(o,n)}}function Fe(e,t,n){var i,o;if(g.unmount&&g.unmount(e),(i=e.ref)&&(i.current&&i.current!=e.__e||he(i,null,t)),(i=e.__c)!=null){if(i.componentWillUnmount)try{i.componentWillUnmount()}catch(s){g.__e(s,t)}i.base=i.__P=i.__n=null}if(i=e.__k)for(o=0;o<i.length;o++)i[o]&&Fe(i[o],t,n||typeof e.type!="function");n||pe(e.__e),e.__c=e.__=e.__e=void 0}function ut(e,t,n){return this.constructor(e,n)}function Ue(e,t,n){var i,o,s,a;t==document&&(t=document.documentElement),g.__&&g.__(e,t),o=(i=typeof n=="function")?null:n&&n.__k||t.__k,s=[],a=[],fe(t,e=(!i&&n||t).__k=rt(T,null,[e]),o||z,z,t.namespaceURI,!i&&n?[n]:o?null:t.firstChild?ee.call(t.childNodes):null,s,!i&&n?n:o?o.__e:t.firstChild,i,a),Oe(s,e,a),e.props.children=null}ee=J.slice,g={__e:function(e,t,n,i){for(var o,s,a;t=t.__;)if((o=t.__c)&&!o.__)try{if((s=o.constructor)&&s.getDerivedStateFromError!=null&&(o.setState(s.getDerivedStateFromError(e)),a=o.__d),o.componentDidCatch!=null&&(o.componentDidCatch(e,i||{}),a=o.__d),a)return o.__E=o}catch(c){e=c}throw e}},Ae=0,st=function(e){return e!=null&&e.constructor===void 0},Q.prototype.setState=function(e,t){var n;n=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=S({},this.state),typeof e=="function"&&(e=e(S({},n),this.props)),e&&S(n,e),e!=null&&this.__v&&(t&&this._sb.push(t),$e(this))},Q.prototype.forceUpdate=function(e){this.__v&&(this.__e=!0,e&&this.__h.push(e),$e(this))},Q.prototype.render=T,A=[],Ce=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,Re=function(e,t){return e.__v.__b-t.__v.__b},Z.__r=0,le=Math.random().toString(8),K="__d"+le,V="__a"+le,Pe=/(PointerCapture)$|Capture$/i,ue=0,de=Te(!1),ce=Te(!0),it=0;function C(e){let t=Math.round(e/6e4);if(t<1)return"just now";if(t<60)return`${t}m ago`;let n=Math.round(t/60);return n<48?`${n}h ago`:`${Math.round(n/24)}d ago`}function He(e){return`\\u2713 ${e.label}`}var ne=5120;var ft=0;function l(e,t,n,i,o,s){t||(t={});var a,c,u=t;if("ref"in u)for(c in u={},t)c=="ref"?a=t[c]:u[c]=t[c];var d={type:e,props:u,key:n,ref:a,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--ft,__i:-1,__u:0,__source:o,__self:s};if(typeof e=="function"&&(a=e.defaultProps))for(c in a)u[c]===void 0&&(u[c]=a[c]);return g.vnode&&g.vnode(d),d}var Me=[..."abcfghilm"],Ye=[{id:"needsYou",label:"Needs you",hotkey:"1"},{id:"findings",label:"Findings",hotkey:"2"}],ht=3e3,P=null,O=!1,Y=!1,I="needsYou",oe={needsYou:null,findings:null},L=null,ge=!1,j=new Map,F=new Set,Ve=new Set,me=new Set,re=new Set,U=new Map,W=new Map,ye=new Map,v=[],se={question:[],task:[],finding:[]},be=0,qe=0,_e=!1,mt=0,ie=new Map;function Be(e,t){return new Promise((n,i)=>{let o=++mt;ie.set(o,{resolve:n,reject:i}),parent.postMessage({jsonrpc:"2.0",id:o,method:e,params:t},"*")})}window.addEventListener("message",e=>{let t=e.data;if(!(!t||t.jsonrpc!=="2.0")){if(t.id!=null&&!t.method&&ie.has(t.id)){let n=ie.get(t.id);ie.delete(t.id),t.error?n.reject(t.error):n.resolve(t.result);return}t.method==="ui/notifications/host-context-changed"&&Ge(t.params??{}),t.id!=null&&t.method&&parent.postMessage({jsonrpc:"2.0",id:t.id,result:{}},"*")}});function Ge(e){e.theme&&(document.documentElement.dataset.theme=e.theme);for(let[t,n]of Object.entries(e.styles?.variables??{}))document.documentElement.style.setProperty(t,n)}async function we(e,t={}){return(await Be("tools/call",{name:e,arguments:t}))?.structuredContent}function gt(e){return{question:e.needsYou.questions.map(t=>t.id),task:e.needsYou.tasks.map(t=>t.id),finding:e.findings.rows.map(t=>t.id)}}function yt(e,t,n,i){if(n==="finding"){let s=t.leaving.find(a=>a.id===i);return s?{what:s.title,outcome:s.text}:null}let o=t.closed.find(s=>s.id===i);return o?{what:o.ask,outcome:Xe(o.outcome)}:null}function ke(e,t){if(t<qe)return;qe=t,Y=!1;let n=Date.now(),i=gt(e),o=[];if(P)for(let s of Object.keys(se))se[s].forEach((a,c)=>{if(i[s].includes(a)||v.some(d=>d.id===a))return;let u=yt(P,e,s,a);u&&o.push({id:a,group:s,index:c,...u,at:n})});v=[...v.filter(s=>!i[s.group].includes(s.id)),...o],o.length>0&&setTimeout(w,ne+50),se=i,P=e,w()}async function Ke(){if(!_e){let e=++be;try{let t=await we("inbox_view",{demo:O});t&&ke(t,e)}catch{Y=!0,w()}}setTimeout(Ke,ht)}async function R(e,t,n){re.add(e),U.delete(e),W.delete(e),w(),_e=!0;let i=++be;try{let o=await we("inbox_press",{press:t,demo:O});o?.error?U.set(e,o.error):n?.(),o?.copy&&await _t(e,o.copy),o?.view&&ke(o.view,i)}catch{U.set(e,"Not sent: the inbox did not answer.")}finally{_e=!1,re.delete(e),w()}}async function _t(e,t){try{await navigator.clipboard.writeText(t.text),W.set(e,`Copied ${t.name}`)}catch{ye.set(e,t)}}function Xe(e){return e.charAt(0).toUpperCase()+e.slice(1)}function bt(e){L=e,ge=!0,w()}function Qe(e){let{id:t,item:n}=e,i=e.actions.filter(f=>Ve.has(t)||!f.isFolded),o=e.actions.length-i.length,s=i.map(f=>f.press.action).lastIndexOf("answer"),a=[],c=[],u=0,d=()=>u<Me.length?{hotkey:Me[u++]}:{};for(let[f,h]of i.entries()){let r=h.press,p=h.label;if(r.action==="answer"&&n){let y=n.options.indexOf(r.option);a.push({...d(),label:p,isPrimary:h.isPrimary,run:()=>{R(t,{action:"answer",id:t,option:y})}}),f===s&&o>0&&a.push({label:`All ${n.options.length} options`,run:()=>{Ve.add(t),w()}})}else if(r.action==="step")a.push({...d(),label:p,run:()=>{R(t,{action:"step",id:t,step:r.step})}});else if(r.action==="done")a.push({hotkey:"d",label:p,run:()=>{R(t,{action:"done",id:t})}});else if(r.action==="address")a.push({hotkey:"a",label:p,run:()=>{R(t,{action:"address",id:t})}});else if(r.action==="type")c.push({hotkey:"t",label:p,run:()=>bt(t)});else if(r.action==="explain"||r.action==="discuss"){let y=r.action;c.push({hotkey:"e",label:p,run:()=>{R(t,{action:y,id:t})}})}else r.action==="dismiss"&&c.push({hotkey:"x",label:p,run:()=>{R(t,n?{action:"dismiss",id:t}:{action:"dismissFinding",id:t})}})}return{keys:a,more:c}}function wt(e,t,n){let i=n.kind==="question",o=t.state.is==="handedOff",s=n.id;return{id:s,handle:o?"\\u2713":t.handle,handleTone:o?"done":void 0,...o?{fold:{}}:{},title:n.ask,titleAfter:n.at===null?void 0:` \\xB7 ${C(e.at-n.at)}`,hasSecondLine:i,...Qe(t),typing:{hint:i?"Your answer":"Your reply to Codex",send:a=>{R(s,{action:"type",id:s,text:a},()=>j.delete(s))}},feedback:t.feedback}}var kt={issue:{label:"Issue",mark:"\\u25B2",tone:"needsYou"},opportunity:{label:"Opportunity",mark:"\\u2726",tone:"done"}};function vt(e,t,n){let i=kt[n.kind],o=n.id;return{id:o,handle:"\\u2022",title:n.title,meta:l("div",{children:[l("span",{class:`tone-${i.tone}`,children:[i.mark," ",i.label]}),l("span",{class:"muted",children:[" ",C(e.at-n.at)]})]}),line:{text:n.title,after:` \\xB7 ${C(e.at-n.at)}`},body:l("div",{children:[l("p",{children:n.detail}),n.path?l("p",{children:[l("span",{class:"muted",children:"Relevant file: "}),n.path]}):null]}),...Qe(t),typing:{hint:"Your reply to Codex",send:s=>{R(o,{action:"typedFinding",id:o,text:s},()=>j.delete(o))}},feedback:t.feedback}}function ze(e){let t=s=>s.flatMap(a=>a.item?[wt(e,a,a.item)]:[]),n=t(e.needsYou.questions),i=t(e.needsYou.tasks),o=e.findings.rows.flatMap(s=>s.finding?[vt(e,s,s.finding)]:[]);return{questions:n,tasks:i,findings:o,byTab:{needsYou:[...n,...i],findings:o}}}function Je(e,t){let n=oe[t];if(!n)return e.length>0?0:-1;let i=e.findIndex(o=>o.id===n.id);return i>=0?i:Math.min(n.index,e.length-1)}function Ze(e,t,n){let i=t[n];i&&(oe[e]={id:i.id,index:n},w())}function et(e){let t={hotkey:"v",label:F.has(e.id)?"Hide details":"Details",run:()=>{F.has(e.id)?F.delete(e.id):F.add(e.id),w()}};return e.fold&&!F.has(e.id)?{keys:[t],more:[]}:e.fold?{keys:e.keys,more:[...e.more,t]}:{keys:e.keys,more:e.more}}function je({k:e}){return l("button",{type:"button",class:e.isPrimary?"key primary":"key",onClick:e.run,children:[e.hotkey?l(T,{children:[l("kbd",{children:e.hotkey}),":"," "]}):null,e.label]})}function xt({row:e}){let t=e.typing;return l("form",{onSubmit:i=>{i.preventDefault();let o=(j.get(e.id)??"").trim();o&&(L=null,t.send(o))},children:[l("input",{id:`type-${e.id}`,value:j.get(e.id)??"",placeholder:t.hint,"aria-label":t.hint,onInput:i=>j.set(e.id,i.currentTarget.value)}),l("button",{type:"submit",class:"key",children:[l("kbd",{children:"\\u21B5"}),": Send"]}),l("button",{type:"button",class:"key",onClick:()=>{L=null,w()},children:[l("kbd",{children:"esc"}),": Cancel"]})]})}function tt(e){return e.feedback&&(e.handleTone==="done"?e.feedback.label:He(e.feedback))}function $t(e,t){return e.feedback?`${tt(e)} \\xB7 ${C(t-e.feedback.at)}`:null}function St({row:e,isSelected:t,onSelect:n,now:i}){let o=e.handleTone==="done"?"tone-done":"muted",s=l("span",{class:`mark ${e.handleTone??""}`,children:e.handle});if(!t){let h=e.line??{text:e.title,after:e.titleAfter},r=e.feedback?{...h,after:` \\xB7 ${tt(e)} ${C(i-e.feedback.at)}`,afterTone:e.handleTone==="done"?"done":void 0}:h;return l("div",{class:"row",children:[s,l("button",{type:"button",class:"line",onClick:n,children:[l("span",{class:e.hasSecondLine?"text two":"text",children:r.text}),r.after?l("span",{class:`after ${r.afterTone?`tone-${r.afterTone}`:""}`,children:r.after}):null]})]})}let a=!e.fold||F.has(e.id),{keys:c,more:u}=et(e),d=[e.fold?.note,$t(e,i)],f=ye.get(e.id);return l("div",{class:"row selected",children:[s,l("div",{class:"content",children:[l("div",{class:"tight",children:[e.meta?l("div",{class:"meta",children:e.meta}):null,l("div",{class:"title",children:[e.title,e.titleAfter?l("span",{class:"after",children:e.titleAfter}):null]})]}),a&&e.body?l("div",{class:"body",children:e.body}):null,d.some(Boolean)||re.has(e.id)||W.has(e.id)||U.has(e.id)?l("div",{class:"tight",children:[d.filter(Boolean).map(h=>l("div",{class:o,children:h})),re.has(e.id)?l("div",{class:"muted",children:"Sending\\u2026"}):null,W.has(e.id)?l("div",{class:"muted",children:W.get(e.id)}):null,U.has(e.id)?l("div",{class:"tone-error",children:U.get(e.id)}):null]}):null,l("div",{class:"keys",children:[c.map(h=>l(je,{k:h})),c.length>0&&u.length>0?l("span",{class:"key-dot",children:"\\xB7"}):null,u.map(h=>l(je,{k:h}))]}),e.typing&&L===e.id?l(xt,{row:e}):null,f?l("div",{children:[l("div",{class:"muted",children:["Copy ",f.name," from here:"]}),l("textarea",{rows:3,readOnly:!0,value:f.text,onFocus:h=>h.currentTarget.select()}),l("button",{type:"button",class:"key",onClick:()=>{ye.delete(e.id),w()},children:"Close"})]}):null]})]})}function Tt({s:e}){return l("div",{class:"row settled",children:[l("span",{class:"mark done",children:"\\u2713"}),l("div",{class:"content tight",children:[l("div",{class:"what",children:e.what}),l("div",{class:"tone-done",children:e.outcome}),l("div",{class:"leave",children:l("div",{style:{animationDuration:`${ne}ms`},ref:t=>{t&&!t.style.animationDelay&&(t.style.animationDelay=`-${Math.max(0,Date.now()-e.at)}ms`)}})})]})]})}function nt({rows:e,group:t,all:n,now:i}){let o=t==="finding"?"findings":"needsYou",s=Je(n,o),a=e.map(c=>({row:c}));for(let c of v.filter(u=>u.group===t).sort((u,d)=>u.index-d.index))a.splice(Math.min(c.index,a.length),0,{settled:c});return a.length===0?null:l("div",{class:t==="finding"?"flat":"tree",children:a.map(c=>"row"in c?l("div",{class:"entry",children:l(St,{row:c.row,now:i,isSelected:n.indexOf(c.row)===s,onSelect:()=>Ze(o,n,n.indexOf(c.row))})},c.row.id):l("div",{class:"entry",children:l(Tt,{s:c.settled})},`settled-${c.settled.id}`))})}function At({title:e,count:t}){return l("div",{class:"group-title",children:[e,t>0?l("span",{class:"count",children:t}):null]})}function We({v:e,kind:t,rows:n,all:i,now:o}){let s=t==="question"?"Questions":"Tasks",a=new Set(v.map(d=>d.id)),c=e.closed.filter(d=>d.kind===t&&!a.has(d.id)),u=me.has(t);return n.length===0&&!v.some(d=>d.group===t)&&c.length===0?null:l("section",{children:[l(At,{title:s,count:n.filter(d=>!d.fold).length}),l(nt,{rows:n,group:t,all:i,now:o}),c.length>0?l("button",{type:"button",class:"fold",onClick:()=>{u?me.delete(t):me.add(t),w()},children:[l("span",{class:"fold-mark",children:u?"\\u25BE":"\\u25B8"}),c.length," Closed"]}):null,u&&c.length>0?l("div",{class:"tree closed-tree",children:c.map(d=>l("div",{class:"entry",children:l("div",{class:"row",children:[l("span",{class:"mark",children:"\\u25C7"}),l("div",{class:"content tight",children:[l("div",{class:"muted",children:d.ask}),l("div",{children:[l("span",{class:d.isLapsed?"outcome lapsed":"outcome",children:Xe(d.outcome)}),l("span",{class:"muted",children:[" \\xB7 ",C(o-d.at)]})]})]})]})},`closed-${d.id}`))}):null]})}function Ct({v:e,lists:t,now:n}){let i=t.byTab.needsYou,o=i.length===0&&!v.some(a=>a.group!=="finding"),s=new Set(v.map(a=>a.id));return o&&!e.closed.some(a=>!s.has(a.id))?l("div",{class:"empty",children:l("div",{class:"title",children:"Nothing needs you."})}):l("main",{children:[o?l("section",{children:l("div",{class:"group-title empty-line",children:"Nothing needs you."})}):null,l(We,{v:e,kind:"question",rows:t.questions,all:i,now:n}),l(We,{v:e,kind:"task",rows:t.tasks,all:i,now:n})]})}function Rt({lists:e,now:t}){return e.findings.length===0&&!v.some(n=>n.group==="finding")?l("div",{class:"empty",children:[l("div",{class:"title",children:"No findings yet"}),l("div",{class:"muted",children:"Codex flags issues and opportunities it spots beyond your task."})]}):l("main",{children:l("section",{children:l(nt,{rows:e.findings,group:"finding",all:e.findings,now:t})})})}function Pt({v:e,now:t}){let n={needsYou:e.needsYou.count,findings:e.findings.count},{changedAt:i,isUpdating:o,error:s}=e.status,a=o?"Updating\\u2026":i!==null?`Updated ${C(t-i)}`:"Not updated yet";return l("nav",{children:[l("div",{class:"tabs",children:Ye.map(c=>l("button",{type:"button",class:`tab ${I===c.id?"shown":""}`,onClick:()=>{I=c.id,w()},children:[c.label,n[c.id]>0?l("span",{class:`count tone-${c.id}`,children:n[c.id]}):null]}))}),l("div",{class:"status",children:[a,s?l("div",{class:"tone-error",children:s}):null]})]})}async function Lt(){O=!O,P=null,v=[],se={question:[],task:[],finding:[]},oe.needsYou=null,oe.findings=null,L=null;let e=++be;w();try{let t=await we("inbox_view",{demo:O});t&&ke(t,e)}catch{Y=!0,w()}}function Et(){if(!P)return l("div",{class:"notice",children:Y?"Could not read the inbox.":l("span",{class:"muted",children:"Loading\\u2026"})});let e=P,t=e.at,n=ze(e);return l(T,{children:[Y?l("div",{class:"notice",children:"Could not read the inbox."}):null,O?l("div",{class:"demo-note",children:"Showing sample entries. Presses here send nothing to Codex."}):null,l(Pt,{v:e,now:t}),I==="needsYou"?l(Ct,{v:e,lists:n,now:t}):l(Rt,{lists:n,now:t}),l("footer",{children:[l("span",{children:[l("kbd",{children:"1 2"}),"Switch tabs",l("span",{class:"sep",children:"\\xB7"}),l("kbd",{children:"j k"}),"Select the next or previous row"]}),l("button",{type:"button",class:"demo-toggle",onClick:()=>{Lt()},children:O?"Hide demo":"Show demo"})]})]})}var q=document.getElementById("app");function w(){v=v.filter(e=>Date.now()-e.at<ne),q.className&&(q.className="",q.textContent=""),Ue(l(Et,{}),q),ge&&L&&(ge=!1,document.getElementById(`type-${L}`)?.focus())}document.addEventListener("keydown",e=>{if(e.metaKey||e.ctrlKey||e.altKey||!P)return;let t=e.target;if(t?.closest("input, textarea")){e.key==="Escape"&&t.tagName==="INPUT"&&(L=null,w());return}let n=Ye.find(f=>f.hotkey===e.key);if(n){I=n.id,w();return}let i=ze(P).byTab[I],o=Je(i,I),s=e.key==="j"||e.key==="ArrowDown"?1:e.key==="k"||e.key==="ArrowUp"?-1:0;if(s!==0){e.preventDefault(),Ze(I,i,Math.max(0,Math.min(i.length-1,o+s))),document.querySelector(".row.selected")?.scrollIntoView({block:"nearest"});return}let a=i[o];if(!a)return;let{keys:c,more:u}=et(a),d=[...c,...u].find(f=>f.hotkey===e.key);d&&(e.preventDefault(),d.run())});Be("ui/initialize",{protocolVersion:"2026-01-26",appInfo:{name:"inbox",version:"0.1.0"},appCapabilities:{tools:{}}}).then(e=>{Ge(e?.hostContext??{}),parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/initialized",params:{}},"*"),Ke()}).catch(()=>{q.textContent="The inbox could not connect to Codex."});})();\n\n    </script>\n  </body>\n</html>\n';

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
