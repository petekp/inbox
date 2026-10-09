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
function isHandedOff(last, turns) {
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
function inboxView({ ledger, lastActions, turns, status }) {
  const { questions, tasks } = needsYouOrder(ledger);
  const numbers = questionNumbers(ledger, ledger.turn + 1);
  const stateOf = (id) => isHandedOff(lastActions[id], turns) ? { is: "handedOff" } : { is: "open" };
  const itemRow = (item) => {
    const n = numbers.get(item.id);
    return {
      id: item.id,
      type: item.kind,
      handle: item.kind === "task" ? "\u2022" : n === void 0 ? "?" : `${n})`,
      title: item.ask,
      at: item.at,
      item,
      finding: null,
      // Questions never fold.
      state: item.kind === "task" ? stateOf(item.id) : { is: "open" }
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
    state: stateOf(finding.id)
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
    ...inboxView({ ledger: l, lastActions: s.lastActions, turns: s.presence, status: perTurnStatus(l, update) }),
    goal: l.card?.goal ?? "",
    now: l.card?.now ?? "",
    done: l.card?.done ?? [],
    running: l.card?.running ?? [],
    lastActions: s.lastActions,
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
var tab_default = '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <title>Inbox</title>\n    <style>\n      /* The host\'s variables when Codex passes them; otherwise the pane\'s own colors. */\n      :root {\n        color-scheme: light;\n        --bg: var(--color-background-primary, #ffffff);\n        --text: var(--color-text-primary, #1f1f1f);\n        --muted: var(--color-text-secondary, #595959);\n        --key: #243bf5;\n        --needs-you: #745417;\n        --findings: #7b00e8;\n        --done: #25652f;\n        --error: #a5293d;\n        --error-mark: #a5293d;\n        --sans: var(--font-sans, -apple-system, system-ui, sans-serif);\n        --mono: var(--font-mono, ui-monospace, \'SF Mono\', Menlo, monospace);\n        /* Surfaces are mixed from the host\'s colors, so they follow its theme. */\n        --card: color-mix(in srgb, var(--text) 4.5%, var(--bg));\n        --raised: color-mix(in srgb, var(--text) 9%, var(--bg));\n        --selected: color-mix(in srgb, #4c9aff 20%, var(--card));\n        --tree: color-mix(in srgb, var(--text) 30%, var(--bg));\n        --divider: color-mix(in srgb, var(--text) 9%, var(--bg));\n        --hover: color-mix(in srgb, var(--key) 14%, transparent);\n        /* The tree\'s grid: its line, where a row\'s mark sits, and where its text starts. */\n        --tree-x: 15px;\n        --mark-x: 30px;\n        --text-x: 52px;\n      }\n      @media (prefers-color-scheme: dark) {\n        :root:not([data-theme=\'light\']) {\n          color-scheme: dark;\n          --bg: var(--color-background-primary, #171717);\n          --text: var(--color-text-primary, #ececec);\n          --muted: var(--color-text-secondary, #a8a8a8);\n          --key: #b1b9f9;\n          --needs-you: #ffc107;\n          --findings: #cab0ff;\n          --done: #7ecd8f;\n          --error: #ffa3b0;\n          --error-mark: #ff6b80;\n          --card: color-mix(in srgb, var(--text) 5.5%, var(--bg));\n          --raised: color-mix(in srgb, var(--text) 11%, var(--bg));\n          --selected: color-mix(in srgb, #7fa6d9 15%, var(--card));\n          --tree: color-mix(in srgb, var(--text) 32%, var(--bg));\n          --divider: color-mix(in srgb, var(--text) 8%, var(--bg));\n        }\n      }\n      :root[data-theme=\'dark\'] {\n        color-scheme: dark;\n        --key: #b1b9f9;\n        --needs-you: #ffc107;\n        --findings: #cab0ff;\n        --done: #7ecd8f;\n        --error: #ffa3b0;\n        --error-mark: #ff6b80;\n        --card: color-mix(in srgb, var(--text) 5.5%, var(--bg));\n        --raised: color-mix(in srgb, var(--text) 11%, var(--bg));\n        --selected: color-mix(in srgb, #7fa6d9 15%, var(--card));\n        --tree: color-mix(in srgb, var(--text) 32%, var(--bg));\n        --divider: color-mix(in srgb, var(--text) 8%, var(--bg));\n      }\n      * {\n        box-sizing: border-box;\n      }\n      body {\n        margin: 0;\n        background: var(--bg);\n        color: var(--text);\n        font: 13px/20px var(--sans);\n        -webkit-font-smoothing: antialiased;\n      }\n      button {\n        font: inherit;\n        color: inherit;\n        background: none;\n        border: none;\n        padding: 0;\n        cursor: pointer;\n        text-align: left;\n      }\n      :focus-visible {\n        outline: 1.5px solid var(--key);\n        outline-offset: 1px;\n        border-radius: 4px;\n      }\n      kbd {\n        font: 12px/20px var(--mono);\n        color: var(--key);\n      }\n      .muted {\n        color: var(--muted);\n      }\n      .tone-needsYou {\n        color: var(--needs-you);\n      }\n      .tone-findings {\n        color: var(--findings);\n      }\n      .tone-done {\n        color: var(--done);\n      }\n      .tone-error {\n        color: var(--error);\n      }\n      .notice {\n        padding: 10px 16px;\n        color: var(--error);\n      }\n\n      /* Tabs: the shown one a raised panel, the others text on the background. */\n      nav {\n        display: flex;\n        flex-wrap: wrap;\n        align-items: flex-end;\n        justify-content: space-between;\n        gap: 4px 16px;\n        padding: 12px 12px 0;\n      }\n      .tabs {\n        display: flex;\n        gap: 4px;\n      }\n      .tab {\n        padding: 6px 12px;\n        border-radius: 6px;\n        color: var(--muted);\n      }\n      .tab:hover {\n        color: var(--text);\n      }\n      .tab.shown {\n        background: var(--raised);\n        color: var(--text);\n        font-weight: 600;\n      }\n      .tab .count {\n        font-weight: 600;\n        margin-left: 6px;\n      }\n      .status {\n        padding: 6px 4px;\n        color: var(--muted);\n        font-size: 12px;\n      }\n\n      main {\n        display: flex;\n        flex-direction: column;\n        gap: 8px;\n        padding: 12px 12px 4px;\n      }\n      section {\n        background: var(--card);\n        border-radius: 8px;\n        padding: 10px 0;\n      }\n      .group-title {\n        padding: 0 14px 0 calc(var(--tree-x) + 4px);\n        font-weight: 500;\n      }\n      .group-title .count {\n        color: var(--muted);\n        margin-left: 6px;\n      }\n\n      /* The tree: a hairline from the group\'s title, an elbow to each row, and a rounded last elbow. */\n      .tree {\n        position: relative;\n        padding-top: 8px;\n      }\n      .tree::before {\n        content: \'\';\n        position: absolute;\n        left: var(--tree-x);\n        top: 0;\n        height: 8px;\n        border-left: 1px solid var(--tree);\n      }\n      .entry {\n        position: relative;\n        --elbow: 16px;\n      }\n      .entry:has(> .row.selected) {\n        --elbow: 22px;\n      }\n      .tree > .entry::before {\n        content: \'\';\n        position: absolute;\n        left: var(--tree-x);\n        top: 0;\n        bottom: 0;\n        border-left: 1px solid var(--tree);\n        z-index: 1;\n      }\n      .tree > .entry::after {\n        content: \'\';\n        position: absolute;\n        left: var(--tree-x);\n        top: var(--elbow);\n        width: 11px;\n        border-top: 1px solid var(--tree);\n        z-index: 1;\n      }\n      .tree > .entry:last-child::before {\n        bottom: auto;\n        height: calc(var(--elbow) + 1px);\n        width: 11px;\n        border-bottom: 1px solid var(--tree);\n        border-bottom-left-radius: 7px;\n      }\n      .tree > .entry:last-child::after {\n        display: none;\n      }\n      .flat {\n        --mark-x: 18px;\n        --text-x: 40px;\n      }\n\n      /* Rows. A divider runs from the text column to the edge, under the tree\'s line. */\n      .row {\n        display: flex;\n        padding: 6px 14px 6px var(--mark-x);\n      }\n      .entry + .entry > .row {\n        background-image: linear-gradient(var(--divider), var(--divider));\n        background-repeat: no-repeat;\n        background-size: calc(100% - var(--text-x)) 1px;\n        background-position: right top;\n      }\n      .row.selected {\n        background-color: var(--selected);\n        padding-top: 12px;\n        padding-bottom: 12px;\n      }\n      .mark {\n        flex: none;\n        width: calc(var(--text-x) - var(--mark-x));\n        font: 12px/20px var(--mono);\n        color: var(--muted);\n      }\n      .mark.done,\n      .mark.error {\n        font-size: 13px;\n      }\n      .mark.done {\n        color: var(--done);\n      }\n      .mark.error {\n        color: var(--error-mark);\n      }\n      .content {\n        flex: 1;\n        min-width: 0;\n        display: flex;\n        flex-direction: column;\n        gap: 8px;\n      }\n      .content > .tight,\n      .content.tight {\n        display: flex;\n        flex-direction: column;\n        gap: 0;\n      }\n      .line {\n        display: flex;\n        width: 100%;\n        min-width: 0;\n      }\n      .line .text {\n        min-width: 0;\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .line .text.two {\n        white-space: normal;\n        display: -webkit-box;\n        -webkit-line-clamp: 2;\n        -webkit-box-orient: vertical;\n      }\n      .line .after {\n        flex: none;\n        white-space: pre;\n        color: var(--muted);\n      }\n      .line .after.tone-done {\n        color: var(--done);\n      }\n      .line:hover .text {\n        color: color-mix(in srgb, var(--text) 80%, var(--key));\n      }\n      .title {\n        font-weight: 600;\n      }\n      .title .after {\n        font-weight: 400;\n        color: var(--muted);\n      }\n      .meta {\n        font-size: 12px;\n      }\n      .body {\n        overflow-wrap: anywhere;\n      }\n      .body p {\n        margin: 0;\n      }\n      .body p + p {\n        margin-top: 4px;\n      }\n      /* Keys are text, as the pane draws them: "a: Fix". */\n      .keys {\n        display: flex;\n        flex-wrap: wrap;\n        align-items: center;\n        gap: 2px 8px;\n        margin-left: -6px;\n      }\n      .key {\n        padding: 1px 6px;\n        border-radius: 5px;\n        white-space: nowrap;\n      }\n      .key:hover {\n        background: var(--hover);\n      }\n      .key .note {\n        color: var(--muted);\n      }\n      .key-dot {\n        color: var(--muted);\n      }\n      form {\n        display: flex;\n        align-items: center;\n        gap: 8px;\n      }\n      input {\n        flex: 1;\n        min-width: 0;\n        font: inherit;\n        color: inherit;\n        background: var(--bg);\n        border: 1px solid var(--tree);\n        border-radius: 6px;\n        padding: 4px 8px;\n      }\n      input:focus {\n        outline: none;\n        border-color: var(--key);\n      }\n      textarea {\n        width: 100%;\n        font: 12px var(--mono);\n        color: inherit;\n        background: var(--bg);\n        border: 1px solid var(--tree);\n        border-radius: 6px;\n      }\n\n      .empty-line {\n        color: var(--muted);\n      }\n      .fold {\n        display: block;\n        margin: 8px 0 0 calc(var(--mark-x) - 2px);\n        padding: 1px 4px;\n        border-radius: 5px;\n        color: var(--muted);\n      }\n      .fold:hover {\n        color: var(--text);\n      }\n      .fold-mark {\n        display: inline-block;\n        width: 14px;\n        font-family: var(--mono);\n      }\n      /* The closed items hang from the fold\'s arrow. */\n      .tree.closed-tree {\n        --tree-x: 36px;\n        --mark-x: 52px;\n        --text-x: 72px;\n        padding-top: 4px;\n      }\n      .tree.closed-tree::before {\n        height: 4px;\n      }\n      .tree.closed-tree .entry + .entry > .row {\n        background-image: none;\n      }\n      .outcome {\n        font-weight: 600;\n      }\n      .outcome.lapsed {\n        font-weight: 400;\n        color: var(--muted);\n      }\n      .settled .what {\n        color: var(--muted);\n        overflow: hidden;\n        text-overflow: ellipsis;\n        white-space: nowrap;\n      }\n      .leave {\n        width: 96px;\n        height: 1.5px;\n        margin-top: 4px;\n        border-radius: 1px;\n        overflow: hidden;\n      }\n      .leave div {\n        height: 100%;\n        background: var(--done);\n        animation-name: leave;\n        animation-timing-function: linear;\n        animation-fill-mode: forwards;\n      }\n      @keyframes leave {\n        from {\n          width: 100%;\n        }\n        to {\n          width: 0;\n        }\n      }\n      .empty {\n        padding: 56px 32px;\n        text-align: center;\n      }\n      .empty .title {\n        margin-bottom: 4px;\n      }\n      footer {\n        display: flex;\n        flex-wrap: wrap;\n        justify-content: space-between;\n        gap: 4px 16px;\n        padding: 8px 16px 16px;\n        color: var(--muted);\n        font-size: 12px;\n      }\n      .demo-toggle {\n        padding: 0 6px;\n        border-radius: 5px;\n        color: var(--muted);\n      }\n      .demo-toggle:hover {\n        color: var(--text);\n        background: var(--hover);\n      }\n      .demo-note {\n        margin: 12px 12px 0;\n        padding: 6px 12px;\n        border-radius: 6px;\n        background: var(--raised);\n        color: var(--text);\n      }\n      footer kbd {\n        margin-right: 4px;\n      }\n      footer .sep {\n        margin: 0 8px;\n      }\n      @media (prefers-reduced-motion: reduce) {\n        .leave div {\n          animation: none;\n        }\n      }\n    </style>\n  </head>\n  <body>\n    <div id="app" class="notice muted">Loading\u2026</div>\n    <script>\n      "use strict";(()=>{var ee,m,Ae,it,C,$e,Re,Le,le,K,V,Ee,ce,de,ue,ot,z={},J=[],rt=/acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i,te=Array.isArray;function T(e,t){for(var n in t)e[n]=t[n];return e}function pe(e){e&&e.parentNode&&e.parentNode.removeChild(e)}function at(e,t,n){var s,o,i,d={};for(i in t)i=="key"?s=t[i]:i=="ref"?o=t[i]:d[i]=t[i];if(arguments.length>2&&(d.children=arguments.length>3?ee.call(arguments,2):n),typeof e=="function"&&e.defaultProps!=null)for(i in e.defaultProps)d[i]===void 0&&(d[i]=e.defaultProps[i]);return X(e,d,s,o,null)}function X(e,t,n,s,o){var i={type:e,props:t,key:n,ref:s,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:o??++Ae,__i:-1,__u:0};return o==null&&m.vnode!=null&&m.vnode(i),i}function A(e){return e.children}function Q(e,t){this.props=e,this.context=t}function N(e,t){if(t==null)return e.__?N(e.__,e.__i+1):null;for(var n;t<e.__k.length;t++)if((n=e.__k[t])!=null&&n.__e!=null)return n.__e;return typeof e.type=="function"?N(e):null}function lt(e){if(e.__P&&e.__d){var t=e.__v,n=t.__e,s=[],o=[],i=T({},t);i.__v=t.__v+1,m.vnode&&m.vnode(i),fe(e.__P,i,t,e.__n,e.__P.namespaceURI,32&t.__u?[n]:null,s,n??N(t),!!(32&t.__u),o),i.__v=t.__v,i.__.__k[i.__i]=i,Oe(s,i,o),t.__e=t.__=null,i.__e!=n&&Pe(i)}}function Pe(e){if((e=e.__)!=null&&e.__c!=null)return e.__e=e.__c.base=null,e.__k.some(function(t){if(t!=null&&t.__e!=null)return e.__e=e.__c.base=t.__e}),Pe(e)}function Se(e){(!e.__d&&(e.__d=!0)&&C.push(e)&&!Z.__r++||$e!=m.debounceRendering)&&(($e=m.debounceRendering)||Re)(Z)}function Z(){try{for(var e,t=1;C.length;)C.length>t&&C.sort(Le),e=C.shift(),t=C.length,lt(e)}finally{C.length=Z.__r=0}}function Ne(e,t,n,s,o,i,d,l,c,u,p){var f,r,h,_,k,b,y=s&&s.__k||J,g=t.length;for(c=dt(n,t,y,c,g),f=0;f<g;f++)(h=n.__k[f])!=null&&(r=h.__i!=-1&&y[h.__i]||z,h.__i=f,b=fe(e,h,r,o,i,d,l,c,u,p),_=h.__e,h.ref&&r.ref!=h.ref&&(r.ref&&he(r.ref,null,h),p.push(h.ref,h.__c||_,h)),k==null&&_!=null&&(k=_),4&h.__u?(c=Ie(h,c,e),r.__e&&(r.__e=null)):typeof h.type=="function"&&b!==void 0?c=b:_&&(c=_.nextSibling),h.__u&=-7);return n.__e=k,c}function dt(e,t,n,s,o){var i,d,l,c,u,p=n.length,f=p,r=0;for(e.__k=new Array(o),i=0;i<o;i++)(d=t[i])!=null&&typeof d!="boolean"&&typeof d!="function"?(typeof d=="string"||typeof d=="number"||typeof d=="bigint"||d.constructor==String?d=e.__k[i]=X(null,d,null,null,null):te(d)?d=e.__k[i]=X(A,{children:d},null,null,null):d.constructor===void 0&&d.__b>0?d=e.__k[i]=X(d.type,d.props,d.key,d.ref?d.ref:null,d.__v):e.__k[i]=d,c=i+r,d.__=e,d.__b=e.__b+1,l=null,(u=d.__i=ut(d,n,c,f))!=-1&&(f--,(l=n[u])&&(l.__u|=2)),l==null||l.__v==null?(u==-1&&(o>p?r--:o<p&&r++),typeof d.type!="function"&&(d.__u|=4)):u!=c&&(u==c-1?r--:u==c+1?r++:(u>c?r--:r++,d.__u|=4))):e.__k[i]=null;if(f)for(i=0;i<p;i++)(l=n[i])!=null&&(2&l.__u)==0&&(l.__e==s&&(s=N(l)),Fe(l,l));return s}function Ie(e,t,n){var s,o;if(typeof e.type=="function"){for(s=e.__k,o=0;s&&o<s.length;o++)s[o]&&(s[o].__=e,t=Ie(s[o],t,n));return t}e.__e!=t&&(t&&e.type&&!t.parentNode&&(t=N(e)),t=n.insertBefore(e.__e,t||null));do t=t&&t.nextSibling;while(t!=null&&t.nodeType==8);return t}function ut(e,t,n,s){var o,i,d,l=e.key,c=e.type,u=t[n],p=u!=null&&(2&u.__u)==0;if(u===null&&l==null||p&&l==u.key&&c==u.type)return n;if(s>(p?1:0)){for(o=n-1,i=n+1;o>=0||i<t.length;)if((u=t[d=o>=0?o--:i++])!=null&&(2&u.__u)==0&&l==u.key&&c==u.type)return d}return-1}function Te(e,t,n){t[0]=="-"?e.setProperty(t,n??""):e[t]=n==null?"":typeof n!="number"||rt.test(t)?n:n+"px"}function G(e,t,n,s,o){var i,d;e:if(t=="style")if(typeof n=="string")e.style.cssText=n;else{if(typeof s=="string"&&(e.style.cssText=s=""),s)for(t in s)n&&t in n||Te(e.style,t,"");if(n)for(t in n)s&&n[t]==s[t]||Te(e.style,t,n[t])}else if(t[0]=="o"&&t[1]=="n")i=t!=(t=t.replace(Ee,"$1")),d=t.toLowerCase(),t=d in e||t=="onFocusOut"||t=="onFocusIn"?d.slice(2):t.slice(2),e.l||(e.l={}),e.l[t+i]=n,n?s?n[V]=s[V]:(n[V]=ce,e.addEventListener(t,i?ue:de,i)):e.removeEventListener(t,i?ue:de,i);else{if(o=="http://www.w3.org/2000/svg")t=t.replace(/xlink(H|:h)/,"h").replace(/sName$/,"s");else if(t!="width"&&t!="height"&&t!="href"&&t!="list"&&t!="form"&&t!="tabIndex"&&t!="download"&&t!="rowSpan"&&t!="colSpan"&&t!="role"&&t!="popover"&&t in e)try{e[t]=n??"";break e}catch{}typeof n=="function"||(n==null||n===!1&&t[4]!="-"?e.removeAttribute(t):e.setAttribute(t,t=="popover"&&n==1?"":n))}}function Ce(e){return function(t){if(this.l){var n=this.l[t.type+e];if(t[K]==null)t[K]=ce++;else if(t[K]<n[V])return;return n(m.event?m.event(t):t)}}}function fe(e,t,n,s,o,i,d,l,c,u){var p,f,r,h,_,k,b,y,g,x,H,P,M,xe,B,ae,$=t.type;if(t.constructor!==void 0)return null;128&n.__u&&(c=!!(32&n.__u),i=[l=t.__e=n.__e]),(p=m.__b)&&p(t);e:if(typeof $=="function"){f=d.length;try{if(g=t.props,x=$.prototype&&$.prototype.render,H=(p=$.contextType)&&s[p.__c],P=p?H?H.props.value:p.__:s,n.__c?y=(r=t.__c=n.__c).__=r.__E:(x?t.__c=r=new $(g,P):(t.__c=r=new Q(g,P),r.constructor=$,r.render=pt),H&&H.sub(r),r.state||(r.state={}),r.__n=s,h=r.__d=!0,r.__h=[],r._sb=[]),x&&r.__s==null&&(r.__s=r.state),x&&$.getDerivedStateFromProps!=null&&(r.__s==r.state&&(r.__s=T({},r.__s)),T(r.__s,$.getDerivedStateFromProps(g,r.__s))),_=r.props,k=r.state,r.__v=t,h)x&&$.getDerivedStateFromProps==null&&r.componentWillMount!=null&&r.componentWillMount(),x&&r.componentDidMount!=null&&r.__h.push(r.componentDidMount);else{if(x&&$.getDerivedStateFromProps==null&&g!==_&&r.componentWillReceiveProps!=null&&r.componentWillReceiveProps(g,P),t.__v==n.__v||!r.__e&&r.shouldComponentUpdate!=null&&r.shouldComponentUpdate(g,r.__s,P)===!1){t.__v!=n.__v&&(r.props=g,r.state=r.__s,r.__d=!1),t.__e=n.__e,t.__k=n.__k,t.__k.some(function(O){O&&(O.__=t)}),J.push.apply(r.__h,r._sb),r._sb=[],r.__h.length&&d.push(r),l=N(n);break e}r.componentWillUpdate!=null&&r.componentWillUpdate(g,r.__s,P),x&&r.componentDidUpdate!=null&&r.__h.push(function(){r.componentDidUpdate(_,k,b)})}if(r.context=P,r.props=g,r.__P=e,r.__e=!1,M=m.__r,xe=0,x)r.state=r.__s,r.__d=!1,M&&M(t),p=r.render(r.props,r.state,r.context),J.push.apply(r.__h,r._sb),r._sb=[];else do r.__d=!1,M&&M(t),p=r.render(r.props,r.state,r.context),r.state=r.__s;while(r.__d&&++xe<25);r.state=r.__s,r.getChildContext!=null&&(s=T(T({},s),r.getChildContext())),x&&!h&&r.getSnapshotBeforeUpdate!=null&&(b=r.getSnapshotBeforeUpdate(_,k)),B=p!=null&&p.type===A&&p.key==null?Ue(p.props.children):p,l=Ne(e,te(B)?B:[B],t,n,s,o,i,d,l,c,u),r.base=t.__e,t.__u&=-161,r.__h.length&&d.push(r),y&&(r.__E=r.__=null)}catch(O){if(d.length=f,t.__v=null,c||i!=null){if(O.then){for(t.__u|=c?160:128;l&&l.nodeType==8&&l.nextSibling;)l=l.nextSibling;i!=null&&(i[i.indexOf(l)]=null),t.__e=l}else if(i!=null)for(ae=i.length;ae--;)pe(i[ae])}else t.__e=n.__e;t.__k==null&&(t.__k=n.__k||[]),O.then||De(t),m.__e(O,t,n)}}else i==null&&t.__v==n.__v?(t.__k=n.__k,t.__e=n.__e):l=t.__e=ct(n.__e,t,n,s,o,i,d,c,u);return(p=m.diffed)&&p(t),128&t.__u?void 0:l}function De(e){e&&(e.__c&&(e.__c.__e=!0),e.__k&&e.__k.some(De))}function Oe(e,t,n){for(var s=0;s<n.length;s++)he(n[s],n[++s],n[++s]);m.__c&&m.__c(t,e),e.some(function(o){try{e=o.__h,o.__h=[],e.some(function(i){i.call(o)})}catch(i){m.__e(i,o.__v)}})}function Ue(e){return typeof e!="object"||e==null||e.__b>0?e:te(e)?e.map(Ue):e.constructor!==void 0?null:T({},e)}function ct(e,t,n,s,o,i,d,l,c){var u,p,f,r,h,_,k,b=n.props||z,y=t.props,g=t.type;if(g=="svg"?o="http://www.w3.org/2000/svg":g=="math"?o="http://www.w3.org/1998/Math/MathML":o||(o="http://www.w3.org/1999/xhtml"),i!=null){for(u=0;u<i.length;u++)if((h=i[u])&&"setAttribute"in h==!!g&&(g?h.localName==g:h.nodeType==3)){e=h,i[u]=null;break}}if(e==null){if(g==null)return document.createTextNode(y);e=document.createElementNS(o,g,y.is&&y),l&&(m.__m&&m.__m(t,i),l=!1),i=null}if(g==null)b===y||l&&e.data==y||(e.data=y);else{if(i=g=="textarea"&&y.defaultValue!=null?null:i&&ee.call(e.childNodes),!l&&i!=null)for(b={},u=0;u<e.attributes.length;u++)b[(h=e.attributes[u]).name]=h.value;for(u in b)h=b[u],u=="dangerouslySetInnerHTML"?f=h:u=="children"||u in y||u=="value"&&"defaultValue"in y||u=="checked"&&"defaultChecked"in y||G(e,u,null,h,o);for(u in y)h=y[u],u=="children"?r=h:u=="dangerouslySetInnerHTML"?p=h:u=="value"?_=h:u=="checked"?k=h:l&&typeof h!="function"||b[u]===h||G(e,u,h,b[u],o);if(p)l||f&&(p.__html==f.__html||p.__html==e.innerHTML)||(e.innerHTML=p.__html),t.__k=[];else if(f&&(e.innerHTML=""),Ne(t.type=="template"?e.content:e,te(r)?r:[r],t,n,s,g=="foreignObject"?"http://www.w3.org/1999/xhtml":o,i,d,i?i[0]:n.__k&&N(n,0),l,c),i!=null)for(u=i.length;u--;)pe(i[u]);l&&g!="textarea"||(u="value",g=="progress"&&_==null?e.removeAttribute("value"):_!=null&&(_!==e[u]||g=="progress"&&!_||g=="option"&&_!=b[u])&&G(e,u,_,b[u],o),u="checked",k!=null&&k!=e[u]&&G(e,u,k,b[u],o))}return e}function he(e,t,n){try{if(typeof e=="function"){var s=typeof e.__u=="function";s&&e.__u(),s&&t==null||(e.__u=e(t))}else e.current=t}catch(o){m.__e(o,n)}}function Fe(e,t,n){var s,o;if(m.unmount&&m.unmount(e),(s=e.ref)&&(s.current&&s.current!=e.__e||he(s,null,t)),(s=e.__c)!=null){if(s.componentWillUnmount)try{s.componentWillUnmount()}catch(i){m.__e(i,t)}s.base=s.__P=s.__n=null}if(s=e.__k)for(o=0;o<s.length;o++)s[o]&&Fe(s[o],t,n||typeof e.type!="function");n||pe(e.__e),e.__c=e.__=e.__e=void 0}function pt(e,t,n){return this.constructor(e,n)}function He(e,t,n){var s,o,i,d;t==document&&(t=document.documentElement),m.__&&m.__(e,t),o=(s=typeof n=="function")?null:n&&n.__k||t.__k,i=[],d=[],fe(t,e=(!s&&n||t).__k=at(A,null,[e]),o||z,z,t.namespaceURI,!s&&n?[n]:o?null:t.firstChild?ee.call(t.childNodes):null,i,!s&&n?n:o?o.__e:t.firstChild,s,d),Oe(i,e,d),e.props.children=null}ee=J.slice,m={__e:function(e,t,n,s){for(var o,i,d;t=t.__;)if((o=t.__c)&&!o.__)try{if((i=o.constructor)&&i.getDerivedStateFromError!=null&&(o.setState(i.getDerivedStateFromError(e)),d=o.__d),o.componentDidCatch!=null&&(o.componentDidCatch(e,s||{}),d=o.__d),d)return o.__E=o}catch(l){e=l}throw e}},Ae=0,it=function(e){return e!=null&&e.constructor===void 0},Q.prototype.setState=function(e,t){var n;n=this.__s!=null&&this.__s!=this.state?this.__s:this.__s=T({},this.state),typeof e=="function"&&(e=e(T({},n),this.props)),e&&T(n,e),e!=null&&this.__v&&(t&&this._sb.push(t),Se(this))},Q.prototype.forceUpdate=function(e){this.__v&&(this.__e=!0,e&&this.__h.push(e),Se(this))},Q.prototype.render=A,C=[],Re=typeof Promise=="function"?Promise.prototype.then.bind(Promise.resolve()):setTimeout,Le=function(e,t){return e.__v.__b-t.__v.__b},Z.__r=0,le=Math.random().toString(8),K="__d"+le,V="__a"+le,Ee=/(PointerCapture)$|Capture$/i,ce=0,de=Ce(!1),ue=Ce(!0),ot=0;function R(e){let t=Math.round(e/6e4);if(t<1)return"just now";if(t<60)return`${t}m ago`;let n=Math.round(t/60);return n<48?`${n}h ago`:`${Math.round(n/24)}d ago`}function Ve(e,t){return e.length>t?`${e.slice(0,t-1)}\\u2026`:e}function qe(e){return e.replace(/\\/+$/,"").split("/").pop()??e}function Me(e){let t=e.kind==="open"?`Open ${qe(e.path)}`:e.kind==="copy"?`Copy ${e.name??"snippet"}`:e.kind==="run"?`Run ${e.name??e.command}`:e.kind==="terminal"?`Copy ${e.name??e.command}`:`Open ${e.name??new URL(e.url).host}`;return Ve(t,32)}function ge(e){let t=e.find(s=>s.kind==="copy"),n=e.find(s=>s.kind==="open");return!t||!n||t.kind!=="copy"||n.kind!=="open"?e.map(s=>({label:Me(s),step:[s]})):e.filter(s=>s!==t).map(s=>s===n?{label:Ve(`Copy ${t.name??"snippet"} and open ${qe(n.path)}`,48),step:[t,n]}:{label:Me(s),step:[s]})}var ne=5120;var ft=0;function a(e,t,n,s,o,i){t||(t={});var d,l,c=t;if("ref"in c)for(l in c={},t)l=="ref"?d=t[l]:c[l]=t[l];var u={type:e,props:c,key:n,ref:d,__k:null,__:null,__b:0,__e:null,__c:null,constructor:void 0,__v:--ft,__i:-1,__u:0,__source:o,__self:i};if(typeof e=="function"&&(d=e.defaultProps))for(l in d)c[l]===void 0&&(c[l]=d[l]);return m.vnode&&m.vnode(u),u}var je=[..."abcfghilm"],Ge=[{id:"needsYou",label:"Needs you",hotkey:"1"},{id:"findings",label:"Findings",hotkey:"2"}],ht=3e3,L=null,D=!1,Y=!1,I="needsYou",oe={needsYou:null,findings:null},E=null,_e=!1,j=new Map,U=new Set,me=new Set,re=new Set,F=new Map,W=new Map,ye=new Map,v=[],se={question:[],task:[],finding:[]},we=0,We=0,be=!1,gt=0,ie=new Map;function Ke(e,t){return new Promise((n,s)=>{let o=++gt;ie.set(o,{resolve:n,reject:s}),parent.postMessage({jsonrpc:"2.0",id:o,method:e,params:t},"*")})}window.addEventListener("message",e=>{let t=e.data;if(!(!t||t.jsonrpc!=="2.0")){if(t.id!=null&&!t.method&&ie.has(t.id)){let n=ie.get(t.id);ie.delete(t.id),t.error?n.reject(t.error):n.resolve(t.result);return}t.method==="ui/notifications/host-context-changed"&&Xe(t.params??{}),t.id!=null&&t.method&&parent.postMessage({jsonrpc:"2.0",id:t.id,result:{}},"*")}});function Xe(e){e.theme&&(document.documentElement.dataset.theme=e.theme);for(let[t,n]of Object.entries(e.styles?.variables??{}))document.documentElement.style.setProperty(t,n)}async function ke(e,t={}){return(await Ke("tools/call",{name:e,arguments:t}))?.structuredContent}function mt(e){return{question:e.needsYou.questions.map(t=>t.id),task:e.needsYou.tasks.map(t=>t.id),finding:e.findings.rows.map(t=>t.id)}}function _t(e,t,n,s){if(n==="finding"){let i=t.leaving.find(d=>d.id===s);return i?{what:i.title,outcome:i.text}:null}let o=t.closed.find(i=>i.id===s);return o?{what:o.ask,outcome:ze(o.outcome)}:null}function ve(e,t){if(t<We)return;We=t,Y=!1;let n=Date.now(),s=mt(e),o=[];if(L)for(let i of Object.keys(se))se[i].forEach((d,l)=>{if(s[i].includes(d)||v.some(u=>u.id===d))return;let c=_t(L,e,i,d);c&&o.push({id:d,group:i,index:l,...c,at:n})});v=[...v.filter(i=>!s[i.group].includes(i.id)),...o],o.length>0&&setTimeout(w,ne+50),se=s,L=e,w()}async function Qe(){if(!be){let e=++we;try{let t=await ke("inbox_view",{demo:D});t&&ve(t,e)}catch{Y=!0,w()}}setTimeout(Qe,ht)}async function S(e,t,n){re.add(e),F.delete(e),W.delete(e),w(),be=!0;let s=++we;try{let o=await ke("inbox_press",{press:t,demo:D});o?.error?F.set(e,o.error):n?.(),o?.copy&&await yt(e,o.copy),o?.view&&ve(o.view,s)}catch{F.set(e,"Not sent: the inbox did not answer.")}finally{be=!1,re.delete(e),w()}}async function yt(e,t){try{await navigator.clipboard.writeText(t.text),W.set(e,`Copied ${t.name}`)}catch{ye.set(e,t)}}function ze(e){return e.charAt(0).toUpperCase()+e.slice(1)}function bt(e,t){return e.length>t?`${e.slice(0,t-1)}\\u2026`:e}function Je(e){E=e,_e=!0,w()}function wt(e,t,n){let s=e.lastActions[t.id]??null,o=n.kind==="question",i=t.state.is==="handedOff",d=(f,r)=>s?.action===r?`${f} again`:f,l=n.id,c=[...o?n.options.map((f,r)=>({label:bt(f,32),...f===n.rec?{note:"(recommended)"}:{},run:()=>{S(l,{action:"answer",id:l,option:r})}})):[],...ge(n.helps).map(({label:f},r)=>({label:d(f,`step-${r}`),run:()=>{S(l,{action:"step",id:l,step:r})}}))].slice(0,je.length).map((f,r)=>({...f,hotkey:je[r]})),u={hotkey:"t",label:o?"Type an answer":"Type a reply",run:()=>Je(l)},p={hotkey:"e",label:d("Explain","explain"),run:()=>{S(l,{action:"explain",id:l})}};return{id:l,handle:i?"\\u2713":t.handle,handleTone:i?"done":void 0,...i?{fold:{}}:{},title:n.ask,titleAfter:n.at===null?void 0:` \\xB7 ${R(e.at-n.at)}`,hasSecondLine:o,keys:o?c:[...c,{hotkey:"d",label:"Done",run:()=>{S(l,{action:"done",id:l})}}],more:o?[u,p,{hotkey:"x",label:"Dismiss",run:()=>{S(l,{action:"dismiss",id:l})}}]:[u,p],typing:{hint:o?"Your answer":"Your reply to Codex",send:f=>{S(l,{action:"type",id:l,text:f},()=>j.delete(l))}},last:s}}var kt={issue:{label:"Issue",mark:"\\u25B2",tone:"needsYou"},opportunity:{label:"Opportunity",mark:"\\u2726",tone:"done"}};function vt(e,t){let n=kt[t.kind],s=t.id;return{id:s,handle:"\\u2022",title:t.title,meta:a("div",{children:[a("span",{class:`tone-${n.tone}`,children:[n.mark," ",n.label]}),a("span",{class:"muted",children:[" ",R(e.at-t.at)]})]}),line:{text:t.title,after:` \\xB7 ${R(e.at-t.at)}`},body:a("div",{children:[a("p",{children:t.detail}),t.path?a("p",{children:[a("span",{class:"muted",children:"Relevant file: "}),t.path]}):null]}),keys:[{hotkey:"a",label:"Address it",run:()=>{S(s,{action:"address",id:s})}}],more:[{hotkey:"t",label:"Type a reply",run:()=>Je(s)},{hotkey:"e",label:"Discuss",run:()=>{S(s,{action:"discuss",id:s})}},{hotkey:"x",label:"Dismiss",run:()=>{S(s,{action:"dismissFinding",id:s})}}],typing:{hint:"Your reply to Codex",send:o=>{S(s,{action:"typedFinding",id:s,text:o},()=>j.delete(s))}},last:e.lastActions[s]??null}}function Ze(e){let t=i=>i.flatMap(d=>d.item?[wt(e,d,d.item)]:[]),n=t(e.needsYou.questions),s=t(e.needsYou.tasks),o=e.findings.rows.flatMap(i=>i.finding?[vt(e,i.finding)]:[]);return{questions:n,tasks:s,findings:o,byTab:{needsYou:[...n,...s],findings:o}}}function et(e,t){let n=oe[t];if(!n)return e.length>0?0:-1;let s=e.findIndex(o=>o.id===n.id);return s>=0?s:Math.min(n.index,e.length-1)}function tt(e,t,n){let s=t[n];s&&(oe[e]={id:s.id,index:n},w())}function nt(e){let t={hotkey:"v",label:U.has(e.id)?"Hide details":"Details",run:()=>{U.has(e.id)?U.delete(e.id):U.add(e.id),w()}};return e.fold&&!U.has(e.id)?{keys:[t],more:[]}:e.fold?{keys:e.keys,more:[...e.more,t]}:{keys:e.keys,more:e.more}}function Ye({k:e}){return a("button",{type:"button",class:"key",onClick:e.run,children:[a("kbd",{children:e.hotkey}),": ",e.label,e.note?a("span",{class:"note",children:[" ",e.note]}):null]})}function xt({row:e}){let t=e.typing;return a("form",{onSubmit:s=>{s.preventDefault();let o=(j.get(e.id)??"").trim();o&&(E=null,t.send(o))},children:[a("input",{id:`type-${e.id}`,value:j.get(e.id)??"",placeholder:t.hint,"aria-label":t.hint,onInput:s=>j.set(e.id,s.currentTarget.value)}),a("button",{type:"submit",class:"key",children:[a("kbd",{children:"\\u21B5"}),": Send"]}),a("button",{type:"button",class:"key",onClick:()=>{E=null,w()},children:[a("kbd",{children:"esc"}),": Cancel"]})]})}function $t(e,t){return e.last?`${e.last.text} \\xB7 ${R(t-e.last.at)}`:null}function St({row:e,isSelected:t,onSelect:n,now:s}){let o=e.handleTone==="done"?"tone-done":"muted",i=a("span",{class:`mark ${e.handleTone??""}`,children:e.handle});if(!t){let f=e.line??{text:e.title,after:e.titleAfter},r=e.last?{...f,after:` \\xB7 ${e.last.text.charAt(0).toLowerCase()}${e.last.text.slice(1)} ${R(s-e.last.at)}`,afterTone:e.handleTone==="done"?"done":void 0}:f;return a("div",{class:"row",children:[i,a("button",{type:"button",class:"line",onClick:n,children:[a("span",{class:e.hasSecondLine?"text two":"text",children:r.text}),r.after?a("span",{class:`after ${r.afterTone?`tone-${r.afterTone}`:""}`,children:r.after}):null]})]})}let d=!e.fold||U.has(e.id),{keys:l,more:c}=nt(e),u=[e.fold?.note,$t(e,s)],p=ye.get(e.id);return a("div",{class:"row selected",children:[i,a("div",{class:"content",children:[a("div",{class:"tight",children:[e.meta?a("div",{class:"meta",children:e.meta}):null,a("div",{class:"title",children:[e.title,e.titleAfter?a("span",{class:"after",children:e.titleAfter}):null]})]}),d&&e.body?a("div",{class:"body",children:e.body}):null,u.some(Boolean)||re.has(e.id)||W.has(e.id)||F.has(e.id)?a("div",{class:"tight",children:[u.filter(Boolean).map(f=>a("div",{class:o,children:f})),re.has(e.id)?a("div",{class:"muted",children:"Sending\\u2026"}):null,W.has(e.id)?a("div",{class:"muted",children:W.get(e.id)}):null,F.has(e.id)?a("div",{class:"tone-error",children:F.get(e.id)}):null]}):null,a("div",{class:"keys",children:[l.map(f=>a(Ye,{k:f})),l.length>0&&c.length>0?a("span",{class:"key-dot",children:"\\xB7"}):null,c.map(f=>a(Ye,{k:f}))]}),e.typing&&E===e.id?a(xt,{row:e}):null,p?a("div",{children:[a("div",{class:"muted",children:["Copy ",p.name," from here:"]}),a("textarea",{rows:3,readOnly:!0,value:p.text,onFocus:f=>f.currentTarget.select()}),a("button",{type:"button",class:"key",onClick:()=>{ye.delete(e.id),w()},children:"Close"})]}):null]})]})}function Tt({s:e}){return a("div",{class:"row settled",children:[a("span",{class:"mark done",children:"\\u2713"}),a("div",{class:"content tight",children:[a("div",{class:"what",children:e.what}),a("div",{class:"tone-done",children:e.outcome}),a("div",{class:"leave",children:a("div",{style:{animationDuration:`${ne}ms`},ref:t=>{t&&!t.style.animationDelay&&(t.style.animationDelay=`-${Math.max(0,Date.now()-e.at)}ms`)}})})]})]})}function st({rows:e,group:t,all:n,now:s}){let o=t==="finding"?"findings":"needsYou",i=et(n,o),d=e.map(l=>({row:l}));for(let l of v.filter(c=>c.group===t).sort((c,u)=>c.index-u.index))d.splice(Math.min(l.index,d.length),0,{settled:l});return d.length===0?null:a("div",{class:t==="finding"?"flat":"tree",children:d.map(l=>"row"in l?a("div",{class:"entry",children:a(St,{row:l.row,now:s,isSelected:n.indexOf(l.row)===i,onSelect:()=>tt(o,n,n.indexOf(l.row))})},l.row.id):a("div",{class:"entry",children:a(Tt,{s:l.settled})},`settled-${l.settled.id}`))})}function Ct({title:e,count:t}){return a("div",{class:"group-title",children:[e,t>0?a("span",{class:"count",children:t}):null]})}function Be({v:e,kind:t,rows:n,all:s,now:o}){let i=t==="question"?"Questions":"Tasks",d=new Set(v.map(u=>u.id)),l=e.closed.filter(u=>u.kind===t&&!d.has(u.id)),c=me.has(t);return n.length===0&&!v.some(u=>u.group===t)&&l.length===0?null:a("section",{children:[a(Ct,{title:i,count:n.filter(u=>!u.fold).length}),a(st,{rows:n,group:t,all:s,now:o}),l.length>0?a("button",{type:"button",class:"fold",onClick:()=>{c?me.delete(t):me.add(t),w()},children:[a("span",{class:"fold-mark",children:c?"\\u25BE":"\\u25B8"}),l.length," Closed"]}):null,c&&l.length>0?a("div",{class:"tree closed-tree",children:l.map(u=>a("div",{class:"entry",children:a("div",{class:"row",children:[a("span",{class:"mark",children:"\\u25C7"}),a("div",{class:"content tight",children:[a("div",{class:"muted",children:u.ask}),a("div",{children:[a("span",{class:u.isLapsed?"outcome lapsed":"outcome",children:ze(u.outcome)}),a("span",{class:"muted",children:[" \\xB7 ",R(o-u.at)]})]})]})]})},`closed-${u.id}`))}):null]})}function At({v:e,lists:t,now:n}){let s=t.byTab.needsYou,o=s.length===0&&!v.some(d=>d.group!=="finding"),i=new Set(v.map(d=>d.id));return o&&!e.closed.some(d=>!i.has(d.id))?a("div",{class:"empty",children:a("div",{class:"title",children:"Nothing needs you."})}):a("main",{children:[o?a("section",{children:a("div",{class:"group-title empty-line",children:"Nothing needs you."})}):null,a(Be,{v:e,kind:"question",rows:t.questions,all:s,now:n}),a(Be,{v:e,kind:"task",rows:t.tasks,all:s,now:n})]})}function Rt({lists:e,now:t}){return e.findings.length===0&&!v.some(n=>n.group==="finding")?a("div",{class:"empty",children:[a("div",{class:"title",children:"No findings yet"}),a("div",{class:"muted",children:"Codex flags issues and opportunities it spots beyond your task."})]}):a("main",{children:a("section",{children:a(st,{rows:e.findings,group:"finding",all:e.findings,now:t})})})}function Lt({v:e,now:t}){let n={needsYou:e.needsYou.count,findings:e.findings.count},{changedAt:s,isUpdating:o,error:i}=e.status,d=o?"Updating\\u2026":s!==null?`Updated ${R(t-s)}`:"Not updated yet";return a("nav",{children:[a("div",{class:"tabs",children:Ge.map(l=>a("button",{type:"button",class:`tab ${I===l.id?"shown":""}`,onClick:()=>{I=l.id,w()},children:[l.label,n[l.id]>0?a("span",{class:`count tone-${l.id}`,children:n[l.id]}):null]}))}),a("div",{class:"status",children:[d,i?a("div",{class:"tone-error",children:i}):null]})]})}async function Et(){D=!D,L=null,v=[],se={question:[],task:[],finding:[]},oe.needsYou=null,oe.findings=null,E=null;let e=++we;w();try{let t=await ke("inbox_view",{demo:D});t&&ve(t,e)}catch{Y=!0,w()}}function Pt(){if(!L)return a("div",{class:"notice",children:Y?"Could not read the inbox.":a("span",{class:"muted",children:"Loading\\u2026"})});let e=L,t=e.at,n=Ze(e);return a(A,{children:[Y?a("div",{class:"notice",children:"Could not read the inbox."}):null,D?a("div",{class:"demo-note",children:"Showing sample entries. Presses here send nothing to Codex."}):null,a(Lt,{v:e,now:t}),I==="needsYou"?a(At,{v:e,lists:n,now:t}):a(Rt,{lists:n,now:t}),a("footer",{children:[a("span",{children:[a("kbd",{children:"1 2"}),"Switch tabs",a("span",{class:"sep",children:"\\xB7"}),a("kbd",{children:"j k"}),"Select the next or previous row"]}),a("button",{type:"button",class:"demo-toggle",onClick:()=>{Et()},children:D?"Hide demo":"Show demo"})]})]})}var q=document.getElementById("app");function w(){v=v.filter(e=>Date.now()-e.at<ne),q.className&&(q.className="",q.textContent=""),He(a(Pt,{}),q),_e&&E&&(_e=!1,document.getElementById(`type-${E}`)?.focus())}document.addEventListener("keydown",e=>{if(e.metaKey||e.ctrlKey||e.altKey||!L)return;let t=e.target;if(t?.closest("input, textarea")){e.key==="Escape"&&t.tagName==="INPUT"&&(E=null,w());return}let n=Ge.find(p=>p.hotkey===e.key);if(n){I=n.id,w();return}let s=Ze(L).byTab[I],o=et(s,I),i=e.key==="j"||e.key==="ArrowDown"?1:e.key==="k"||e.key==="ArrowUp"?-1:0;if(i!==0){e.preventDefault(),tt(I,s,Math.max(0,Math.min(s.length-1,o+i))),document.querySelector(".row.selected")?.scrollIntoView({block:"nearest"});return}let d=s[o];if(!d)return;let{keys:l,more:c}=nt(d),u=[...l,...c].find(p=>p.hotkey===e.key);u&&(e.preventDefault(),u.run())});Ke("ui/initialize",{protocolVersion:"2026-01-26",appInfo:{name:"inbox",version:"0.1.0"},appCapabilities:{tools:{}}}).then(e=>{Xe(e?.hostContext??{}),parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/initialized",params:{}},"*"),Qe()}).catch(()=>{q.textContent="The inbox could not connect to Codex."});})();\n\n    </script>\n  </body>\n</html>\n';

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
