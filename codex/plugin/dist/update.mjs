// Built by codex/build.mjs from codex/src and hooks/. Do not edit.

// src/update-main.ts
import { homedir as homedir3 } from "node:os";
import { dirname as dirname2, join as join5 } from "node:path";
import { fileURLToPath } from "node:url";

// src/data-dir.ts
import { homedir } from "node:os";
import { join } from "node:path";
function dataDir(env, pluginRoot) {
  const fromEnv = env.INBOX_DATA || env.PLUGIN_DATA;
  if (fromEnv) return fromEnv;
  const m = pluginRoot.match(/^(.*)\/plugins\/cache\/([^/]+)\/([^/]+)\/[^/]+$/);
  if (m) return `${m[1]}/plugins/data/${m[3]}-${m[2]}`;
  return join(homedir(), ".codex", "inbox-dev");
}

// src/state.ts
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rmdir,
  stat,
  symlink,
  unlink,
  writeFile
} from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { basename, dirname, isAbsolute, join as join2, resolve } from "node:path";

// ../hooks/text.ts
var NL = "\n";
var FENCE = /```[^\n]*\n([\s\S]*?)```/g;
function codeBlocks(reply) {
  return [...reply.matchAll(FENCE)].map((m) => (m[1] ?? "").replace(/\n$/, ""));
}
function numberBlocks(reply) {
  let n = 0;
  return reply.replace(FENCE, (block) => `[block ${n += 1}]${NL}${block}`);
}
function clip(text, max) {
  return text.length <= max ? text : text.slice(0, max) + " \u2026[cut]";
}
function clipLabel(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text;
}
function clipMiddle(text, max, head) {
  if (text.length <= max) return text;
  return `${text.slice(0, head)}${NL}\u2026[cut]${NL}${text.slice(text.length - (max - head))}`;
}

