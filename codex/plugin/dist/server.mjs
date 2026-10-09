// Built by codex/build.mjs from codex/src and hooks/. Do not edit.

// src/server-main.ts
import { dirname as dirname2 } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

// src/server.ts
import { constants } from "node:fs";
import { access, stat as stat2 } from "node:fs/promises";

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
function idNumber(id) {
  return Number(id.match(/\d+/)?.[0] ?? Number.NaN);
}
function inIdOrder(open, entry) {
  const at = open.findIndex((x) => idNumber(x.id) > idNumber(entry.id));
  return at < 0 ? [...open, entry] : [...open.slice(0, at), entry, ...open.slice(at)];
}
function reopenItem(ledger, id) {
  const item = ledger.closed.findLast((c) => c.id === id)?.item;
  if (!item || ledger.items.some((i) => i.id === id)) return ledger;
  return { ...ledger, items: inIdOrder(ledger.items, item), closed: ledger.closed.filter((c) => c.id !== id) };
}
function reopenFinding(ledger, id) {
  const record = ledger.closedFindings.findLast((f) => f.id === id);
  if (!record || ledger.findings.some((f) => f.id === id)) return ledger;
  const { how: _how, outcome: _outcome, closedAt: _closedAt, ...finding } = record;
  return {
    ...ledger,
    findings: inIdOrder(ledger.findings, finding),
    closedFindings: ledger.closedFindings.filter((f) => f.id !== id)
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
var TOLD_NOTHING = { inbox: null, closed: [] };

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
  const pressed2 = last?.kind === "handoff" && last.delivery?.state !== "failed" ? last.turnsStarted : void 0;
  return pressed2 !== void 0 && pressed2 <= turns.turnsStarted && turns.turnsApplied <= pressed2;
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
    Object.entries(saved).flatMap(([key, entry]) => {
      const {
        tab: _tab,
        title: _title,
        index: _index,
        ...last
      } = entry;
      if ("kind" in last && last.kind) return [[key, last]];
      const upgraded2 = upgradedLastAction(key, last);
      return upgraded2 ? [[key, upgraded2]] : [];
    })
  );
}
function isUndoable(how) {
  return how === "done" || how === "dismissed";
}
var STALE_TEXT = "This changed before your press. Nothing was sent.";
function noteText(note) {
  return note === "sample" ? "Sample entry: nothing was sent." : STALE_TEXT;
}
function helpEffect(item, help) {
  switch (help.kind) {
    case "run":
      return { kind: "send", text: messages.run(item, help.command), by: { id: item.id, action: "run" } };
    case "open":
      return { kind: "open", target: help.path, name: baseName(help.path) };
    case "link":
      return { kind: "open", target: help.url, name: help.name ?? help.url };
    case "copy":
      return { kind: "copy", text: help.text, name: help.name ?? "snippet", isCommand: false };
    case "terminal":
      return { kind: "copy", text: help.command, name: help.name ?? clipLabel(help.command, 32), isCommand: true };
  }
}
function stepEffects(item, step) {
  return step.step.map((h) => helpEffect(item, h));
}
function pendingResult(effects, at) {
  return {
    state: "pending",
    parts: effects.flatMap(
      (e) => e.kind === "send" ? [] : [{ kind: e.kind, name: e.name, isCommand: e.kind === "copy" && e.isCommand, error: null }]
    ),
    at
  };
}
function finishedResult(pending, errors, at) {
  const parts = pending.parts.map((part, n) => ({ ...part, error: errors[n] ?? null }));
  return { state: parts.some((part) => part.error !== null) ? "failed" : "done", parts, at };
}
function localLast(last, pressed2, result) {
  return last && last.kind !== "local" ? { ...last, result } : { kind: "local", ...pressed2, at: result.at, result };
}
function withResult(lastActions, rowId, pendingAt, result) {
  const last = lastActions[rowId];
  if (last?.result?.state !== "pending" || last.result.at !== pendingAt) return lastActions;
  return { ...lastActions, [rowId]: { ...last, result } };
}
function applyPress(ledger, last, p, ctx) {
  const r = pressed(ledger, last, p, ctx);
  return "stale" in r || !r.last ? r : { ...r, last: withQueued(r.last, r.effects) };
}
function withQueued(last, effects) {
  const send = effects.find((e) => e.kind === "send");
  return send ? { ...last, delivery: { state: "queued", message: send.text } } : last;
}
function retryOf(id, last) {
  if (!/^[if]\d+$/.test(id)) return null;
  const step = /^step-(\d+)$/.exec(last.action);
  if (step) return { action: "step", id, step: Number(step[1]), label: last.text };
  switch (last.action) {
    case "answer":
      return { action: "answer", id, option: last.text };
    case "explain":
    case "address":
    case "discuss":
      return { action: last.action, id };
    default:
      return null;
  }
}
function pressed(ledger, last, p, ctx) {
  const stale = { stale: true };
  const record = (kind) => ({
    kind,
    action: actionId(p),
    text: pressText(p),
    at: ctx.now,
    turnsStarted: ctx.turnsStarted
  });
  const unchanged = { ledger, last: null, effects: [] };
  if (p.action === "undo") {
    if (ledger.items.some((i) => i.id === p.id) || ledger.findings.some((f) => f.id === p.id)) return stale;
    const closed = ledger.closed.findLast((c) => c.id === p.id);
    if (closed?.item && isUndoable(closed.how)) return { ...unchanged, ledger: reopenItem(ledger, p.id) };
    const closedFinding = ledger.closedFindings.findLast((f) => f.id === p.id);
    if (closedFinding && isUndoable(closedFinding.how)) return { ...unchanged, ledger: reopenFinding(ledger, p.id) };
    return stale;
  }
  const finding = ledger.findings.find((f) => f.id === p.id);
  if (finding) {
    const sendFinding = (kind, text2) => ({
      ledger,
      last: record(kind),
      effects: [{ kind: "send", text: text2, by: null }]
    });
    switch (p.action) {
      case "address":
        return sendFinding("handoff", messages.finding(finding, "address"));
      case "discuss":
        return sendFinding("talk", messages.finding(finding, "discuss"));
      case "type": {
        const words2 = p.text.trim();
        return words2 ? sendFinding("handoff", messages.finding(finding, "typed", words2)) : unchanged;
      }
      case "dismiss":
        return {
          ledger: closeFinding(ledger, p.id, { how: "dismissed", outcome: "dismissed" }, ctx.now),
          last: null,
          effects: []
        };
      default:
        return stale;
    }
  }
  const item = ledger.items.find((i) => i.id === p.id);
  if (!item) return stale;
  const answered = (answer) => ({
    ledger: closeItem(ledger, item.id, { how: "answered", outcome: answer }, ctx.now),
    last: record("mark"),
    effects: [{ kind: "send", text: messages.answer(item, answer), by: { id: item.id, action: "answer" } }]
  });
  switch (p.action) {
    case "answer":
      return item.options.includes(p.option) ? answered(p.option) : stale;
    case "type": {
      const words2 = p.text.trim();
      if (!words2) return unchanged;
      if (item.kind === "question") return answered(words2);
      return {
        ledger,
        last: record("handoff"),
        effects: [{ kind: "send", text: messages.taskReply(item, words2), by: null }]
      };
    }
    case "explain":
      return {
        ledger,
        last: record("talk"),
        effects: [{ kind: "send", text: messages.explain(item), by: { id: item.id, action: "explain" } }]
      };
    case "done":
      return { ledger: closeItem(ledger, item.id, { how: "done", outcome: "done" }, ctx.now), last: null, effects: [] };
    case "dismiss":
      return {
        ledger: closeItem(ledger, item.id, { how: "dismissed", outcome: "dismissed" }, ctx.now),
        last: null,
        effects: []
      };
    case "step": {
      const step = stepsOf(item, ctx.extraSteps)[p.step];
      if (!step || step.label !== p.label) return stale;
      const effects = stepEffects(item, step);
      if (effects.some((e) => e.kind === "send")) return { ledger, last: record("handoff"), effects };
      return {
        ledger,
        last: localLast(last, { action: actionId(p), text: pressText(p) }, pendingResult(effects, ctx.now)),
        effects
      };
    }
    // Address and Discuss are a finding's.
    default:
      return stale;
  }
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
var SETTLED_MS = 5120;
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
function feedbackOf(id, last, note, now) {
  const result = last?.result;
  if (note && now - note.at < SETTLED_MS && note.at >= Math.max(last?.at ?? 0, result?.at ?? 0))
    return { is: "note", note: note.note, at: note.at };
  if (result && (result.state !== "done" || now - result.at < SETTLED_MS)) return { is: "local", result };
  if (!last || last.kind === "local") return null;
  const delivery = last.delivery;
  if (delivery?.state === "queued") return { is: "queued", label: last.text, at: last.at };
  if (delivery?.state === "failed") return { is: "notSent", reason: delivery.reason, retry: retryOf(id, last) };
  return { is: "done", label: last.text, at: last.at };
}
function stepKind(step) {
  return step.step.some((h) => h.kind === "run") ? "handoff" : "local";
}
function actionsOf(row, last) {
  const { id, item, steps: steps2 } = row;
  const action = (press, label, kind, flags = {}) => ({
    press,
    // The type action opens a field for new words each time, an open or copy
    // only shows its result, and a press whose message failed did nothing, so none reads "again".
    label: press.action !== "type" && last?.kind !== "local" && last?.delivery?.state !== "failed" && last?.action === actionId(press) ? `${label} again` : label,
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
function settledLabel(outcome) {
  return outcome.charAt(0).toUpperCase() + outcome.slice(1);
}
function inboxView({
  ledger,
  lastActions,
  notes,
  turns,
  extraSteps,
  settleWindowMs,
  status,
  now
}) {
  const isSettling = (at) => now - at < settleWindowMs;
  const isOpen = (id) => ledger.items.some((i) => i.id === id) || ledger.findings.some((f) => f.id === id);
  const settledItems = new Map(
    ledger.closed.filter((d) => d.item && isSettling(d.at) && !isOpen(d.id)).map((d) => [d.id, d])
  );
  const settledFindings = new Map(
    ledger.closedFindings.filter((f) => isSettling(f.closedAt) && !isOpen(f.id)).map((f) => [f.id, f])
  );
  const placed = [...settledFindings.keys()].reduce(reopenFinding, [...settledItems.keys()].reduce(reopenItem, ledger));
  const { questions, tasks } = needsYouOrder(placed);
  const numbers = questionNumbers(ledger, ledger.turn + 1);
  const stateOf = (id) => {
    const closed2 = settledItems.get(id) ?? settledFindings.get(id);
    if (closed2) {
      const at = "closedAt" in closed2 ? closed2.closedAt : closed2.at;
      const last = lastActions[id];
      return {
        is: "settled",
        label: settledLabel(closed2.outcome),
        at,
        canUndo: isUndoable(closed2.how),
        // Queued only while the answer press that closed the row waits to reach Claude. Claude's own close sends nothing.
        isQueued: closed2.how === "answered" && last?.kind === "mark" && last.at === at && last.delivery?.state === "queued"
      };
    }
    return isHandedOff(lastActions[id], turns) ? { is: "handedOff" } : { is: "open" };
  };
  const settledActions = (id, state) => state.is !== "settled" ? null : state.canUndo ? [{ press: { action: "undo", id }, label: "Undo", kind: "view", isPrimary: false, isFolded: false }] : [];
  const itemRow = (item) => {
    const n = numbers.get(item.id);
    const steps2 = stepsOf(item, extraSteps[item.id] ?? []);
    const state = stateOf(item.id);
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
      state: item.kind === "question" && state.is === "handedOff" ? { is: "open" } : state,
      feedback: state.is === "settled" ? null : feedbackOf(item.id, lastActions[item.id], notes[item.id], now),
      actions: settledActions(item.id, state) ?? actionsOf({ id: item.id, item, steps: steps2 }, lastActions[item.id])
    };
  };
  const questionRows = questions.map(itemRow);
  const taskRows = tasks.map(itemRow);
  const counted = [...questionRows, ...taskRows].filter((r) => r.state.is === "open");
  const findingRows = [...placed.findings].reverse().map((finding) => {
    const state = stateOf(finding.id);
    return {
      id: finding.id,
      type: "finding",
      handle: "\u2022",
      title: finding.title,
      at: finding.at,
      item: null,
      finding,
      steps: [],
      state,
      feedback: state.is === "settled" ? null : feedbackOf(finding.id, lastActions[finding.id], notes[finding.id], now),
      actions: settledActions(finding.id, state) ?? actionsOf({ id: finding.id, item: null, steps: [] }, lastActions[finding.id])
    };
  });
  const closed = [...ledger.closed].reverse();
  return {
    needsYou: {
      count: counted.length,
      topId: counted[0]?.id ?? null,
      questions: questionRows,
      tasks: taskRows,
      closed: { questions: closed.filter((d) => d.kind === "question"), tasks: closed.filter((d) => d.kind === "task") }
    },
    findings: {
      count: findingRows.filter((r) => r.state.is === "open").length,
      rows: findingRows,
      closed: [...ledger.closedFindings].reverse()
    },
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

// src/settle.ts
var POLL_MS = 3e3;
var SETTLE_WINDOW_MS = SETTLED_MS + 2 * POLL_MS;

// src/texts.ts
var CODEX = {
  agent: "Codex",
  surface: "the Inbox tab",
  band: null,
  findingsIn: "the Findings section of the Inbox tab"
};
var TAB_DESCRIPTION = "Open the Inbox tab beside this conversation. Call it only when the user asks to see the inbox.";

// src/core.ts
function isPromptMissed(h, turnId) {
  if (turnId !== null && (h.promptTurns.length > 0 || h.promptAt === null)) return !h.promptTurns.includes(turnId);
  return h.promptAt === null || h.stopAt !== null && h.promptAt < h.stopAt;
}
function noteToolCall(s, turnId, now) {
  return isPromptMissed(s.heard, turnId) ? { ...s, heard: { ...s.heard, promptMissedAt: now } } : s;
}
function heardState(h) {
  if (h.startAt === null && h.promptAt === null && h.stopAt === null) return "none";
  const isMissed = h.promptMissedAt !== null && (h.promptAt === null || h.promptMissedAt >= h.promptAt);
  const turns = h.promptTurns.length > 0 ? h.promptTurns.length : h.prompts;
  return h.startAt === null || isMissed || turns >= 2 && h.stops === 0 ? "partial" : "heard";
}
function viewOf(s, now) {
  const l = s.ledger;
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
      // The tab keeps its own row notes.
      notes: {},
      turns: s.presence,
      extraSteps: {},
      // The tab times each settled row from its first poll, so the server lists a close for longer.
      settleWindowMs: SETTLE_WINDOW_MS,
      status: perTurnStatus(l, update),
      now
    }),
    heard: heardState(s.heard),
    goal: l.card?.goal ?? "",
    now: l.card?.now ?? "",
    done: l.card?.done ?? [],
    running: l.card?.running ?? [],
    lastActions: s.lastActions,
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
          at: now,
          // Closed as the demo starts, so it shows settled in its place first.
          item: {
            id: "d10",
            kind: "question",
            label: null,
            ask: "Draw the tabs on the pane\u2019s own background?",
            options: ["Yes, as part of the title bar", "No, on a card"],
            rec: "Yes, as part of the title bar",
            helps: [],
            turn: 14,
            at: now - 12 * MIN
          }
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
      closedFindings: [
        {
          id: "d19",
          kind: "issue",
          title: "The band redraws every second while idle",
          detail: "The clock tick redraws the band even when nothing on it changed.",
          path: "hooks/register.tsx",
          at: now - 4 * 60 * MIN,
          how: "claude",
          outcome: "closed by Claude: fixed in the tick handler",
          closedAt: now - 2 * 60 * MIN
        }
      ],
      prs: ["petekp/inbox#31", "petekp/inbox#29", "petekp/inbox#33"],
      nextId: 24,
      turn: 14,
      batchTurn: 14
    },
    stop: null,
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
        turnsStarted: 14
      },
      "petekp/inbox#31 thread DT1": {
        kind: "handoff",
        action: "thread-address",
        text: "Address",
        at: now - 2 * MIN,
        turnsStarted: 14
      }
    },
    notes: {},
    turns: { turnsStarted: 14, turnsApplied: 14 }
  };
}

