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
    // A message sent before the server kept its row changes no row when it arrives.
    sent: (saved.sent ?? []).map((x) => ({ ...x, row: x.row ?? null, queuedId: x.queuedId ?? null })),
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
var tab_default = '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>Inbox</title>\n    <style>\n      /* The host\'s variables when Codex passes them; otherwise the pane\'s own colors. */\n      :root {\n        color-scheme: light;\n        --bg: var(--color-background-primary, #ffffff);\n        --text: var(--color-text-primary, #1f1f1f);\n        --muted: var(--color-text-secondary, #595959);\n        --key: #243bf5;\n        --needs-you: #745417;\n        --findings: #7b00e8;\n        --done: #25652f;\n        --error: #a5293d;\n        --error-mark: #a5293d;\n        --sans: var(--font-sans, -apple-system, system-ui, sans-serif);\n        --mono: var(--font-mono, ui-monospace, \'SF Mono\', Menlo, monospace);\n        /* Surfaces are mixed from the host\'s colors, so they follow its theme. */\n        --card: color-mix(in srgb, var(--text) 4.5%, var(--bg));\n        --raised: color-mix(in srgb, var(--text) 9%, var(--bg));\n        --selected: color-mix(in srgb, #4c9aff 20%, var(--card));\n        --tree: color-mix(in srgb, var(--text) 30%, var(--bg));\n        --divider: color-mix(in srgb, var(--text) 9%, var(--bg));\n        --hover: color-mix(in srgb, var(--key) 14%, transparent);\n        /* The tree\'s grid: its line, where a row\'s mark sits, and where its text starts. */\n        --tree-x: 15px;\n        --mark-x: 30px;\n        --text-x: 52px;\n      }\n      @media (prefers-color-scheme: dark) {\n        :root:not([data-theme=\'light\']) {\n          color-scheme: dark;\n          --bg: var(--color-background-primary, #171717);\n          --text: var(--color-text-primary, #ececec);\n          --muted: var(--color-text-secondary, #a8a8a8);\n          --key: #b1b9f9;\n          --needs-you: #ffc107;\n          --findings: #cab0ff;\n          --done: #7ecd8f;\n          --error: #ffa3b0;\n          --error-mark: #ff6b80;\n          --card: color-mix(in srgb, var(--text) 5.5%, var(--bg));\n          --raised: color-mix(in srgb, var(--text) 11%, var(--bg));\n          --selected: color-mix(in srgb, #7fa6d9 15%, var(--card));\n          --tree: color-mix(in srgb, var(--text) 32%, var(--bg));\n          --divider: color-mix(in srgb, var(--text) 8%, var(--bg));\n        }\n      }\n      :root[data-theme=\'dark\'] {\n        color-scheme: dark;\n        --key: #b1b9f9;\n        --needs-you: #ffc107;\n        --findings: #cab0ff;\n        --done: #7ecd8f;\n        --error: #ffa3b0;\n        --error-mark: #ff6b80;\n        --card: color-mix(in srgb, var(--text) 5.5%, var(--bg));\n        --raised: color-mix(in srgb, var(--text) 11%, var(--bg));\n        --selected: color-mix(in srgb, #7fa6d9 15%, var(--card));\n        --tree: color-mix(in srgb, var(--text) 32%, var(--bg));\n        --divider: color-mix(in srgb, var(--text) 8%, var(--bg));\n      }\n      * {\n        box-sizing: border-box;\n      }\n      body {\n        margin: 0;\n        background: var(--bg);\n        color: var(--text);\n        font: 13px/20px var(--sans);\n        -webkit-font-smoothing: antialiased;\n      }\n      button {\n        font: inherit;\n        color: inherit;\n        background: none;\n        border: none;\n        padding: 0;\n        cursor: pointer;\n        text-align: left;\n      }\n      :focus-visible {\n        outline: 1.5px solid var(--key);\n        outline-offset: 1px;\n        border-radius: 4px;\n      }\n      kbd {\n        font: 12px/20px var(--mono);\n        color: var(--key);\n      }\n      .muted {\n        color: var(--muted);\n      }\n      .tone-needsYou {\n        color: var(--needs-you);\n      }\n      .tone-findings {\n        color: var(--findings);\n      }\n      .tone-done {\n        color: var(--done);\n      }\n      .tone-error {\n        color: var(--error);\n      }\n      .notice {\n        padding: 10px 16px;\n        color: var(--error);\n      }\n\n      /* Tabs: the shown one a raised panel, the others text on the background. */\n      nav {\n        display: flex;\n        flex-wrap: wrap;\n        align-items: flex-end;\n        justify-content: space-between;\n        gap: 4px 16px;\n        padding: 12px 12px 0;\n      }\n      .tabs {\n        display: flex;\n        gap: 4px;\n      }\n      .tab {\n        padding: 6px 12px;\n        border-radius: 6px;\n        color: var(--muted);\n      }\n      .tab:hover {\n        color: var(--text);\n      }\n      .tab.shown {\n        background: var(--raised);\n        color: var(--text);\n        font-weight: 600;\n      }\n      .tab .count {\n        font-weight: 600;\n        margin-left: 6px;\n      }\n      .status {\n        padding: 6px 4px;\n        color: var(--muted);\n        font-size: 12px;\n      }\n\n      main {\n        display: flex;\n        flex-direction: column;\n        gap: 8px;\n        padding: 12px 12px 4px;\n      }\n      section {\n        background: var(--card);\n        border-radius: 8px;\n        padding: 10px 0;\n      }\n      .group-title {\n        padding: 0 14px 0 calc(var(--tree-x) + 4px);\n        font-weight: 500;\n      }\n      .group-title .count {\n        color: var(--muted);\n        margin-left: 6px;\n      }\n\n      /* The tree: a hairline from the group\'s title, an elbow to each row, and a rounded last elbow. */\n      .tree {\n        position: relative;\n        padding-top: 8px;\n      }\n      .tree::before {\n        content: \'\';\n        position: absolute;\n        left: var(--tree-x);\n        top: 0;\n        height: 8px;\n        border-left: 1px solid var(--tree);\n      }\n      .entry {\n        position: relative;\n        --elbow: 16px;\n      }\n      .entry:has(> .row.selected) {\n        --elbow: 22px;\n      }\n      .tree > .entry::before {\n        content: \'\';\n        position: absolute;\n        left: var(--tree-x);\n        top: 0;\n        bottom: 0;\n        border-left: 1px solid var(--tree);\n        z-index: 1;\n      }\n      .tree > .entry::after {\n        content: \'\';\n        position: absolute;\n        left: var(--tree-x);\n        top: var(--elbow);\n        width: 11px;\n        border-top: 1px solid var(--tree);\n        z-index: 1;\n      }\n      .tree > .entry:last-child::before {\n        bottom: auto;\n        height: calc(var(--elbow) + 1px);\n        width: 11px;\n        border-bottom: 1px solid var(--tree);\n        border-bottom-left-radius: 7px;\n      }\n      .tree > .entry:last-child::after {\n        display: none;\n      }\n      .flat {\n        --mark-x: 18px;\n        --text-x: 40px;\n      }\n\n      /* Rows. A divider runs from the text column to the edge, under the tree\'s line. */\n      .row {\n        display: flex;\n        padding: 6px 14px 6px var(--mark-x);\n      }\n      .entry + .entry > .row {\n        background-image: linear-gradient(var(--divider), var(--divider));\n        background-repeat: no-repeat;\n        background-size: calc(100% - var(--text-x)) 1px;\n        background-position: right top;\n      }\n      .row.selected {\n        background-color: var(--selected);\n        padding-top: 12px;\n        padding-bottom: 12px;\n      }\n      .mark {\n        flex: none;\n        width: calc(var(--text-x) - var(--mark-x));\n        font: 12px/20px var(--mono);\n        color: var(--muted);\n      }\n      .mark.done,\n      .mark.error {\n        font-size: 13px;\n      }\n      .mark.done {\n        color: var(--done);\n      }\n      .mark.error {\n        color: var(--error-mark);\n      }\n      .content {\n        flex: 1;\n        min-width: 0;\n        display: flex;\n        flex-direction: column;\n        gap: 8px;\n      }\n      .content > .tight,\n      .content.tight {\n        display: flex;\n        flex-direction: column;\n        gap: 0;\n      }\n      .line {\n        display: flex;\n        width: 100%;\n        min-width: 0;\n      }\n      .line .text {\n        min-width: 0;\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .line .text.two {\n        white-space: normal;\n        display: -webkit-box;\n        -webkit-line-clamp: 2;\n        -webkit-box-orient: vertical;\n      }\n      .line .after {\n        flex: none;\n        white-space: pre;\n        color: var(--muted);\n      }\n      .line .after.tone-done {\n        color: var(--done);\n      }\n      .line:hover .text {\n        color: color-mix(in srgb, var(--text) 80%, var(--key));\n      }\n      .title {\n        font-weight: 600;\n      }\n      .title .after {\n        font-weight: 400;\n        color: var(--muted);\n      }\n      .meta {\n        font-size: 12px;\n      }\n      .body {\n        overflow-wrap: anywhere;\n      }\n      .body p {\n        margin: 0;\n      }\n      .body p + p {\n        margin-top: 4px;\n      }\n      /* Keys are text, as the pane draws them: "a: Fix". */\n      .keys {\n        display: flex;\n        flex-wrap: wrap;\n        align-items: center;\n        gap: 2px 8px;\n        margin-left: -6px;\n      }\n      .key {\n        padding: 1px 6px;\n        border-radius: 5px;\n        white-space: nowrap;\n      }\n      .key:hover {\n        background: var(--hover);\n      }\n      /* The option Claude recommended. */\n      .key.primary {\n        font-weight: 600;\n      }\n      .key-dot {\n        color: var(--muted);\n      }\n      form {\n        display: flex;\n        align-items: center;\n        gap: 8px;\n      }\n      input {\n        flex: 1;\n        min-width: 0;\n        font: inherit;\n        color: inherit;\n        background: var(--bg);\n        border: 1px solid var(--tree);\n        border-radius: 6px;\n        padding: 4px 8px;\n      }\n      input:focus {\n        outline: none;\n        border-color: var(--key);\n      }\n      textarea {\n        width: 100%;\n        font: 12px var(--mono);\n        color: inherit;\n        background: var(--bg);\n        border: 1px solid var(--tree);\n        border-radius: 6px;\n      }\n\n      .empty-line {\n        color: var(--muted);\n      }\n      .fold {\n        display: block;\n        margin: 8px 0 0 calc(var(--mark-x) - 2px);\n        padding: 1px 4px;\n        border-radius: 5px;\n        color: var(--muted);\n      }\n      .fold:hover {\n        color: var(--text);\n      }\n      .fold-mark {\n        display: inline-block;\n        width: 14px;\n        font-family: var(--mono);\n      }\n      /* The closed items hang from the fold\'s arrow. */\n      .tree.closed-tree {\n        --tree-x: 36px;\n        --mark-x: 52px;\n        --text-x: 72px;\n        padding-top: 4px;\n      }\n      .tree.closed-tree::before {\n        height: 4px;\n      }\n      .tree.closed-tree .entry + .entry > .row {\n        background-image: none;\n      }\n      .outcome {\n        font-weight: 600;\n      }\n      .outcome.lapsed {\n        font-weight: 400;\n        color: var(--muted);\n      }\n      .settled .what {\n        color: var(--muted);\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .leave {\n        width: 96px;\n        height: 1.5px;\n        margin-top: 4px;\n        border-radius: 1px;\n        overflow: hidden;\n      }\n      .leave div {\n        height: 100%;\n        background: var(--done);\n        animation-name: leave;\n        animation-timing-function: linear;\n        animation-fill-mode: forwards;\n      }\n      @keyframes leave {\n        from {\n          width: 100%;\n        }\n        to {\n          width: 0;\n        }\n      }\n      .empty {\n        padding: 56px 32px;\n        text-align: center;\n      }\n      .empty .title {\n        margin-bottom: 4px;\n      }\n      footer {\n        display: flex;\n        flex-wrap: wrap;\n        justify-content: space-between;\n        gap: 4px 16px;\n        padding: 8px 16px 16px;\n        color: var(--muted);\n        font-size: 12px;\n      }\n      .demo-toggle {\n        padding: 0 6px;\n        border-radius: 5px;\n        color: var(--muted);\n      }\n      .demo-toggle:hover {\n        color: var(--text);\n        background: var(--hover);\n      }\n      .demo-note {\n        display: flex;\n        flex-wrap: wrap;\n        align-items: center;\n        gap: 4px 12px;\n        margin: 12px 12px 0;\n        padding: 6px 12px;\n        border-radius: 6px;\n        background: var(--raised);\n        color: var(--text);\n      }\n      footer kbd {\n        margin-right: 4px;\n      }\n      footer .sep {\n        margin: 0 8px;\n      }\n      @media (prefers-reduced-motion: reduce) {\n        .leave div {\n          animation: none;\n        }\n      }\n    </style>\n  </head>\n  <body>\n    <div id="app" class="notice muted">Loading\u2026</div>\n    <script>\n      "use strict";(()=>{var ie,y,Fe,vt,A,Ne,Ue,Me,ue,J,V,He,me,pe,fe,xt,te={},ne=[],$t=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,oe=Array.isArray;function T(e,t){for(var n in t)e[n]=t[n];return e}function he(e){e&&e.parentNode&&e.parentNode.removeChild(e)}function Lt(e,t,n){var s,o,i,r={};for(i in t)i=="key"?s=t[i]:i=="ref"?o=t[i]:r[i]=t[i];if(arguments.length>2&&(r.children=arguments.length>3?ie.call(arguments,2):n),typeof e=="function"&&e.defaultProps!=null)for(i in e.defaultProps)r[i]===void 0&&(r[i]=e.defaultProps[i]);return Z(e,r,s,o,null)}function Z(e,t,n,s,o){var i={type:e,props:t,key:n,ref:s,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:o??++Fe,__i:-1,__u:0};return o==null&&y.vnode!=null&&y.vnode(i),i}function L(e){return e.children}function ee(e,t){this.props=e,this.context=t}function I(e,t){if(t==null)return e.__?I(e.__,e.__i+1):null;for(var n;t<e.__k.length;t++)if((n=e.__k[t])!=null&&n.__e!=null)return n.__e;return typeof e.type=="function"?I(e):null}function Rt(e){if(e.__P&&e.__d){var t=e.__v,n=t.__e,s=[],o=[],i=T({},t);i.__v=t.__v+1,y.vnode&&y.vnode(i),ge(e.__P,i,t,e.__n,e.__P.namespaceURI,32&t.__u?[n]:null,s,n??I(t),!!(32&t.__u),o),i.__v=t.__v,i.__.__k[i.__i]=i,Ye(s,i,o),t.__e=t.__=null,i.__e!=n&&qe(i)}}function qe(e){if((e=e.__)!=null&&e.__c!=null)return e.__e=e.__c.base=null,e.__k.some(function(t){if(t!=null&&t.__e!=null)return e.__e=e.__c.base=t.__e}),qe(e)}function Ie(e){(!e.__d&&(e.__d=!0)&&A.push(e)&&!se.__r++||Ne!=y.debounceRendering)&&((Ne=y.debounceRendering)||Ue)(se)}function se(){try{for(var e,t=1;A.length;)A.length>t&&A.sort(Me),e=A.shift(),t=A.length,Rt(e)}finally{A.length=se.__r=0}}function Ve(e,t,n,s,o,i,r,d,u,c,f){var g,l,p,m,k,b,w=s&&s.__k||ne,h=t.length;for(u=St(n,t,w,u,h),g=0;g<h;g++)(p=n.__k[g])!=null&&(l=p.__i!=-1&&w[p.__i]||te,p.__i=g,b=ge(e,p,l,o,i,r,d,u,c,f),m=p.__e,p.ref&&l.ref!=p.ref&&(l.ref&&ye(l.ref,null,p),f.push(p.ref,p.__c||m,p)),k==null&&m!=null&&(k=m),4&p.__u?(u=je(p,u,e),l.__e&&(l.__e=null)):typeof p.type=="function"&&b!==void 0?u=b:m&&(u=m.nextSibling),p.__u&=-7);return n.__e=k,u}function St(e,t,n,s,o){var i,r,d,u,c,f=n.length,g=f,l=0;for(e.__k=new Array(o),i=0;i<o;i++)(r=t[i])!=null&&typeof r!="boolean"&&typeof r!="function"?(typeof r=="string"||typeof r=="number"||typeof r=="bigint"||r.constructor==String?r=e.__k[i]=Z(null,r,null,null,null):oe(r)?r=e.__k[i]=Z(L,{children:r},null,null,null):r.constructor===void 0&&r.__b>0?r=e.__k[i]=Z(r.type,r.props,r.key,r.ref?r.ref:null,r.__v):e.__k[i]=r,u=i+l,r.__=e,r.__b=e.__b+1,d=null,(c=r.__i=Tt(r,n,u,g))!=-1&&(g--,(d=n[c])&&(d.__u|=2)),d==null||d.__v==null?(c==-1&&(o>f?l--:o<f&&l++),typeof r.type!="function"&&(r.__u|=4)):c!=u&&(c==u-1?l--:c==u+1?l++:(c>u?l--:l++,r.__u|=4))):e.__k[i]=null;if(g)for(i=0;i<f;i++)(d=n[i])!=null&&(2&d.__u)==0&&(d.__e==s&&(s=I(d)),Be(d,d));return s}function je(e,t,n){var s,o;if(typeof e.type=="function"){for(s=e.__k,o=0;s&&o<s.length;o++)s[o]&&(s[o].__=e,t=je(s[o],t,n));return t}e.__e!=t&&(t&&e.type&&!t.parentNode&&(t=I(e)),t=n.insertBefore(e.__e,t||null));do t=t&&t.nextSibling;while(t!=null&&t.nodeType==8);return t}function Tt(e,t,n,s){var o,i,r,d=e.key,u=e.type,c=t[n],f=c!=null&&(2&c.__u)==0;if(c===null&&d==null||f&&d==c.key&&u==c.type)return n;if(s>(f?1:0)){for(o=n-1,i=n+1;o>=0||i<t.length;)if((c=t[r=o>=0?o--:i++])!=null&&(2&c.__u)==0&&d==c.key&&u==c.type)return r}return-1}function Oe(e,t,n){t[0]=="-"?e.setProperty(t,n??""):e[t]=n==null?"":typeof n!="number"||$t.test(t)?n:n+"px"}function z(e,t,n,s,o){var i,r;e:if(t=="style")if(typeof n=="string")e.style.cssText=n;else{if(typeof s=="string"&&(e.style.cssText=s=""),s)for(t in s)n&&t in n||Oe(e.style,t,"");if(n)for(t in n)s&&n[t]==s[t]||Oe(e.style,t,n[t])}else if(t[0]=="o"&&t[1]=="n")i=t!=(t=t.replace(He,"$1")),r=t.toLowerCase(),t=r in e||t=="onFocusOut"||t=="onFocusIn"?r.slice(2):t.slice(2),e.l||(e.l={}),e.l[t+i]=n,n?s?n[V]=s[V]:(n[V]=me,e.addEventListener(t,i?fe:pe,i)):e.removeEventListener(t,i?fe:pe,i);else{if(o=="http://www.w3.org/2000/svg")t=t.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(t!="width"&&t!="height"&&t!="href"&&t!="list"&&t!="form"&&t!="tabIndex"&&t!="download"&&t!="rowSpan"&&t!="colSpan"&&t!="role"&&t!="popover"&&t in e)try{e[t]=n??"";break e}catch{}typeof n=="function"||(n==null||n===!1&&t[4]!="-"?e.removeAttribute(t):e.setAttribute(t,t=="popover"&&n==1?"":n))}}function De(e){return function(t){if(this.l){var n=this.l[t.type+e];if(t[J]==null)t[J]=me++;else if(t[J]<n[V])return;return n(y.event?y.event(t):t)}}}function ge(e,t,n,s,o,i,r,d,u,c){var f,g,l,p,m,k,b,w,h,x,H,N,q,Ee,X,ce,$=t.type;if(t.constructor!==void 0)return null;128&n.__u&&(u=!!(32&n.__u),i=[d=t.__e=n.__e]),(f=y.__b)&&f(t);e:if(typeof $=="function"){g=r.length;try{if(h=t.props,x=$.prototype&&$.prototype.render,H=(f=$.contextType)&&s[f.__c],N=f?H?H.props.value:f.__:s,n.__c?w=(l=t.__c=n.__c).__=l.__E:(x?t.__c=l=new $(h,N):(t.__c=l=new ee(h,N),l.constructor=$,l.render=Pt),H&&H.sub(l),l.state||(l.state={}),l.__n=s,p=l.__d=!0,l.__h=[],l._sb=[]),x&&l.__s==null&&(l.__s=l.state),x&&$.getDerivedStateFromProps!=null&&(l.__s==l.state&&(l.__s=T({},l.__s)),T(l.__s,$.getDerivedStateFromProps(h,l.__s))),m=l.props,k=l.state,l.__v=t,p)x&&$.getDerivedStateFromProps==null&&l.componentWillMount!=null&&l.componentWillMount(),x&&l.componentDidMount!=null&&l.__h.push(l.componentDidMount);else{if(x&&$.getDerivedStateFromProps==null&&h!==m&&l.componentWillReceiveProps!=null&&l.componentWillReceiveProps(h,N),t.__v==n.__v||!l.__e&&l.shouldComponentUpdate!=null&&l.shouldComponentUpdate(h,l.__s,N)===!1){t.__v!=n.__v&&(l.props=h,l.state=l.__s,l.__d=!1),t.__e=n.__e,t.__k=n.__k,t.__k.some(function(U){U&&(U.__=t)}),ne.push.apply(l.__h,l._sb),l._sb=[],l.__h.length&&r.push(l),d=I(n);break e}l.componentWillUpdate!=null&&l.componentWillUpdate(h,l.__s,N),x&&l.componentDidUpdate!=null&&l.__h.push(function(){l.componentDidUpdate(m,k,b)})}if(l.context=N,l.props=h,l.__P=e,l.__e=!1,q=y.__r,Ee=0,x)l.state=l.__s,l.__d=!1,q&&q(t),f=l.render(l.props,l.state,l.context),ne.push.apply(l.__h,l._sb),l._sb=[];else do l.__d=!1,q&&q(t),f=l.render(l.props,l.state,l.context),l.state=l.__s;while(l.__d&&++Ee<25);l.state=l.__s,l.getChildContext!=null&&(s=T(T({},s),l.getChildContext())),x&&!p&&l.getSnapshotBeforeUpdate!=null&&(b=l.getSnapshotBeforeUpdate(m,k)),X=f!=null&&f.type===L&&f.key==null?Ke(f.props.children):f,d=Ve(e,oe(X)?X:[X],t,n,s,o,i,r,d,u,c),l.base=t.__e,t.__u&=-161,l.__h.length&&r.push(l),w&&(l.__E=l.__=null)}catch(U){if(r.length=g,t.__v=null,u||i!=null){if(U.then){for(t.__u|=u?160:128;d&&d.nodeType==8&&d.nextSibling;)d=d.nextSibling;i!=null&&(i[i.indexOf(d)]=null),t.__e=d}else if(i!=null)for(ce=i.length;ce--;)he(i[ce])}else t.__e=n.__e;t.__k==null&&(t.__k=n.__k||[]),U.then||We(t),y.__e(U,t,n)}}else i==null&&t.__v==n.__v?(t.__k=n.__k,t.__e=n.__e):d=t.__e=Ct(n.__e,t,n,s,o,i,r,u,c);return(f=y.diffed)&&f(t),128&t.__u?void 0:d}function We(e){e&&(e.__c&&(e.__c.__e=!0),e.__k&&e.__k.some(We))}function Ye(e,t,n){for(var s=0;s<n.length;s++)ye(n[s],n[++s],n[++s]);y.__c&&y.__c(t,e),e.some(function(o){try{e=o.__h,o.__h=[],e.some(function(i){i.call(o)})}catch(i){y.__e(i,o.__v)}})}function Ke(e){return typeof e!="object"||e==null||e.__b>0?e:oe(e)?e.map(Ke):e.constructor!==void 0?null:T({},e)}function Ct(e,t,n,s,o,i,r,d,u){var c,f,g,l,p,m,k,b=n.props||te,w=t.props,h=t.type;if(h=="svg"?o="http://www.w3.org/2000/svg":h=="math"?o="http://www.w3.org/1998/Math/MathML":o||(o="http://www.w3.org/1999/xhtml"),i!=null){for(c=0;c<i.length;c++)if((p=i[c])&&"setAttribute"in p==!!h&&(h?p.localName==h:p.nodeType==3)){e=p,i[c]=null;break}}if(e==null){if(h==null)return document.createTextNode(w);e=document.createElementNS(o,h,w.is&&w),d&&(y.__m&&y.__m(t,i),d=!1),i=null}if(h==null)b===w||d&&e.data==w||(e.data=w);else{if(i=h=="textarea"&&w.defaultValue!=null?null:i&&ie.call(e.childNodes),!d&&i!=null)for(b={},c=0;c<e.attributes.length;c++)b[(p=e.attributes[c]).name]=p.value;for(c in b)p=b[c],c=="dangerouslySetInnerHTML"?g=p:c=="children"||c in w||c=="value"&&"defaultValue"in w||c=="checked"&&"defaultChecked"in w||z(e,c,null,p,o);for(c in w)p=w[c],c=="children"?l=p:c=="dangerouslySetInnerHTML"?f=p:c=="value"?m=p:c=="checked"?k=p:d&&typeof p!="function"||b[c]===p||z(e,c,p,b[c],o);if(f)d||g&&(f.__html==g.__html||f.__html==e.innerHTML)||(e.innerHTML=f.__html),t.__k=[];else if(g&&(e.innerHTML=""),Ve(t.type=="template"?e.content:e,oe(l)?l:[l],t,n,s,h=="foreignObject"?"http://www.w3.org/1999/xhtml":o,i,r,i?i[0]:n.__k&&I(n,0),d,u),i!=null)for(c=i.length;c--;)he(i[c]);d&&h!="textarea"||(c="value",h=="progress"&&m==null?e.removeAttribute("value"):m!=null&&(m!==e[c]||h=="progress"&&!m||h=="option"&&m!=b[c])&&z(e,c,m,b[c],o),c="checked",k!=null&&k!=e[c]&&z(e,c,k,b[c],o))}return e}function ye(e,t,n){try{if(typeof e=="function"){var s=typeof e.__u=="function";s&&e.__u(),s&&t==null||(e.__u=e(t))}else e.current=t}catch(o){y.__e(o,n)}}function Be(e,t,n){var s,o;if(y.unmount&&y.unmount(e),(s=e.ref)&&(s.current&&s.current!=e.__e||ye(s,null,t)),(s=e.__c)!=null){if(s.componentWillUnmount)try{s.componentWillUnmount()}catch(i){y.__e(i,t)}s.base=s.__P=s.__n=null}if(s=e.__k)for(o=0;o<s.length;o++)s[o]&&Be(s[o],t,n||typeof e.type!="function");n||he(e.__e),e.__c=e.__=e.__e=void 0}function Pt(e,t,n){return this.constructor(e,n)}function Ge(e,t,n){var s,o,i,r;t==document&&(t=document.documentElement),y.__&&y.__(e,t),o=(s=typeof n=="function")?null:n&&n.__k||t.__k,i=[],r=[],ge(t,e=(!s&&n||t).__k=Lt(L,null,[e]),o||te,te,t.namespaceURI,!s&&n?[n]:o?null:t.firstChild?ie.call(t.childNodes):null,i,!s&&n?n:o?o.__e:t.firstChild,s,r),Ye(i,e,r),e.props.children=null}ie=ne.slice,y={__e:function(e,t,n,s){for(var o,i,r;t=t.__;)if((o=t.__c)&&!o.__)try{if((i=o.constructor)&&i.getDerivedStateFromError!=null&&(o.setState(i.getDerivedStateFromError(e)),r=o.__d),o.componentDidCatch!=null&&(o.componentDidCatch(e,s||{}),r=o.__d),r)return o.__E=o}catch(d){e=d}throw e}},Fe=0,vt=function(e){return e!=null&&e.constructor===void 0},ee.prototype.setState=function(e,t){var n;n=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=T({},this.state),typeof e=="function"&&(e=e(T({},n),this.props)),e&&T(n,e),e!=null&&this.__v&&(t&&this._sb.push(t),Ie(this))},ee.prototype.forceUpdate=function(e){this.__v&&(this.__e=!0,e&&this.__h.push(e),Ie(this))},ee.prototype.render=L,A=[],Ue=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,Me=function(e,t){return e.__v.__b-t.__v.__b},se.__r=0,ue=Math.random().toString(8),J="__d"+ue,V="__a"+ue,He=/(PointerCapture)$|Capture$/i,me=0,pe=De(!1),fe=De(!0),xt=0;function be(e){return e.how==="dismissed"||e.how==="expired"||e.how==="claude"?!0:e.how==="update"&&/^(no longer applies|replaced|superseded|moot)/i.test(e.outcome)}function O(e){let t=Math.round(e/6e4);if(t<1)return"just now";if(t<60)return`${t}m ago`;let n=Math.round(t/60);return n<48?`${n}h ago`:`${Math.round(n/24)}d ago`}function Qe(e,t){return e.length>t?`${e.slice(0,t-1)}\\u2026`:e}function Nt(e){return e.replace(/\\/+$/,"").split("/").pop()??e}var It="This changed before your press. Nothing was sent.";function j(e){return e==="sample"?"Sample entry: nothing was sent.":It}function Ot(e,t){switch(t.kind){case"run":return{kind:"send",text:Ft.run(e,t.command),by:{id:e.id,action:"run"}};case"open":return{kind:"open",target:t.path,name:Nt(t.path)};case"link":return{kind:"open",target:t.url,name:t.name??t.url};case"copy":return{kind:"copy",text:t.text,name:t.name??"snippet",isCommand:!1};case"terminal":return{kind:"copy",text:t.command,name:t.name??Qe(t.command,32),isCommand:!0}}}function Xe(e,t){return t.step.map(n=>Ot(e,n))}function ze(e,t){return{state:"pending",parts:e.flatMap(n=>n.kind==="send"?[]:[{kind:n.kind,name:n.name,isCommand:n.kind==="copy"&&n.isCommand,error:null}]),at:t}}function Dt(e){return[`${e.kind==="issue"?"Issue":"Opportunity"}: ${e.title}`,e.detail,...e.path?[`File: ${e.path}`]:[]]}var Ft={answer:(e,t)=>`Re "${e.ask}": ${t}`,explain:e=>{let t=e.kind==="task"?"this task you left for me":"this question you asked me",n=e.options.length>0?`\nOptions: ${e.options.join(" / ")}`:"";return`Remind me what ${t} is about: why it came up, and what each choice would mean. Don\'t act on it yet.\n"${e.ask}"${n}`},run:(e,t)=>`For "${e.ask}", run this:\n\\`\\`\\`\n${t}\n\\`\\`\\``,taskReply:(e,t)=>`Re the task you left for me, "${e.ask}": ${t}`,finding:(e,t,n="")=>[t==="address"?"Please address this finding you recorded:":t==="discuss"?"Let\'s talk through this finding you recorded before changing anything:":"About this finding you recorded:",...Dt(e),...t==="typed"?["",n]:[]].join(`\n`)};var Ut=3,R=5120;function ke(e,t){return e.filter(n=>!t.has(n.id)).slice(0,Ut)}function re(e){return e?.is==="notSent"||e?.is==="local"&&e.result.state==="failed"}function Je(e){return e.is==="done"||e.is==="queued"}var Mt={terminal:"Run it in a terminal, or type ! and paste.",desktop:"Run it in Terminal.",html:"Run it in Terminal."},_e={open:{pending:"Opening",done:"Opened",failed:"open"},copy:{pending:"Copying",done:"Copied",failed:"copy"}};function Ht(e,t){let s=e.parts.length>1&&e.parts.every(r=>r.kind==="open"&&r.error===null&&/^PR #\\d+$/.test(r.name))?[{...e.parts[0],name:`${e.parts.length} PRs`}]:e.parts;if(e.state==="pending")return`${s.map(r=>`${_e[r.kind].pending} ${r.name}`).join(" \\xB7 ")}\\u2026`;let o=s.map(r=>r.error===null?`${_e[r.kind].done} ${r.name}`:`Could not ${_e[r.kind].failed} ${r.name}: ${r.error}`).join(" \\xB7 ");if(e.state==="failed")return o;let i=s.some(r=>r.kind==="copy"&&r.isCommand);return`\\u2713 ${o}${i?`. ${Mt[t]}`:""}`}function we(e,t){return e.is==="note"?j(e.note):e.is==="local"?Ht(e.result,t):e.is==="queued"?`Queued: ${e.label}`:e.is==="notSent"?`Not sent: ${e.reason}`:`\\u2713 ${e.label}`}var ve=3e3,Tn=R+2*ve;function Ze(e){return[...e.needsYou.questions,...e.needsYou.tasks,...e.findings.rows].filter(t=>t.state.is==="settled").map(t=>t.id)}function et(e,t,n){return new Map(t.map(s=>[s,e.get(s)??n]))}function ae(e,t){return new Set([...e].filter(([,n])=>t-n<R).map(([n])=>n))}var qt=0;function a(e,t,n,s,o,i){t||(t={});var r,d,u=t;if("ref"in u)for(d in u={},t)d=="ref"?r=t[d]:u[d]=t[d];var c={type:e,props:u,key:n,ref:r,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--qt,__i:-1,__u:0,__source:o,__self:i};if(typeof e=="function"&&(r=e.defaultProps))for(d in r)u[d]===void 0&&(u[d]=r[d]);return y.vnode&&y.vnode(c),c}var tt=[..."abcfghilm"],ct=[{id:"needsYou",label:"Needs you",hotkey:"1"},{id:"findings",label:"Findings",hotkey:"2"}],v=null,F=!1,B=!1,D="needsYou",G={needsYou:null,findings:null},P=null,$e=!1,Y=new Map,M=new Set,nt=new Set,xe=new Set,K=new Map,E=new Map,Le=new Map,Q=new Map,le=null,C=new Map,Te=0,st=0,Re=!1,Vt=0,de=new Map;function ut(e,t){return new Promise((n,s)=>{let o=++Vt;de.set(o,{resolve:n,reject:s}),parent.postMessage({jsonrpc:"2.0",id:o,method:e,params:t},"*")})}window.addEventListener("message",e=>{let t=e.data;if(!(!t||t.jsonrpc!=="2.0")){if(t.id!=null&&!t.method&&de.has(t.id)){let n=de.get(t.id);de.delete(t.id),t.error?n.reject(t.error):n.resolve(t.result);return}t.method==="ui/notifications/host-context-changed"&&pt(t.params??{}),t.id!=null&&t.method&&parent.postMessage({jsonrpc:"2.0",id:t.id,result:{}},"*")}});function pt(e){e.theme&&(document.documentElement.dataset.theme=e.theme);for(let[t,n]of Object.entries(e.styles?.variables??{}))document.documentElement.style.setProperty(t,n)}async function Ce(e,t={}){return(await ut("tools/call",{name:e,arguments:t}))?.structuredContent}function Pe(e,t){if(t<st)return;st=t,B=!1;let n=C;C=et(C,Ze(e),Date.now()),[...C.keys()].some(s=>!n.has(s))&&setTimeout(_,R+50),v=e,_()}async function ft(){if(!Re){let e=++Te;try{let t=await Ce("inbox_view",{demo:F});t&&Pe(t,e)}catch{B=!0,_()}}setTimeout(ft,ve)}function jt(e,t){return[...e.needsYou.questions,...e.needsYou.tasks,...e.findings.rows].some(n=>n.id===t&&n.state.is!=="settled")}function Wt(e,t){return[...e.needsYou.questions,...e.needsYou.tasks,...e.findings.rows].some(n=>n.id===t&&n.feedback?.is==="notSent")}async function S(e,t,n,s="Sending\\u2026"){K.set(e,s),E.delete(e),Le.delete(e),Q.delete(e),_(),Re=!0;let o=++Te;try{let i=await Ce("inbox_press",{press:t,thread:v?.thread,demo:F});i?.copy&&await Yt(e,i.copy),i?.view&&Pe(i.view,o),i?.error&&!(v&&Wt(v,e))&&E.set(e,i.error),!i?.error&&i?.note!=="stale"&&n?.(),i?.note&&v&&jt(v,e)?(Le.set(e,{text:j(i.note),at:Date.now()}),setTimeout(_,R+50),i.note==="stale"&&t.action==="type"&&(P=e)):i?.note&&(le={text:j(i.note),at:Date.now()},setTimeout(_,R+50))}catch{E.set(e,"Not sent: the inbox did not answer.")}finally{Re=!1,K.delete(e),_()}}async function Yt(e,t){try{await navigator.clipboard.writeText(t.text)}catch{E.set(e,`Could not copy ${t.name}: this tab has no clipboard access`),Q.set(e,t)}}function Kt(e){return e.charAt(0).toUpperCase()+e.slice(1)}function Bt(e){P=e,$e=!0,_()}function mt(e){let{id:t,item:n}=e,s=e.actions.filter(g=>nt.has(t)||!g.isFolded),o=e.actions.length-s.length,i=s.map(g=>g.press.action).lastIndexOf("answer"),r=[],d=[],u=e.feedback?.is==="notSent"?e.feedback.retry:null;u&&r.push({label:"Try again",run:()=>{S(t,u)}});let c=0,f=()=>c<tt.length?{hotkey:tt[c++]}:{};for(let[g,l]of s.entries()){let p=l.press,m=l.label;if(p.action==="answer"&&n)r.push({...f(),label:m,isPrimary:l.isPrimary,run:()=>{S(t,p)}}),g===i&&o>0&&r.push({label:`All ${n.options.length} options`,run:()=>{nt.add(t),_()}});else if(p.action==="step"){let k=e.steps[p.step],b=l.kind==="local"&&n&&k?we({is:"local",result:ze(Xe(n,k),Date.now())},"html"):void 0;r.push({...f(),label:m,run:()=>{S(t,p,void 0,b)}})}else p.action==="done"?r.push({hotkey:"d",label:m,run:()=>{S(t,p)}}):p.action==="address"?r.push({hotkey:"a",label:m,run:()=>{S(t,p)}}):p.action==="type"?d.push({hotkey:"t",label:m,run:()=>Bt(t)}):p.action==="explain"||p.action==="discuss"?d.push({hotkey:"e",label:m,run:()=>{S(t,p)}}):p.action==="dismiss"&&d.push({hotkey:"x",label:m,run:()=>{S(t,p)}})}return{keys:r,more:d}}function Gt(e,t,n){let s=n.kind==="question",o=t.state.is==="handedOff",i=n.id;return{id:i,handle:o?"\\u2713":t.handle,handleTone:o?"done":void 0,...o?{fold:{}}:{},title:n.ask,titleAfter:n.at===null?void 0:` \\xB7 ${O(e.at-n.at)}`,hasSecondLine:s,...mt(t),typing:{hint:s?"Your answer":"Your reply to Codex",send:r=>{S(i,{action:"type",id:i,text:r},()=>Y.delete(i))}},feedback:t.feedback}}var Qt={issue:{label:"Issue",mark:"\\u25B2",tone:"needsYou"},opportunity:{label:"Opportunity",mark:"\\u2726",tone:"done"}};function Xt(e,t,n){let s=Qt[n.kind],o=t.state.is==="handedOff",i=n.id;return{id:i,handle:o?"\\u2713":t.handle,handleTone:o?"done":void 0,...o?{fold:{}}:{},title:n.title,meta:a("div",{children:[a("span",{class:`tone-${s.tone}`,children:[s.mark," ",s.label]}),a("span",{class:"muted",children:[" ",O(e.at-n.at)]})]}),line:{text:n.title,after:` \\xB7 ${O(e.at-n.at)}`},body:a("div",{children:[a("p",{children:n.detail}),n.path?a("p",{children:[a("span",{class:"muted",children:"Relevant file: "}),n.path]}):null]}),...mt(t),typing:{hint:"Your reply to Codex",send:r=>{S(i,{action:"type",id:i,text:r},()=>Y.delete(i))}},feedback:t.feedback}}function Ae(e,t){let n=d=>d.flatMap(u=>u.state.is==="settled"?t.has(u.id)?[{settled:u,state:u.state}]:[]:u.item?[{row:Gt(e,u,u.item)}]:u.finding?[{row:Xt(e,u,u.finding)}]:[]),s=d=>d.flatMap(u=>"row"in u?[u.row]:[]),o=n(e.needsYou.questions),i=n(e.needsYou.tasks),r=n(e.findings.rows);return{questions:o,tasks:i,findings:r,byTab:{needsYou:[...s(o),...s(i)],findings:s(r)}}}function ht(e){return new Set(e.flatMap(t=>"settled"in t?[t.settled.id]:[]))}function zt(e){let t=e.type==="finding"?"findings":"needsYou";S(e.id,{action:"undo",id:e.id},()=>{let n=v?Ae(v,ae(C,Date.now())).byTab[t]:[];G[t]={id:e.id,index:Math.max(0,n.findIndex(s=>s.id===e.id))}})}function gt(e,t){let n=G[t];if(!n)return e.length>0?0:-1;let s=e.findIndex(o=>o.id===n.id);return s>=0?s:Math.min(n.index,e.length-1)}function yt(e,t,n){let s=t[n];s&&(G[e]={id:s.id,index:n},_())}function bt(e){let t={hotkey:"v",label:M.has(e.id)?"Hide details":"Details",run:()=>{M.has(e.id)?M.delete(e.id):M.add(e.id),_()}};return e.fold&&!M.has(e.id)?{keys:[t],more:[]}:e.fold?{keys:e.keys,more:[...e.more,t]}:{keys:e.keys,more:e.more}}function it({k:e}){return a("button",{type:"button",class:e.isPrimary?"key primary":"key",onClick:e.run,children:[e.hotkey?a(L,{children:[a("kbd",{children:e.hotkey}),":"," "]}):null,e.label]})}function Jt({row:e}){let t=e.typing;return a("form",{onSubmit:s=>{s.preventDefault();let o=(Y.get(e.id)??"").trim();o&&(P=null,t.send(o))},children:[a("input",{id:`type-${e.id}`,value:Y.get(e.id)??"",placeholder:t.hint,"aria-label":t.hint,onInput:s=>Y.set(e.id,s.currentTarget.value)}),a("button",{type:"submit",class:"key",children:[a("kbd",{children:"\\u21B5"}),": Send"]}),a("button",{type:"button",class:"key",onClick:()=>{P=null,_()},children:[a("kbd",{children:"esc"}),": Cancel"]})]})}function ot(e){let t=e.feedback;return t?t.is==="done"&&e.handleTone==="done"?t.label:we(t,"html"):null}function rt(e,t){let n=e.feedback;return n?Je(n)?`${ot(e)} \\xB7 ${O(t-n.at)}`:ot(e):null}function _t(e){let t=Le.get(e);return t&&Date.now()-t.at<R?t.text:null}function at(e){return!E.has(e.id)&&_t(e.id)===null&&!Q.has(e.id)}function Zt({row:e,isSelected:t,onSelect:n,now:s}){let o=e.handleTone==="done"&&e.feedback?.is!=="queued"?"tone-done":"muted",i=a("span",{class:`mark ${e.handleTone??""}`,children:e.handle});if(!t){let m=e.line??{text:e.title,after:e.titleAfter},k=at(e)?rt(e,s):null,b=k?{...m,after:` \\xB7 ${k}`,afterTone:re(e.feedback)?"error":e.handleTone==="done"&&e.feedback?.is==="done"?"done":void 0}:m;return a("div",{class:"row",children:[i,a("button",{type:"button",class:"line",onClick:n,children:[a("span",{class:e.hasSecondLine?"text two":"text",children:b.text}),b.after?a("span",{class:`after ${b.afterTone?`tone-${b.afterTone}`:""}`,children:b.after}):null]})]})}let r=!e.fold||M.has(e.id),{keys:d,more:u}=bt(e),c=at(e)?rt(e,s):null,f=[e.fold?.note,re(e.feedback)?null:c],g=re(e.feedback)?c:null,l=Q.get(e.id),p=_t(e.id);return a("div",{class:"row selected",children:[i,a("div",{class:"content",children:[a("div",{class:"tight",children:[e.meta?a("div",{class:"meta",children:e.meta}):null,a("div",{class:"title",children:[e.title,e.titleAfter?a("span",{class:"after",children:e.titleAfter}):null]})]}),r&&e.body?a("div",{class:"body",children:e.body}):null,f.some(Boolean)||g||K.has(e.id)||p||E.has(e.id)?a("div",{class:"tight",children:[f.filter(Boolean).map(m=>a("div",{class:o,children:m})),g?a("div",{class:"tone-error",children:g}):null,K.has(e.id)?a("div",{class:"muted",children:K.get(e.id)}):null,p?a("div",{class:"muted",children:p}):null,E.has(e.id)?a("div",{class:"tone-error",children:E.get(e.id)}):null]}):null,a("div",{class:"keys",children:[d.map(m=>a(it,{k:m})),d.length>0&&u.length>0?a("span",{class:"key-dot",children:"\\xB7"}):null,u.map(m=>a(it,{k:m}))]}),e.typing&&P===e.id?a(Jt,{row:e}):null,l?a("div",{children:[a("div",{class:"muted",children:["Copy ",l.name," from here:"]}),a("textarea",{rows:3,readOnly:!0,value:l.text,onFocus:m=>m.currentTarget.select()}),a("button",{type:"button",class:"key",onClick:()=>{Q.delete(e.id),_()},children:"Close"})]}):null]})]})}function en({settled:e,state:t}){let n=C.get(e.id)??Date.now();return a("div",{class:"row settled",children:[a("span",{class:"mark done",children:t.isQueued?"":"\\u2713"}),a("div",{class:"content tight",children:[a("div",{class:"what",children:e.title}),a("div",{children:[a("span",{class:t.isQueued?"muted":"tone-done",children:t.isQueued?`Queued: ${t.label}`:t.label}),t.canUndo?a("button",{type:"button",class:"key",onClick:()=>zt(e),children:"Undo"}):null]}),a("div",{class:"leave",children:a("div",{style:{animationDuration:`${R}ms`},ref:s=>{s&&!s.style.animationDelay&&(s.style.animationDelay=`-${Math.max(0,Date.now()-n)}ms`)}})})]})]})}function kt({entries:e,group:t,all:n,now:s}){let o=t==="finding"?"findings":"needsYou",i=gt(n,o);return e.length===0?null:a("div",{class:t==="finding"?"flat":"tree",children:e.map(r=>"row"in r?a("div",{class:"entry",children:a(Zt,{row:r.row,now:s,isSelected:n.indexOf(r.row)===i,onSelect:()=>yt(o,n,n.indexOf(r.row))})},r.row.id):a("div",{class:"entry",children:a(en,{settled:r.settled,state:r.state})},`settled-${r.settled.id}`))})}function tn({title:e,count:t}){return a("div",{class:"group-title",children:[e,t>0?a("span",{class:"count",children:t}):null]})}function Se(e,t,n){return ke(e.needsYou.closed[t==="question"?"questions":"tasks"],ht(n)).map(s=>({id:s.id,ask:s.ask,outcome:s.outcome,isLapsed:be(s),at:s.at}))}function lt({v:e,kind:t,entries:n,all:s,now:o}){let i=t==="question"?"Questions":"Tasks",r=Se(e,t,n);if(n.length===0&&r.length===0)return null;let d=n.flatMap(u=>"row"in u?[u.row]:[]);return a("section",{children:[a(tn,{title:i,count:d.filter(u=>!u.fold).length}),a(kt,{entries:n,group:t,all:s,now:o}),a(wt,{group:t,closed:r,now:o})]})}function wt({group:e,closed:t,now:n}){if(t.length===0)return null;let s=xe.has(e);return a(L,{children:[a("button",{type:"button",class:"fold",onClick:()=>{s?xe.delete(e):xe.add(e),_()},children:[a("span",{class:"fold-mark",children:s?"\\u25BE":"\\u25B8"}),t.length," Closed"]}),s?a("div",{class:"tree closed-tree",children:t.map(o=>a("div",{class:"entry",children:a("div",{class:"row",children:[a("span",{class:"mark",children:"\\u25C7"}),a("div",{class:"content tight",children:[a("div",{class:"muted",children:o.ask}),a("div",{children:[a("span",{class:o.isLapsed?"outcome lapsed":"outcome",children:Kt(o.outcome)}),a("span",{class:"muted",children:[" \\xB7 ",O(n-o.at)]})]})]})]})},`closed-${o.id}`))}):null]})}function nn({v:e,lists:t,now:n}){let s=t.byTab.needsYou,o=t.questions.length===0&&t.tasks.length===0,i=Se(e,"question",t.questions).length>0||Se(e,"task",t.tasks).length>0;return o&&!i?a("div",{class:"empty",children:a("div",{class:"title",children:"Nothing needs you."})}):a("main",{children:[o?a("section",{children:a("div",{class:"group-title empty-line",children:"Nothing needs you."})}):null,a(lt,{v:e,kind:"question",entries:t.questions,all:s,now:n}),a(lt,{v:e,kind:"task",entries:t.tasks,all:s,now:n})]})}function sn({v:e,lists:t,now:n}){let s=ke(e.findings.closed,ht(t.findings)).map(i=>({id:i.id,ask:i.title,outcome:i.outcome,isLapsed:be(i),at:i.closedAt})),o=t.findings.length===0;return o&&s.length===0?a("div",{class:"empty",children:[a("div",{class:"title",children:"No findings yet"}),a("div",{class:"muted",children:"Codex flags issues and opportunities it spots beyond your task."})]}):a("main",{children:a("section",{children:[o?a("div",{class:"group-title empty-line",children:"No open findings."}):null,a(kt,{entries:t.findings,group:"finding",all:t.byTab.findings,now:n}),a(wt,{group:"finding",closed:s,now:n})]})})}function on({v:e,now:t}){let n={needsYou:e.needsYou.count,findings:e.findings.count},{changedAt:s,isUpdating:o,error:i}=e.status,r=o?"Updating\\u2026":s!==null?`Updated ${O(t-s)}`:"Not updated yet";return a("nav",{children:[a("div",{class:"tabs",children:ct.map(d=>a("button",{type:"button",class:`tab ${D===d.id?"shown":""}`,onClick:()=>{D=d.id,_()},children:[d.label,n[d.id]>0?a("span",{class:`count tone-${d.id}`,children:n[d.id]}):null]}))}),a("div",{class:"status",children:[r,i?a("div",{class:"tone-error",children:i}):null,le&&Date.now()-le.at<R?a("div",{class:"muted",children:le.text}):null]})]})}async function dt(){F=!F,v=null,C=new Map,G.needsYou=null,G.findings=null,P=null;let e=++Te;_();try{let t=await Ce("inbox_view",{demo:F});t&&Pe(t,e)}catch{B=!0,_()}}function rn(){if(!v)return a("div",{class:"notice",children:B?"Could not read the inbox.":a("span",{class:"muted",children:"Loading\\u2026"})});let e=v,t=e.at,n=Ae(e,ae(C,Date.now()));return a(L,{children:[B?a("div",{class:"notice",children:"Could not read the inbox."}):null,F?a("div",{class:"demo-note",children:[a("span",{children:"Showing sample entries. Presses here send nothing."}),a("button",{type:"button",class:"key",onClick:()=>{dt()},children:"Hide demo"})]}):null,a(on,{v:e,now:t}),D==="needsYou"?a(nn,{v:e,lists:n,now:t}):a(sn,{v:e,lists:n,now:t}),a("footer",{children:[a("span",{children:[a("kbd",{children:"1 2"}),"Switch tabs",a("span",{class:"sep",children:"\\xB7"}),a("kbd",{children:"j k"}),"Select the next or previous row"]}),F?null:a("button",{type:"button",class:"demo-toggle",onClick:()=>{dt()},children:"Show demo"})]})]})}var W=document.getElementById("app");function _(){W.className&&(W.className="",W.textContent=""),Ge(a(rn,{}),W),$e&&P&&($e=!1,document.getElementById(`type-${P}`)?.focus())}document.addEventListener("keydown",e=>{if(e.metaKey||e.ctrlKey||e.altKey||!v)return;let t=e.target;if(t?.closest("input, textarea")){e.key==="Escape"&&t.tagName==="INPUT"&&(P=null,_());return}let n=ct.find(f=>f.hotkey===e.key);if(n){D=n.id,_();return}let s=Ae(v,ae(C,Date.now())).byTab[D],o=gt(s,D),i=e.key==="j"||e.key==="ArrowDown"?1:e.key==="k"||e.key==="ArrowUp"?-1:0;if(i!==0){e.preventDefault(),yt(D,s,Math.max(0,Math.min(s.length-1,o+i))),document.querySelector(".row.selected")?.scrollIntoView({block:"nearest"});return}let r=s[o];if(!r)return;let{keys:d,more:u}=bt(r),c=[...d,...u].find(f=>f.hotkey===e.key);c&&(e.preventDefault(),c.run())});ut("ui/initialize",{protocolVersion:"2026-01-26",appInfo:{name:"inbox",version:"0.1.0"},appCapabilities:{tools:{}}}).then(e=>{pt(e?.hostContext??{}),parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/initialized",params:{}},"*"),ft()}).catch(()=>{W.textContent="The inbox could not connect to Codex."});})();\n\n    </script>\n  </body>\n</html>\n';

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