// ../hooks/ledger.ts
var EMPTY = {
  card: null,
  milestones: [],
  items: [],
  closed: [],
  findings: [],
  closedFindings: [],
  prs: [],
  nextId: 1,
  turn: 0,
  batchTurn: 0
};
var NL2 = "\n";
var MAX_OPEN = 20;
var STALE_AFTER = 12;
var UNFOUNDED_MOOT = /^no longer applies:.*(\b(not|never) (related|relevant|addressed|mentioned|discussed|answered|raised|part of)\b|\bunrelated\b|\b(still|stays) open\b|\boutside (the|this)\b|\bnothing\b.*\b(touch|address|mention|relate))/i;
var MAX_CLOSED = 12;
var EXPIRED = "expired, unanswered";
var MAX_HELPS = 3;
function readKind(kind) {
  return kind === "task" || kind === "do" ? "task" : "question";
}
function upgradeLedger(ledger) {
  const { notes, decided, ...rest } = ledger;
  return {
    ...rest,
    milestones: addMilestones(
      rest.milestones ?? [],
      (rest.card?.done ?? []).map((text) => doneMilestone(text, null))
    ),
    findings: [...rest.findings ?? [], ...notes ?? []],
    // reopenFinding puts these back, so a conversion added for findings must run on them too.
    closedFindings: (rest.closedFindings ?? []).map(upgradeClosedFinding),
    items: rest.items.map(upgradeItem),
    closed: (rest.closed ?? decided ?? []).map((d) => ({
      ...d,
      kind: readKind(d.kind),
      how: d.how ?? howFromOutcome(d.outcome),
      ...d.item ? { item: upgradeItem(d.item) } : {}
    }))
  };
}
var ASKED_AS = /^asked as (i\d+)$/;
function upgradeClosedFinding(f) {
  const asker = f.how === "update" ? ASKED_AS.exec(f.outcome)?.[1] : void 0;
  return asker && f.askedAs === void 0 ? { ...f, askedAs: asker } : f;
}
function upgradeItem(item) {
  return {
    ...item,
    kind: readKind(item.kind),
    at: item.at ?? null,
    rec: recommendedOption(item.options, item.rec),
    from: item.from ?? "update"
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
  const label = (text) => text.match(/^\s*\(?([a-z]|\d{1,2})\s*[:.)]/i)?.[1]?.toLowerCase();
  const byLabel = /^\s*(?:option\s+)?([a-z]|\d{1,2})\s*[.!]?\s*$/i.exec(rec)?.[1]?.toLowerCase();
  return best ?? (byLabel ? options.find((o) => label(o) === byLabel) ?? null : null);
}
function howFromOutcome(outcome) {
  if (outcome === "dismissed") return "dismissed";
  if (outcome === EXPIRED) return "expired";
  if (outcome === "done" || outcome === "you ran it") return "done";
  if (outcome.startsWith(CLOSED_BY_CLAUDE)) return "claude";
  return "update";
}
var NEEDS_PERSON = /(?:^|[\s;&|])(?:login|logout|signin|sign-in|sudo|passwd|ssh-add|ssh-keygen)(?=[\s:]|$)|\binit --interactive\b/i;
var PERSON_ONLY_REASON = /credential|password|passphrase|secret|\btoken|\b2fa\b|\bmfa\b|\bdevice\b|phone|android|tablet|account|sign(?:ed)?[- ]?in|log(?:ged)?[- ]?in|only you|you hold|your (?:mac|machine|laptop|computer|keychain)|\bsudo\b/i;
function readHelp(kind, value, name, blocks, source) {
  const isQuoted = (text) => source === null || source.includes(text);
  const block = value.match(/^block\s+(\d+)$/i);
  const quoted = block ? blocks[Number(block[1]) - 1] ?? "" : value.replace(/^`|`$/g, "");
  const isFromReply = (text) => block !== null || isQuoted(text);
  if (kind === "open") {
    const path = value.replace(/^`|`$/g, "");
    const isPath = /[/.~]/.test(path) && !/^[a-z]+:/i.test(path) && path.length <= 300;
    const standsAlone = (text) => new RegExp(`(?<![\\w.~-])${escaped(path)}(?![\\w/-])`).test(text);
    return isPath && (source === null || standsAlone(source)) ? { kind, path } : null;
  }
  if (kind === "copy") {
    return quoted.trim() !== "" && quoted.length <= 8e3 && isFromReply(quoted) ? { kind, text: quoted, name } : null;
  }
  if (kind === "run" || kind === "terminal") {
    const command = commandText(quoted);
    const isUsable = command !== "" && command.length <= 4e3 && isFromReply(command);
    const isTheirs = NEEDS_PERSON.test(command) || kind === "terminal" && (source === null || PERSON_ONLY_REASON.test(source));
    return isUsable ? { kind: isTheirs ? "terminal" : "run", command, name } : null;
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
function helpFields(tail, source) {
  const whole = tail.join("|").trim();
  if (tail.length <= 1 || source !== null && source.includes(commandText(whole.replace(/^`|`$/g, ""))))
    return { help: whole, name: null };
  return { help: tail.slice(0, -1).join("|").trim(), name: dash(tail.at(-1)) };
}
function escaped(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
function dash(value) {
  const v = (value ?? "").trim();
  return v === "" || v === "-" ? null : v;
}
var KEY_LINE = /^\s*[-*]?\s*(GOAL|DONE|NOW|RUNNING|CLOSED|FIXED|ASKED|NEW|UPDATE|HELP|TODO)\s*:\s*(.*)$/;
function parseReply(text, source = null) {
  const blocks = source === null ? [] : codeBlocks(source);
  const card = { goal: "", now: "", running: [] };
  const done = [];
  const closed = [];
  const added = [];
  const helped = [];
  const updated = [];
  const helps = [];
  const asks = [];
  const todos = [];
  let seen = 0;
  const lines = text.split(NL2);
  const lastGoal = lines.findLastIndex((line) => KEY_LINE.exec(line)?.[1] === "GOAL");
  const newLines = [];
  for (const raw of lines.slice(Math.max(lastGoal, 0))) {
    const m = KEY_LINE.exec(raw);
    if (!m) continue;
    seen += 1;
    const key = m[1];
    const value = dash(m[2]) ?? "";
    if (key === "GOAL") card.goal = value;
    else if (key === "NOW") card.now = value;
    else if (key === "DONE" && value) done.push(value);
    else if (key === "RUNNING" && value) card.running.push(value);
    else if (key === "CLOSED" || key === "FIXED") {
      const [id, outcome] = value.split("|").map((s) => s.trim());
      if (id && /^f\d/.test(id) === (key === "FIXED")) closed.push({ id, outcome: outcome ?? "" });
    } else if (key === "ASKED") {
      const [id, target] = value.split("|").map((s) => s.trim());
      if (id && /^f\d+$/.test(id) && target) asks.push({ id, target });
    } else if (key === "NEW") {
      const fields = value.split("|");
      const isLabelSkipped = !dash(fields[2]) && /\s/.test((fields[1] ?? "").trim());
      const [kind, label, ask, ...rest] = (isLabelSkipped ? [fields[0], "-", ...fields.slice(1)] : fields).map(dash);
      const rec = rest.length > 1 ? rest.pop() : null;
      if (!ask) {
        newLines.push(void 0);
        continue;
      }
      const options = rest.flatMap((o) => o?.split(/\s+\/\s+/) ?? []).filter(Boolean);
      const item = {
        kind: readKind(kind),
        label: label ?? null,
        ask,
        options,
        rec: recommendedOption(options, rec ?? null),
        helps: []
      };
      added.push(item);
      newLines.push(item);
    } else if (key === "TODO" && value && !isTakenUp(value, source)) {
      todos.push(value);
    } else if (key === "UPDATE") {
      const [target, options, rec] = value.split("|").map(dash);
      const id = target?.match(/\b(i\d+)\b/)?.[1];
      if (id)
        updated.push({ id, options: options ? options.split(/\s+\/\s+/).filter(Boolean) : null, rec: rec ?? null });
    } else if (key === "HELP") {
      const [target, kind, ...tail] = value.split("|");
      const { help, name } = helpFields(tail, source);
      const parsed = readHelp((kind ?? "").trim(), help, name, blocks, source);
      if (parsed && target) helps.push({ target: target.trim(), help: parsed });
    }
  }
  for (const { target, help } of helps) {
    const n = target.match(/\bnew\s*(\d+)\b/i);
    const id = target.match(/\b(i\d+)\b/)?.[1];
    const item = n ? newLines[Number(n[1]) - 1] : void 0;
    if (item) item.helps = withHelp(item.helps, help);
    else if (!n && id) helped.push({ id, help });
  }
  const asked = [];
  for (const { id, target } of asks) {
    const n = target.match(/\bnew\s*(\d+)\b/i);
    const item = n ? added.indexOf(newLines[Number(n[1]) - 1]) : target.match(/\b(i\d+)\b/)?.[1];
    if (item !== void 0 && item !== -1) asked.push({ id, item });
  }
  return seen === 0 ? null : { card, done, closed, added, helped, updated, asked, todos };
}
var MAX_MILESTONES = 200;
var DONE_PER_UPDATE = 3;
var DONE_PER_CATCH_UP = 6;
var CARD_DONE = 4;
var MILESTONE_TEXT_CHARS = 120;
var MILESTONE_DETAIL_CHARS = 200;
var TODO_OPTIONS = ["Proceed", "Not yet"];
var BARE_YES = /^\s*(?:yes|yep|yeah|y|ok|okay|sure|go|go ahead|proceed|do it|continue|approved?|sounds good|sgtm|lgtm|all recommended|yes to all|ship it)\s*[.!]*\s*$/i;
function doneMilestone(text, at) {
  return { source: "done", text: clipLabel(text, MILESTONE_TEXT_CHARS), detail: null, ref: null, at };
}
function isTodoQuestion(item) {
  return item.options.length === TODO_OPTIONS.length && item.options.every((o, n) => o === TODO_OPTIONS[n]);
}
function answeredMilestone(item, answer, at) {
  const text = answer.trim();
  if (item.kind !== "question" || isTodoQuestion(item) || text === "" || BARE_YES.test(text) || PUT_OFF.test(text))
    return null;
  return {
    source: "answered",
    text: clipLabel(item.ask, MILESTONE_TEXT_CHARS),
    detail: clipLabel(text, MILESTONE_DETAIL_CHARS),
    ref: item.id,
    at
  };
}
function foldedText(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
function nextMilestoneId(milestones) {
  return `m${Math.max(0, ...milestones.map((m) => idNumber(m.id) || 0)) + 1}`;
}
function addMilestone(milestones, m) {
  const folded = foldedText(m.text);
  const isRepeat = milestones.some(
    (x) => m.ref !== null ? x.source === m.source && x.ref === m.ref : m.source === "done" && foldedText(x.text) === folded
  );
  if (isRepeat) return milestones;
  const all = [...milestones, { ...m, id: nextMilestoneId(milestones) }];
  if (all.length <= MAX_MILESTONES) return all;
  const oldest = all.reduce((a, b) => (a.at ?? -Infinity) <= (b.at ?? -Infinity) ? a : b);
  return all.filter((x) => x !== oldest);
}
function addMilestones(milestones, added) {
  return added.reduce(addMilestone, milestones);
}
function removeMilestone(ledger, ref) {
  return ledger.milestones.some((m) => m.ref === ref) ? { ...ledger, milestones: ledger.milestones.filter((m) => m.ref !== ref) } : ledger;
}
function doneTexts(milestones) {
  return milestones.filter((m) => m.source === "done").slice(-CARD_DONE).map((m) => m.text);
}
function isTakenUp(work, reply) {
  const key = [...keyWords(work)];
  const said = new Set(words(reply ?? ""));
  return key.length > 0 && key.filter((w) => said.has(w)).length * 2 >= key.length;
}
function todoAsk(work) {
  return `Ready to start on ${work.replace(/[.?!\s]+$/, "")}?`;
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
  return new Set(words(text).filter((w) => new RegExp("\\p{N}", "u").test(w) || w.length > 2 && !FILLER.has(w)));
}
function restates(a, b) {
  const x = keyWords(a);
  const y = keyWords(b);
  const fewer = Math.min(x.size, y.size);
  const shared = [...x].filter((w) => y.has(w)).length;
  const numbers = (words2) => [...words2].filter((w) => new RegExp("\\p{N}", "u").test(w)).sort().join(" ");
  if (numbers(x) !== "" && numbers(y) !== "" && numbers(x) !== numbers(y)) return false;
  return fewer >= 2 ? shared / fewer >= 0.7 : sameAsk(a, b);
}
function sameAsk(a, b) {
  const norm = (s) => words(s).join(" ");
  return norm(a) !== "" && norm(a) === norm(b);
}
function matchOpen(items, a, sameBatch = /* @__PURE__ */ new Set()) {
  return items.findIndex(
    (i) => i.id === a.label || sameAsk(i.ask, a.ask) || !sameBatch.has(i.id) && i.kind === a.kind && restates(i.ask, a.ask)
  );
}
function repeatsClosed(closed, a, since) {
  const recent = closed.filter((c) => c.at >= since && !isAskedForChoices(c));
  const settled = closed.filter((c) => c.at < since && c.how !== "expired");
  return matchOpen(recent, a) >= 0 || a.label !== null && recent.some((c) => c.label === a.label) || settled.some((c) => repeatsSettled(c, a));
}
var LIST_CHOICES = "List the choices";
function isAskedForChoices(c) {
  return c.how === "answered" && c.outcome.trim().toLowerCase() === LIST_CHOICES.toLowerCase();
}
function repeatsSettled(c, a) {
  if (isAskedForChoices(c)) return false;
  return c.how === "answered" ? c.id === a.label || sameAsk(c.ask, a.ask) : matchOpen([c], a) >= 0;
}
function closedRecord(item, closing, now) {
  const { id, kind, ask, label } = item;
  return { id, kind, ask, ...label ? { label } : {}, ...closing, at: now, item };
}
function closedFindingRecord(finding, closing, now, askedAs) {
  return { ...finding, ...askedAs ? { askedAs } : {}, ...closing, closedAt: now };
}
var CLOSED_BY_CLAUDE = "closed by Claude";
function closeFinding(ledger, id, closing, now, askedAs) {
  const finding = ledger.findings.find((f) => f.id === id);
  if (!finding) return ledger;
  return {
    ...ledger,
    findings: ledger.findings.filter((f) => f.id !== id),
    closedFindings: [...ledger.closedFindings, closedFindingRecord(finding, closing, now, askedAs)]
  };
}
var SHARED_TITLE_WORDS = 2;
var PUT_OFF = /\b(?:not (?:now|yet)|put off|for later|postpone|defer)/i;
function leavesWorkOpen(c) {
  return c.how !== "done" && (isLapsed(c) || PUT_OFF.test(c.outcome));
}
function reopenAskedFindings(ledger, closes) {
  return closes.filter(leavesWorkOpen).reduce((l, c) => {
    const record2 = l.closedFindings.findLast((f) => f.askedAs === c.id);
    if (!record2) return l;
    const reopened = reopenFinding(l, record2.id);
    return {
      ...reopened,
      findings: reopened.findings.map((f) => {
        const { askedAs: _askedAs, ...rest } = f;
        return f.id === record2.id ? rest : f;
      })
    };
  }, ledger);
}
function prNumbers(text) {
  return new Set([...text.matchAll(/(?:#|\bPR\s*#?|\/pull\/)(\d+)/gi)].map((m) => m[1]));
}
function asksAbout(item, finding, isClaimed = false) {
  if (item.label === finding.id) return true;
  if (restates(finding.title, item.ask) || restates(finding.detail, item.ask)) return true;
  if (isClaimed) {
    const known = keyWords(finding.title);
    if ([...keyWords(item.ask)].filter((w) => known.has(w)).length >= SHARED_TITLE_WORDS) return true;
  }
  const itemPrs = prNumbers(`${item.label ?? ""} ${item.ask}`);
  return [...prNumbers(`${finding.title} ${finding.detail}`)].some((n) => itemPrs.has(n));
}
function pruneClosed(ledger, keep) {
  const pruned = (records) => records.filter((r, n) => n >= records.length - MAX_CLOSED || keep.has(r.id));
  return { ...ledger, closed: pruned(ledger.closed), closedFindings: pruned(ledger.closedFindings) };
}
function idNumber(id) {
  return Number(id.match(/\d+/)?.[0] ?? Number.NaN);
}
function inIdOrder(open2, entry) {
  const at = open2.findIndex((x) => idNumber(x.id) > idNumber(entry.id));
  return at < 0 ? [...open2, entry] : [...open2.slice(0, at), entry, ...open2.slice(at)];
}
function reopenFinding(ledger, id) {
  const record2 = ledger.closedFindings.findLast((f) => f.id === id);
  if (!record2 || ledger.findings.some((f) => f.id === id)) return ledger;
  const { how: _how, outcome: _outcome, closedAt: _closedAt, ...finding } = record2;
  return removeMilestone(
    {
      ...ledger,
      findings: inIdOrder(ledger.findings, finding),
      closedFindings: ledger.closedFindings.filter((f) => f.id !== id)
    },
    id
  );
}
function applyExchangeUpdate(ledger, update, exchange, now, promptAt) {
  const explainedId = exchange.press?.action === "explain" ? exchange.press.id : null;
  return applyUpdate(
    ledger,
    { ...update, closed: update.closed.filter((c) => c.id !== explainedId) },
    now,
    exchange.turn,
    promptAt
  );
}
var OVERTAKEN_OUTCOMES = "no longer applies|replaced|superseded|moot";
var OVERTAKEN = new RegExp(`^(?:closed by \\w+: )?(?:${OVERTAKEN_OUTCOMES})`, "i");
var NOT_AN_ANSWER = new RegExp(`^\\s*(?:done\\s*:|(?:${OVERTAKEN_OUTCOMES}|no longer relevant|dealt with)\\b)`, "i");
function isPersonsAnswer(outcome) {
  return outcome.trim() !== "" && !NOT_AN_ANSWER.test(outcome);
}
function applyUpdate(ledger, u, now, turn, promptAt = now, isCatchUp = false) {
  const stillAsked = new Set(u.updated.filter((c) => c.options || c.rec).map((c) => c.id));
  const closing = new Map(
    u.closed.filter((c) => !stillAsked.has(c.id) && !UNFOUNDED_MOOT.test(c.outcome)).map((c) => [c.id, c.outcome])
  );
  const closed = [...ledger.closed];
  const items = [];
  const answers = [];
  for (const item of ledger.items) {
    const outcome = closing.get(item.id);
    const helps = u.helped.filter((h) => h.id === item.id).reduce((all, h) => withHelp(all, h.help), item.helps);
    const isClosing = outcome !== void 0 && (item.from !== "record" || isPersonsAnswer(outcome));
    if (isClosing) {
      closed.push(closedRecord(item, { outcome, how: "update" }, now));
      const answer = isPersonsAnswer(outcome) ? answeredMilestone(item, outcome, now) : null;
      if (answer) answers.push(answer);
    } else items.push(withUpdate({ ...item, helps }, u.updated));
  }
  const recordedThisTurn = new Set(
    [...ledger.items, ...ledger.closed.flatMap((c) => c.item ?? [])].filter((i) => i.from === "record" && i.turn === turn).map((i) => i.kind)
  );
  let nextId = ledger.nextId;
  let added = 0;
  const addedIds = [];
  const created = /* @__PURE__ */ new Set();
  for (const a of u.added) {
    if (repeatsClosed(ledger.closed, a, promptAt)) {
      addedIds.push(null);
      continue;
    }
    const at = matchOpen(items, a, created);
    const restated = items[at];
    if (restated) {
      items[at] = { ...restated, helps: a.helps.reduce((all, h) => withHelp(all, h), restated.helps) };
      addedIds.push(restated.id);
      continue;
    }
    if (recordedThisTurn.has(a.kind)) {
      addedIds.push(null);
      continue;
    }
    items.push({ ...a, id: `i${nextId}`, turn, at: now, from: "update" });
    addedIds.push(`i${nextId}`);
    created.add(`i${nextId}`);
    nextId += 1;
    added += 1;
  }
  for (const work of u.todos) {
    const todo = {
      kind: "question",
      label: null,
      ask: todoAsk(work),
      options: TODO_OPTIONS,
      rec: null
    };
    const isKnown = items.some((i) => restates(i.ask, work)) || ledger.findings.some((f) => restates(f.title, work)) || repeatsClosed(ledger.closed, { ...todo, helps: [] }, promptAt);
    if (isKnown) continue;
    items.push({ ...todo, helps: [], id: `i${nextId}`, turn, at: now, from: "update" });
    nextId += 1;
    added += 1;
  }
  const kept = items.filter((i) => i.from === "record" || turn - i.turn <= STALE_AFTER).slice(-MAX_OPEN);
  for (const i of items) if (!kept.includes(i)) closed.push(closedRecord(i, { outcome: EXPIRED, how: "expired" }, now));
  const askedBy = /* @__PURE__ */ new Map();
  for (const a of u.asked) {
    const id = typeof a.item === "number" ? addedIds[a.item] : a.item;
    const asker = kept.find((i) => i.id === id);
    const finding = ledger.findings.find((f) => f.id === a.id);
    if (asker && finding && asksAbout(asker, finding, true)) askedBy.set(a.id, asker.id);
  }
  for (const i of kept.filter((i2) => created.has(i2.id)))
    for (const f of ledger.findings) if (!askedBy.has(f.id) && asksAbout(i, f)) askedBy.set(f.id, i.id);
  const { findings, closedFindings } = ledger.findings.reduce((l, f) => {
    const asker = askedBy.get(f.id);
    const outcome = closing.get(f.id);
    if (outcome !== void 0) return closeFinding(l, f.id, { outcome, how: "update" }, now);
    return asker ? closeFinding(l, f.id, { outcome: `asked as ${asker}`, how: "update" }, now, asker) : l;
  }, ledger);
  const fixes = ledger.findings.flatMap((f) => {
    const outcome = closing.get(f.id);
    if (outcome === void 0 || isLapsed({ how: "update", outcome })) return [];
    return [
      {
        source: "fixed",
        text: clipLabel(f.title, MILESTONE_TEXT_CHARS),
        detail: outcome.trim() === "" ? null : clipLabel(outcome.trim(), MILESTONE_DETAIL_CHARS),
        ref: f.id,
        at: now
      }
    ];
  });
  const results = u.done.slice(isCatchUp ? -DONE_PER_CATCH_UP : -DONE_PER_UPDATE).map((text) => doneMilestone(text, now));
  const written = [...answers, ...fixes, ...results].map((m, n) => ({ ...m, at: isCatchUp ? null : now + n }));
  const milestones = addMilestones(ledger.milestones, written);
  const prev = ledger.card;
  const card = {
    goal: u.card.goal || prev?.goal || "",
    done: doneTexts(milestones),
    now: u.card.now || prev?.now || "",
    running: u.card.running
  };
  return reopenAskedFindings(
    {
      ...ledger,
      card,
      milestones,
      items: kept,
      closed,
      findings,
      closedFindings,
      nextId,
      batchTurn: added > 0 ? turn : ledger.batchTurn
    },
    closed.slice(ledger.closed.length)
  );
}
function withUpdate(item, updated) {
  const change = updated.findLast((c) => c.id === item.id);
  if (!change || item.kind !== "question") return item;
  const options = change.options ?? item.options;
  return { ...item, options, rec: recommendedOption(options, change.rec ?? item.rec) };
}
function closedState(d) {
  if (d.how === "dismissed") return "dismissed";
  if (d.how === "expired") return "lapsed";
  const isOvertaken = OVERTAKEN.test(d.outcome);
  return (d.how === "claude" || d.how === "update") && isOvertaken ? "lapsed" : "handled";
}
function isLapsed(d) {
  return closedState(d) !== "handled";
}

// ../hooks/model-text.ts
var NL3 = "\n";
var MODEL_KIND = { question: "decide", task: "do" };
function systemText(host) {
  const band = host.band ? ` They always see how many items are in <open> and <findings> in ${host.band}.` : "";
  return `You keep a short ledger for a person who works with a coding agent across many parallel sessions. They glance at your ledger between tasks, or after time away, to see where this session stands. You read one exchange and update the ledger.

Input:
- <card>: the ledger before this exchange (may be empty)
- <listed>: results already listed for the person, newest first
- <open>: items still waiting on the person, as id | kind | label | ask | options | rec
- <findings>: findings the agent recorded for the person to review later, outside the current task, each with an id
- <decided>: items the person already settled, and how. Never add one of these again as NEW, even when the reply asks it again.
- <person>: what the person just sent, and the commands they ran themselves: "$ cmd" for a shell command, with its output, and "/name" for a slash command
- <activity>: what the agent did this turn (files edited, commands, URLs)
- <reply>: the agent's final reply
- <screen>: what the person has on screen besides the conversation.${band}

Answer with lines only, each starting with one of these keys. No other text.

GOAL: what this session is for, at most 12 words. Keep the previous goal unless the person clearly changed direction. "-" until the person has asked for something.
DONE: one result the agent finished in this exchange, at most 8 words, past tense. A result is something that now holds: code written, a cause found, a decision made. Commands run, tests or checks passing, reading, searching, plans and steps in progress are not results. Write no DONE line when the exchange finished nothing. Write no more DONE lines than the prompt allows, oldest first. Never write a result <listed> already has, even reworded. Write no DONE line for an item you close with the person's answer, or for a finding you mark FIXED: the inbox lists those itself.
NOW: where the work stands at the end of this reply, at most 12 words. Name what it waits on, if anything. "-" when no work has started.
RUNNING: something still running that the person may open, as "name: URL or port". Dev servers, simulators, background jobs. Omit anything the agent stopped. Zero or more lines.
CLOSED: <id> | the outcome, at most 8 words, in one of three forms. When the person answered in <person>, write their answer. Otherwise write "done: <what the agent did>" when the work is done, or "no longer applies: <what in the reply or <activity> made it moot>". An option the agent picked on its own, or an option the work made moot, is not the person's answer: write it in the "done:" or "no longer applies:" form. One line for each item in <open> the person answered in <person> (including "all recommended", "go", "yes to all", numbered answers), or that the reply or <activity> shows is done or no longer applies. A person asking what an item means has not answered it, and a reply explaining it does not close it. When <person> asks to run an item's command and the reply says it ran, that item is done. So is an item whose command the person ran themselves, per <person>, when its output shows it worked. An item that has nothing to do with this exchange stays open: being outside the current work, or not being mentioned, does not make it no longer apply.
FIXED: <id> | the change that fixed it, at most 8 words. One line for each finding in <findings> whose problem the reply, <activity> or <person> shows was fixed by a change to the work. Only a change fixes a finding. When the person puts a finding off, sets it aside or says it does not matter, write no FIXED line: it stays open until they dismiss it.
ASKED: <id> | <item>
  For a finding in <findings> that a NEW line or an item in <open> asks the person about. item: "new N" for the Nth NEW line in your answer, or an id from <open>. The item takes the finding's place, so the person sees it once.
NEW: <kind> | <label> | <ask> | <options> | <rec>
  One line per thing in <reply> that waits on the person and is not already in <open> or <findings>. A finding the agent recorded is not NEW unless the reply asks the person to decide or do something about it now; then also write an ASKED line for it. Also one line per dialog in <activity> that the person dismissed or left unanswered, with an ASKED line when the dialog asks about a finding. When the reply restates, rewords or narrows an item in <open>, it is not new: add HELP lines to that item's id instead.
  kind: "decide" (a choice, approval, or information only the person has, explicitly put to them, without which the agent cannot go on with its task) or "do" (an action only the person can take, without which the agent cannot continue or finish: sign in, run a command needing their password, test on their device, reply to a teammate).
  label: the reply's own number or id for it ("1", "D3"), or "-".
  ask: plain words, readable without the reply, at most 12 words, or up to 16 when 12 would lose meaning. Keep the question's meaning and every alternative it names. Replace any term the reply coined with what it means. Name an item or finding by what it says, never by its id: the person does not see ids.
  options: the answers the person can pick, separated by " / ", at most 5 words each; "-" for kind "do". For kind "decide", always at least one, so one press can answer. Use the choices the reply offers, plus the answer it recommends when that is not one of them. When the reply offers none, predict the answers the person would most likely give: the yes and the no for an approval or a yes-or-no question ("Approve / Not yet"); the 1 to 3 likeliest answers to an open question, from the conversation; or, when the conversation suggests no answer, what the person would most likely ask the agent to do instead ("${LIST_CHOICES}", "Pick one for me").
  rec: the option the reply states it recommends for this question ("I'd go with X", "I recommend X"), copied from options, or "-" when it states none for this question. A reason the reply gives for one answer is not a recommendation: it must say it recommends or prefers that answer.
  Skip: rhetorical questions; offers to go on with the next step of the task the person already asked for ("Want me to start on the next file?"); FYIs; generic "let me know", though the agent holding an act that changes or publishes something (commit, push, edit a shared page) until the person agrees is a "decide" item ("Say when you want those committed"); invitations to look at, try or check finished work ("Open X to see it", "reload to check") unless the agent waits on the person's verdict before going on; optional suggestions; anything the person already has on screen, per <screen>; questions asking the person to describe what they saw, did or meant, even when the answer would help diagnose a problem ("What happens when you click it?", "Which file did you mean?"). The person answers those by replying.
UPDATE: <id> | <options> | <rec>
  For a "decide" item in <open> when the reply now offers it different answers, or states a recommendation for it that <open> does not show. options: the answers the person can now pick, as in NEW, or "-" to keep them. rec: as in NEW, or "-" to keep it. Rewording the question is not a change.
HELP: <item> | <kind> | <value> | <name>
  A step that does part of an item's work in one press, when the reply or activity already spells it out: the file to edit, the text to paste, the command to run, the page to visit. Not background reading. Up to 3 per item, most useful first.
  item: "new N" for the Nth NEW line in your answer, or an id from <open>.
  kind and value:
    open | a file or folder the person needs to open or edit, the path as written
    copy | text for the person to paste into a file or form, never a command: "block N" for the code block marked [block N] in <reply>, or one line of text
    run | a shell command the reply asks the person to run or approve: "block N" or the command
    terminal | a shell command the reply says only the person can run, because it needs their credentials, password, device or account. The command a "do" item asks the person to run is always terminal: "block N" or the command
    link | an https URL the person needs to visit
  name: what a copy, command or link is, at most 3 words ("settings snippet", "removal command", "token page"), or "-".
  Use only paths, commands, text and URLs that appear in <reply> or <activity>. Never invent one.
TODO: <work>
  For a todo in <person>: work the person sets aside for later, as in "todo: X", and the reply leaves undone. work: at most 12 words, worded to follow "Ready to start on".

Write plainly. No jargon, no filler, no markdown.`;
}
var CATCH_UP = `The ledger below may have missed turns. Write a CLOSED line for every item in <open> that the conversation shows answered, done, dealt with, or no longer relevant, and a FIXED line for every finding in <findings> that it shows was fixed. Add as NEW only what still waits on the user and is not already in <open> or <findings>. Write up to ${DONE_PER_CATCH_UP} DONE lines, for the results the conversation reached that <listed> lacks.`;
function transcriptCatchUpPrompt(ledger, screen, transcript) {
  return [
    `Treat the conversation in <conversation> as the exchange. Its start may be cut. ${CATCH_UP}`,
    ...ledgerBlocks(ledger, true),
    `<conversation>${NL3}${numberBlocks(transcript)}${NL3}</conversation>`,
    `<screen>${NL3}${screen}${NL3}</screen>`
  ].join(NL3);
}
var MAX_ACTIVITY = 40;
function addActivity(activity, line) {
  return !line || activity.length >= MAX_ACTIVITY || activity.includes(line) ? activity : [...activity, line];
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
var DIALOG_QUESTIONS_SHOWN = 3;
var DIALOG_QUESTION_MAX = 200;
var DIALOG_OPTIONS_SHOWN = 6;
var DIALOG_OPTION_MAX = 60;
var DIALOG_ANSWER_MAX = 400;
var RECOMMENDED_SUFFIX = /\s*\(recommended\)\s*$/i;
function dialogQuestions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((q) => {
    const fields = q ?? {};
    const text = [fields.question, fields.title].find((v) => typeof v === "string" && v.trim() !== "");
    if (!text) return [];
    const options = (Array.isArray(fields.options) ? fields.options : []).flatMap((o) => {
      const label = typeof o === "string" ? o : o?.label;
      return typeof label === "string" && label.trim() !== "" ? [label.trim()] : [];
    });
    return [{ question: text.trim(), options }];
  });
}
function dialogQuestionText(q) {
  const shown = q.options.slice(0, DIALOG_OPTIONS_SHOWN).map((label) => {
    const plain = label.replace(RECOMMENDED_SUFFIX, "");
    const text = clip(plain, DIALOG_OPTION_MAX);
    return plain === label ? text : `${text} (recommended)`;
  });
  const more = q.options.length > shown.length ? ` / and ${q.options.length - shown.length} more` : "";
  const options = shown.length > 0 ? ` (options: ${shown.join(" / ")}${more})` : "";
  return `"${clip(q.question.replaceAll('"', "'"), DIALOG_QUESTION_MAX)}"${options}`;
}
function dialogActivity(questions, outcome) {
  const shown = questions.slice(0, DIALOG_QUESTIONS_SHOWN).map(dialogQuestionText);
  const more = questions.length - shown.length;
  const asked = shown.length > 0 ? `: ${shown.join("; ")}${more > 0 ? `; and ${more} more` : ""}` : "";
  const head = `asked the user in a dialog${asked}`;
  switch (outcome.kind) {
    case "answered":
      return `${head}; answer: ${outcome.answer.slice(0, DIALOG_ANSWER_MAX)}`;
    case "timed-out":
      return `${head}; it timed out while the user was away, so the user did not answer; it went on with: ${outcome.answer.slice(0, DIALOG_ANSWER_MAX)}`;
    case "dismissed":
      return `${head}; the user dismissed it without answering`;
    case "open":
      return `${head}; still open, waiting on the user's answer`;
  }
}
var LISTED_SHOWN = 8;
function ledgerBlocks(ledger, isCatchUp = false) {
  const card = ledger.card ? [`GOAL: ${ledger.card.goal}`, `NOW: ${ledger.card.now}`, ...ledger.card.running.map((r) => `RUNNING: ${r}`)].join(
    NL3
  ) : "";
  const listed = ledger.milestones.slice(isCatchUp ? 0 : -LISTED_SHOWN).reverse().map((m) => m.text).join(NL3);
  const open2 = ledger.items.map(
    (i) => `${i.id} | ${MODEL_KIND[i.kind]} | ${i.label ?? "-"} | ${i.ask} | ${i.options.join(" / ") || "-"} | ${i.rec ?? "-"}`
  ).join(NL3);
  const findings = ledger.findings.map((f) => `${f.id} | ${f.kind}: ${f.title}`).join(NL3);
  const closed = ledger.closed.filter((d) => d.how !== "expired" && !isAskedForChoices(d)).map((d) => `${d.ask} \u2192 ${outcomeText(d)}`).join(NL3);
  return [
    `<card>${NL3}${card}${NL3}</card>`,
    `<listed>${NL3}${listed}${NL3}</listed>`,
    `<open>${NL3}${open2}${NL3}</open>`,
    `<findings>${NL3}${findings}${NL3}</findings>`,
    `<decided>${NL3}${closed}${NL3}</decided>`
  ];
}
function buildPrompt(ledger, ex) {
  const person = ex.person ?? `(The person sent nothing. The turn was started by: ${ex.trigger ?? "unknown"}.)`;
  return [
    ...ledgerBlocks(ledger),
    `<person>${NL3}${clipMiddle(person, 4e3, 1500)}${NL3}</person>`,
    `<activity>${NL3}${clipMiddle(ex.activity.join(NL3), 2500, 500)}${NL3}</activity>`,
    `<reply>${NL3}${clipMiddle(numberBlocks(ex.reply), 12e3, 4e3)}${NL3}</reply>`,
    `<screen>${NL3}${ex.screen}${NL3}</screen>`,
    `Write at most ${DONE_PER_UPDATE} DONE lines.`
  ].join(NL3);
}
function surfaceAtStart(host) {
  return host.surface.charAt(0).toUpperCase() + host.surface.slice(1);
}
function screenText(host, isOpen, tab) {
  return isOpen ? `${surfaceAtStart(host)} is open beside the conversation, ${tab ? `on its ${tab} tab, ` : ""}listing every open item.` : `${surfaceAtStart(host)} is closed.`;
}
function outcomeText(d) {
  if (d.how === "dismissed") return "dismissed by the user";
  if (d.how === "expired") return "expired before the user answered";
  return d.outcome;
}
var TOLD_NOTHING = { inbox: null, closed: [] };

// ../hooks/presses.ts
var HANDOFF_IDS = /^(address|type|step-\d+|thread-address|pr-conflicts|pr-address-all)$/;
var PR_RENAMES = [
  [/^address-all-/, "pr-address-all"],
  [/^resolve-/, "pr-conflicts"]
];
var THREAD_RENAMES = [
  [/^address-/, "thread-address"],
  [/^draft-/, "thread-draft"],
  [/^discuss-/, "thread-discuss"]
];
var ROW_RENAMES = [
  [/^explain(-|$)/, "explain"],
  [/^(help-.+-|step-)\d+$/, (old) => `step-${old.split("-").pop()}`],
  [/^typed$/, "type"],
  [/^address(-|$)/, "address"],
  [/^discuss(-|$)/, "discuss"]
];
function upgradedLastAction(key, old) {
  const renames = key.startsWith("pr:") ? PR_RENAMES : key.includes(" thread ") ? THREAD_RENAMES : ROW_RENAMES;
  const found = renames.find(([pattern]) => pattern.test(old.action));
  const action = found ? typeof found[1] === "function" ? found[1](old.action) : found[1] : null;
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

// ../hooks/view.ts
var CHOICE_KEYS = [..."abcfghilm"];
var SETTLED_MS = 5120;
var TABS = [
  { id: "needsYou", label: "Needs you", hotkey: "1" },
  { id: "findings", label: "Findings", hotkey: "2" },
  { id: "prs", label: "PRs", hotkey: "3" }
];
var ROW_TABS = TABS.filter((t) => t.id !== "prs");

// ../hooks/session.ts
var NO_PRS = { views: {}, branchRef: null, isFetching: false };
var NO_TURN = { person: null, trigger: null, activity: [], press: null };
function emptySession() {
  return {
    ledger: EMPTY,
    turn: NO_TURN,
    told: TOLD_NOTHING,
    presence: { turnsStarted: 0, turnsApplied: 0, ledgerState: "current", hasDroppedReply: false, isUpdating: false },
    pending: [],
    sent: [],
    lastActions: {},
    heldRows: [],
    prViews: NO_PRS,
    stop: null
  };
}
var SESSION_ID = /^[\w-]{1,100}$/;
function sessionFile(sessionId) {
  if (!SESSION_ID.test(sessionId)) throw new Error(`Not a session id: ${sessionId}`);
  return `${sessionId}.json`;
}
function missingAsNull(err) {
  if (err.code === "ENOENT") return null;
  throw err;
}
function upgradeSession(saved) {
  const base = emptySession();
  const views = saved.prViews?.views ?? {};
  return {
    ledger: saved.ledger ? { ...base.ledger, ...upgradeLedger({ ...saved.ledger, items: saved.ledger.items ?? [] }) } : base.ledger,
    turn: { ...base.turn, ...saved.turn },
    told: { ...base.told, ...saved.told },
    presence: { ...base.presence, ...saved.presence },
    pending: saved.pending ?? [],
    sent: (saved.sent ?? []).map((x) => ({
      ...x,
      row: x.row ?? null,
      queuedId: x.queuedId ?? null,
      pressedAt: x.pressedAt ?? null,
      deliveryId: x.deliveryId ?? null,
      phase: x.phase ?? "accepted"
    })),
    lastActions: upgradeLastActions(saved.lastActions ?? {}),
    heldRows: saved.heldRows ?? [],
    prViews: {
      ...NO_PRS,
      ...saved.prViews,
      // Threads saved before their times and `isLinesChanged` existed.
      views: Object.fromEntries(
        Object.entries(views).map(([ref, pr]) => [
          ref,
          {
            ...pr,
            threads: pr.threads.map((t) => ({
              ...t,
              isLinesChanged: t.isLinesChanged ?? false,
              at: t.at ?? null,
              reply: t.reply && { ...t.reply, at: t.reply.at ?? null }
            }))
          }
        ])
      ),
      isFetching: false
    },
    stop: saved.stop ?? null
  };
}
function applied(s, reply, now, promptAt) {
  const next = s.pending[0];
  if (!next) return s;
  const { ex } = next;
  const parsed = reply === null ? null : parseReply(reply, [ex.reply, ...ex.activity].join("\n"));
  if (!parsed && !next.failed)
    return {
      ...s,
      pending: [{ ...next, failed: true }, ...s.pending.slice(1)],
      presence: { ...s.presence, ledgerState: "failed" }
    };
  const ledger = parsed ? applyExchangeUpdate(s.ledger, parsed, ex, now, promptAt) : s.ledger;
  const hasDroppedReply = s.presence.hasDroppedReply || !parsed;
  return {
    ...s,
    ledger,
    pending: s.pending.slice(1),
    presence: {
      ...s.presence,
      ledgerState: hasDroppedReply ? "failed" : "current",
      hasDroppedReply,
      turnsApplied: Math.max(s.presence.turnsApplied, next.turnsStarted)
    }
  };
}
function needsCatchUp(s) {
  const { presence } = s;
  const hasUnappliedTurn = s.pending.length === 0 && s.turn.person === null && presence.turnsStarted > presence.turnsApplied;
  return presence.ledgerState !== "current" || hasUnappliedTurn;
}
var pendingKey = (p) => `${p.turnsStarted}:${p.ex.turn}`;
function appliedCatchUp(s, begun, parsed, now) {
  const covered = new Set(begun.pending.map(pendingKey));
  return {
    ...s,
    ledger: parsed ? applyUpdate(s.ledger, parsed, now, s.ledger.turn, now, true) : s.ledger,
    pending: s.pending.filter((p) => !covered.has(pendingKey(p))),
    presence: {
      ...s.presence,
      ledgerState: parsed ? "current" : "failed",
      hasDroppedReply: parsed ? false : s.presence.hasDroppedReply,
      turnsApplied: Math.max(s.presence.turnsApplied, begun.presence.turnsStarted)
    }
  };
}

// src/state.ts
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
    transcriptPath: null,
    home: homedir2(),
    cliPath: null,
    ...emptySession(),
    tabSeenAt: 0,
    heard: NOTHING_HEARD
  };
}
function statePath(dir, sessionId) {
  return join2(dir, "sessions", sessionFile(sessionId));
}
function upgraded(saved, sessionId) {
  if (saved.version !== void 0 && saved.version !== 1)
    throw new Error(`Unsupported inbox state version: ${saved.version}`);
  const base = emptyState(sessionId);
  const { checks: _checks, snapshots: _snapshots, recordedRuns: _runs, top: _top, ...kept } = saved;
  const { sentBack: _sentBack, ...turn } = saved.turn ?? {};
  return {
    ...base,
    ...kept,
    ...upgradeSession({
      ...kept,
      turn,
      pending: (saved.pending ?? []).map(({ ex: { checks: _exChecks, ...ex }, ...p }) => ({ ...p, ex }))
    }),
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
async function readSaved(dir, sessionId) {
  const saved = await readFile(statePath(dir, sessionId), "utf8").catch(missingAsNull);
  return saved === null ? { state: emptyState(sessionId), isSaved: false } : { state: upgraded(JSON.parse(saved), sessionId), isSaved: true };
}
async function readState(dir, sessionId) {
  return (await readSaved(dir, sessionId)).state;
}
var LOCK_WAIT_MS = 1e4;
var LOCK_CHILD = "held";
var sleep = (ms) => new Promise((resolve3) => setTimeout(resolve3, ms));
var LockBusyError = class extends Error {
};
var bootSession = null;
var ownIdentity = null;
function lockOwner(suffix) {
  const match = /^(\d+)-[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}(?:-([a-f\d]{32}))?$/.exec(suffix);
  const pid = Number(match?.[1]);
  return Number.isSafeInteger(pid) && pid > 0 ? { pid, identity: match?.[2] ?? null } : null;
}
function processIdentity(pid) {
  if (pid === process.pid && ownIdentity) return ownIdentity;
  try {
    const options = {
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C", TZ: "UTC" },
      stdio: "pipe",
      timeout: 1e3
    };
    const boot = bootSession ?? execFileSync("/usr/sbin/sysctl", ["-n", "kern.bootsessionuuid"], options).trim();
    const started = execFileSync("/bin/ps", ["-p", String(pid), "-o", "lstart="], options).trim();
    if (!boot || !started) return null;
    bootSession = boot;
    const identity = createHash("sha256").update(boot).update("\0").update(started).digest("hex").slice(0, 32);
    if (pid === process.pid) ownIdentity = identity;
    return identity;
  } catch {
    return null;
  }
}
function isLive(owner, generation, observedLiveAt) {
  try {
    process.kill(owner.pid, 0);
  } catch (err) {
    return err.code !== "ESRCH";
  }
  if (owner.identity === null) return true;
  const checkedAt = observedLiveAt.get(generation);
  if (checkedAt !== void 0 && Date.now() - checkedAt < 250) return true;
  const identity = processIdentity(owner.pid);
  if (identity !== null && identity !== owner.identity) return false;
  observedLiveAt.set(generation, Date.now());
  return true;
}
async function lockTarget(path) {
  return readlink(path).catch((err) => {
    if (err.code === "ENOENT" || err.code === "EINVAL") return null;
    throw err;
  });
}
async function removeOwnedLock(path, target, owner, source) {
  const identity = processIdentity(process.pid);
  const claimed = `${owner}.recover-${process.pid}-${randomUUID()}${identity ? `-${identity}` : ""}`;
  const isDirectory = await lstat(source).then(
    (s) => s.isDirectory(),
    (err) => {
      if (err.code === "ENOENT") return false;
      throw err;
    }
  );
  if (!isDirectory) return false;
  try {
    await rename(source, claimed);
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
  if (await lockTarget(path) === target) await unlink(path);
  await rmdir(claimed);
  return true;
}
async function recoverLock(path, observedLiveAt) {
  const target = await lockTarget(path);
  if (!target || !isAbsolute(target)) return false;
  const owner = basename(target) === LOCK_CHILD ? dirname(target) : target;
  if (target !== owner && target !== join2(owner, LOCK_CHILD)) return false;
  const prefix = `${basename(path)}.owner-`;
  if (!basename(owner).startsWith(prefix)) return false;
  if (await realpath(dirname(owner)).catch(() => null) !== dirname(path)) return false;
  const holder = lockOwner(basename(owner).slice(prefix.length));
  if (!holder || isLive(holder, owner, observedLiveAt)) return false;
  if (await removeOwnedLock(path, target, owner, owner)) return true;
  const recoverPrefix = `${basename(owner)}.recover-`;
  const entries = await readdir(dirname(path));
  for (const entry of entries) {
    if (!entry.startsWith(recoverPrefix)) continue;
    const recovering = lockOwner(entry.slice(recoverPrefix.length));
    if (!recovering || isLive(recovering, entry, observedLiveAt)) continue;
    if (await removeOwnedLock(path, target, owner, join2(dirname(path), entry))) return true;
  }
  return false;
}
async function withLock(path, fn, waitMs = LOCK_WAIT_MS) {
  path = resolve(path);
  await mkdir(dirname(path), { recursive: true });
  path = join2(await realpath(dirname(path)), basename(path));
  const identity = processIdentity(process.pid);
  const owner = `${path}.owner-${process.pid}-${randomUUID()}${identity ? `-${identity}` : ""}`;
  const target = join2(owner, LOCK_CHILD);
  await mkdir(owner);
  const until = Date.now() + waitMs;
  const observedLiveAt = /* @__PURE__ */ new Map();
  try {
    for (; ; ) {
      try {
        await symlink(target, path);
        break;
      } catch (err) {
        if (err.code !== "EEXIST") throw err;
        if (await recoverLock(path, observedLiveAt)) continue;
        if (Date.now() > until) throw new LockBusyError(`Timed out waiting for ${path}`);
        await sleep(15);
      }
    }
    return await fn();
  } finally {
    await removeOwnedLock(path, target, owner, owner);
  }
}
async function tryWithLock(path, fn) {
  let acquired = false;
  try {
    return {
      acquired: true,
      value: await withLock(
        path,
        () => {
          acquired = true;
          return fn();
        },
        0
      )
    };
  } catch (err) {
    if (!acquired && err instanceof LockBusyError) return { acquired: false };
    throw err;
  }
}
async function updateState(dir, sessionId, change) {
  const path = statePath(dir, sessionId);
  return withLock(`${path}.lock`, async () => {
    const { state: current, isSaved } = await readSaved(dir, sessionId);
    const changed = await change(current);
    if (isSaved && changed === current) return current;
    const next = { ...changed, ledger: pruneClosed(changed.ledger, new Set(changed.heldRows)) };
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(next));
    await rename(tmp, path);
    return next;
  });
}

// src/run.ts
import { execFile } from "node:child_process";
var run = (args, { cwd, timeoutMs, env }) => new Promise((resolve3) => {
  const [file = "", ...rest] = args;
  const child = execFile(
    file,
    rest,
    { cwd, env: { ...process.env, ...env }, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" },
    (err, stdout, stderr) => {
      const code = err ? typeof err.code === "number" ? err.code : -1 : 0;
      resolve3({ code, stdout: String(stdout), stderr: String(stderr) });
    }
  );
  child.stdin?.end();
});

// src/update.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import {
  access,
  copyFile,
  lstat as lstat2,
  mkdir as mkdir2,
  readFile as readFile2,
  readlink as readlink2,
  rename as rename2,
  rm,
  stat as stat2,
  symlink as symlink2,
  writeFile as writeFile2
} from "node:fs/promises";
import { join as join4 } from "node:path";

// ../hooks/session-host.ts
async function askOverConversation(ask, s, screen, conversation) {
  if (!conversation) return { kind: "unreadable" };
  const text = await ask(transcriptCatchUpPrompt(s.ledger, screen, conversation)).catch(() => null);
  return text === null ? { kind: "failed" } : { kind: "reply", text, source: conversation };
}
async function runUpdates(host) {
  let canCatchUp = host.catchUp !== void 0;
  const wantsCatchUp = (s) => canCatchUp && needsCatchUp(s);
  const hasWork = (s) => s.pending.length > 0 || wantsCatchUp(s);
  while (hasWork(await host.read())) {
    const held = await host.exclusive(async () => {
      try {
        for (; ; ) {
          const s = await host.update((x) => ({ ...x, presence: { ...x.presence, isUpdating: hasWork(x) } }));
          if (!hasWork(s)) break;
          if (wantsCatchUp(s)) {
            const reply2 = await host.catchUp(s).catch(() => ({ kind: "failed" }));
            if (reply2.kind === "unreadable") {
              canCatchUp = false;
              continue;
            }
            const parsed = reply2.kind === "reply" ? parseReply(reply2.text, reply2.source) : null;
            const at = await host.now();
            await host.update((x) => appliedCatchUp(x, s, parsed, at));
            if (!parsed) return "stop";
            continue;
          }
          const next = s.pending[0];
          const promptAt = await host.now();
          const reply = await host.ask(buildPrompt(s.ledger, next.ex)).catch(() => null);
          const after = await host.update(
            async (x) => x.pending[0]?.turnsStarted === next.turnsStarted && x.pending[0].ex.turn === next.ex.turn ? applied(x, reply, await host.now(), promptAt) : x
          );
          if (after.pending[0]?.failed && !next.failed) return "stop";
        }
      } finally {
        await host.update((x) => ({ ...x, presence: { ...x.presence, isUpdating: false } }));
      }
    });
    if (!held.acquired || held.value === "stop") return;
  }
}

// src/settle.ts
var POLL_MS = 3e3;
var SETTLE_WINDOW_MS = SETTLED_MS + 2 * POLL_MS;

// src/texts.ts
var CODEX = {
  agent: "Codex",
  surface: "the Inbox tab",
  band: null,
  findingsIn: "the Findings section of the Inbox tab",
  recordTool: "mcp__inbox__record",
  closeTool: "mcp__inbox__close",
  intro: "The inbox plugin shows the user what waits on them: your open questions and the tasks only they can do, and your findings, in the Inbox tab beside the conversation."
};

// src/core.ts
var TAB_OPEN_MS = 15e3;
function isTabOpen(s, now) {
  return now - s.tabSeenAt < TAB_OPEN_MS;
}
function activityOf(tool, input) {
  return toolActivity(tool, input);
}
function patchFiles(patch) {
  return [...patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((m) => (m[1] ?? "").trim()).filter(Boolean);
}

// src/host.ts
function codexStore(dir, sessionId, now) {
  return {
    now,
    read: () => readState(dir, sessionId),
    update: (change) => updateState(dir, sessionId, change),
    exclusive: (fn) => tryWithLock(`${statePath(dir, sessionId)}.updating`, fn)
  };
}

// src/transcript.ts
import { open, readdir as readdir2 } from "node:fs/promises";
import { join as join3, resolve as resolve2 } from "node:path";

// ../hooks/conversation.ts
var NL4 = "\n";
var TRANSCRIPT_MAX = 8e4;
var MESSAGE_MAX = 6e3;
function flattenConversation(turns) {
  const lines = [];
  for (const turn of turns) {
    const text = turn.text.trim();
    const shown = turn.isVerbatim ? text : clip(text, MESSAGE_MAX);
    if (turn.role === "person") {
      if (text && !text.startsWith("inbox:")) lines.push(`Person: ${shown}`);
      continue;
    }
    if (text) lines.push(`Agent: ${shown}`);
    for (const line of turn.activity) lines.push(`Agent ${line}`);
  }
  const kept = [];
  let size = 0;
  for (const line of lines.reverse()) {
    size += line.length + 1;
    if (size > TRANSCRIPT_MAX) {
      kept.push("(earlier conversation left out)");
      break;
    }
    kept.push(line);
  }
  return kept.reverse().join(NL4);
}

// src/transcript.ts
var DIALOG_TOOL = "request_user_input_async";
var TAIL_BYTES = 4 * 1024 * 1024;
var SHELL_CALLS = /* @__PURE__ */ new Set(["shell", "shell_command", "exec_command", "container.exec"]);
var isText = (v) => typeof v === "string";
function commandText2(command) {
  if (isText(command)) return command;
  if (!Array.isArray(command)) return "";
  const argv = command.filter(isText);
  const [, flag, script] = argv;
  return argv.length === 3 && flag?.startsWith("-") && flag.endsWith("c") && script !== void 0 ? script : argv.join(" ");
}
function callCommand(p) {
  if (p.type === "local_shell_call") return commandText2(p.action?.command);
  if (p.type !== "function_call" || !p.name || !SHELL_CALLS.has(p.name) || !isText(p.arguments)) return "";
  try {
    const args = JSON.parse(p.arguments);
    return commandText2(args.command ?? args.cmd);
  } catch {
    return "";
  }
}
async function tailLines(path, bytes) {
  const file = await open(path, "r");
  try {
    const { size } = await file.stat();
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    const { bytesRead } = await file.read(buf, 0, buf.length, start);
    const lines = buf.subarray(0, bytesRead).toString("utf8").split("\n");
    if (start > 0) lines.shift();
    return lines;
  } finally {
    await file.close();
  }
}
var ROLLOUT_BYTES = 8 * 1024 * 1024;
var record = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
var textOf = (v) => isText(v) ? v : "";
var contentText = (content) => (Array.isArray(content) ? content : []).map((part) => textOf(record(part).text)).filter(Boolean).join("\n").trim();
var jsonRecord = (raw) => {
  try {
    return record(JSON.parse(textOf(raw)));
  } catch {
    return {};
  }
};
var literalValue = (literal) => {
  if (literal === void 0) return null;
  try {
    return textOf(JSON.parse(literal));
  } catch {
    return null;
  }
};
var PATCH_ARGUMENT = /tools\.apply_patch\(\s*("(?:[^"\\]|\\.)*")/;
var COMMAND_ARGUMENT = /\bcmd:\s*("(?:[^"\\]|\\.)*")/;
var shellLines = (command) => {
  const line = command === "" ? null : activityOf("Bash", { command });
  return line ? [line] : [];
};
var editLines = (patch, cwd) => patchFiles(patch).map((file) => `edited ${resolve2(cwd || "/", file)}`);
function callLines(p, hasCommandRows, cwd) {
  const name = textOf(p.name);
  if (p.type === "local_shell_call") return hasCommandRows ? [] : shellLines(callCommand(p));
  if (p.type === "custom_tool_call" && name === "exec") {
    const input = textOf(p.input);
    const patch = literalValue(PATCH_ARGUMENT.exec(input)?.[1]);
    const command = literalValue(COMMAND_ARGUMENT.exec(input)?.[1]);
    return [...patch ? editLines(patch, cwd) : [], ...command && !hasCommandRows ? shellLines(command) : []];
  }
  if (p.type !== "function_call") return [];
  if (SHELL_CALLS.has(name)) return hasCommandRows ? [] : shellLines(callCommand(p));
  const args = jsonRecord(p.arguments);
  if (name === "apply_patch") return editLines(textOf(args.input ?? args.patch ?? args.command), cwd);
  if (name === "spawn_agent") {
    const line2 = activityOf("Agent", { description: textOf(args.task_name) });
    return line2 ? [line2] : [];
  }
  if (name === DIALOG_TOOL) return [dialogActivity(dialogQuestions(args.questions), { kind: "open" })];
  const line = activityOf(textOf(p.namespace).startsWith("mcp__") ? textOf(p.namespace) + name : name, {});
  return line ? [line] : [];
}
var isItem = (row, ...kinds) => row.type === "event_msg" && record(row.payload).type === "item_completed" && kinds.includes(textOf(record(record(row.payload).item).type));
function turnsOf(rows, cwd) {
  const hasMessageRows = rows.some((row) => isItem(row, "UserMessage", "AgentMessage"));
  const hasCommandRows = rows.some((row) => isItem(row, "CommandExecution"));
  const turns = [];
  const agentTurn = () => {
    const last = turns.at(-1);
    if (last?.role === "agent") return last;
    const turn = { role: "agent", text: "", activity: [] };
    turns.push(turn);
    return turn;
  };
  const person = (text) => {
    if (text && !text.startsWith("<")) turns.push({ role: "person", text, activity: [] });
  };
  const act = (lines) => {
    if (lines.length === 0) return;
    const turn = agentTurn();
    turn.activity = lines.reduce((all, line) => addActivity(all, line), turn.activity);
  };
  for (const row of rows) {
    const p = record(row.payload);
    const item = record(p.item);
    if (isItem(row, "UserMessage")) person(contentText(item.content));
    else if (isItem(row, "AgentMessage")) turns.push({ role: "agent", text: contentText(item.content), activity: [] });
    else if (isItem(row, "CommandExecution")) act(shellLines(commandText2(item.command)));
    else if (row.type === "response_item") {
      if (p.type === "message" && !hasMessageRows && p.role === "user") person(contentText(p.content));
      else if (p.type === "message" && !hasMessageRows && p.role === "assistant")
        turns.push({ role: "agent", text: contentText(p.content), activity: [] });
      else act(callLines(p, hasCommandRows, cwd));
    }
  }
  return turns;
}
function rolloutTurns(lines, cwd) {
  const groups = [];
  for (const line of lines) {
    let row;
    try {
      row = record(JSON.parse(line));
    } catch {
      continue;
    }
    const p = record(row.payload);
    if (row.type === "event_msg" && p.type === "task_started") {
      groups.push({ id: textOf(p.turn_id) || textOf(record(p.turn_attribution).turn_id), isComplete: false, rows: [] });
      continue;
    }
    if (groups.length === 0) groups.push({ id: "", isComplete: false, rows: [] });
    const group = groups.at(-1);
    if (row.type === "event_msg" && p.type === "task_complete") group.isComplete = true;
    else group.rows.push(row);
  }
  return groups.map((g) => ({ id: g.id, isComplete: g.isComplete, turns: turnsOf(g.rows, cwd) }));
}
async function readRollout(path, cwd, currentTurnId) {
  if (path === null) return null;
  try {
    const turns = rolloutTurns(await tailLines(path, ROLLOUT_BYTES), cwd);
    const earlier = turns.filter(
      (t) => t.id !== currentTurnId && (t.isComplete || t.turns.some((x) => x.role === "person"))
    );
    return { conversation: flattenConversation(turns.flatMap((t) => t.turns)), earlierTurns: earlier.length };
  } catch {
    return null;
  }
}

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
async function modelHome(dir, personHome) {
  const auth = join4(personHome, "auth.json");
  const hasSignInFile = await access(auth).then(
    () => true,
    () => false
  );
  if (!hasSignInFile) return null;
  const home = join4(dir, "model-home");
  const link = join4(home, "auth.json");
  try {
    await mkdir2(home, { recursive: true });
    const isLinked = await readlink2(link).catch(() => null) === auth;
    if (isLinked) return home;
    await keepNewerSignIn(link, auth);
    const made = `${link}.${randomUUID2()}`;
    await symlink2(auth, made);
    await rename2(made, link);
    return home;
  } catch {
    return null;
  }
}
async function keepNewerSignIn(link, auth) {
  const saved = await lstat2(link).catch(() => null);
  if (!saved?.isFile()) return;
  const theirs = await stat2(auth);
  if (saved.mtimeMs > theirs.mtimeMs) await copyFile(link, auth);
}
function codexAsk(exec, cli, dir, personHome) {
  return async (prompt) => {
    const work = join4(dir, "exec");
    const system = join4(dir, "inbox-system.md");
    const out = join4(work, `reply-${randomUUID2()}.txt`);
    await mkdir2(work, { recursive: true });
    const home = await modelHome(dir, personHome);
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
          MODEL,
          "-c",
          'model_reasoning_effort="low"',
          "-c",
          `model_instructions_file=${JSON.stringify(system)}`,
          "-c",
          "project_doc_max_bytes=0",
          ...home ? ["-c", 'cli_auth_credentials_store="file"'] : [],
          ...off.flatMap((f) => ["--disable", f]),
          "-o",
          out,
          prompt
        ],
        { cwd: work, timeoutMs: TIMEOUT_MS, env: home ? { CODEX_HOME: home } : {} }
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
var runUpdates2 = (dir, sessionId, ask, now) => runUpdates({
  ...codexStore(dir, sessionId, now),
  ask,
  catchUp: async (s) => askOverConversation(
    ask,
    s,
    screenText(CODEX, isTabOpen(s, now()), null),
    (await readRollout(s.transcriptPath, s.root))?.conversation ?? null
  )
});

// src/update-main.ts
async function main() {
  const sessionId = process.argv[2] ?? "";
  const dir = dataDir(process.env, dirname2(dirname2(fileURLToPath(import.meta.url))));
  const { cliPath } = await readState(dir, sessionId);
  const personHome = process.env.CODEX_HOME || join5(homedir3(), ".codex");
  await runUpdates2(dir, sessionId, codexAsk(run, cliPath ?? "codex", dir, personHome), Date.now);
}
main().catch(() => process.exit(0));
