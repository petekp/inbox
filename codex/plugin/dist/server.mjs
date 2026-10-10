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
function isLapsed(d) {
  if (d.how === "dismissed" || d.how === "expired" || d.how === "claude") return true;
  return d.how === "update" && /^(no longer applies|replaced|superseded|moot)/i.test(d.outcome);
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
        // Dismissed, expired or closed by the agent: drawn muted, as the Closed fold draws it.
        isLapsed: isLapsed(closed2),
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
var PRESS_TIMEOUT_MS = 6e4;
var SETTLE_WINDOW_MS = SETTLED_MS + 2 * POLL_MS;

// src/texts.ts
var CODEX = {
  agent: "Codex",
  surface: "the Inbox tab",
  band: null,
  findingsIn: "the Findings section of the Inbox tab"
};
var INBOX_DESCRIPTION = "What waits on the user in this conversation: open questions, tasks and findings, as text. Call it only when the user asks to see the inbox or what waits on them. It does not open the Inbox tab; the user opens that from the side panel.";
var VIEW_DESCRIPTION = "For the Inbox tab only: what the tab shows for this conversation, or its demo. Do not call it; to tell the user what waits on them, call inbox.";
function inboxToolText(v) {
  const isOpen = (r) => r.state.is === "open";
  const groups = [
    ["Questions:", v.needsYou.questions.filter(isOpen)],
    ["Tasks:", v.needsYou.tasks.filter(isOpen)],
    ["Findings:", v.findings.rows.filter(isOpen)]
  ];
  const needs = v.needsYou.count;
  const findings = v.findings.count;
  if (needs === 0 && findings === 0) return "Nothing waits on the user.";
  const counts = [
    needs > 0 ? `${needs} ${needs === 1 ? "waits" : "wait"} on the user` : null,
    findings > 0 ? findings === 1 ? "1 finding" : `${findings} findings` : null
  ].filter((x) => x !== null);
  const out = [counts.join(" \xB7 ")];
  for (const [title, rows] of groups) {
    if (rows.length === 0) continue;
    out.push(title);
    for (const r of rows) out.push(rowLine(r));
  }
  out.push("Open the Inbox tab to act on these.");
  return out.join("\n");
}
function rowLine(r) {
  if (r.finding) return `${r.handle} [${r.id}] ${r.finding.kind}: ${r.title}`;
  const item = r.item;
  const options = item && item.options.length > 0 ? `; options: ${item.options.join(" / ")}` : "";
  const rec = item?.rec ? `; recommended: ${item.rec}` : "";
  return `${r.handle} [${r.id}] "${r.title}"${options}${rec}`;
}

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
function withoutStalePending(lastActions, now) {
  const isStale = (last) => last.result?.state === "pending" && now - last.result.at > PRESS_TIMEOUT_MS;
  return Object.fromEntries(
    Object.entries(lastActions).map(([id, last]) => {
      if (!isStale(last)) return [id, last];
      const { result: _result, ...rest } = last;
      return [id, rest];
    })
  );
}
function viewOf(s, now) {
  const l = s.ledger;
  const lastActions = withoutStalePending(s.lastActions, now);
  const update = {
    isUpdating: s.presence.isUpdating || s.pending.length > 0,
    isFailed: s.presence.ledgerState === "failed",
    // applied() drops a failed exchange; nothing reruns it.
    retries: false
  };
  return {
    ...inboxView({
      ledger: l,
      lastActions,
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
    done: l.card?.done ?? [],
    running: l.card?.running ?? [],
    lastActions,
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
  // No resourceUri: Codex mounts every model-called MCP App inline in the transcript.
  { name: "inbox", description: INBOX_DESCRIPTION, inputSchema: { type: "object", properties: {} } },
  {
    // The side panel names the tab from this title. Entrypoints ignore `visibility`, so the tab still opens.
    name: "inbox_view",
    title: "Inbox",
    description: VIEW_DESCRIPTION,
    inputSchema: { type: "object", properties: { demo: { type: "boolean" } } },
    _meta: {
      ui: { resourceUri: TAB_URI, visibility: ["app"] },
      "openai/ui": { entrypoints: [{ type: "thread" }] }
    }
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
        return text(inboxToolText(viewOf(s, now())));
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
var tab_default = '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>Inbox</title>\n    <style>\n      /* The host\'s variables when Codex passes them; otherwise the pane\'s own colors. */\n      :root {\n        color-scheme: light;\n        --bg: var(--color-background-primary, #ffffff);\n        --text: var(--color-text-primary, #1f1f1f);\n        --muted: var(--color-text-secondary, #595959);\n        --key: #243bf5;\n        --needs-you: #745417;\n        --findings: #7b00e8;\n        --done: #25652f;\n        --error: #a5293d;\n        --error-mark: #a5293d;\n        --sans: var(--font-sans, -apple-system, system-ui, sans-serif);\n        --mono: var(--font-mono, ui-monospace, \'SF Mono\', Menlo, monospace);\n        /* Surfaces are mixed from the host\'s colors, so they follow its theme. */\n        --card: color-mix(in srgb, var(--text) 4.5%, var(--bg));\n        --raised: color-mix(in srgb, var(--text) 9%, var(--bg));\n        --selected: color-mix(in srgb, #4c9aff 20%, var(--card));\n        --divider: color-mix(in srgb, var(--text) 9%, var(--bg));\n        --hover: color-mix(in srgb, var(--key) 14%, transparent);\n        /* Codex\'s gray button fills: the foreground at 8% and 12% in light, 12% and 16% in dark. */\n        --soft: color-mix(in oklab, var(--text) 8%, transparent);\n        --soft-hover: color-mix(in oklab, var(--text) 12%, transparent);\n        /* The Codex app\'s timing: --transition-duration-basic with ease, --cubic-move, --cubic-enter, --ease-spring-snappy. */\n        --quick: 150ms ease;\n        --move: 200ms cubic-bezier(0.65, 0, 0.35, 1);\n        --enter: 300ms cubic-bezier(0.19, 1, 0.22, 1);\n        --spring: 300ms\n          linear(\n            0,\n            0.086,\n            0.2539,\n            0.428,\n            0.5786,\n            0.698,\n            0.7879,\n            0.8534,\n            0.8998,\n            0.9323,\n            0.9546,\n            0.9697,\n            0.98,\n            0.9868,\n            0.9913,\n            0.9943,\n            0.9963,\n            0.9976,\n            0.9985,\n            1\n          );\n        /* Where a row\'s mark sits, and where its text starts. */\n        --mark-x: 18px;\n        --text-x: 40px;\n      }\n      @media (prefers-color-scheme: dark) {\n        :root:not([data-theme=\'light\']) {\n          color-scheme: dark;\n          --bg: var(--color-background-primary, #171717);\n          --text: var(--color-text-primary, #ececec);\n          --muted: var(--color-text-secondary, #a8a8a8);\n          --key: #b1b9f9;\n          --needs-you: #ffc107;\n          --findings: #cab0ff;\n          --done: #7ecd8f;\n          --error: #ffa3b0;\n          --error-mark: #ff6b80;\n          --card: color-mix(in srgb, var(--text) 5.5%, var(--bg));\n          --raised: color-mix(in srgb, var(--text) 11%, var(--bg));\n          --selected: color-mix(in srgb, #7fa6d9 15%, var(--card));\n          --divider: color-mix(in srgb, var(--text) 8%, var(--bg));\n          --soft: color-mix(in oklab, var(--text) 12%, transparent);\n          --soft-hover: color-mix(in oklab, var(--text) 16%, transparent);\n        }\n      }\n      :root[data-theme=\'dark\'] {\n        color-scheme: dark;\n        --key: #b1b9f9;\n        --needs-you: #ffc107;\n        --findings: #cab0ff;\n        --done: #7ecd8f;\n        --error: #ffa3b0;\n        --error-mark: #ff6b80;\n        --card: color-mix(in srgb, var(--text) 5.5%, var(--bg));\n        --raised: color-mix(in srgb, var(--text) 11%, var(--bg));\n        --selected: color-mix(in srgb, #7fa6d9 15%, var(--card));\n        --divider: color-mix(in srgb, var(--text) 8%, var(--bg));\n        --soft: color-mix(in oklab, var(--text) 12%, transparent);\n        --soft-hover: color-mix(in oklab, var(--text) 16%, transparent);\n      }\n      * {\n        box-sizing: border-box;\n      }\n      body {\n        margin: 0;\n        background: var(--bg);\n        color: var(--text);\n        font: 13px/20px var(--sans);\n        -webkit-font-smoothing: antialiased;\n      }\n      button {\n        font: inherit;\n        color: inherit;\n        background: none;\n        border: none;\n        padding: 0;\n        cursor: pointer;\n        text-align: left;\n      }\n      :focus-visible {\n        outline: 1.5px solid var(--key);\n        outline-offset: 1px;\n        border-radius: 4px;\n      }\n      .muted {\n        color: var(--muted);\n      }\n      .tone-needsYou {\n        color: var(--needs-you);\n      }\n      .tone-findings {\n        color: var(--findings);\n      }\n      .tone-done {\n        color: var(--done);\n      }\n      .tone-error {\n        color: var(--error);\n      }\n      .notice {\n        padding: 10px 16px;\n        color: var(--error);\n        overflow-wrap: anywhere;\n      }\n      .notice .key {\n        color: var(--text);\n      }\n\n      /* Tabs: the shown one a raised panel, the others text on the background. */\n      nav {\n        display: flex;\n        flex-wrap: wrap;\n        align-items: center;\n        gap: 4px 16px;\n        padding: 12px 12px 0;\n      }\n      .tabs {\n        display: flex;\n        gap: 4px;\n      }\n      .tab {\n        padding: 6px 12px;\n        border-radius: 6px;\n        color: var(--muted);\n      }\n      .tab:hover {\n        color: var(--text);\n      }\n      .tab.shown {\n        background: var(--raised);\n        color: var(--text);\n        font-weight: 600;\n      }\n      .tab .count {\n        font-weight: 600;\n        margin-left: 6px;\n      }\n      .status {\n        margin-left: auto;\n        color: var(--muted);\n        font-size: 12px;\n      }\n      .status-line {\n        flex-basis: 100%;\n        padding: 0 4px;\n        font-size: 12px;\n        overflow-wrap: anywhere;\n      }\n\n      main {\n        display: flex;\n        flex-direction: column;\n        gap: 8px;\n        padding: 12px 12px 4px;\n      }\n      section {\n        background: var(--card);\n        border-radius: 8px;\n        padding: 10px 0;\n      }\n      .group-title {\n        padding: 0 14px 0 var(--mark-x);\n        font-weight: 500;\n      }\n      .group-title .count {\n        color: var(--muted);\n        margin-left: 6px;\n      }\n\n      /* Rows. A divider runs from the text column to the edge. */\n      .row {\n        display: flex;\n        padding: 6px 14px 6px var(--mark-x);\n      }\n      .entry + .entry > .row {\n        background-image: linear-gradient(var(--divider), var(--divider));\n        background-repeat: no-repeat;\n        background-size: calc(100% - var(--text-x)) 1px;\n        background-position: right top;\n      }\n      /* An open row keeps a closed row\'s padding, so its line does not move as it opens. */\n      .row.selected {\n        background-color: var(--selected);\n      }\n      /* A row that just appeared, in its tab\'s color. */\n      .row.new {\n        box-shadow: inset 3px 0 0 var(--bar);\n      }\n      .tone-bar-needsYou {\n        --bar: var(--needs-you);\n      }\n      .tone-bar-findings {\n        --bar: var(--findings);\n      }\n      /* Marks center in a badge\'s width, so a ?, a \u2022 and a number line up. */\n      .mark {\n        flex: none;\n        width: calc(var(--text-x) - var(--mark-x));\n        padding-right: 4px;\n        text-align: center;\n        color: var(--muted);\n      }\n      .mark .number {\n        display: inline-flex;\n        align-items: center;\n        justify-content: center;\n        min-width: 18px;\n        height: 18px;\n        padding: 0 5px;\n        border-radius: 999px;\n        background: var(--soft);\n        color: var(--text);\n        font-size: 11px;\n        font-weight: 500;\n        line-height: 1;\n        font-variant-numeric: tabular-nums;\n        vertical-align: 1px;\n      }\n      .mark.done {\n        color: var(--done);\n      }\n      .mark.issue {\n        color: var(--needs-you);\n      }\n      .mark.opportunity {\n        color: var(--done);\n      }\n      .mark.error {\n        color: var(--error-mark);\n      }\n      .content {\n        flex: 1;\n        min-width: 0;\n        display: flex;\n        flex-direction: column;\n      }\n      /* Its space above is padding, not a gap, so the row\'s height grows smoothly when the panel mounts. */\n      .panel {\n        display: flex;\n        flex-direction: column;\n        gap: 8px;\n        padding: 8px 0 6px;\n      }\n      .content > .tight,\n      .content.tight {\n        display: flex;\n        flex-direction: column;\n        gap: 0;\n      }\n      .line {\n        display: flex;\n        width: 100%;\n        min-width: 0;\n      }\n      .line .text {\n        min-width: 0;\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .line .text.two {\n        white-space: normal;\n        display: -webkit-box;\n        -webkit-line-clamp: 2;\n        -webkit-box-orient: vertical;\n      }\n      .line .after {\n        flex: none;\n        white-space: pre;\n        color: var(--muted);\n      }\n      .line .after.tone-done {\n        color: var(--done);\n      }\n      .row.collapsed {\n        cursor: pointer;\n      }\n      /* Open, and while closing, the title shows in full where it stood, with the age following its last word. */\n      .row.selected .line,\n      .row.closing .line {\n        display: block;\n      }\n      .row.selected .line {\n        cursor: default;\n      }\n      .row.selected .line .text,\n      .row.closing .line .text {\n        display: inline;\n        white-space: normal;\n      }\n      .row.selected .line .after,\n      .row.closing .line .after {\n        white-space: normal;\n      }\n      .row.collapsed:hover {\n        background-color: var(--soft);\n      }\n      .title {\n        font-weight: 600;\n      }\n      .title .after {\n        font-weight: 400;\n        color: var(--muted);\n      }\n      .meta {\n        font-size: 12px;\n      }\n      .body {\n        overflow-wrap: anywhere;\n      }\n      .body p {\n        margin: 0;\n      }\n      .body p + p {\n        margin-top: 4px;\n      }\n      /*\n       * Actions are Codex\'s own pill buttons, size sm: the recommended option is solid, the row\'s other\n       * answers are a soft gray fill, and the follow-ups are ghost buttons. Keys are an extra, so no key text shows.\n       */\n      .keys {\n        display: flex;\n        flex-wrap: wrap;\n        align-items: center;\n        gap: 6px;\n      }\n      .key {\n        min-height: 26px;\n        padding: 3px 11px;\n        border-radius: 999px;\n        background: var(--soft);\n        font-weight: 500;\n        text-align: center;\n        white-space: nowrap;\n      }\n      .key:not(:disabled):hover {\n        background: var(--soft-hover);\n      }\n      .key:focus-visible {\n        outline-width: 2px;\n        outline-offset: 2px;\n        border-radius: 999px;\n      }\n      .key.primary {\n        background: var(--text);\n        color: var(--bg);\n      }\n      .key.primary:not(:disabled):hover {\n        background: color-mix(in srgb, var(--text) 82%, var(--bg));\n      }\n      .key.ghost {\n        background: none;\n        color: var(--muted);\n      }\n      .key.ghost:not(:disabled):hover {\n        color: var(--text);\n      }\n      /* The ghost line\'s first label lines up with the text above it, as Codex aligns a leading ghost button. */\n      .keys.ghost-line {\n        margin-left: -11px;\n      }\n      /* The row just opened, so a click on its keys would be a double-click\'s second. Nothing dims: that read as a flicker. */\n      .key:disabled {\n        cursor: default;\n      }\n      .actions {\n        display: flex;\n        flex-direction: column;\n        gap: 4px;\n      }\n      form {\n        display: flex;\n        align-items: center;\n        gap: 6px;\n      }\n      input {\n        flex: 1;\n        min-width: 0;\n        min-height: 26px;\n        font: inherit;\n        color: inherit;\n        background: var(--bg);\n        border: 1px solid color-mix(in oklab, var(--text) 16%, transparent);\n        border-radius: 999px;\n        padding: 2px 11px;\n      }\n      input:focus {\n        outline: none;\n        border-color: var(--key);\n        border-radius: 999px;\n      }\n      textarea {\n        width: 100%;\n        font: 12px var(--mono);\n        color: inherit;\n        background: var(--bg);\n        border: 1px solid color-mix(in oklab, var(--text) 16%, transparent);\n        border-radius: 6px;\n      }\n\n      .empty-line {\n        color: var(--muted);\n      }\n      .fold {\n        display: block;\n        margin: 8px 0 0 calc(var(--mark-x) - 2px);\n        padding: 1px 4px;\n        border-radius: 5px;\n        color: var(--muted);\n      }\n      .fold:hover {\n        color: var(--text);\n      }\n      .fold-mark {\n        display: inline-block;\n        width: 14px;\n        transition: transform var(--move);\n      }\n      .fold-mark.open {\n        transform: rotate(90deg);\n      }\n      /* The closed items sit under the fold\'s label. */\n      .closed-list {\n        --mark-x: 34px;\n        --text-x: 56px;\n        padding-top: 4px;\n      }\n      .closed-list .entry + .entry > .row {\n        background-image: none;\n      }\n      .outcome {\n        font-weight: 600;\n      }\n      .outcome.lapsed {\n        font-weight: 400;\n        color: var(--muted);\n      }\n      .row.settled {\n        position: relative;\n        align-items: center;\n      }\n      .settled .what {\n        color: var(--muted);\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .settled .outcome-label {\n        font-weight: 500;\n      }\n      .settled .outcome-label.muted {\n        font-weight: 400;\n      }\n      .key.undo {\n        flex: none;\n        margin-left: 12px;\n      }\n      /* The time Undo has left, draining along the row\'s bottom edge from the text column. */\n      .countdown {\n        position: absolute;\n        left: var(--text-x);\n        right: 0;\n        bottom: 0;\n        height: 2px;\n        background: var(--soft);\n        overflow: hidden;\n      }\n      .countdown div {\n        height: 100%;\n        background: color-mix(in oklab, var(--text) 32%, transparent);\n        transform-origin: left;\n        animation-name: drain;\n        animation-timing-function: linear;\n        animation-fill-mode: forwards;\n      }\n      .countdown.paused div {\n        animation-play-state: paused;\n      }\n      @keyframes drain {\n        from {\n          transform: scaleX(1);\n        }\n        to {\n          transform: scaleX(0);\n        }\n      }\n      /* The page is at least the pane\'s height. The footer sits at its bottom, and an empty tab\'s text fills the space above it. */\n      #app {\n        display: flex;\n        flex-direction: column;\n        min-height: 100vh;\n      }\n      .empty {\n        flex: 1;\n        display: flex;\n        flex-direction: column;\n        justify-content: center;\n        padding: 32px;\n        text-align: center;\n      }\n      .empty .title {\n        margin-bottom: 4px;\n      }\n      footer {\n        margin-top: auto;\n        display: flex;\n        flex-wrap: wrap;\n        justify-content: space-between;\n        gap: 4px 16px;\n        padding: 8px 16px 16px;\n        color: var(--muted);\n        font-size: 12px;\n      }\n      .demo-toggle {\n        padding: 0 6px;\n        border-radius: 5px;\n        color: var(--muted);\n      }\n      .demo-toggle:hover {\n        color: var(--text);\n        background: var(--hover);\n      }\n      .demo-note {\n        display: flex;\n        flex-wrap: wrap;\n        align-items: center;\n        gap: 4px 12px;\n        margin: 12px 12px 0;\n        padding: 6px 12px;\n        border-radius: 6px;\n        background: var(--raised);\n        color: var(--text);\n      }\n      /*\n       * Motion, with the Codex app\'s own timing. Hover and fills change over 150 ms, and what a draw\n       * mounts fades in from @starting-style. Heights move in the script, around each draw.\n       */\n      .key,\n      .tab,\n      .row,\n      .fold {\n        transition:\n          background-color var(--quick),\n          color var(--quick),\n          box-shadow var(--enter),\n          transform var(--spring);\n      }\n      .key:not(:disabled):active {\n        transform: scale(0.97);\n      }\n      .panel {\n        transition:\n          opacity 200ms ease 40ms,\n          translate var(--enter);\n        @starting-style {\n          opacity: 0;\n          translate: 0 -4px;\n        }\n      }\n      .panel.closing {\n        opacity: 0;\n        translate: 0 -4px;\n        transition:\n          opacity 120ms ease,\n          translate var(--move);\n      }\n      .row > .content,\n      .status-line,\n      .demo-note,\n      .empty,\n      main,\n      form {\n        transition: opacity var(--quick);\n        @starting-style {\n          opacity: 0;\n        }\n      }\n      @media (prefers-reduced-motion: reduce) {\n        *,\n        *::before,\n        *::after {\n          transition-duration: 0s !important;\n        }\n        /* With no motion, the countdown shows no time left, so it is not drawn. */\n        .countdown {\n          display: none;\n        }\n      }\n    </style>\n  </head>\n  <body>\n    <div id="app" class="notice muted">Loading\u2026</div>\n    <script>\n      "use strict";(()=>{var ue,b,ze,Xt,N,Be,Je,Ze,xe,oe,B,et,Re,$e,Se,zt,le={},de=[],Jt=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,pe=Array.isArray;function C(e,t){for(var n in t)e[n]=t[n];return e}function Te(e){e&&e.parentNode&&e.parentNode.removeChild(e)}function Zt(e,t,n){var i,o,s,r={};for(s in t)s=="key"?i=t[s]:s=="ref"?o=t[s]:r[s]=t[s];if(arguments.length>2&&(r.children=arguments.length>3?ue.call(arguments,2):n),typeof e=="function"&&e.defaultProps!=null)for(s in e.defaultProps)r[s]===void 0&&(r[s]=e.defaultProps[s]);return re(e,r,i,o,null)}function re(e,t,n,i,o){var s={type:e,props:t,key:n,ref:i,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:o??++ze,__i:-1,__u:0};return o==null&&b.vnode!=null&&b.vnode(s),s}function A(e){return e.children}function ae(e,t){this.props=e,this.context=t}function O(e,t){if(t==null)return e.__?O(e.__,e.__i+1):null;for(var n;t<e.__k.length;t++)if((n=e.__k[t])!=null&&n.__e!=null)return n.__e;return typeof e.type=="function"?O(e):null}function en(e){if(e.__P&&e.__d){var t=e.__v,n=t.__e,i=[],o=[],s=C({},t);s.__v=t.__v+1,b.vnode&&b.vnode(s),Le(e.__P,s,t,e.__n,e.__P.namespaceURI,32&t.__u?[n]:null,i,n??O(t),!!(32&t.__u),o),s.__v=t.__v,s.__.__k[s.__i]=s,ot(i,s,o),t.__e=t.__=null,s.__e!=n&&tt(s)}}function tt(e){if((e=e.__)!=null&&e.__c!=null)return e.__e=e.__c.base=null,e.__k.some(function(t){if(t!=null&&t.__e!=null)return e.__e=e.__c.base=t.__e}),tt(e)}function Ke(e){(!e.__d&&(e.__d=!0)&&N.push(e)&&!ce.__r++||Be!=b.debounceRendering)&&((Be=b.debounceRendering)||Je)(ce)}function ce(){try{for(var e,t=1;N.length;)N.length>t&&N.sort(Ze),e=N.shift(),t=N.length,en(e)}finally{N.length=ce.__r=0}}function nt(e,t,n,i,o,s,r,c,d,u,f){var g,l,p,y,v,w,_=i&&i.__k||de,h=t.length;for(d=tn(n,t,_,d,h),g=0;g<h;g++)(p=n.__k[g])!=null&&(l=p.__i!=-1&&_[p.__i]||le,p.__i=g,w=Le(e,p,l,o,s,r,c,d,u,f),y=p.__e,p.ref&&l.ref!=p.ref&&(l.ref&&Ee(l.ref,null,p),f.push(p.ref,p.__c||y,p)),v==null&&y!=null&&(v=y),4&p.__u?(d=st(p,d,e),l.__e&&(l.__e=null)):typeof p.type=="function"&&w!==void 0?d=w:y&&(d=y.nextSibling),p.__u&=-7);return n.__e=v,d}function tn(e,t,n,i,o){var s,r,c,d,u,f=n.length,g=f,l=0;for(e.__k=new Array(o),s=0;s<o;s++)(r=t[s])!=null&&typeof r!="boolean"&&typeof r!="function"?(typeof r=="string"||typeof r=="number"||typeof r=="bigint"||r.constructor==String?r=e.__k[s]=re(null,r,null,null,null):pe(r)?r=e.__k[s]=re(A,{children:r},null,null,null):r.constructor===void 0&&r.__b>0?r=e.__k[s]=re(r.type,r.props,r.key,r.ref?r.ref:null,r.__v):e.__k[s]=r,d=s+l,r.__=e,r.__b=e.__b+1,c=null,(u=r.__i=nn(r,n,d,g))!=-1&&(g--,(c=n[u])&&(c.__u|=2)),c==null||c.__v==null?(u==-1&&(o>f?l--:o<f&&l++),typeof r.type!="function"&&(r.__u|=4)):u!=d&&(u==d-1?l--:u==d+1?l++:(u>d?l--:l++,r.__u|=4))):e.__k[s]=null;if(g)for(s=0;s<f;s++)(c=n[s])!=null&&(2&c.__u)==0&&(c.__e==i&&(i=O(c)),at(c,c));return i}function st(e,t,n){var i,o;if(typeof e.type=="function"){for(i=e.__k,o=0;i&&o<i.length;o++)i[o]&&(i[o].__=e,t=st(i[o],t,n));return t}e.__e!=t&&(t&&e.type&&!t.parentNode&&(t=O(e)),t=n.insertBefore(e.__e,t||null));do t=t&&t.nextSibling;while(t!=null&&t.nodeType==8);return t}function nn(e,t,n,i){var o,s,r,c=e.key,d=e.type,u=t[n],f=u!=null&&(2&u.__u)==0;if(u===null&&c==null||f&&c==u.key&&d==u.type)return n;if(i>(f?1:0)){for(o=n-1,s=n+1;o>=0||s<t.length;)if((u=t[r=o>=0?o--:s++])!=null&&(2&u.__u)==0&&c==u.key&&d==u.type)return r}return-1}function Qe(e,t,n){t[0]=="-"?e.setProperty(t,n??""):e[t]=n==null?"":typeof n!="number"||Jt.test(t)?n:n+"px"}function ie(e,t,n,i,o){var s,r;e:if(t=="style")if(typeof n=="string")e.style.cssText=n;else{if(typeof i=="string"&&(e.style.cssText=i=""),i)for(t in i)n&&t in n||Qe(e.style,t,"");if(n)for(t in n)i&&n[t]==i[t]||Qe(e.style,t,n[t])}else if(t[0]=="o"&&t[1]=="n")s=t!=(t=t.replace(et,"$1")),r=t.toLowerCase(),t=r in e||t=="onFocusOut"||t=="onFocusIn"?r.slice(2):t.slice(2),e.l||(e.l={}),e.l[t+s]=n,n?i?n[B]=i[B]:(n[B]=Re,e.addEventListener(t,s?Se:$e,s)):e.removeEventListener(t,s?Se:$e,s);else{if(o=="http://www.w3.org/2000/svg")t=t.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(t!="width"&&t!="height"&&t!="href"&&t!="list"&&t!="form"&&t!="tabIndex"&&t!="download"&&t!="rowSpan"&&t!="colSpan"&&t!="role"&&t!="popover"&&t in e)try{e[t]=n??"";break e}catch{}typeof n=="function"||(n==null||n===!1&&t[4]!="-"?e.removeAttribute(t):e.setAttribute(t,t=="popover"&&n==1?"":n))}}function Xe(e){return function(t){if(this.l){var n=this.l[t.type+e];if(t[oe]==null)t[oe]=Re++;else if(t[oe]<n[B])return;return n(b.event?b.event(t):t)}}}function Le(e,t,n,i,o,s,r,c,d,u){var f,g,l,p,y,v,w,_,h,R,Y,I,G,Ge,se,ve,T=t.type;if(t.constructor!==void 0)return null;128&n.__u&&(d=!!(32&n.__u),s=[c=t.__e=n.__e]),(f=b.__b)&&f(t);e:if(typeof T=="function"){g=r.length;try{if(h=t.props,R=T.prototype&&T.prototype.render,Y=(f=T.contextType)&&i[f.__c],I=f?Y?Y.props.value:f.__:i,n.__c?_=(l=t.__c=n.__c).__=l.__E:(R?t.__c=l=new T(h,I):(t.__c=l=new ae(h,I),l.constructor=T,l.render=on),Y&&Y.sub(l),l.state||(l.state={}),l.__n=i,p=l.__d=!0,l.__h=[],l._sb=[]),R&&l.__s==null&&(l.__s=l.state),R&&T.getDerivedStateFromProps!=null&&(l.__s==l.state&&(l.__s=C({},l.__s)),C(l.__s,T.getDerivedStateFromProps(h,l.__s))),y=l.props,v=l.state,l.__v=t,p)R&&T.getDerivedStateFromProps==null&&l.componentWillMount!=null&&l.componentWillMount(),R&&l.componentDidMount!=null&&l.__h.push(l.componentDidMount);else{if(R&&T.getDerivedStateFromProps==null&&h!==y&&l.componentWillReceiveProps!=null&&l.componentWillReceiveProps(h,I),t.__v==n.__v||!l.__e&&l.shouldComponentUpdate!=null&&l.shouldComponentUpdate(h,l.__s,I)===!1){t.__v!=n.__v&&(l.props=h,l.state=l.__s,l.__d=!1),t.__e=n.__e,t.__k=n.__k,t.__k.some(function(U){U&&(U.__=t)}),de.push.apply(l.__h,l._sb),l._sb=[],l.__h.length&&r.push(l),c=O(n);break e}l.componentWillUpdate!=null&&l.componentWillUpdate(h,l.__s,I),R&&l.componentDidUpdate!=null&&l.__h.push(function(){l.componentDidUpdate(y,v,w)})}if(l.context=I,l.props=h,l.__P=e,l.__e=!1,G=b.__r,Ge=0,R)l.state=l.__s,l.__d=!1,G&&G(t),f=l.render(l.props,l.state,l.context),de.push.apply(l.__h,l._sb),l._sb=[];else do l.__d=!1,G&&G(t),f=l.render(l.props,l.state,l.context),l.state=l.__s;while(l.__d&&++Ge<25);l.state=l.__s,l.getChildContext!=null&&(i=C(C({},i),l.getChildContext())),R&&!p&&l.getSnapshotBeforeUpdate!=null&&(w=l.getSnapshotBeforeUpdate(y,v)),se=f!=null&&f.type===A&&f.key==null?rt(f.props.children):f,c=nt(e,pe(se)?se:[se],t,n,i,o,s,r,c,d,u),l.base=t.__e,t.__u&=-161,l.__h.length&&r.push(l),_&&(l.__E=l.__=null)}catch(U){if(r.length=g,t.__v=null,d||s!=null){if(U.then){for(t.__u|=d?160:128;c&&c.nodeType==8&&c.nextSibling;)c=c.nextSibling;s!=null&&(s[s.indexOf(c)]=null),t.__e=c}else if(s!=null)for(ve=s.length;ve--;)Te(s[ve])}else t.__e=n.__e;t.__k==null&&(t.__k=n.__k||[]),U.then||it(t),b.__e(U,t,n)}}else s==null&&t.__v==n.__v?(t.__k=n.__k,t.__e=n.__e):c=t.__e=sn(n.__e,t,n,i,o,s,r,d,u);return(f=b.diffed)&&f(t),128&t.__u?void 0:c}function it(e){e&&(e.__c&&(e.__c.__e=!0),e.__k&&e.__k.some(it))}function ot(e,t,n){for(var i=0;i<n.length;i++)Ee(n[i],n[++i],n[++i]);b.__c&&b.__c(t,e),e.some(function(o){try{e=o.__h,o.__h=[],e.some(function(s){s.call(o)})}catch(s){b.__e(s,o.__v)}})}function rt(e){return typeof e!="object"||e==null||e.__b>0?e:pe(e)?e.map(rt):e.constructor!==void 0?null:C({},e)}function sn(e,t,n,i,o,s,r,c,d){var u,f,g,l,p,y,v,w=n.props||le,_=t.props,h=t.type;if(h=="svg"?o="http://www.w3.org/2000/svg":h=="math"?o="http://www.w3.org/1998/Math/MathML":o||(o="http://www.w3.org/1999/xhtml"),s!=null){for(u=0;u<s.length;u++)if((p=s[u])&&"setAttribute"in p==!!h&&(h?p.localName==h:p.nodeType==3)){e=p,s[u]=null;break}}if(e==null){if(h==null)return document.createTextNode(_);e=document.createElementNS(o,h,_.is&&_),c&&(b.__m&&b.__m(t,s),c=!1),s=null}if(h==null)w===_||c&&e.data==_||(e.data=_);else{if(s=h=="textarea"&&_.defaultValue!=null?null:s&&ue.call(e.childNodes),!c&&s!=null)for(w={},u=0;u<e.attributes.length;u++)w[(p=e.attributes[u]).name]=p.value;for(u in w)p=w[u],u=="dangerouslySetInnerHTML"?g=p:u=="children"||u in _||u=="value"&&"defaultValue"in _||u=="checked"&&"defaultChecked"in _||ie(e,u,null,p,o);for(u in _)p=_[u],u=="children"?l=p:u=="dangerouslySetInnerHTML"?f=p:u=="value"?y=p:u=="checked"?v=p:c&&typeof p!="function"||w[u]===p||ie(e,u,p,w[u],o);if(f)c||g&&(f.__html==g.__html||f.__html==e.innerHTML)||(e.innerHTML=f.__html),t.__k=[];else if(g&&(e.innerHTML=""),nt(t.type=="template"?e.content:e,pe(l)?l:[l],t,n,i,h=="foreignObject"?"http://www.w3.org/1999/xhtml":o,s,r,s?s[0]:n.__k&&O(n,0),c,d),s!=null)for(u=s.length;u--;)Te(s[u]);c&&h!="textarea"||(u="value",h=="progress"&&y==null?e.removeAttribute("value"):y!=null&&(y!==e[u]||h=="progress"&&!y||h=="option"&&y!=w[u])&&ie(e,u,y,w[u],o),u="checked",v!=null&&v!=e[u]&&ie(e,u,v,w[u],o))}return e}function Ee(e,t,n){try{if(typeof e=="function"){var i=typeof e.__u=="function";i&&e.__u(),i&&t==null||(e.__u=e(t))}else e.current=t}catch(o){b.__e(o,n)}}function at(e,t,n){var i,o;if(b.unmount&&b.unmount(e),(i=e.ref)&&(i.current&&i.current!=e.__e||Ee(i,null,t)),(i=e.__c)!=null){if(i.componentWillUnmount)try{i.componentWillUnmount()}catch(s){b.__e(s,t)}i.base=i.__P=i.__n=null}if(i=e.__k)for(o=0;o<i.length;o++)i[o]&&at(i[o],t,n||typeof e.type!="function");n||Te(e.__e),e.__c=e.__=e.__e=void 0}function on(e,t,n){return this.constructor(e,n)}function lt(e,t,n){var i,o,s,r;t==document&&(t=document.documentElement),b.__&&b.__(e,t),o=(i=typeof n=="function")?null:n&&n.__k||t.__k,s=[],r=[],Le(t,e=(!i&&n||t).__k=Zt(A,null,[e]),o||le,le,t.namespaceURI,!i&&n?[n]:o?null:t.firstChild?ue.call(t.childNodes):null,s,!i&&n?n:o?o.__e:t.firstChild,i,r),ot(s,e,r),e.props.children=null}ue=de.slice,b={__e:function(e,t,n,i){for(var o,s,r;t=t.__;)if((o=t.__c)&&!o.__)try{if((s=o.constructor)&&s.getDerivedStateFromError!=null&&(o.setState(s.getDerivedStateFromError(e)),r=o.__d),o.componentDidCatch!=null&&(o.componentDidCatch(e,i||{}),r=o.__d),r)return o.__E=o}catch(c){e=c}throw e}},ze=0,Xt=function(e){return e!=null&&e.constructor===void 0},ae.prototype.setState=function(e,t){var n;n=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=C({},this.state),typeof e=="function"&&(e=e(C({},n),this.props)),e&&C(n,e),e!=null&&this.__v&&(t&&this._sb.push(t),Ke(this))},ae.prototype.forceUpdate=function(e){this.__v&&(this.__e=!0,e&&this.__h.push(e),Ke(this))},ae.prototype.render=A,N=[],Je=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,Ze=function(e,t){return e.__v.__b-t.__v.__b},ce.__r=0,xe=Math.random().toString(8),oe="__d"+xe,B="__a"+xe,et=/(PointerCapture)$|Capture$/i,Re=0,$e=Xe(!1),Se=Xe(!0),zt=0;function fe(e){return e.how==="dismissed"||e.how==="expired"||e.how==="claude"?!0:e.how==="update"&&/^(no longer applies|replaced|superseded|moot)/i.test(e.outcome)}function D(e){let t=Math.round(e/6e4);if(t<1)return"just now";if(t<60)return`${t}m ago`;let n=Math.round(t/60);return n<48?`${n}h ago`:`${Math.round(n/24)}d ago`}function me(e,t){return e.length>t?`${e.slice(0,t-1)}\\u2026`:e}function ln(e){return e.replace(/\\/+$/,"").split("/").pop()??e}var dn="This changed before your press. Nothing was sent.";function K(e){return e==="sample"?"Sample entry: nothing was sent.":dn}function cn(e,t){switch(t.kind){case"run":return{kind:"send",text:pn.run(e,t.command),by:{id:e.id,action:"run"}};case"open":return{kind:"open",target:t.path,name:ln(t.path)};case"link":return{kind:"open",target:t.url,name:t.name??t.url};case"copy":return{kind:"copy",text:t.text,name:t.name??"snippet",isCommand:!1};case"terminal":return{kind:"copy",text:t.command,name:t.name??me(t.command,32),isCommand:!0}}}function dt(e,t){return t.step.map(n=>cn(e,n))}function ct(e,t){return{state:"pending",parts:e.flatMap(n=>n.kind==="send"?[]:[{kind:n.kind,name:n.name,isCommand:n.kind==="copy"&&n.isCommand,error:null}]),at:t}}function un(e){return[`${e.kind==="issue"?"Issue":"Opportunity"}: ${e.title}`,e.detail,...e.path?[`File: ${e.path}`]:[]]}var pn={answer:(e,t)=>`Re "${e.ask}": ${t}`,explain:e=>{let t=e.kind==="task"?"this task you left for me":"this question you asked me",n=e.options.length>0?`\nOptions: ${e.options.join(" / ")}`:"";return`Remind me what ${t} is about: why it came up, and what each choice would mean. Don\'t act on it yet.\n"${e.ask}"${n}`},run:(e,t)=>`For "${e.ask}", run this:\n\\`\\`\\`\n${t}\n\\`\\`\\``,taskReply:(e,t)=>`Re the task you left for me, "${e.ask}": ${t}`,finding:(e,t,n="")=>[t==="address"?"Please address this finding you recorded:":t==="discuss"?"Let\'s talk through this finding you recorded before changing anything:":"About this finding you recorded:",...un(e),...t==="typed"?["",n]:[]].join(`\n`)};var fn=3,k=5120,Ae=1500,Pe=400;function ut(e,t){return e>0&&t-e<Pe}function Q(e,t){return e.filter(n=>!t.has(n.id)).slice(0,fn)}function pt(e){return e?.is==="notSent"||e?.is==="local"&&e.result.state==="failed"}function ft(e){return e.is==="done"||e.is==="queued"}var mn={terminal:"Run it in a terminal, or type ! and paste.",desktop:"Run it in Terminal.",html:"Run it in Terminal."},Ce={open:{pending:"Opening",done:"Opened",failed:"open"},copy:{pending:"Copying",done:"Copied",failed:"copy"}};function gn(e,t){let i=e.parts.length>1&&e.parts.every(r=>r.kind==="open"&&r.error===null&&/^PR #\\d+$/.test(r.name))?[{...e.parts[0],name:`${e.parts.length} PRs`}]:e.parts;if(e.state==="pending")return`${i.map(r=>`${Ce[r.kind].pending} ${r.name}`).join(" \\xB7 ")}\\u2026`;let o=i.map(r=>r.error===null?`${Ce[r.kind].done} ${r.name}`:`Could not ${Ce[r.kind].failed} ${r.name}: ${r.error}`).join(" \\xB7 ");if(e.state==="failed")return o;let s=i.some(r=>r.kind==="copy"&&r.isCommand);return`\\u2713 ${o}${s?`. ${mn[t]}`:""}`}function Ne(e,t){return e.is==="note"?K(e.note):e.is==="local"?gn(e.result,t):e.is==="queued"?`Queued: ${e.label}`:e.is==="notSent"?`Not sent: ${e.reason}`:`\\u2713 ${e.label}`}var hn=["needsYou","findings"];function yn(e){return{needsYou:[...e.needsYou.questions,...e.needsYou.tasks].map(t=>t.id),findings:e.findings.rows.map(t=>t.id)}}function mt(e,t){let n=yn(t);return{seen:{needsYou:new Set(n.needsYou),findings:new Set(n.findings)},added:{needsYou:e?n.needsYou.filter(i=>!e.needsYou.has(i)):[],findings:e?n.findings.filter(i=>!e.findings.has(i)):[]}}}function gt(e,t,n,i){let o=r=>r.some(c=>c.state.is!=="settled"||n.has(c.id)),s=(r,c)=>i.has(r)&&Q(c,n).length>0;return t==="findings"?!o(e.findings.rows)&&!s("finding",e.findings.closed):e.heard==="heard"&&!o(e.needsYou.questions)&&!o(e.needsYou.tasks)&&!s("question",e.needsYou.closed.questions)&&!s("task",e.needsYou.closed.tasks)}function ht(e,t,n,i){let o=t?hn.find(s=>s!==e&&n[s].length>0):void 0;return o?{tab:o,id:i[o].find(s=>n[o].includes(s))??null}:null}var ge=3e3,yt=6e4,ks=k+2*ge;function bt(e){return[...e.needsYou.questions,...e.needsYou.tasks,...e.findings.rows].filter(t=>t.state.is==="settled").map(t=>t.id)}function wt(e,t,n){return new Map(t.map(i=>[i,e.get(i)??n]))}var M=200;function _t(e,t,n=new Set,i=new Map){let o=(s,r)=>{let c=i.get(s);return n.has(s)||t-r<k||t-(c??r+k)<M};return new Set([...e].filter(([s,r])=>o(s,r)).map(([s])=>s))}function kt(e,t,n){return new Set([...e].filter(([i,o])=>!n.has(i)&&t-o>=k).map(([i])=>i))}var bn=0;function a(e,t,n,i,o,s){t||(t={});var r,c,d=t;if("ref"in d)for(c in d={},t)c=="ref"?r=t[c]:d[c]=t[c];var u={type:e,props:d,key:n,ref:r,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--bn,__i:-1,__u:0,__source:o,__self:s};if(typeof e=="function"&&(r=e.defaultProps))for(c in r)d[c]===void 0&&(d[c]=r[c]);return b.vnode&&b.vnode(u),u}var vt=[..."abcfghilm"],Ct=[{id:"needsYou",label:"Needs you",hotkey:"1"},{id:"findings",label:"Findings",hotkey:"2"}],x=null,j=!1,be=null,Ue=0,At=0,$="needsYou",F={needsYou:null,findings:null},P=null,Oe=!1,z=new Map,H=new Set,xt=new Set,q=new Set,we=new Map,E=new Map,_e=new Map,te=new Map,V=null,S=new Map,De=null,He=new Map,J=new Set,W=new Set,ne=new Map,he=new Set,Z=new Set,Ie=new Map,Pt=0,$t=0,Me=!1,wn=0,ee=new Map;function Nt(e,t,n){return new Promise((i,o)=>{let s=++wn;ee.set(s,{resolve:i,reject:o}),parent.postMessage({jsonrpc:"2.0",id:s,method:e,params:t},"*"),n!==void 0&&setTimeout(()=>{ee.delete(s)&&o(new Error(`The inbox did not answer in ${Math.round(n/1e3)} s`))},n)})}window.addEventListener("message",e=>{let t=e.data;if(!(!t||t.jsonrpc!=="2.0")){if(t.id!=null&&!t.method&&ee.has(t.id)){let n=ee.get(t.id);ee.delete(t.id),t.error?n.reject(t.error):n.resolve(t.result);return}t.method==="ui/notifications/host-context-changed"&&It(t.params??{}),t.id!=null&&t.method&&parent.postMessage({jsonrpc:"2.0",id:t.id,result:{}},"*")}});function It(e){e.theme&&(document.documentElement.dataset.theme=e.theme);for(let[t,n]of Object.entries(e.styles?.variables??{}))document.documentElement.style.setProperty(t,n)}async function Ot(e,t={},n){let i=await Nt("tools/call",{name:e,arguments:t},n);if(!i||i.isError||i.structuredContent===void 0)throw new Error(i?.isError&&i.content?.[0]?.text||"The answer had nothing to show");return i.structuredContent}function Dt(e,t){if(t<$t)return;$t=t,be=null,Ue=0,At=Date.now();let n=S;S=wt(S,bt(e),Date.now());for(let s of ne.keys())S.has(s)||ne.delete(s);[...S.keys()].some(s=>!n.has(s))&&(setTimeout(m,k+50),setTimeout(m,k+M+50)),x=e;let i=mt(De,e);De=i.seen;let o=[...i.added.needsYou,...i.added.findings];for(let s of o)He.set(s,Date.now()),J.add(s);o.length>0&&setTimeout(m,Ae+50),_n(e,i.added),m()}function _n(e,t){let n=We(),i=Ve(e,n),o=ht($,gt(e,$,n,q),t,{needsYou:i.byTab.needsYou.map(s=>s.id),findings:i.byTab.findings.map(s=>s.id)});o&&($=o.tab,o.id&&je(o.tab,o.id))}var kn=3*ge;async function qe(){let e=++Pt;try{Dt(await Ot("inbox_view",{demo:j},kn),e)}catch(t){x?Ue++:be=vn(t),m()}}function vn(e){let t=typeof e=="object"&&e!==null&&typeof e.message=="string"?e.message:String(e),n=me(t.replace(/^(Failed|Not done): /,"").replace(/\\s+/g," ").trim(),120)||"No reason given";return Ft(/[.!?\u2026]$/.test(n)?n:`${n}.`)}async function Mt(){Me||await qe(),setTimeout(Mt,ge)}function xn(e,t){return[...e.needsYou.questions,...e.needsYou.tasks,...e.findings.rows].some(n=>n.id===t&&n.state.is!=="settled")}function $n(e,t){return[...e.needsYou.questions,...e.needsYou.tasks,...e.findings.rows].some(n=>n.id===t&&n.feedback?.is==="notSent")}async function L(e,t,n,i="Sending\\u2026"){t.action!=="undo"&&Wt(e),we.set(e,i),E.delete(e),_e.delete(e),te.delete(e),m(),Me=!0;let o=++Pt;try{let s=await Ot("inbox_press",{press:t,thread:x?.thread,demo:j},yt);s?.copy&&await Sn(e,s.copy),s?.view&&Dt(s.view,o),s?.error&&!(x&&$n(x,e))&&E.set(e,s.error),!s?.error&&s?.note!=="stale"&&n?.(),s?.note&&x&&xn(x,e)?(_e.set(e,{text:K(s.note),at:Date.now()}),setTimeout(m,k+50),s.note==="stale"&&t.action==="type"&&(P=e)):s?.note&&(V={text:K(s.note),at:Date.now()},setTimeout(m,k+50))}catch{E.set(e,"Not sent: the inbox did not answer.")}finally{Me=!1,we.delete(e),m()}}async function Sn(e,t){try{await navigator.clipboard.writeText(t.text)}catch{E.set(e,`Could not copy ${t.name}: this tab has no clipboard access`),te.set(e,t)}}function Ft(e){return e.charAt(0).toUpperCase()+e.slice(1)}function Rn(e){Wt(e),P=e,Oe=!0,m()}function Ut(e){let{id:t,item:n}=e,i=e.actions.filter(g=>xt.has(t)||!g.isFolded),o=e.actions.length-i.length,s=i.map(g=>g.press.action).lastIndexOf("answer"),r=[],c=[],d=e.feedback?.is==="notSent"?e.feedback.retry:null;d&&r.push({label:"Try again",run:()=>{L(t,d)}});let u=0,f=()=>u<vt.length?{hotkey:vt[u++]}:{};for(let[g,l]of i.entries()){let p=l.press,y=l.label;if(p.action==="answer"&&n)r.push({...f(),label:y,isPrimary:l.isPrimary,run:()=>{L(t,p)}}),g===s&&o>0&&r.push({label:`All ${n.options.length} options`,run:()=>{xt.add(t),m()}});else if(p.action==="step"){let v=e.steps[p.step],w=l.kind==="local"&&n&&v?Ne({is:"local",result:ct(dt(n,v),Date.now())},"html"):void 0;r.push({...f(),label:y,run:()=>{L(t,p,void 0,w)}})}else p.action==="done"?r.push({hotkey:"d",label:y,run:()=>{L(t,p)}}):p.action==="address"?r.push({hotkey:"a",label:y,run:()=>{L(t,p)}}):p.action==="type"?c.push({hotkey:"t",label:y,run:()=>Rn(t)}):p.action==="explain"||p.action==="discuss"?c.push({hotkey:"e",label:y,run:()=>{L(t,p)}}):p.action==="dismiss"&&c.push({hotkey:"x",label:y,run:()=>{L(t,p)}})}return{keys:r,more:c}}function Tn(e,t,n){let i=n.kind==="question",o=t.state.is==="handedOff",s=n.id;return{id:s,handle:o?"\\u2713":t.handle==="?"?"\\u2022":t.handle,handleTone:o?"done":void 0,...o?{fold:{}}:{},title:n.ask,titleAfter:n.at===null?void 0:` \\xB7 ${D(e.at-n.at)}`,hasSecondLine:i,...Ut(t),typing:{hint:i?"Your answer":"Your reply to Codex",send:r=>{L(s,{action:"type",id:s,text:r},()=>z.delete(s))}},feedback:t.feedback}}var Ln={issue:{label:"Issue",mark:"\\u25B2",tone:"needsYou"},opportunity:{label:"Opportunity",mark:"\\u2726",tone:"done"}};function En(e,t,n){let i=Ln[n.kind],o=t.state.is==="handedOff",s=n.id;return{id:s,handle:o?"\\u2713":i.mark,handleTone:o?"done":void 0,kind:n.kind,...o?{fold:{}}:{},title:n.title,meta:a("span",{class:`tone-${i.tone}`,children:i.label}),line:{text:n.title,after:` \\xB7 ${D(e.at-n.at)}`},body:a("div",{children:[a("p",{children:n.detail}),n.path?a("p",{children:[a("span",{class:"muted",children:"Relevant file: "}),n.path]}):null]}),...Ut(t),typing:{hint:"Your reply to Codex",send:r=>{L(s,{action:"type",id:s,text:r},()=>z.delete(s))}},feedback:t.feedback}}function Ve(e,t){let n=c=>c.flatMap(d=>d.state.is==="settled"?t.has(d.id)?[{settled:d,state:d.state}]:[]:d.item?[{row:Tn(e,d,d.item)}]:d.finding?[{row:En(e,d,d.finding)}]:[]),i=c=>c.flatMap(d=>"row"in d?[d.row]:[]),o=n(e.needsYou.questions),s=n(e.needsYou.tasks),r=n(e.findings.rows);return{questions:o,tasks:s,findings:r,byTab:{needsYou:[...i(o),...i(s)],findings:i(r)}}}function Ht(e){return new Set(e.flatMap(t=>"settled"in t?[t.settled.id]:[]))}function We(){return _t(S,Date.now(),W,ne)}async function Cn(e){if(W.has(e.id))return;let t=e.type==="finding"?"findings":"needsYou";W.add(e.id);try{await L(e.id,{action:"undo",id:e.id},()=>{je(t,e.id),_e.set(e.id,{text:"\\u2713 Undo",at:Date.now()}),setTimeout(m,k+50)})}finally{W.delete(e.id);let n=S.get(e.id),i=n!==void 0&&Date.now()-n<k,o=E.get(e.id);o&&!i&&(V={text:o,at:Date.now(),isError:!0},setTimeout(m,k+50)),n!==void 0&&!i&&(S.set(e.id,Date.now()-k),ne.delete(e.id),setTimeout(m,M+50)),m()}}function qt(e,t,n){let i=F[t],o=i?i.id:(t==="needsYou"?n.needsYou.topId:null)??e[0]?.id;return o?e.findIndex(s=>s.id===o):-1}function An(e,t,n){let i=Ie.get(e);n&&Z.delete(n),n?Ie.set(e,n):Ie.delete(e),!(!i||i===n||ke.matches||!t.some(o=>o.id===i))&&document.querySelector(`[data-motion="${CSS.escape(i)}"] .panel:not(.closing)`)&&(Z.add(i),setTimeout(()=>{Z.delete(i)&&m()},Ye+150))}function je(e,t){F[e]={id:t,openedAt:Date.now()},setTimeout(m,Pe+50)}function Vt(e,t,n){let i=t[n];i&&(je(e,i.id),m())}function Wt(e){F[$]||(F[$]={id:e,openedAt:0})}function St(){return ut(F[$]?.openedAt??0,Date.now())}function jt(e){let t={hotkey:"v",label:H.has(e.id)?"Hide details":"Details",run:()=>{H.has(e.id)?H.delete(e.id):H.add(e.id),m()}};return e.fold&&!H.has(e.id)?{keys:[t],more:[]}:e.fold?{keys:e.keys,more:[...e.more,t]}:{keys:e.keys,more:e.more}}function Rt({k:e,isGhost:t=!1}){return a("button",{type:"button",class:e.isPrimary?"key primary":t?"key ghost":"key",disabled:St(),onClick:()=>{St()||e.run()},children:e.label})}function Pn({row:e}){let t=e.typing;return a("form",{onSubmit:i=>{i.preventDefault();let o=(z.get(e.id)??"").trim();o&&(P=null,t.send(o))},children:[a("input",{id:`type-${e.id}`,value:z.get(e.id)??"",placeholder:t.hint,"aria-label":t.hint,onInput:i=>z.set(e.id,i.currentTarget.value)}),a("button",{type:"submit",class:"key",children:"Send"}),a("button",{type:"button",class:"key ghost",onClick:()=>{P=null,m()},children:"Cancel"})]})}function Tt(e){let t=e.feedback;return t?t.is==="done"&&e.handleTone==="done"?t.label:Ne(t,"html"):null}function Nn(e,t){let n=e.feedback;return n?ft(n)?`${Tt(e)} \\xB7 ${D(t-n.at)}`:Tt(e):null}function Yt(e){let t=_e.get(e);return t&&Date.now()-t.at<k?t.text:null}function In(e){return!E.has(e.id)&&Yt(e.id)===null&&!te.has(e.id)}function On(e){let t=He.get(e);return t!==void 0&&Date.now()-t<Ae}function Dn({row:e,tone:t,isSelected:n,onSelect:i,now:o}){let s=On(e.id)?` new tone-bar-${t}`:"",r=/^(\\d+)\\)$/.exec(e.handle)?.[1],c=a("span",{class:`mark ${e.handleTone??e.kind??""}`,children:r?a("span",{class:"number",children:r}):e.handle}),d=e.line??{text:e.title,after:e.titleAfter},u=In(e)?Nn(e,o):null,f=u?{...d,after:` \\xB7 ${u}`,afterTone:pt(e.feedback)?"error":e.handleTone==="done"&&e.feedback?.is==="done"?"done":void 0}:d,g=!n&&Z.has(e.id);return a("div",{class:`row ${n?"selected":"collapsed"}${g?" closing":""}${s}`,onClick:n?void 0:i,children:[c,a("div",{class:"content",children:[a("button",{type:"button",class:"line",...n?{tabIndex:-1,"aria-disabled":!0}:{"aria-expanded":!1},children:[a("span",{class:e.hasSecondLine?"text two":"text",children:f.text}),f.after?a("span",{class:`after ${f.afterTone?`tone-${f.afterTone}`:""}`,children:f.after}):null]}),n||g?a(Mn,{row:e,isClosing:g}):null]})]})}function Mn({row:e,isClosing:t}){let n=!e.fold||H.has(e.id),{keys:i,more:o}=jt(e),s=te.get(e.id),r=Yt(e.id),c=[e.fold?.note?a("div",{class:"muted",children:e.fold.note}):null,we.has(e.id)?a("div",{class:"muted",children:we.get(e.id)}):null,r?a("div",{class:"muted",children:r}):null,E.has(e.id)?a("div",{class:"tone-error",children:E.get(e.id)}):null].filter(Boolean);return a("div",{class:t?"panel closing":"panel",inert:t,children:[e.meta?a("div",{class:"meta",children:e.meta}):null,n&&e.body?a("div",{class:"body",children:e.body}):null,c.length>0?a("div",{class:"tight",children:c}):null,a("div",{class:"actions",children:[i.length>0?a("div",{class:"keys",children:i.map(d=>a(Rt,{k:d}))}):null,e.typing&&P===e.id?a(Pn,{row:e}):o.length>0?a("div",{class:"keys ghost-line",children:o.map(d=>a(Rt,{k:d,isGhost:!0}))}):null]}),s?a("div",{children:[a("div",{class:"muted",children:["Copy ",s.name," from here:"]}),a("textarea",{rows:3,readOnly:!0,value:s.text,onFocus:d=>d.currentTarget.select()}),a("button",{type:"button",class:"key",onClick:()=>{te.delete(e.id),m()},children:"Close"})]}):null]})}function Fn({settled:e,state:t}){let n=S.get(e.id)??Date.now(),i=W.has(e.id),o=!t.isLapsed&&!t.isQueued;return a("div",{class:"row settled",children:[a("span",{class:o?"mark done":"mark",children:t.isQueued?"":"\\u2713"}),a("div",{class:"content tight",children:[a("div",{class:"what",children:e.title}),a("div",{class:o?"outcome-label tone-done":"outcome-label muted",children:t.isQueued?`Queued: ${t.label}`:t.label}),E.has(e.id)?a("div",{class:"tone-error",children:E.get(e.id)}):null]}),t.canUndo?a("button",{type:"button",class:"key undo",disabled:i,onClick:()=>{Cn(e)},children:i?"Undoing\\u2026":"Undo"}):null,t.canUndo?a("div",{class:i?"countdown paused":"countdown",children:a("div",{style:{animationDuration:`${k}ms`},ref:s=>{s&&!s.style.animationDelay&&(s.style.animationDelay=`-${Math.max(0,Date.now()-n)}ms`)}},n)}):null]})}function Gt({v:e,entries:t,group:n,all:i,now:o}){let s=n==="finding"?"findings":"needsYou",r=qt(i,s,e);if(An(s,i,i[r]?.id),t.length===0)return null;let c=kt(S,Date.now(),W);return a("div",{class:"list",children:t.map(d=>"row"in d?a("div",{class:"entry","data-motion":d.row.id,children:a(Dn,{row:d.row,tone:s,now:o,isSelected:i.indexOf(d.row)===r,onSelect:()=>Vt(s,i,i.indexOf(d.row))})},d.row.id):a("div",{class:c.has(d.settled.id)?"entry leaving":"entry","data-motion":d.settled.id,children:a(Fn,{settled:d.settled,state:d.state})},d.settled.id))})}function Un({title:e,count:t}){return a("div",{class:"group-title",children:[e,t>0?a("span",{class:"count",children:t}):null]})}function Fe(e,t,n){return Q(e.needsYou.closed[t==="question"?"questions":"tasks"],Ht(n)).map(i=>({id:i.id,ask:i.ask,outcome:i.outcome,isLapsed:fe(i),at:i.at}))}function Lt({v:e,kind:t,entries:n,all:i,now:o}){let s=t==="question"?"Questions":"Tasks",r=Fe(e,t,n);if(n.length===0&&r.length===0)return null;let c=n.flatMap(d=>"row"in d?[d.row]:[]);return a("section",{children:[a(Un,{title:s,count:c.filter(d=>!d.fold).length}),a(Gt,{v:e,entries:n,group:t,all:i,now:o}),a(Bt,{group:t,closed:r,now:o})]})}function Bt({group:e,closed:t,now:n}){if(t.length===0)return null;let i=q.has(e),o=i||he.has(e);return a(A,{children:[a("button",{type:"button",class:"fold","data-fold":e,onClick:()=>Xn(e),children:[a("span",{class:i?"fold-mark open":"fold-mark",children:"\\u25B8"}),t.length," Closed"]}),o?a("div",{class:"list closed-list","data-motion":`closed-${e}`,children:t.map(s=>a("div",{class:"entry",children:a("div",{class:"row",children:[a("span",{class:"mark",children:"\\u25C7"}),a("div",{class:"content tight",children:[a("div",{class:"muted",children:s.ask}),a("div",{children:[a("span",{class:s.isLapsed?"outcome lapsed":"outcome",children:Ft(s.outcome)}),a("span",{class:"muted",children:[" \\xB7 ",D(n-s.at)]})]})]})]})},`closed-${s.id}`))}):null]})}function Hn(e){return e.heard==="heard"?null:["The inbox has not heard from this chat\\u2019s hooks.",e.heard==="none"?"Codex runs a plugin\\u2019s hooks only after you trust them.":"Items from Codex\\u2019s replies are missing."]}function qn({v:e,lists:t,now:n}){let i=t.byTab.needsYou,o=t.questions.length===0&&t.tasks.length===0,s=Fe(e,"question",t.questions).length>0||Fe(e,"task",t.tasks).length>0,r=Hn(e);return o&&!s?r?a("div",{class:"empty",children:[a("div",{class:"title",children:r[0]}),a("div",{class:"muted",children:r[1]})]}):a("div",{class:"empty",children:a("div",{class:"title",children:"Nothing needs you."})}):a("main",{children:[r?a("section",{children:a("div",{class:"group-title",children:[r[0],a("div",{class:"muted",children:r[1]})]})}):o?a("section",{children:a("div",{class:"group-title empty-line",children:"Nothing needs you."})}):null,a(Lt,{v:e,kind:"question",entries:t.questions,all:i,now:n}),a(Lt,{v:e,kind:"task",entries:t.tasks,all:i,now:n})]})}function Vn({v:e,lists:t,now:n}){let i=Q(e.findings.closed,Ht(t.findings)).map(s=>({id:s.id,ask:s.title,outcome:s.outcome,isLapsed:fe(s),at:s.closedAt})),o=t.findings.length===0;return o&&i.length===0?a("div",{class:"empty",children:[a("div",{class:"title",children:"No findings yet"}),a("div",{class:"muted",children:"Codex flags issues and opportunities it spots beyond your task."})]}):a("main",{children:a("section",{children:[o?a("div",{class:"group-title empty-line",children:"No open findings."}):null,a(Gt,{v:e,entries:t.findings,group:"finding",all:t.byTab.findings,now:n}),a(Bt,{group:"finding",closed:i,now:n})]})})}var Wn=6e4;function jn({v:e,now:t}){let n={needsYou:e.needsYou.count,findings:e.findings.count},{changedAt:i,isUpdating:o,error:s}=e.status,r=Date.now()-At,c=Ue>=2?a("span",{class:r>Wn?"tone-error":void 0,children:["Last read ",D(r)," \\xB7 retrying"]}):o?"Updating\\u2026":i!==null?`Updated ${D(t-i)}`:"Not updated yet";return a("nav",{children:[a("div",{class:"tabs",children:Ct.map(d=>a("button",{type:"button",class:`tab ${$===d.id?"shown":""}`,onClick:()=>{$=d.id,m()},children:[d.label,n[d.id]>0?a("span",{class:`count tone-${d.id}`,children:n[d.id]}):null]}))}),a("div",{class:"status",children:c}),s?a("div",{class:"status-line tone-error",children:s}):null,V&&Date.now()-V.at<k?a("div",{class:V.isError?"status-line tone-error":"status-line muted",children:V.text}):null]})}async function Et(){j=!j,x=null,S=new Map,De=null,He.clear(),F.needsYou=null,F.findings=null,P=null,m(),await qe()}function Yn(){if(!x)return be!==null?a("div",{class:"notice",children:["Could not read the inbox. ",be," ",a("button",{type:"button",class:"key",onClick:()=>{qe()},children:"Try again"})]}):a("div",{class:"notice",children:a("span",{class:"muted",children:"Loading\\u2026"})});let e=x,t=e.at,n=Ve(e,We());return a(A,{children:[j?a("div",{class:"demo-note",children:[a("span",{children:"Showing sample entries. Presses here send nothing."}),a("button",{type:"button",class:"key",onClick:()=>{Et()},children:"Hide demo"})]}):null,a(jn,{v:e,now:t}),$==="needsYou"?a(qn,{v:e,lists:n,now:t}):a(Vn,{v:e,lists:n,now:t}),a("footer",{children:j?null:a("button",{type:"button",class:"demo-toggle",onClick:()=>{Et()},children:"Show demo"})})]})}var Gn={duration:300,easing:"cubic-bezier(.19, 1, .22, 1)"},Ye=200,Kt={duration:Ye,easing:"cubic-bezier(.65, 0, .35, 1)"},Qt={duration:M,easing:"cubic-bezier(.8, 0, .4, 1)",fill:"forwards"},ke=matchMedia("(prefers-reduced-motion: reduce)");function Bn(){let e=new Map;for(let t of document.querySelectorAll("[data-motion]"))e.set(t.dataset.motion,{el:t,height:t.getBoundingClientRect().height});return e}function ye(e,t,n,i){e.style.overflow="hidden",e.dataset.to=String(i);let o=e.animate(t,n),s=()=>{e.getAnimations().length>0||(e.style.overflow="",delete e.dataset.to)};o.onfinish=s,o.oncancel=s}function Kn(e){if(ke.matches){J.clear();return}for(let t of document.querySelectorAll("[data-motion]")){let n=t.dataset.motion,i=e.get(n);if(t.dataset.closing)continue;let o=t.getAnimations();if(t.classList.contains("leaving")){if(t.dataset.leaving)continue;t.dataset.leaving="1",ne.set(n,Date.now()),setTimeout(m,M+50);let u=t.getBoundingClientRect().height,f=Number(getComputedStyle(t).opacity);for(let g of o)g.cancel();ye(t,[{height:`${u}px`,opacity:f},{height:"0px",opacity:0}],Qt,0);continue}delete t.dataset.leaving;let s=t.querySelector(".panel.closing");if(s){t.dataset.collapsing||Qn(t,n,s,i?.el===t?i.height:void 0);continue}delete t.dataset.collapsing;let r=t.scrollHeight;if(!i||i.el!==t){if(!J.delete(n))continue;ye(t,[{height:"0px",opacity:0},{height:`${r}px`,opacity:1}],Gn,r);continue}if(o.length>0&&Math.abs(Number(t.dataset.to)-r)<1)continue;let c=o.length>0?t.getBoundingClientRect().height:i.height,d=o.length>0?Number(getComputedStyle(t).opacity):1;for(let u of o)u.cancel();Math.abs(c-r)<1&&d>.99||ye(t,[{height:`${c}px`,opacity:d},{height:`${r}px`,opacity:1}],Kt,r)}J.clear()}function Qn(e,t,n,i){e.dataset.collapsing="1";let o=e.getAnimations().length>0?e.getBoundingClientRect().height:i??e.scrollHeight,s=e.querySelector(".row.closing");s?.classList.remove("closing"),n.style.display="none";let r=e.scrollHeight;n.style.display="",s?.classList.add("closing");for(let d of e.getAnimations())d.cancel();e.style.overflow="hidden",e.dataset.to=String(r);let c=e.animate([{height:`${o}px`},{height:`${r}px`}],{...Kt,fill:"forwards"});c.onfinish=()=>{Z.delete(t),m(),c.cancel(),!(e.getAnimations().length>0)&&(e.style.overflow="",delete e.dataset.to)}}function Xn(e){let t=document.querySelector(`[data-motion="closed-${e}"]`);if(!q.has(e)){q.add(e),he.delete(e)&&t?delete t.dataset.closing:J.add(`closed-${e}`),m();return}if(q.delete(e),!t||ke.matches){m();return}he.add(e),m(),t.dataset.closing="1";let n=t.getBoundingClientRect().height;for(let i of t.getAnimations())i.cancel();ye(t,[{height:`${n}px`,opacity:1},{height:"0px",opacity:0}],Qt,0),setTimeout(()=>{q.has(e)||!he.delete(e)||m()},M)}function zn(){document.querySelector(".row.selected")?.scrollIntoView({block:"nearest"}),ke.matches||setTimeout(()=>document.querySelector(".row.selected")?.scrollIntoView({block:"nearest"}),Ye+20)}var X=document.getElementById("app");function m(){X.className&&(X.className="",X.textContent="");let e=Bn();lt(a(Yn,{}),X),Kn(e),Oe&&P&&(Oe=!1,document.getElementById(`type-${P}`)?.focus())}document.addEventListener("keydown",e=>{if(e.metaKey||e.ctrlKey||e.altKey||!x)return;let t=e.target;if(t?.closest("input, textarea")){e.key==="Escape"&&t.tagName==="INPUT"&&(P=null,m());return}let n=Ct.find(f=>f.hotkey===e.key);if(n){$=n.id,m();return}let i=Ve(x,We()).byTab[$],o=qt(i,$,x),s=e.key==="j"||e.key==="ArrowDown"?1:e.key==="k"||e.key==="ArrowUp"?-1:0;if(s!==0){e.preventDefault(),Vt($,i,Math.max(0,Math.min(i.length-1,o+s))),zn();return}let r=i[o];if(!r)return;let{keys:c,more:d}=jt(r),u=[...c,...d].find(f=>f.hotkey===e.key);u&&(e.preventDefault(),u.run())});Nt("ui/initialize",{protocolVersion:"2026-01-26",appInfo:{name:"inbox",version:"0.1.0"},appCapabilities:{tools:{}}}).then(e=>{It(e?.hostContext??{}),parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/initialized",params:{}},"*"),Mt()}).catch(()=>{X.textContent="The inbox could not connect to Codex."});})();\n\n    </script>\n  </body>\n</html>\n';

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