// src/state.ts
import { mkdir, readFile, rename, rmdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
var NOTHING_HEARD = {
  startAt: null,
  promptAt: null,
  prompts: 0,
  promptTurns: [],
  stopAt: null,
  stops: 0,
  promptMissedAt: null
};
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
    tabSeenAt: 0,
    heard: NOTHING_HEARD
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
    // A message sent before the server kept its row changes no row when it arrives.
    sent: (saved.sent ?? []).map((x) => ({ ...x, row: x.row ?? null, queuedId: x.queuedId ?? null })),
    lastActions: upgradeLastActions(saved.lastActions ?? {}),
    // A file saved before the hooks kept this record came from hooks that ran, so it reads as heard.
    // Its turns were not recorded, so `promptAt` is set too: a tool call then falls back to the time rule.
    heard: saved.heard ? { ...NOTHING_HEARD, ...saved.heard } : {
      ...NOTHING_HEARD,
      startAt: 0,
      promptAt: 0,
      prompts: saved.presence?.turnsStarted ?? 0,
      stops: saved.presence?.turnsStarted ?? 0
    }
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
    presence: { ...s.presence, ...d.turns },
    // The samples show no not-heard text: their hooks count as run.
    heard: { ...s.heard, startAt: now }
  };
}

// src/server.ts
var TAB_URI = "ui://inbox/tab";
var TAB_MIME = "text/html;profile=mcp-app";
var APP_ONLY = { ui: { visibility: ["app"] } };
var MAX_SENT = 20;
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
      properties: { press: { type: "object" }, thread: { type: "string" }, demo: { type: "boolean" } },
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
function turnOf(params) {
  const meta = params?._meta ?? {};
  const turn = meta["x-codex-turn-metadata"];
  if (typeof turn !== "object" || turn === null) return void 0;
  const t = turn;
  const isOtherThread = typeof t.thread_id === "string" && t.thread_id !== t.session_id;
  if (t.parent_thread_id || t.forked_from_thread_id || isOtherThread) return void 0;
  return typeof t.turn_id === "string" && t.turn_id ? t.turn_id : null;
}
var text = (t) => ({ content: [{ type: "text", text: t }] });
function withoutDelivery({ delivery: _delivery, ...last }) {
  return last;
}
function makeServer(deps) {
  const { dir, now } = deps;
  async function queue(s, message) {
    const cli = s.cliPath ?? await deps.fallbackCli();
    const r = await deps.exec([cli, "queue", "--thread", s.sessionId, "--message", message], {
      cwd: s.root || "/",
      timeoutMs: 15e3
    });
    if (r.code !== 0) throw new Error(r.stderr.trim() || `codex queue exited ${r.code}`);
    return /Queued message (\S+)/.exec(r.stdout)?.[1] ?? null;
  }
  const served = (s, id) => ({ ...viewOf(s, now()), thread: id });
  async function onPress(id, p, thread) {
    let copy = null;
    let local = null;
    let error = null;
    let note = thread === id ? null : "stale";
    let s = await updateState(dir, id, async (s2) => {
      if (note) return s2;
      const r = applyPress(s2.ledger, s2.lastActions[p.id], p, {
        now: now(),
        turnsStarted: s2.presence.turnsStarted,
        extraSteps: []
      });
      if ("stale" in r) {
        note = "stale";
        return s2;
      }
      let next = {
        ...s2,
        ledger: r.ledger,
        lastActions: r.last ? { ...s2.lastActions, [p.id]: r.last } : s2.lastActions,
        // Codex was told of the close; with the id out of `told`, a second close of the row is reported too.
        told: p.action === "undo" ? { ...s2.told, closed: s2.told.closed.filter((id2) => id2 !== p.id) } : s2.told
      };
      if (r.last?.result?.state === "pending") local = { effects: r.effects, pending: r.last.result };
      for (const e of r.effects) {
        if (e.kind === "send") {
          try {
            const queuedId = await queue(next, e.text);
            next = {
              ...next,
              sent: [...next.sent, { text: e.text, press: e.by, at: now(), row: p.id, queuedId }].slice(-MAX_SENT)
            };
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            error = `Not sent: ${reason}`;
            copy = null;
            const failed = r.last && { ...r.last, delivery: { state: "failed", reason } };
            return failed ? { ...s2, lastActions: { ...s2.lastActions, [p.id]: failed } } : s2;
          }
        } else if (e.kind === "copy") copy = { text: e.text, name: e.name };
      }
      return next;
    }).catch(async (err) => {
      error = `Not sent: ${err instanceof Error ? err.message : String(err)}`;
      return readState(dir, id);
    });
    const ran = local;
    if (ran) {
      const errors = [];
      for (const e of ran.effects)
        if (e.kind !== "send") errors.push(e.kind === "open" ? await open(s, e.target) : null);
      const result = finishedResult(ran.pending, errors, now());
      s = await updateState(dir, id, (s2) => ({
        ...s2,
        lastActions: withResult(s2.lastActions, p.id, ran.pending.at, result)
      }));
    }
    return { view: served(s, id), copy, error, note };
  }
  async function open(s, target) {
    const run2 = (argv2) => deps.exec(argv2, { cwd: "/", timeoutMs: 1e4 });
    const failure = (r2) => r2.stderr.trim() || `open exited ${r2.code}`;
    if (/^https:\/\//.test(target)) {
      const r2 = await run2(["open", target]);
      return r2.code === 0 ? null : failure(r2);
    }
    const path = localPath(target, s.root || "/", s.home);
    const info = await stat2(path).catch(() => null);
    if (!info) return "it no longer exists";
    const isExecutable = info.isFile() && await access(path, constants.X_OK).then(
      () => true,
      () => false
    );
    const { argv, fallback } = openCommands(path, info.isFile(), isExecutable);
    const r = await run2(argv);
    const retry = r.code !== 0 && fallback ? await run2(fallback) : r;
    return retry.code === 0 ? null : failure(retry);
  }
  const demos = /* @__PURE__ */ new Map();
  const demoOf = (id) => {
    const s = demos.get(id) ?? demoState(now());
    demos.set(id, s);
    return s;
  };
  function onDemoPress(id, p, thread) {
    const s = demoOf(id);
    const r = thread === id ? applyPress(s.ledger, s.lastActions[p.id], p, {
      now: now(),
      turnsStarted: s.presence.turnsStarted,
      extraSteps: []
    }) : { stale: true };
    if ("stale" in r) return { view: served(s, id), copy: null, error: null, note: "stale" };
    const isLocal = r.last?.result !== void 0;
    const sample = r.last && !isLocal ? withoutDelivery(r.last) : null;
    demos.set(id, {
      ...s,
      ledger: r.ledger,
      lastActions: sample ? { ...s.lastActions, [p.id]: sample } : s.lastActions
    });
    return {
      view: served(demoOf(id), id),
      copy: null,
      error: null,
      note: r.effects.length > 0 ? "sample" : null
    };
  }
  async function callTool(name, args, id, turn) {
    if (!id) return { ...text("Not done: this call carries no session id."), isError: true };
    const heard = (s) => turn === void 0 ? s : noteToolCall(s, turn, now());
    switch (name) {
      case "record_finding":
      case "close": {
        let result = "";
        await updateState(dir, id, (s) => {
          const r = (name === "close" ? recordClose : recordFinding)(CODEX, s.ledger, args, now());
          result = r.result;
          return heard({ ...s, ledger: r.ledger });
        });
        return text(result);
      }
      case "inbox": {
        const s = turn === void 0 ? await readState(dir, id) : await updateState(dir, id, heard);
        return { ...text("Opened the Inbox tab beside the conversation."), structuredContent: viewOf(s, now()) };
      }
      case "inbox_view": {
        if (args.demo === true) return { ...text("Inbox demo"), structuredContent: served(demoOf(id), id) };
        const s = await updateState(dir, id, (s2) => ({ ...s2, tabSeenAt: now() }));
        return { ...text("Inbox view"), structuredContent: served(s, id) };
      }
      case "inbox_press": {
        const p = args.press;
        const r = args.demo === true ? onDemoPress(id, p, args.thread) : await onPress(id, p, args.thread);
        return { ...text(r.error ?? (r.note ? noteText(r.note) : "Done")), structuredContent: r };
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
          return ok(await callTool(name, args, sessionOf(params), turnOf(params)));
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
var tab_default = '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>Inbox</title>\n    <style>\n      /* The host\'s variables when Codex passes them; otherwise the pane\'s own colors. */\n      :root {\n        color-scheme: light;\n        --bg: var(--color-background-primary, #ffffff);\n        --text: var(--color-text-primary, #1f1f1f);\n        --muted: var(--color-text-secondary, #595959);\n        --key: #243bf5;\n        --needs-you: #745417;\n        --findings: #7b00e8;\n        --done: #25652f;\n        --error: #a5293d;\n        --error-mark: #a5293d;\n        --sans: var(--font-sans, -apple-system, system-ui, sans-serif);\n        --mono: var(--font-mono, ui-monospace, \'SF Mono\', Menlo, monospace);\n        /* Surfaces are mixed from the host\'s colors, so they follow its theme. */\n        --card: color-mix(in srgb, var(--text) 4.5%, var(--bg));\n        --raised: color-mix(in srgb, var(--text) 9%, var(--bg));\n        --selected: color-mix(in srgb, #4c9aff 20%, var(--card));\n        --tree: color-mix(in srgb, var(--text) 30%, var(--bg));\n        --divider: color-mix(in srgb, var(--text) 9%, var(--bg));\n        --hover: color-mix(in srgb, var(--key) 14%, transparent);\n        /* The tree\'s grid: its line, where a row\'s mark sits, and where its text starts. */\n        --tree-x: 15px;\n        --mark-x: 30px;\n        --text-x: 52px;\n      }\n      @media (prefers-color-scheme: dark) {\n        :root:not([data-theme=\'light\']) {\n          color-scheme: dark;\n          --bg: var(--color-background-primary, #171717);\n          --text: var(--color-text-primary, #ececec);\n          --muted: var(--color-text-secondary, #a8a8a8);\n          --key: #b1b9f9;\n          --needs-you: #ffc107;\n          --findings: #cab0ff;\n          --done: #7ecd8f;\n          --error: #ffa3b0;\n          --error-mark: #ff6b80;\n          --card: color-mix(in srgb, var(--text) 5.5%, var(--bg));\n          --raised: color-mix(in srgb, var(--text) 11%, var(--bg));\n          --selected: color-mix(in srgb, #7fa6d9 15%, var(--card));\n          --tree: color-mix(in srgb, var(--text) 32%, var(--bg));\n          --divider: color-mix(in srgb, var(--text) 8%, var(--bg));\n        }\n      }\n      :root[data-theme=\'dark\'] {\n        color-scheme: dark;\n        --key: #b1b9f9;\n        --needs-you: #ffc107;\n        --findings: #cab0ff;\n        --done: #7ecd8f;\n        --error: #ffa3b0;\n        --error-mark: #ff6b80;\n        --card: color-mix(in srgb, var(--text) 5.5%, var(--bg));\n        --raised: color-mix(in srgb, var(--text) 11%, var(--bg));\n        --selected: color-mix(in srgb, #7fa6d9 15%, var(--card));\n        --tree: color-mix(in srgb, var(--text) 32%, var(--bg));\n        --divider: color-mix(in srgb, var(--text) 8%, var(--bg));\n      }\n      * {\n        box-sizing: border-box;\n      }\n      body {\n        margin: 0;\n        background: var(--bg);\n        color: var(--text);\n        font: 13px/20px var(--sans);\n        -webkit-font-smoothing: antialiased;\n      }\n      button {\n        font: inherit;\n        color: inherit;\n        background: none;\n        border: none;\n        padding: 0;\n        cursor: pointer;\n        text-align: left;\n      }\n      :focus-visible {\n        outline: 1.5px solid var(--key);\n        outline-offset: 1px;\n        border-radius: 4px;\n      }\n      .muted {\n        color: var(--muted);\n      }\n      .tone-needsYou {\n        color: var(--needs-you);\n      }\n      .tone-findings {\n        color: var(--findings);\n      }\n      .tone-done {\n        color: var(--done);\n      }\n      .tone-error {\n        color: var(--error);\n      }\n      .notice {\n        padding: 10px 16px;\n        color: var(--error);\n      }\n      .notice .key {\n        color: var(--text);\n      }\n\n      /* Line 1: the count and the status. Line 2: the goal and its current step. */\n      header {\n        padding: 12px 16px 0;\n      }\n      .line-one {\n        display: flex;\n        flex-wrap: wrap;\n        justify-content: space-between;\n        gap: 0 16px;\n      }\n      .counts {\n        font-weight: 600;\n      }\n      .goal {\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .goal-mark {\n        color: var(--key);\n      }\n\n      /* Tabs: the shown one a raised panel, the others text on the background. */\n      nav {\n        display: flex;\n        flex-wrap: wrap;\n        gap: 4px 16px;\n        padding: 8px 12px 0;\n      }\n      .tabs {\n        display: flex;\n        gap: 4px;\n      }\n      .tab {\n        padding: 6px 12px;\n        border-radius: 6px;\n        color: var(--muted);\n      }\n      .tab:hover {\n        color: var(--text);\n      }\n      .tab.shown {\n        background: var(--raised);\n        color: var(--text);\n        font-weight: 600;\n      }\n      .tab .count {\n        font-weight: 600;\n        margin-left: 6px;\n      }\n      .status {\n        color: var(--muted);\n        font-size: 12px;\n        text-align: right;\n      }\n\n      main {\n        display: flex;\n        flex-direction: column;\n        gap: 8px;\n        padding: 12px 12px 4px;\n      }\n      section {\n        background: var(--card);\n        border-radius: 8px;\n        padding: 10px 0;\n      }\n      .group-title {\n        padding: 0 14px 0 calc(var(--tree-x) + 4px);\n        font-weight: 500;\n      }\n      .group-title .count {\n        color: var(--muted);\n        margin-left: 6px;\n      }\n\n      /* The tree: a hairline from the group\'s title, an elbow to each row, and a rounded last elbow. */\n      .tree {\n        position: relative;\n        padding-top: 8px;\n      }\n      .tree::before {\n        content: \'\';\n        position: absolute;\n        left: var(--tree-x);\n        top: 0;\n        height: 8px;\n        border-left: 1px solid var(--tree);\n      }\n      .entry {\n        position: relative;\n        --elbow: 16px;\n      }\n      .entry:has(> .row.selected) {\n        --elbow: 22px;\n      }\n      .tree > .entry::before {\n        content: \'\';\n        position: absolute;\n        left: var(--tree-x);\n        top: 0;\n        bottom: 0;\n        border-left: 1px solid var(--tree);\n        z-index: 1;\n      }\n      .tree > .entry::after {\n        content: \'\';\n        position: absolute;\n        left: var(--tree-x);\n        top: var(--elbow);\n        width: 11px;\n        border-top: 1px solid var(--tree);\n        z-index: 1;\n      }\n      .tree > .entry:last-child::before {\n        bottom: auto;\n        height: calc(var(--elbow) + 1px);\n        width: 11px;\n        border-bottom: 1px solid var(--tree);\n        border-bottom-left-radius: 7px;\n      }\n      .tree > .entry:last-child::after {\n        display: none;\n      }\n      .flat {\n        --mark-x: 18px;\n        --text-x: 40px;\n      }\n\n      /* Rows. A divider runs from the text column to the edge, under the tree\'s line. */\n      .row {\n        display: flex;\n        padding: 6px 14px 6px var(--mark-x);\n      }\n      .entry + .entry > .row {\n        background-image: linear-gradient(var(--divider), var(--divider));\n        background-repeat: no-repeat;\n        background-size: calc(100% - var(--text-x)) 1px;\n        background-position: right top;\n      }\n      .row.selected {\n        background-color: var(--selected);\n        padding-top: 12px;\n        padding-bottom: 12px;\n      }\n      /* A row that just appeared, in its tab\'s color. */\n      .row.new {\n        box-shadow: inset 3px 0 0 var(--bar);\n      }\n      .tone-bar-needsYou {\n        --bar: var(--needs-you);\n      }\n      .tone-bar-findings {\n        --bar: var(--findings);\n      }\n      .mark {\n        flex: none;\n        width: calc(var(--text-x) - var(--mark-x));\n        font: 12px/20px var(--mono);\n        color: var(--muted);\n      }\n      .mark.done,\n      .mark.error {\n        font-size: 13px;\n      }\n      .mark.done {\n        color: var(--done);\n      }\n      .mark.error {\n        color: var(--error-mark);\n      }\n      .content {\n        flex: 1;\n        min-width: 0;\n        display: flex;\n        flex-direction: column;\n        gap: 8px;\n      }\n      .content > .tight,\n      .content.tight {\n        display: flex;\n        flex-direction: column;\n        gap: 0;\n      }\n      .line {\n        display: flex;\n        width: 100%;\n        min-width: 0;\n      }\n      .line .text {\n        min-width: 0;\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .line .text.two {\n        white-space: normal;\n        display: -webkit-box;\n        -webkit-line-clamp: 2;\n        -webkit-box-orient: vertical;\n      }\n      .line .after {\n        flex: none;\n        white-space: pre;\n        color: var(--muted);\n      }\n      .line .after.tone-done {\n        color: var(--done);\n      }\n      .line:hover .text {\n        color: color-mix(in srgb, var(--text) 80%, var(--key));\n      }\n      .title {\n        font-weight: 600;\n      }\n      .title .after {\n        font-weight: 400;\n        color: var(--muted);\n      }\n      .meta {\n        font-size: 12px;\n      }\n      .body {\n        overflow-wrap: anywhere;\n      }\n      .body p {\n        margin: 0;\n      }\n      .body p + p {\n        margin-top: 4px;\n      }\n      /* Keys are text buttons, with no key text: keys are an extra. */\n      .keys {\n        display: flex;\n        flex-wrap: wrap;\n        align-items: center;\n        gap: 2px 8px;\n        margin-left: -6px;\n      }\n      .key {\n        padding: 1px 6px;\n        border-radius: 5px;\n        white-space: nowrap;\n      }\n      .key:hover {\n        background: var(--hover);\n      }\n      /* The row just opened, so a click on its keys would be a double-click\'s second. */\n      .key:disabled {\n        color: var(--muted);\n        background: none;\n      }\n      /* The option Claude recommended. */\n      .key.primary {\n        font-weight: 600;\n      }\n      .key-dot {\n        color: var(--muted);\n      }\n      form {\n        display: flex;\n        align-items: center;\n        gap: 8px;\n      }\n      input {\n        flex: 1;\n        min-width: 0;\n        font: inherit;\n        color: inherit;\n        background: var(--bg);\n        border: 1px solid var(--tree);\n        border-radius: 6px;\n        padding: 4px 8px;\n      }\n      input:focus {\n        outline: none;\n        border-color: var(--key);\n      }\n      textarea {\n        width: 100%;\n        font: 12px var(--mono);\n        color: inherit;\n        background: var(--bg);\n        border: 1px solid var(--tree);\n        border-radius: 6px;\n      }\n\n      .empty-line {\n        color: var(--muted);\n      }\n      .fold {\n        display: block;\n        margin: 8px 0 0 calc(var(--mark-x) - 2px);\n        padding: 1px 4px;\n        border-radius: 5px;\n        color: var(--muted);\n      }\n      .fold:hover {\n        color: var(--text);\n      }\n      .fold-mark {\n        display: inline-block;\n        width: 14px;\n        font-family: var(--mono);\n      }\n      /* The closed items hang from the fold\'s arrow. */\n      .tree.closed-tree {\n        --tree-x: 36px;\n        --mark-x: 52px;\n        --text-x: 72px;\n        padding-top: 4px;\n      }\n      .tree.closed-tree::before {\n        height: 4px;\n      }\n      .tree.closed-tree .entry + .entry > .row {\n        background-image: none;\n      }\n      .outcome {\n        font-weight: 600;\n      }\n      .outcome.lapsed {\n        font-weight: 400;\n        color: var(--muted);\n      }\n      .settled .what {\n        color: var(--muted);\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .leave {\n        width: 96px;\n        height: 1.5px;\n        margin-top: 4px;\n        border-radius: 1px;\n        overflow: hidden;\n      }\n      .leave div {\n        height: 100%;\n        background: var(--done);\n        animation-name: leave;\n        animation-timing-function: linear;\n        animation-fill-mode: forwards;\n      }\n      @keyframes leave {\n        from {\n          width: 100%;\n        }\n        to {\n          width: 0;\n        }\n      }\n      .empty {\n        padding: 56px 32px;\n        text-align: center;\n      }\n      .empty .title {\n        margin-bottom: 4px;\n      }\n      footer {\n        display: flex;\n        flex-wrap: wrap;\n        justify-content: space-between;\n        gap: 4px 16px;\n        padding: 8px 16px 16px;\n        color: var(--muted);\n        font-size: 12px;\n      }\n      .demo-toggle {\n        padding: 0 6px;\n        border-radius: 5px;\n        color: var(--muted);\n      }\n      .demo-toggle:hover {\n        color: var(--text);\n        background: var(--hover);\n      }\n      .demo-note {\n        display: flex;\n        flex-wrap: wrap;\n        align-items: center;\n        gap: 4px 12px;\n        margin: 12px 12px 0;\n        padding: 6px 12px;\n        border-radius: 6px;\n        background: var(--raised);\n        color: var(--text);\n      }\n      @media (prefers-reduced-motion: reduce) {\n        .leave div {\n          animation: none;\n        }\n      }\n    </style>\n  </head>\n  <body>\n    <div id="app" class="notice muted">Loading\u2026</div>\n    <script>\n      "use strict";(()=>{var oe,y,Ve,Ot,P,Fe,qe,We,fe,Z,W,je,he,me,ge,Ft,ne={},se=[],Ut=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,re=Array.isArray;function T(e,t){for(var n in t)e[n]=t[n];return e}function ye(e){e&&e.parentNode&&e.parentNode.removeChild(e)}function Mt(e,t,n){var i,o,s,a={};for(s in t)s=="key"?i=t[s]:s=="ref"?o=t[s]:a[s]=t[s];if(arguments.length>2&&(a.children=arguments.length>3?oe.call(arguments,2):n),typeof e=="function"&&e.defaultProps!=null)for(s in e.defaultProps)a[s]===void 0&&(a[s]=e.defaultProps[s]);return ee(e,a,i,o,null)}function ee(e,t,n,i,o){var s={type:e,props:t,key:n,ref:i,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:o??++Ve,__i:-1,__u:0};return o==null&&y.vnode!=null&&y.vnode(s),s}function C(e){return e.children}function te(e,t){this.props=e,this.context=t}function O(e,t){if(t==null)return e.__?O(e.__,e.__i+1):null;for(var n;t<e.__k.length;t++)if((n=e.__k[t])!=null&&n.__e!=null)return n.__e;return typeof e.type=="function"?O(e):null}function Ht(e){if(e.__P&&e.__d){var t=e.__v,n=t.__e,i=[],o=[],s=T({},t);s.__v=t.__v+1,y.vnode&&y.vnode(s),be(e.__P,s,t,e.__n,e.__P.namespaceURI,32&t.__u?[n]:null,i,n??O(t),!!(32&t.__u),o),s.__v=t.__v,s.__.__k[s.__i]=s,Qe(i,s,o),t.__e=t.__=null,s.__e!=n&&Ye(s)}}function Ye(e){if((e=e.__)!=null&&e.__c!=null)return e.__e=e.__c.base=null,e.__k.some(function(t){if(t!=null&&t.__e!=null)return e.__e=e.__c.base=t.__e}),Ye(e)}function Ue(e){(!e.__d&&(e.__d=!0)&&P.push(e)&&!ie.__r++||Fe!=y.debounceRendering)&&((Fe=y.debounceRendering)||qe)(ie)}function ie(){try{for(var e,t=1;P.length;)P.length>t&&P.sort(We),e=P.shift(),t=P.length,Ht(e)}finally{P.length=ie.__r=0}}function Ge(e,t,n,i,o,s,a,d,c,u,f){var b,l,p,g,k,h,_=i&&i.__k||se,m=t.length;for(c=Vt(n,t,_,c,m),b=0;b<m;b++)(p=n.__k[b])!=null&&(l=p.__i!=-1&&_[p.__i]||ne,p.__i=b,h=be(e,p,l,o,s,a,d,c,u,f),g=p.__e,p.ref&&l.ref!=p.ref&&(l.ref&&_e(l.ref,null,p),f.push(p.ref,p.__c||g,p)),k==null&&g!=null&&(k=g),4&p.__u?(c=Be(p,c,e),l.__e&&(l.__e=null)):typeof p.type=="function"&&h!==void 0?c=h:g&&(c=g.nextSibling),p.__u&=-7);return n.__e=k,c}function Vt(e,t,n,i,o){var s,a,d,c,u,f=n.length,b=f,l=0;for(e.__k=new Array(o),s=0;s<o;s++)(a=t[s])!=null&&typeof a!="boolean"&&typeof a!="function"?(typeof a=="string"||typeof a=="number"||typeof a=="bigint"||a.constructor==String?a=e.__k[s]=ee(null,a,null,null,null):re(a)?a=e.__k[s]=ee(C,{children:a},null,null,null):a.constructor===void 0&&a.__b>0?a=e.__k[s]=ee(a.type,a.props,a.key,a.ref?a.ref:null,a.__v):e.__k[s]=a,c=s+l,a.__=e,a.__b=e.__b+1,d=null,(u=a.__i=qt(a,n,c,b))!=-1&&(b--,(d=n[u])&&(d.__u|=2)),d==null||d.__v==null?(u==-1&&(o>f?l--:o<f&&l++),typeof a.type!="function"&&(a.__u|=4)):u!=c&&(u==c-1?l--:u==c+1?l++:(u>c?l--:l++,a.__u|=4))):e.__k[s]=null;if(b)for(s=0;s<f;s++)(d=n[s])!=null&&(2&d.__u)==0&&(d.__e==i&&(i=O(d)),ze(d,d));return i}function Be(e,t,n){var i,o;if(typeof e.type=="function"){for(i=e.__k,o=0;i&&o<i.length;o++)i[o]&&(i[o].__=e,t=Be(i[o],t,n));return t}e.__e!=t&&(t&&e.type&&!t.parentNode&&(t=O(e)),t=n.insertBefore(e.__e,t||null));do t=t&&t.nextSibling;while(t!=null&&t.nodeType==8);return t}function qt(e,t,n,i){var o,s,a,d=e.key,c=e.type,u=t[n],f=u!=null&&(2&u.__u)==0;if(u===null&&d==null||f&&d==u.key&&c==u.type)return n;if(i>(f?1:0)){for(o=n-1,s=n+1;o>=0||s<t.length;)if((u=t[a=o>=0?o--:s++])!=null&&(2&u.__u)==0&&d==u.key&&c==u.type)return a}return-1}function Me(e,t,n){t[0]=="-"?e.setProperty(t,n??""):e[t]=n==null?"":typeof n!="number"||Ut.test(t)?n:n+"px"}function J(e,t,n,i,o){var s,a;e:if(t=="style")if(typeof n=="string")e.style.cssText=n;else{if(typeof i=="string"&&(e.style.cssText=i=""),i)for(t in i)n&&t in n||Me(e.style,t,"");if(n)for(t in n)i&&n[t]==i[t]||Me(e.style,t,n[t])}else if(t[0]=="o"&&t[1]=="n")s=t!=(t=t.replace(je,"$1")),a=t.toLowerCase(),t=a in e||t=="onFocusOut"||t=="onFocusIn"?a.slice(2):t.slice(2),e.l||(e.l={}),e.l[t+s]=n,n?i?n[W]=i[W]:(n[W]=he,e.addEventListener(t,s?ge:me,s)):e.removeEventListener(t,s?ge:me,s);else{if(o=="http://www.w3.org/2000/svg")t=t.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(t!="width"&&t!="height"&&t!="href"&&t!="list"&&t!="form"&&t!="tabIndex"&&t!="download"&&t!="rowSpan"&&t!="colSpan"&&t!="role"&&t!="popover"&&t in e)try{e[t]=n??"";break e}catch{}typeof n=="function"||(n==null||n===!1&&t[4]!="-"?e.removeAttribute(t):e.setAttribute(t,t=="popover"&&n==1?"":n))}}function He(e){return function(t){if(this.l){var n=this.l[t.type+e];if(t[Z]==null)t[Z]=he++;else if(t[Z]<n[W])return;return n(y.event?y.event(t):t)}}}function be(e,t,n,i,o,s,a,d,c,u){var f,b,l,p,g,k,h,_,m,$,V,D,q,Oe,z,pe,R=t.type;if(t.constructor!==void 0)return null;128&n.__u&&(c=!!(32&n.__u),s=[d=t.__e=n.__e]),(f=y.__b)&&f(t);e:if(typeof R=="function"){b=a.length;try{if(m=t.props,$=R.prototype&&R.prototype.render,V=(f=R.contextType)&&i[f.__c],D=f?V?V.props.value:f.__:i,n.__c?_=(l=t.__c=n.__c).__=l.__E:($?t.__c=l=new R(m,D):(t.__c=l=new te(m,D),l.constructor=R,l.render=jt),V&&V.sub(l),l.state||(l.state={}),l.__n=i,p=l.__d=!0,l.__h=[],l._sb=[]),$&&l.__s==null&&(l.__s=l.state),$&&R.getDerivedStateFromProps!=null&&(l.__s==l.state&&(l.__s=T({},l.__s)),T(l.__s,R.getDerivedStateFromProps(m,l.__s))),g=l.props,k=l.state,l.__v=t,p)$&&R.getDerivedStateFromProps==null&&l.componentWillMount!=null&&l.componentWillMount(),$&&l.componentDidMount!=null&&l.__h.push(l.componentDidMount);else{if($&&R.getDerivedStateFromProps==null&&m!==g&&l.componentWillReceiveProps!=null&&l.componentWillReceiveProps(m,D),t.__v==n.__v||!l.__e&&l.shouldComponentUpdate!=null&&l.shouldComponentUpdate(m,l.__s,D)===!1){t.__v!=n.__v&&(l.props=m,l.state=l.__s,l.__d=!1),t.__e=n.__e,t.__k=n.__k,t.__k.some(function(U){U&&(U.__=t)}),se.push.apply(l.__h,l._sb),l._sb=[],l.__h.length&&a.push(l),d=O(n);break e}l.componentWillUpdate!=null&&l.componentWillUpdate(m,l.__s,D),$&&l.componentDidUpdate!=null&&l.__h.push(function(){l.componentDidUpdate(g,k,h)})}if(l.context=D,l.props=m,l.__P=e,l.__e=!1,q=y.__r,Oe=0,$)l.state=l.__s,l.__d=!1,q&&q(t),f=l.render(l.props,l.state,l.context),se.push.apply(l.__h,l._sb),l._sb=[];else do l.__d=!1,q&&q(t),f=l.render(l.props,l.state,l.context),l.state=l.__s;while(l.__d&&++Oe<25);l.state=l.__s,l.getChildContext!=null&&(i=T(T({},i),l.getChildContext())),$&&!p&&l.getSnapshotBeforeUpdate!=null&&(h=l.getSnapshotBeforeUpdate(g,k)),z=f!=null&&f.type===C&&f.key==null?Xe(f.props.children):f,d=Ge(e,re(z)?z:[z],t,n,i,o,s,a,d,c,u),l.base=t.__e,t.__u&=-161,l.__h.length&&a.push(l),_&&(l.__E=l.__=null)}catch(U){if(a.length=b,t.__v=null,c||s!=null){if(U.then){for(t.__u|=c?160:128;d&&d.nodeType==8&&d.nextSibling;)d=d.nextSibling;s!=null&&(s[s.indexOf(d)]=null),t.__e=d}else if(s!=null)for(pe=s.length;pe--;)ye(s[pe])}else t.__e=n.__e;t.__k==null&&(t.__k=n.__k||[]),U.then||Ke(t),y.__e(U,t,n)}}else s==null&&t.__v==n.__v?(t.__k=n.__k,t.__e=n.__e):d=t.__e=Wt(n.__e,t,n,i,o,s,a,c,u);return(f=y.diffed)&&f(t),128&t.__u?void 0:d}function Ke(e){e&&(e.__c&&(e.__c.__e=!0),e.__k&&e.__k.some(Ke))}function Qe(e,t,n){for(var i=0;i<n.length;i++)_e(n[i],n[++i],n[++i]);y.__c&&y.__c(t,e),e.some(function(o){try{e=o.__h,o.__h=[],e.some(function(s){s.call(o)})}catch(s){y.__e(s,o.__v)}})}function Xe(e){return typeof e!="object"||e==null||e.__b>0?e:re(e)?e.map(Xe):e.constructor!==void 0?null:T({},e)}function Wt(e,t,n,i,o,s,a,d,c){var u,f,b,l,p,g,k,h=n.props||ne,_=t.props,m=t.type;if(m=="svg"?o="http://www.w3.org/2000/svg":m=="math"?o="http://www.w3.org/1998/Math/MathML":o||(o="http://www.w3.org/1999/xhtml"),s!=null){for(u=0;u<s.length;u++)if((p=s[u])&&"setAttribute"in p==!!m&&(m?p.localName==m:p.nodeType==3)){e=p,s[u]=null;break}}if(e==null){if(m==null)return document.createTextNode(_);e=document.createElementNS(o,m,_.is&&_),d&&(y.__m&&y.__m(t,s),d=!1),s=null}if(m==null)h===_||d&&e.data==_||(e.data=_);else{if(s=m=="textarea"&&_.defaultValue!=null?null:s&&oe.call(e.childNodes),!d&&s!=null)for(h={},u=0;u<e.attributes.length;u++)h[(p=e.attributes[u]).name]=p.value;for(u in h)p=h[u],u=="dangerouslySetInnerHTML"?b=p:u=="children"||u in _||u=="value"&&"defaultValue"in _||u=="checked"&&"defaultChecked"in _||J(e,u,null,p,o);for(u in _)p=_[u],u=="children"?l=p:u=="dangerouslySetInnerHTML"?f=p:u=="value"?g=p:u=="checked"?k=p:d&&typeof p!="function"||h[u]===p||J(e,u,p,h[u],o);if(f)d||b&&(f.__html==b.__html||f.__html==e.innerHTML)||(e.innerHTML=f.__html),t.__k=[];else if(b&&(e.innerHTML=""),Ge(t.type=="template"?e.content:e,re(l)?l:[l],t,n,i,m=="foreignObject"?"http://www.w3.org/1999/xhtml":o,s,a,s?s[0]:n.__k&&O(n,0),d,c),s!=null)for(u=s.length;u--;)ye(s[u]);d&&m!="textarea"||(u="value",m=="progress"&&g==null?e.removeAttribute("value"):g!=null&&(g!==e[u]||m=="progress"&&!g||m=="option"&&g!=h[u])&&J(e,u,g,h[u],o),u="checked",k!=null&&k!=e[u]&&J(e,u,k,h[u],o))}return e}function _e(e,t,n){try{if(typeof e=="function"){var i=typeof e.__u=="function";i&&e.__u(),i&&t==null||(e.__u=e(t))}else e.current=t}catch(o){y.__e(o,n)}}function ze(e,t,n){var i,o;if(y.unmount&&y.unmount(e),(i=e.ref)&&(i.current&&i.current!=e.__e||_e(i,null,t)),(i=e.__c)!=null){if(i.componentWillUnmount)try{i.componentWillUnmount()}catch(s){y.__e(s,t)}i.base=i.__P=i.__n=null}if(i=e.__k)for(o=0;o<i.length;o++)i[o]&&ze(i[o],t,n||typeof e.type!="function");n||ye(e.__e),e.__c=e.__=e.__e=void 0}function jt(e,t,n){return this.constructor(e,n)}function Je(e,t,n){var i,o,s,a;t==document&&(t=document.documentElement),y.__&&y.__(e,t),o=(i=typeof n=="function")?null:n&&n.__k||t.__k,s=[],a=[],be(t,e=(!i&&n||t).__k=Mt(C,null,[e]),o||ne,ne,t.namespaceURI,!i&&n?[n]:o?null:t.firstChild?oe.call(t.childNodes):null,s,!i&&n?n:o?o.__e:t.firstChild,i,a),Qe(s,e,a),e.props.children=null}oe=se.slice,y={__e:function(e,t,n,i){for(var o,s,a;t=t.__;)if((o=t.__c)&&!o.__)try{if((s=o.constructor)&&s.getDerivedStateFromError!=null&&(o.setState(s.getDerivedStateFromError(e)),a=o.__d),o.componentDidCatch!=null&&(o.componentDidCatch(e,i||{}),a=o.__d),a)return o.__E=o}catch(d){e=d}throw e}},Ve=0,Ot=function(e){return e!=null&&e.constructor===void 0},te.prototype.setState=function(e,t){var n;n=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=T({},this.state),typeof e=="function"&&(e=e(T({},n),this.props)),e&&T(n,e),e!=null&&this.__v&&(t&&this._sb.push(t),Ue(this))},te.prototype.forceUpdate=function(e){this.__v&&(this.__e=!0,e&&this.__h.push(e),Ue(this))},te.prototype.render=C,P=[],qe=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,We=function(e,t){return e.__v.__b-t.__v.__b},ie.__r=0,fe=Math.random().toString(8),Z="__d"+fe,W="__a"+fe,je=/(PointerCapture)$|Capture$/i,he=0,me=He(!1),ge=He(!0),Ft=0;function we(e){return e.how==="dismissed"||e.how==="expired"||e.how==="claude"?!0:e.how==="update"&&/^(no longer applies|replaced|superseded|moot)/i.test(e.outcome)}function N(e){let t=Math.round(e/6e4);if(t<1)return"just now";if(t<60)return`${t}m ago`;let n=Math.round(t/60);return n<48?`${n}h ago`:`${Math.round(n/24)}d ago`}function Ze(e,t){return e.length>t?`${e.slice(0,t-1)}\\u2026`:e}function Bt(e){return e.replace(/\\/+$/,"").split("/").pop()??e}var Kt="This changed before your press. Nothing was sent.";function j(e){return e==="sample"?"Sample entry: nothing was sent.":Kt}function Qt(e,t){switch(t.kind){case"run":return{kind:"send",text:zt.run(e,t.command),by:{id:e.id,action:"run"}};case"open":return{kind:"open",target:t.path,name:Bt(t.path)};case"link":return{kind:"open",target:t.url,name:t.name??t.url};case"copy":return{kind:"copy",text:t.text,name:t.name??"snippet",isCommand:!1};case"terminal":return{kind:"copy",text:t.command,name:t.name??Ze(t.command,32),isCommand:!0}}}function et(e,t){return t.step.map(n=>Qt(e,n))}function tt(e,t){return{state:"pending",parts:e.flatMap(n=>n.kind==="send"?[]:[{kind:n.kind,name:n.name,isCommand:n.kind==="copy"&&n.isCommand,error:null}]),at:t}}function Xt(e){return[`${e.kind==="issue"?"Issue":"Opportunity"}: ${e.title}`,e.detail,...e.path?[`File: ${e.path}`]:[]]}var zt={answer:(e,t)=>`Re "${e.ask}": ${t}`,explain:e=>{let t=e.kind==="task"?"this task you left for me":"this question you asked me",n=e.options.length>0?`\nOptions: ${e.options.join(" / ")}`:"";return`Remind me what ${t} is about: why it came up, and what each choice would mean. Don\'t act on it yet.\n"${e.ask}"${n}`},run:(e,t)=>`For "${e.ask}", run this:\n\\`\\`\\`\n${t}\n\\`\\`\\``,taskReply:(e,t)=>`Re the task you left for me, "${e.ask}": ${t}`,finding:(e,t,n="")=>[t==="address"?"Please address this finding you recorded:":t==="discuss"?"Let\'s talk through this finding you recorded before changing anything:":"About this finding you recorded:",...Xt(e),...t==="typed"?["",n]:[]].join(`\n`)};var Jt=3,S=5120,ve=1500,xe=400;function nt(e,t){return e>0&&t-e<xe}function Y(e,t){return e.filter(n=>!t.has(n.id)).slice(0,Jt)}function ae(e){return e?.is==="notSent"||e?.is==="local"&&e.result.state==="failed"}function st(e){return e.is==="done"||e.is==="queued"}var Zt={terminal:"Run it in a terminal, or type ! and paste.",desktop:"Run it in Terminal.",html:"Run it in Terminal."},ke={open:{pending:"Opening",done:"Opened",failed:"open"},copy:{pending:"Copying",done:"Copied",failed:"copy"}};function en(e,t){let i=e.parts.length>1&&e.parts.every(a=>a.kind==="open"&&a.error===null&&/^PR #\\d+$/.test(a.name))?[{...e.parts[0],name:`${e.parts.length} PRs`}]:e.parts;if(e.state==="pending")return`${i.map(a=>`${ke[a.kind].pending} ${a.name}`).join(" \\xB7 ")}\\u2026`;let o=i.map(a=>a.error===null?`${ke[a.kind].done} ${a.name}`:`Could not ${ke[a.kind].failed} ${a.name}: ${a.error}`).join(" \\xB7 ");if(e.state==="failed")return o;let s=i.some(a=>a.kind==="copy"&&a.isCommand);return`\\u2713 ${o}${s?`. ${Zt[t]}`:""}`}function $e(e,t){return e.is==="note"?j(e.note):e.is==="local"?en(e.result,t):e.is==="queued"?`Queued: ${e.label}`:e.is==="notSent"?`Not sent: ${e.reason}`:`\\u2713 ${e.label}`}var tn=["needsYou","findings"];function nn(e){return{needsYou:[...e.needsYou.questions,...e.needsYou.tasks].map(t=>t.id),findings:e.findings.rows.map(t=>t.id)}}function it(e,t){let n=nn(t);return{seen:{needsYou:new Set(n.needsYou),findings:new Set(n.findings)},added:{needsYou:e?n.needsYou.filter(i=>!e.needsYou.has(i)):[],findings:e?n.findings.filter(i=>!e.findings.has(i)):[]}}}function ot(e,t,n,i){let o=a=>a.some(d=>d.state.is!=="settled"||n.has(d.id)),s=(a,d)=>i.has(a)&&Y(d,n).length>0;return t==="findings"?!o(e.findings.rows)&&!s("finding",e.findings.closed):e.heard==="heard"&&!o(e.needsYou.questions)&&!o(e.needsYou.tasks)&&!s("question",e.needsYou.closed.questions)&&!s("task",e.needsYou.closed.tasks)}function rt(e,t,n,i){let o=t?tn.find(s=>s!==e&&n[s].length>0):void 0;return o?{tab:o,id:i[o].find(s=>n[o].includes(s))??null}:null}var le=3e3,Jn=S+2*le;function at(e){return[...e.needsYou.questions,...e.needsYou.tasks,...e.findings.rows].filter(t=>t.state.is==="settled").map(t=>t.id)}function lt(e,t,n){return new Map(t.map(i=>[i,e.get(i)??n]))}function de(e,t){return new Set([...e].filter(([,n])=>t-n<S).map(([n])=>n))}var sn=0;function r(e,t,n,i,o,s){t||(t={});var a,d,c=t;if("ref"in c)for(d in c={},t)d=="ref"?a=t[d]:c[d]=t[d];var u={type:e,props:c,key:n,ref:a,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--sn,__i:-1,__u:0,__source:o,__self:s};if(typeof e=="function"&&(a=e.defaultProps))for(d in a)c[d]===void 0&&(c[d]=a[d]);return y.vnode&&y.vnode(u),u}var dt=[..."abcfghilm"],_t=[{id:"needsYou",label:"Needs you",hotkey:"1"},{id:"findings",label:"Findings",hotkey:"2"}],v=null,H=!1,Ee=!1,Ae=0,wt=0,x="needsYou",F={needsYou:null,findings:null},A=null,Re=!1,B=new Map,M=new Set,ut=new Set,ue=new Set,K=new Map,I=new Map,Se=new Map,X=new Map,ce=null,E=new Map,Le=null,Pe=new Map,kt=0,ct=0,Te=!1,on=0,Q=new Map;function vt(e,t,n){return new Promise((i,o)=>{let s=++on;Q.set(s,{resolve:i,reject:o}),parent.postMessage({jsonrpc:"2.0",id:s,method:e,params:t},"*"),n!==void 0&&setTimeout(()=>{Q.delete(s)&&o(new Error(`${e} timed out`))},n)})}window.addEventListener("message",e=>{let t=e.data;if(!(!t||t.jsonrpc!=="2.0")){if(t.id!=null&&!t.method&&Q.has(t.id)){let n=Q.get(t.id);Q.delete(t.id),t.error?n.reject(t.error):n.resolve(t.result);return}t.method==="ui/notifications/host-context-changed"&&xt(t.params??{}),t.id!=null&&t.method&&parent.postMessage({jsonrpc:"2.0",id:t.id,result:{}},"*")}});function xt(e){e.theme&&(document.documentElement.dataset.theme=e.theme);for(let[t,n]of Object.entries(e.styles?.variables??{}))document.documentElement.style.setProperty(t,n)}async function $t(e,t={},n){let i=await vt("tools/call",{name:e,arguments:t},n);if(!i||i.isError||i.structuredContent===void 0)throw new Error(i?.content?.[0]?.text??`${e} failed`);return i.structuredContent}function Rt(e,t){if(t<ct)return;ct=t,Ee=!1,Ae=0,wt=Date.now();let n=E;E=lt(E,at(e),Date.now()),[...E.keys()].some(s=>!n.has(s))&&setTimeout(w,S+50),v=e;let i=it(Le,e);Le=i.seen;let o=[...i.added.needsYou,...i.added.findings];for(let s of o)Pe.set(s,Date.now());o.length>0&&setTimeout(w,ve+50),rn(e,i.added),w()}function rn(e,t){let n=de(E,Date.now()),i=Ie(e,n),o=rt(x,ot(e,x,n,ue),t,{needsYou:i.byTab.needsYou.map(s=>s.id),findings:i.byTab.findings.map(s=>s.id)});o&&(x=o.tab,o.id&&De(o.tab,o.id))}var an=3*le;async function Ne(){let e=++kt;try{Rt(await $t("inbox_view",{demo:H},an),e)}catch{v?Ae++:Ee=!0,w()}}async function St(){Te||await Ne(),setTimeout(St,le)}function ln(e,t){return[...e.needsYou.questions,...e.needsYou.tasks,...e.findings.rows].some(n=>n.id===t&&n.state.is!=="settled")}function dn(e,t){return[...e.needsYou.questions,...e.needsYou.tasks,...e.findings.rows].some(n=>n.id===t&&n.feedback?.is==="notSent")}async function L(e,t,n,i="Sending\\u2026"){t.action!=="undo"&&At(e),K.set(e,i),I.delete(e),Se.delete(e),X.delete(e),w(),Te=!0;let o=++kt;try{let s=await $t("inbox_press",{press:t,thread:v?.thread,demo:H});s?.copy&&await un(e,s.copy),s?.view&&Rt(s.view,o),s?.error&&!(v&&dn(v,e))&&I.set(e,s.error),!s?.error&&s?.note!=="stale"&&n?.(),s?.note&&v&&ln(v,e)?(Se.set(e,{text:j(s.note),at:Date.now()}),setTimeout(w,S+50),s.note==="stale"&&t.action==="type"&&(A=e)):s?.note&&(ce={text:j(s.note),at:Date.now()},setTimeout(w,S+50))}catch{I.set(e,"Not sent: the inbox did not answer.")}finally{Te=!1,K.delete(e),w()}}async function un(e,t){try{await navigator.clipboard.writeText(t.text)}catch{I.set(e,`Could not copy ${t.name}: this tab has no clipboard access`),X.set(e,t)}}function cn(e){return e.charAt(0).toUpperCase()+e.slice(1)}function pn(e){At(e),A=e,Re=!0,w()}function Lt(e){let{id:t,item:n}=e,i=e.actions.filter(b=>ut.has(t)||!b.isFolded),o=e.actions.length-i.length,s=i.map(b=>b.press.action).lastIndexOf("answer"),a=[],d=[],c=e.feedback?.is==="notSent"?e.feedback.retry:null;c&&a.push({label:"Try again",run:()=>{L(t,c)}});let u=0,f=()=>u<dt.length?{hotkey:dt[u++]}:{};for(let[b,l]of i.entries()){let p=l.press,g=l.label;if(p.action==="answer"&&n)a.push({...f(),label:g,isPrimary:l.isPrimary,run:()=>{L(t,p)}}),b===s&&o>0&&a.push({label:`All ${n.options.length} options`,run:()=>{ut.add(t),w()}});else if(p.action==="step"){let k=e.steps[p.step],h=l.kind==="local"&&n&&k?$e({is:"local",result:tt(et(n,k),Date.now())},"html"):void 0;a.push({...f(),label:g,run:()=>{L(t,p,void 0,h)}})}else p.action==="done"?a.push({hotkey:"d",label:g,run:()=>{L(t,p)}}):p.action==="address"?a.push({hotkey:"a",label:g,run:()=>{L(t,p)}}):p.action==="type"?d.push({hotkey:"t",label:g,run:()=>pn(t)}):p.action==="explain"||p.action==="discuss"?d.push({hotkey:"e",label:g,run:()=>{L(t,p)}}):p.action==="dismiss"&&d.push({hotkey:"x",label:g,run:()=>{L(t,p)}})}return{keys:a,more:d}}function fn(e,t,n){let i=n.kind==="question",o=t.state.is==="handedOff",s=n.id;return{id:s,handle:o?"\\u2713":t.handle,handleTone:o?"done":void 0,...o?{fold:{}}:{},title:n.ask,titleAfter:n.at===null?void 0:` \\xB7 ${N(e.at-n.at)}`,hasSecondLine:i,...Lt(t),typing:{hint:i?"Your answer":"Your reply to Codex",send:a=>{L(s,{action:"type",id:s,text:a},()=>B.delete(s))}},feedback:t.feedback}}var mn={issue:{label:"Issue",mark:"\\u25B2",tone:"needsYou"},opportunity:{label:"Opportunity",mark:"\\u2726",tone:"done"}};function gn(e,t,n){let i=mn[n.kind],o=t.state.is==="handedOff",s=n.id;return{id:s,handle:o?"\\u2713":t.handle,handleTone:o?"done":void 0,...o?{fold:{}}:{},title:n.title,meta:r("div",{children:[r("span",{class:`tone-${i.tone}`,children:[i.mark," ",i.label]}),r("span",{class:"muted",children:[" ",N(e.at-n.at)]})]}),line:{text:n.title,after:` \\xB7 ${N(e.at-n.at)}`},body:r("div",{children:[r("p",{children:n.detail}),n.path?r("p",{children:[r("span",{class:"muted",children:"Relevant file: "}),n.path]}):null]}),...Lt(t),typing:{hint:"Your reply to Codex",send:a=>{L(s,{action:"type",id:s,text:a},()=>B.delete(s))}},feedback:t.feedback}}function Ie(e,t){let n=d=>d.flatMap(c=>c.state.is==="settled"?t.has(c.id)?[{settled:c,state:c.state}]:[]:c.item?[{row:fn(e,c,c.item)}]:c.finding?[{row:gn(e,c,c.finding)}]:[]),i=d=>d.flatMap(c=>"row"in c?[c.row]:[]),o=n(e.needsYou.questions),s=n(e.needsYou.tasks),a=n(e.findings.rows);return{questions:o,tasks:s,findings:a,byTab:{needsYou:[...i(o),...i(s)],findings:i(a)}}}function Tt(e){return new Set(e.flatMap(t=>"settled"in t?[t.settled.id]:[]))}function hn(e){let t=e.type==="finding"?"findings":"needsYou";L(e.id,{action:"undo",id:e.id},()=>De(t,e.id))}function Ct(e,t,n){let i=F[t],o=i?i.id:(t==="needsYou"?n.needsYou.topId:null)??e[0]?.id;return o?e.findIndex(s=>s.id===o):-1}function De(e,t){F[e]={id:t,openedAt:Date.now()},setTimeout(w,xe+50)}function Et(e,t,n){let i=t[n];i&&(De(e,i.id),w())}function At(e){F[x]||(F[x]={id:e,openedAt:0})}function pt(){return nt(F[x]?.openedAt??0,Date.now())}function Pt(e){let t={hotkey:"v",label:M.has(e.id)?"Hide details":"Details",run:()=>{M.has(e.id)?M.delete(e.id):M.add(e.id),w()}};return e.fold&&!M.has(e.id)?{keys:[t],more:[]}:e.fold?{keys:e.keys,more:[...e.more,t]}:{keys:e.keys,more:e.more}}function ft({k:e}){return r("button",{type:"button",class:e.isPrimary?"key primary":"key",disabled:pt(),onClick:()=>{pt()||e.run()},children:e.label})}function yn({row:e}){let t=e.typing;return r("form",{onSubmit:i=>{i.preventDefault();let o=(B.get(e.id)??"").trim();o&&(A=null,t.send(o))},children:[r("input",{id:`type-${e.id}`,value:B.get(e.id)??"",placeholder:t.hint,"aria-label":t.hint,onInput:i=>B.set(e.id,i.currentTarget.value)}),r("button",{type:"submit",class:"key",children:"Send"}),r("button",{type:"button",class:"key",onClick:()=>{A=null,w()},children:"Cancel"})]})}function mt(e){let t=e.feedback;return t?t.is==="done"&&e.handleTone==="done"?t.label:$e(t,"html"):null}function gt(e,t){let n=e.feedback;return n?st(n)?`${mt(e)} \\xB7 ${N(t-n.at)}`:mt(e):null}function Nt(e){let t=Se.get(e);return t&&Date.now()-t.at<S?t.text:null}function ht(e){return!I.has(e.id)&&Nt(e.id)===null&&!X.has(e.id)}function bn(e){let t=Pe.get(e);return t!==void 0&&Date.now()-t<ve}function _n({row:e,tone:t,isSelected:n,onSelect:i,now:o}){let s=bn(e.id)?` new tone-bar-${t}`:"",a=e.handleTone==="done"&&e.feedback?.is!=="queued"?"tone-done":"muted",d=r("span",{class:`mark ${e.handleTone??""}`,children:e.handle});if(!n){let h=e.line??{text:e.title,after:e.titleAfter},_=ht(e)?gt(e,o):null,m=_?{...h,after:` \\xB7 ${_}`,afterTone:ae(e.feedback)?"error":e.handleTone==="done"&&e.feedback?.is==="done"?"done":void 0}:h;return r("div",{class:`row${s}`,children:[d,r("button",{type:"button",class:"line",onClick:i,children:[r("span",{class:e.hasSecondLine?"text two":"text",children:m.text}),m.after?r("span",{class:`after ${m.afterTone?`tone-${m.afterTone}`:""}`,children:m.after}):null]})]})}let c=!e.fold||M.has(e.id),{keys:u,more:f}=Pt(e),b=ht(e)?gt(e,o):null,l=[e.fold?.note,ae(e.feedback)?null:b],p=ae(e.feedback)?b:null,g=X.get(e.id),k=Nt(e.id);return r("div",{class:`row selected${s}`,children:[d,r("div",{class:"content",children:[r("div",{class:"tight",children:[e.meta?r("div",{class:"meta",children:e.meta}):null,r("div",{class:"title",children:[e.title,e.titleAfter?r("span",{class:"after",children:e.titleAfter}):null]})]}),c&&e.body?r("div",{class:"body",children:e.body}):null,l.some(Boolean)||p||K.has(e.id)||k||I.has(e.id)?r("div",{class:"tight",children:[l.filter(Boolean).map(h=>r("div",{class:a,children:h})),p?r("div",{class:"tone-error",children:p}):null,K.has(e.id)?r("div",{class:"muted",children:K.get(e.id)}):null,k?r("div",{class:"muted",children:k}):null,I.has(e.id)?r("div",{class:"tone-error",children:I.get(e.id)}):null]}):null,r("div",{class:"keys",children:[u.map(h=>r(ft,{k:h})),u.length>0&&f.length>0?r("span",{class:"key-dot",children:"\\xB7"}):null,f.map(h=>r(ft,{k:h}))]}),e.typing&&A===e.id?r(yn,{row:e}):null,g?r("div",{children:[r("div",{class:"muted",children:["Copy ",g.name," from here:"]}),r("textarea",{rows:3,readOnly:!0,value:g.text,onFocus:h=>h.currentTarget.select()}),r("button",{type:"button",class:"key",onClick:()=>{X.delete(e.id),w()},children:"Close"})]}):null]})]})}function wn({settled:e,state:t}){let n=E.get(e.id)??Date.now();return r("div",{class:"row settled",children:[r("span",{class:"mark done",children:t.isQueued?"":"\\u2713"}),r("div",{class:"content tight",children:[r("div",{class:"what",children:e.title}),r("div",{children:[r("span",{class:t.isQueued?"muted":"tone-done",children:t.isQueued?`Queued: ${t.label}`:t.label}),t.canUndo?r("button",{type:"button",class:"key",onClick:()=>hn(e),children:"Undo"}):null]}),r("div",{class:"leave",children:r("div",{style:{animationDuration:`${S}ms`},ref:i=>{i&&!i.style.animationDelay&&(i.style.animationDelay=`-${Math.max(0,Date.now()-n)}ms`)}})})]})]})}function It({v:e,entries:t,group:n,all:i,now:o}){let s=n==="finding"?"findings":"needsYou",a=Ct(i,s,e);return t.length===0?null:r("div",{class:n==="finding"?"flat":"tree",children:t.map(d=>"row"in d?r("div",{class:"entry",children:r(_n,{row:d.row,tone:s,now:o,isSelected:i.indexOf(d.row)===a,onSelect:()=>Et(s,i,i.indexOf(d.row))})},d.row.id):r("div",{class:"entry",children:r(wn,{settled:d.settled,state:d.state})},`settled-${d.settled.id}`))})}function kn({title:e,count:t}){return r("div",{class:"group-title",children:[e,t>0?r("span",{class:"count",children:t}):null]})}function Ce(e,t,n){return Y(e.needsYou.closed[t==="question"?"questions":"tasks"],Tt(n)).map(i=>({id:i.id,ask:i.ask,outcome:i.outcome,isLapsed:we(i),at:i.at}))}function yt({v:e,kind:t,entries:n,all:i,now:o}){let s=t==="question"?"Questions":"Tasks",a=Ce(e,t,n);if(n.length===0&&a.length===0)return null;let d=n.flatMap(c=>"row"in c?[c.row]:[]);return r("section",{children:[r(kn,{title:s,count:d.filter(c=>!c.fold).length}),r(It,{v:e,entries:n,group:t,all:i,now:o}),r(Dt,{group:t,closed:a,now:o})]})}function Dt({group:e,closed:t,now:n}){if(t.length===0)return null;let i=ue.has(e);return r(C,{children:[r("button",{type:"button",class:"fold",onClick:()=>{i?ue.delete(e):ue.add(e),w()},children:[r("span",{class:"fold-mark",children:i?"\\u25BE":"\\u25B8"}),t.length," Closed"]}),i?r("div",{class:"tree closed-tree",children:t.map(o=>r("div",{class:"entry",children:r("div",{class:"row",children:[r("span",{class:"mark",children:"\\u25C7"}),r("div",{class:"content tight",children:[r("div",{class:"muted",children:o.ask}),r("div",{children:[r("span",{class:o.isLapsed?"outcome lapsed":"outcome",children:cn(o.outcome)}),r("span",{class:"muted",children:[" \\xB7 ",N(n-o.at)]})]})]})]})},`closed-${o.id}`))}):null]})}function vn(e){return e.heard==="heard"?null:["The inbox has not heard from this chat\\u2019s hooks.",e.heard==="none"?"Codex runs a plugin\\u2019s hooks only after you trust them.":"Items from Codex\\u2019s replies are missing."]}function xn({v:e,lists:t,now:n}){let i=t.byTab.needsYou,o=t.questions.length===0&&t.tasks.length===0,s=Ce(e,"question",t.questions).length>0||Ce(e,"task",t.tasks).length>0,a=vn(e);return o&&!s?a?r("div",{class:"empty",children:[r("div",{class:"title",children:a[0]}),r("div",{class:"muted",children:a[1]})]}):r("div",{class:"empty",children:r("div",{class:"title",children:"Nothing needs you."})}):r("main",{children:[o?r("section",{children:a?r("div",{class:"group-title",children:[a[0],r("div",{class:"muted",children:a[1]})]}):r("div",{class:"group-title empty-line",children:"Nothing needs you."})}):null,r(yt,{v:e,kind:"question",entries:t.questions,all:i,now:n}),r(yt,{v:e,kind:"task",entries:t.tasks,all:i,now:n})]})}function $n({v:e,lists:t,now:n}){let i=Y(e.findings.closed,Tt(t.findings)).map(s=>({id:s.id,ask:s.title,outcome:s.outcome,isLapsed:we(s),at:s.closedAt})),o=t.findings.length===0;return o&&i.length===0?r("div",{class:"empty",children:[r("div",{class:"title",children:"No findings yet"}),r("div",{class:"muted",children:"Codex flags issues and opportunities it spots beyond your task."})]}):r("main",{children:r("section",{children:[o?r("div",{class:"group-title empty-line",children:"No open findings."}):null,r(It,{v:e,entries:t.findings,group:"finding",all:t.byTab.findings,now:n}),r(Dt,{group:"finding",closed:i,now:n})]})})}var Rn=6e4;function Sn({v:e,now:t}){let{changedAt:n,isUpdating:i,error:o}=e.status,s=Date.now()-wt,a=Ae>=2?r("span",{class:s>Rn?"tone-error":void 0,children:["Last read ",N(s)," \\xB7 retrying"]}):i?"Updating\\u2026":n!==null?`Updated ${N(t-n)}`:"Not updated yet",d=e.findings.count,c=[e.needsYou.count>0?r("span",{class:"tone-needsYou",children:[e.needsYou.count," need you"]}):null,d>0?r("span",{class:"tone-findings",children:d===1?"1 finding":`${d} findings`}):null].filter(u=>u!==null);return r("header",{children:[r("div",{class:"line-one",children:[r("span",{class:"counts",children:c.map((u,f)=>r("span",{children:[f>0?r("span",{class:"muted",children:" \\xB7 "}):null,u]},f))}),r("div",{class:"status",children:[a,o?r("div",{class:"tone-error",children:o}):null,ce&&Date.now()-ce.at<S?r("div",{class:"muted",children:ce.text}):null]})]}),e.goal?r("div",{class:"goal",children:[r("span",{class:"goal-mark",children:"\\u25C6 "}),e.goal,e.now?r("span",{class:"muted",children:[" \\xB7 ",e.now]}):null]}):null]})}function Ln({v:e}){let t={needsYou:e.needsYou.count,findings:e.findings.count};return r("nav",{children:r("div",{class:"tabs",children:_t.map(n=>r("button",{type:"button",class:`tab ${x===n.id?"shown":""}`,onClick:()=>{x=n.id,w()},children:[n.label,t[n.id]>0?r("span",{class:`count tone-${n.id}`,children:t[n.id]}):null]}))})})}async function bt(){H=!H,v=null,E=new Map,Le=null,Pe.clear(),F.needsYou=null,F.findings=null,A=null,w(),await Ne()}function Tn(){if(!v)return Ee?r("div",{class:"notice",children:["Could not read the inbox."," ",r("button",{type:"button",class:"key",onClick:()=>{Ne()},children:"Try again"})]}):r("div",{class:"notice",children:r("span",{class:"muted",children:"Loading\\u2026"})});let e=v,t=e.at,n=Ie(e,de(E,Date.now()));return r(C,{children:[H?r("div",{class:"demo-note",children:[r("span",{children:"Showing sample entries. Presses here send nothing."}),r("button",{type:"button",class:"key",onClick:()=>{bt()},children:"Hide demo"})]}):null,r(Sn,{v:e,now:t}),r(Ln,{v:e}),x==="needsYou"?r(xn,{v:e,lists:n,now:t}):r($n,{v:e,lists:n,now:t}),r("footer",{children:H?null:r("button",{type:"button",class:"demo-toggle",onClick:()=>{bt()},children:"Show demo"})})]})}var G=document.getElementById("app");function w(){G.className&&(G.className="",G.textContent=""),Je(r(Tn,{}),G),Re&&A&&(Re=!1,document.getElementById(`type-${A}`)?.focus())}document.addEventListener("keydown",e=>{if(e.metaKey||e.ctrlKey||e.altKey||!v)return;let t=e.target;if(t?.closest("input, textarea")){e.key==="Escape"&&t.tagName==="INPUT"&&(A=null,w());return}let n=_t.find(f=>f.hotkey===e.key);if(n){x=n.id,w();return}let i=Ie(v,de(E,Date.now())).byTab[x],o=Ct(i,x,v),s=e.key==="j"||e.key==="ArrowDown"?1:e.key==="k"||e.key==="ArrowUp"?-1:0;if(s!==0){e.preventDefault(),Et(x,i,Math.max(0,Math.min(i.length-1,o+s))),document.querySelector(".row.selected")?.scrollIntoView({block:"nearest"});return}let a=i[o];if(!a)return;let{keys:d,more:c}=Pt(a),u=[...d,...c].find(f=>f.hotkey===e.key);u&&(e.preventDefault(),u.run())});vt("ui/initialize",{protocolVersion:"2026-01-26",appInfo:{name:"inbox",version:"0.1.0"},appCapabilities:{tools:{}}}).then(e=>{xt(e?.hostContext??{}),parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/initialized",params:{}},"*"),St()}).catch(()=>{G.textContent="The inbox could not connect to Codex."});})();\n\n    </script>\n  </body>\n</html>\n';

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
