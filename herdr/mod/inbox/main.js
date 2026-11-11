// Built by herdr/build.ts with Bun 1.4.4 from herdr/src and hooks/. Do not edit.

// src/main.ts
import { View, div } from "gpui-kit";
import { Scrollbar, h_flex, v_flex } from "gpui-base";
import { appHome, focused, panes, props, readTextFile, terminals, theme, watchFolder } from "herdr";

// ../hooks/press-labels.ts
function actionId(p) {
  return p.action === "step" ? `step-${p.step}` : p.action;
}
function capitalized(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
var ISSUE_LABEL = "File issue";

// ../hooks/banners.ts
function groupEmptyText(title) {
  return `No open ${title.toLowerCase()}`;
}
var BANNER_TONES = {
  demo: "notice",
  "update-failed": "warning",
  "tools-refused": "error",
  "read-failed": "error",
  stopped: "error",
  "gh-missing": "warning",
  "gh-signed-out": "warning",
  "gh-limited": "warning",
  "gh-failed": "warning",
  "press-note": "notice",
  "press-failed": "error",
  "hooks-trust": "error",
  "server-gone": "error",
  "server-load-failed": "error",
  "server-builds-differ": "warning",
  "tab-update-failed": "warning"
};
function bannerOf(kind, text) {
  const end = text.indexOf(". ");
  const lead = end < 0 ? text : text.slice(0, end + 1);
  const body = end < 0 ? null : text.slice(end + 2);
  return { kind, tone: BANNER_TONES[kind], lead, body };
}
function tabBarBanners(host, statusError, pressNote) {
  return [
    ...host,
    ...statusError ? [bannerOf("update-failed", statusError)] : [],
    ...pressNote ? [bannerOf(pressNote.isError ? "press-failed" : "press-note", pressNote.text)] : []
  ];
}
var READING_TEXT = "Reading the inbox…";
var NEXT_BUILD_MARK = ".next-build";
var MAYBE_STALE_TEXT = "May be out of date";
function emptyText(tab, agent, isStale = false) {
  const text = tab === "needsYou" ? { title: "Nothing needed", hint: `${agent}'s questions and the tasks only you can do show up here.` } : { title: "No findings yet", hint: `${agent} flags issues and opportunities it spots beyond your task.` };
  return isStale ? { ...text, title: MAYBE_STALE_TEXT } : text;
}

// ../hooks/status-limits.ts
var OPEN_SUBJECTS = 6;
var NAME_KEPT = 20;
var TEXT_KEPT = 12;
var DESCRIPTION_KEPT = 14;
var GOAL_LEFT_MS = 30 * 60000;
var REMOVED_KEPT = 10;
var IDLE_AFTER_MS = 24 * 60 * 60000;
var CHILD_KEPT_MS = 24 * 60 * 60000;
var STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "for",
  "to",
  "in",
  "on",
  "and",
  "or",
  "is",
  "it",
  "its",
  "now",
  "be",
  "by",
  "at",
  "with"
]);
var EMPTY_SESSION_STATUS = {
  head: null,
  subjects: [],
  children: [],
  askSubjects: {},
  nextId: 1,
  nextChildId: 1,
  lastLookAt: null,
  missedInLastLook: {},
  look: null,
  goal: null,
  removedGoals: [],
  goalRemoved: null,
  milestones: [],
  nextMilestoneId: 1,
  serves: {}
};
var OPEN_STATUSES = ["working", "queued", "waits-on-other"];
var STATUSES = [...OPEN_STATUSES, "done", "dropped"];
function clipWords(text, limit) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length <= limit ? words.join(" ") : `${words.slice(0, limit).join(" ")}…`;
}
function words(text) {
  const matches = text.toLowerCase().match(/[\p{L}\p{N}#.]+/gu) ?? [];
  return new Set(matches.map((w) => w.replace(/^\.+|\.+$/g, "")).filter((w) => w !== "" && !STOP_WORDS.has(w)));
}
var NUMBER_KINDS = new Set(["pr", "prs", "pull", "request", "issue", "issues", "ticket", "gh"]);
function nameKey(name) {
  return [...words(name)].sort().join(" ");
}
var SUFFIXES = ["ing", "ed", "es", "s"];
function stem(word) {
  if (/\d/.test(word))
    return word;
  const suffix = SUFFIXES.find((s) => word.endsWith(s) && word.length - s.length >= 3) ?? "";
  const cut = word.slice(0, word.length - suffix.length);
  const base = cut.length > 3 && cut.endsWith("e") ? cut.slice(0, -1) : cut;
  return base.replace(/([b-df-hj-np-tv-z])\1$/, "$1");
}
function isOpen(s) {
  return s.status !== "done" && s.status !== "dropped";
}

// ../hooks/text.ts
function clipLabel(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
var PHRASE_END = /[,;](?=\s)|\s(?=and\s)/g;
function cutAtPhrase(text, fits) {
  if (fits(text))
    return text;
  const heads = [...text.matchAll(PHRASE_END)].map((m) => `${text.slice(0, m.index).replace(/[\s.,;:]+$/, "")}…`);
  return heads.findLast(fits) ?? heads[0] ?? text;
}
var segmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
var LEADING_JAMO = String.raw`[\u1100-\u115F\uA960-\uA97C]`;
var VOWEL_JAMO = String.raw`[\u1160-\u11A7\uD7B0-\uD7C6]`;
var TRAILING_JAMO = String.raw`[\u11A8-\u11FF\uD7CB-\uD7FB]`;
var SYLLABLE = String.raw`[\uAC00-\uD7A3]`;
var OPEN_SYLLABLE = `[${Array.from({ length: 19 * 21 }, (_, i) => String.fromCharCode(44032 + i * 28)).join("")}]`;
var HANGUL = `(?:${LEADING_JAMO}*(?:${VOWEL_JAMO}+|${OPEN_SYLLABLE}${VOWEL_JAMO}*|${SYLLABLE})${TRAILING_JAMO}*|${LEADING_JAMO}+|${TRAILING_JAMO}+)`;
var FLAG = String.raw`[\u{1F1E6}-\u{1F1FF}]{2}`;
var EXTEND = String.raw`\p{M}\p{Emoji_Modifier}\u{E0020}-\u{E007F}‌ﾞﾟำຳ`;
var GRAPHEME = new RegExp(String.raw`[${EXTEND}\u200D]+|(?:${FLAG}|${HANGUL}|[^${EXTEND}\u200D])(?:[${EXTEND}]|\u200D[^${EXTEND}\u200D]?)*`, "gu");
function graphemesOf(text) {
  return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : text.match(GRAPHEME) ?? [];
}
var ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cc}\p{Cf}]+$/u;
var EMOJI = /\p{Emoji_Presentation}|\uFE0F/u;
var WIDE = /^[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{20000}-\u{3FFFD}]/u;
function cellWidth(text) {
  let cells = 0;
  for (const segment of graphemesOf(text))
    cells += graphemeCells(segment);
  return cells;
}
function graphemeCells(grapheme) {
  if (ZERO_WIDTH.test(grapheme))
    return 0;
  return EMOJI.test(grapheme) || WIDE.test(grapheme) ? 2 : 1;
}
function duration(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60)
    return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 48)
    return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
function ago(ms) {
  return Math.round(ms / 60000) < 1 ? "just now" : `${duration(ms)} ago`;
}
function clockTime(ms) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// ../hooks/status-children.ts
function isChildRunning(c, now) {
  return c.startedAt <= now && (c.endedAt === null || c.endedAt > now);
}
function subjectSeenAt(o, id) {
  return id in o.missedInLastLook ? o.missedInLastLook[id] ?? null : o.lastLookAt;
}
function isSubjectSeen(o, s) {
  const seenAt = subjectSeenAt(o, s.id);
  return seenAt !== null && s.changedAt <= seenAt;
}

// ../hooks/tabs.ts
var TAB_NAMES = [
  { id: "overview", label: "Status", symbol: "\uD83E\uDDED" },
  { id: "needsYou", label: "Asks", symbol: "\uD83D\uDE4B" },
  { id: "findings", label: "Finds", symbol: "\uD83D\uDD0D" },
  { id: "prs", label: "PRs", symbol: "\uD83D\uDD00" }
];
var numbered = (tabs) => tabs.map((t, n) => ({ ...t, hotkey: String(n + 1) }));
var NEXT_BUILD_TABS = numbered(TAB_NAMES);
var RELEASE_TABS = numbered(TAB_NAMES.filter((t) => t.id !== "overview"));
function shownTabs(isNextBuild) {
  return isNextBuild ? NEXT_BUILD_TABS : RELEASE_TABS;
}
function tabBadge(id, counts) {
  return isRowTab(id) && counts[id] > 0 ? String(counts[id]) : null;
}
function isListedTab(tab) {
  return tab === "needsYou" || tab === "findings";
}
function isRowTab(tab) {
  return tab !== "overview";
}
var ROW_TABS = TAB_NAMES.filter((t) => isRowTab(t.id));
var LISTED_TABS = TAB_NAMES.filter((t) => isListedTab(t.id));

// ../hooks/help.ts
var FINDING_GROUPS = {
  issue: { title: "Issues", mark: "▲", tone: "issue" },
  opportunity: { title: "Opportunities", mark: "✦", tone: "done" }
};
var SUBJECT_MARKS = {
  working: { mark: "●", tone: null },
  queued: { mark: "○", tone: null },
  "waits-on-other": { mark: "◌", tone: null },
  done: { mark: "✓", tone: "done" },
  dropped: { mark: "✗", tone: null }
};
var HELD_MARK = { mark: "◆", tone: "needsYou" };
var RUNNING_FRAMES = ["●", "◉", "◎", "◉"];
var RUNNING_MARK = RUNNING_FRAMES[0];
var IDLE_MARK = { mark: "◐", tone: null };
var CLOSED_MARKS = {
  handled: SUBJECT_MARKS.done.mark,
  dismissed: "✕",
  lapsed: SUBJECT_MARKS.dropped.mark
};
var PR_MARKS = {
  waiting: { text: HELD_MARK.mark, tone: "needsYou" },
  sent: { text: SUBJECT_MARKS.done.mark, tone: "done" },
  failing: { text: FINDING_GROUPS.issue.mark, tone: "error" },
  cancelled: { text: "⊘", tone: null }
};
var stoppedWords = (what) => `Stopped before it finished: ${what}`;
var MARK_LEGEND = [
  {
    mark: RUNNING_MARK,
    tone: null,
    isRunning: true,
    words: "Working. It moves while the work runs or your message is on its way."
  },
  { mark: IDLE_MARK.mark, tone: null, isRunning: false, words: "Working, with nothing running right now" },
  { mark: SUBJECT_MARKS.queued.mark, tone: null, isRunning: false, words: "Queued: not started yet" },
  {
    mark: SUBJECT_MARKS["waits-on-other"].mark,
    tone: null,
    isRunning: false,
    words: "Waits on something other than you, such as a build or a review"
  },
  { mark: HELD_MARK.mark, tone: HELD_MARK.tone, isRunning: false, words: "Waits on you" },
  { mark: SUBJECT_MARKS.done.mark, tone: "done", isRunning: false, words: "Done, or handed to the agent" },
  { mark: SUBJECT_MARKS.dropped.mark, tone: null, isRunning: false, words: stoppedWords("dropped work") },
  { mark: CLOSED_MARKS.dismissed, tone: null, isRunning: false, words: "Dismissed by you" },
  {
    mark: FINDING_GROUPS.issue.mark,
    tone: FINDING_GROUPS.issue.tone,
    isRunning: false,
    words: "Something is wrong: an issue or a failing check"
  },
  {
    mark: PR_MARKS.cancelled.text,
    tone: PR_MARKS.cancelled.tone,
    isRunning: false,
    words: stoppedWords("a cancelled check, which needs another run")
  },
  {
    mark: FINDING_GROUPS.opportunity.mark,
    tone: FINDING_GROUPS.opportunity.tone,
    isRunning: false,
    words: "Opportunity: something that could be better"
  }
];
var STATUS_ONLY_MARKS = new Set([IDLE_MARK.mark, SUBJECT_MARKS.queued.mark, SUBJECT_MARKS["waits-on-other"].mark]);
var UNDO_KEY = "u";

// ../hooks/status-goal-page.ts
var AWAITING_TEXT = "Milestones after the next reply";
var GOAL_HEADING = "Goal";
var NO_GOAL_TEXT = "No goal yet. The inbox sets one when the work shows where it's headed.";
function oldestAsk(items, links, id) {
  const oldest = items.filter((i) => links[i.id]?.includes(id)).sort((i, j) => (i.at ?? -Infinity) - (j.at ?? -Infinity))[0];
  return oldest ? { id: oldest.id, kind: oldest.kind } : null;
}
function milestoneRow(m, o, items) {
  const isOpen = m.status !== "done" && m.status !== "dropped";
  const servingIds = new Set(Object.entries(o.serves).flatMap(([id, to]) => to === m.id ? [id] : []));
  const holds = items.filter((i) => {
    const to = o.askSubjects[i.id] ?? [];
    return to.some((id) => id === m.id || servingIds.has(id));
  });
  const isHeld = isOpen && holds.length > 0;
  const isChanged = o.lastLookAt !== null && m.changedAt > o.lastLookAt && m.changedAt > (o.goal?.setAt ?? 0);
  const direct = oldestAsk(items, o.askSubjects, m.id);
  const viaSubject = holds.sort((i, j) => (i.at ?? -Infinity) - (j.at ?? -Infinity))[0];
  return {
    id: m.id,
    ...isHeld ? HELD_MARK : SUBJECT_MARKS[m.status],
    name: m.name,
    text: m.text || null,
    stall: isHeld ? { text: "waiting", tone: "needsYou" } : null,
    was: isChanged ? m.was : null,
    isChanged,
    ask: !isHeld ? null : direct ?? (viaSubject ? { id: viaSubject.id, kind: viaSubject.kind } : null),
    rows: []
  };
}
function goalPage(o, items) {
  const g = o?.goal ?? null;
  if (o === null || g === null)
    return { goal: null, canRestoreGoal: o?.goalRemoved != null };
  const isWasShown = g.was !== null && (o.lastLookAt === null || g.setAt > o.lastLookAt);
  const kept = o.milestones.filter((m) => m.status !== "dropped");
  const shown = o.milestones.filter((m) => m.status !== "dropped" || o.lastLookAt !== null && m.changedAt > o.lastLookAt);
  const done = kept.filter((m) => m.status === "done").length;
  const isMet = g.metAt !== null;
  const isAwaiting = g.isAwaitingMilestones || kept.length === 0;
  const head = o.head;
  return {
    goal: {
      label: isMet ? "Goal met" : GOAL_HEADING,
      text: g.text,
      count: isMet || isAwaiting ? null : `${done} of ${kept.length} done`,
      isMet,
      was: isWasShown ? g.was : null,
      now: head ? `Now: ${head.description || head.title}` : null,
      awaiting: isAwaiting ? AWAITING_TEXT : null,
      milestones: g.isAwaitingMilestones ? [] : shown.map((m) => milestoneRow(m, o, items))
    },
    canRestoreGoal: false
  };
}

// ../hooks/status-page-parts.ts
var CHILD_ROWS = 3;
var CHILD_MARK = { mark: SUBJECT_MARKS.working.mark, tone: null };
var COUNT_WORDS = {
  working: "working",
  "waits-on-other": "waiting",
  queued: "queued"
};
function countsByMark(folded) {
  return ["working", "waits-on-other", "queued"].flatMap((status) => {
    const n = folded.filter((x) => x.status === status).length;
    return n === 0 ? [] : [{ ...SUBJECT_MARKS[status], text: `${n} ${COUNT_WORDS[status]}` }];
  });
}
function isFinishedUnseen(c, lastLookAt) {
  return c.delegateState === "finished" && c.endedAt !== null && (lastLookAt === null || c.endedAt > lastLookAt);
}
var DAY_MS = 24 * 60 * 60000;
function subjectStall(x, isHeld, isWorkRunning, now) {
  if (isHeld)
    return { text: "waiting", tone: "needsYou" };
  const idleMs = now - x.changedAt;
  const isIdle = isOpen(x) && !isWorkRunning && idleMs >= IDLE_AFTER_MS;
  return isIdle ? { text: `idle ${Math.floor(idleMs / DAY_MS)}d`, tone: "muted" } : null;
}
function isChildWorking(c) {
  return c.endedAt === null && c.delegateState !== "blocked";
}
function childStall(c) {
  if (c.delegateState === "finished")
    return { text: "finished", tone: "done" };
  if (c.delegateState === "blocked")
    return { text: "waiting", tone: "needsYou" };
  return null;
}
function childRow(c, branch, depth) {
  const marks = c.delegateState === "finished" ? SUBJECT_MARKS.done : c.delegateState === "blocked" ? HELD_MARK : CHILD_MARK;
  return {
    kind: "child",
    id: c.id,
    depth,
    ...marks,
    isRunning: isChildWorking(c),
    name: c.name,
    stall: childStall(c),
    branch
  };
}
function partRows(shown, c, depth, afterNew = []) {
  const rows = [];
  const lookRow = c.lookId === null ? null : { kind: "look", id: c.lookId, depth, text: c.lookText };
  const firstSeen = shown.findIndex((x) => !c.isNew(x));
  for (const [i, x] of shown.entries()) {
    const hasNewAbove = i > 0;
    if (i === firstSeen && hasNewAbove)
      rows.push(...afterNew, ...lookRow ? [lookRow] : []);
    const under = c.running.filter((ch) => ch.subjectId === x.id);
    const shownUnder = under.slice(0, CHILD_ROWS);
    const isMore = under.length > CHILD_ROWS;
    const isRunning = x.status === "working" && !c.isHeld(x) && (c.isTurnRunning || under.some(isChildWorking));
    const isIdle = x.status === "working" && !isRunning;
    const isWorkRunning = isRunning || under.some((ch) => ch.endedAt === null);
    rows.push({
      kind: "subject",
      id: x.id,
      depth,
      ...c.isHeld(x) ? HELD_MARK : isIdle ? IDLE_MARK : SUBJECT_MARKS[x.status],
      isRunning,
      name: x.name,
      text: c.isNew(x) || isOpen(x) ? x.text || null : null,
      stall: subjectStall(x, c.isHeld(x), isWorkRunning, c.now),
      merged: c.isNew(x) ? x.merged : null,
      was: c.isNew(x) ? x.was : null,
      hasChildren: under.length > 0,
      ask: c.oldestAskOf(x)
    });
    rows.push(...shownUnder.map((ch, n) => childRow(ch, n === shownUnder.length - 1 && !isMore ? "last" : "mid", depth + 1)));
    const hidden = under.slice(CHILD_ROWS);
    const isEveryHiddenRunning = hidden.every((ch) => ch.delegateState !== "finished");
    if (isMore)
      rows.push({
        kind: "more",
        id: `${x.id}-more`,
        depth: depth + 1,
        text: `+ ${hidden.length} more${isEveryHiddenRunning ? " running" : ""}`,
        branch: "last"
      });
  }
  const isEveryShownNew = firstSeen === -1;
  if (isEveryShownNew)
    rows.push(...afterNew);
  if (lookRow && c.isLookAtEnd && isEveryShownNew && shown.length > 0)
    rows.push(lookRow);
  return rows;
}
function isItemAfterItem(row, prev) {
  const isUnderSubject = row.kind === "more" || row.kind === "child" && row.branch !== null;
  const isLine = (r) => r.kind === "look" || r.kind === "part";
  return prev !== undefined && !isLine(prev) && !isLine(row) && !isUnderSubject;
}
function ruledRows(rows, isRuled) {
  return rows.map((r, n) => ({
    ...r,
    isRuledAbove: isRuled && isItemAfterItem(r, rows[n - 1]),
    isLast: n === rows.length - 1
  }));
}
function unfoldedRows(rows, isUnfolded) {
  return rows.flatMap((r) => r.kind === "done-fold" && isUnfolded(r.id) ? [{ ...r, isLast: false }, ...r.rows.map((x, n) => ({ ...x, isLast: r.isLast && n === r.rows.length - 1 }))] : [r]);
}

// ../hooks/status-page.ts
var STATUS_FAILED = "The inbox couldn't update this page from one of the agent's replies. What changed in that reply may be missing. It reads the conversation again after the next reply.";
var LOOK_TEXT = "Last seen";
var OTHER_WORK = "Other work";
var WAS_PREFIX = "was: ";
var MERGED_PREFIX = "merged in: ";
var STALL_GAP = " · ";
var NEW_CLOSED_ROWS = 2;
var NAMED_FOLD_TEXT = { done: "Also done: ", dropped: "Also dropped: " };
var NAMED_FOLD_NAMES = 2;
var IS_FOLD_MORE_SEEN = true;
var namedFoldMore = (n) => `+${n} more`;
var STATUS_PLACES = ["held", "working", "waits-on-other", "queued", "closed"];
function mergedLine(merged, fits) {
  return `${MERGED_PREFIX}${cutAtPhrase(merged, (names) => fits(`${MERGED_PREFIX}${names}`))}`;
}
function statusPage(s, now) {
  const o = s.ledger.overview;
  const look = o?.lastLookAt ?? null;
  const subjects = (o?.subjects ?? []).filter((x) => x.into === null);
  const isNew = (x) => o === null || !isSubjectSeen(o, x);
  const heldIds = new Set(s.ledger.items.flatMap((i) => o?.askSubjects[i.id] ?? []));
  const isHeld = (x) => isOpen(x) && heldIds.has(x.id);
  const oldestAskOf = (x) => isHeld(x) ? oldestAsk(s.ledger.items, o?.askSubjects ?? {}, x.id) : null;
  const placeOf = (x) => isHeld(x) ? "held" : x.status === "done" || x.status === "dropped" ? "closed" : x.status;
  const pageOrder = (x, y) => Number(isNew(y)) - Number(isNew(x)) || STATUS_PLACES.indexOf(placeOf(x)) - STATUS_PLACES.indexOf(placeOf(y)) || y.changedAt - x.changedAt;
  const goalParts = goalPage(o, s.ledger.items);
  const milestoneIds = new Set((goalParts.goal?.milestones ?? []).map((m) => m.id));
  const servedBy = (x) => o?.goal ? o.serves[x.id] : undefined;
  const isOther = (x) => servedBy(x) === "none";
  const milestoneOf = (x) => {
    const to = servedBy(x);
    return to !== undefined && milestoneIds.has(to) ? to : null;
  };
  const running = (o?.children ?? []).filter((c) => isChildRunning(c, now) || isFinishedUnseen(c, look)).sort((x, y) => (y.lastActivityAt ?? y.startedAt) - (x.lastActivityAt ?? x.startedAt));
  const hasChildRow = (x) => running.some((c) => c.subjectId === x.id);
  const unseenClosedOf = (part) => part.filter((x) => !isOpen(x) && isNew(x)).sort((x, y) => (y.closedAt ?? 0) - (x.closedAt ?? 0));
  const main = subjects.filter((x) => !isOther(x));
  const other = subjects.filter(isOther);
  const open = main.filter(isOpen).sort(pageOrder);
  const foldable = open.filter((x) => !isHeld(x) && !isNew(x) && !hasChildRow(x));
  const folded = foldable.slice(Math.max(0, OPEN_SUBJECTS - (open.length - foldable.length)));
  const split = (part) => {
    const unseenClosed = unseenClosedOf(part);
    const newClosed = unseenClosed.slice(0, NEW_CLOSED_ROWS);
    return {
      shown: [...part.filter((x) => isOpen(x) && !folded.includes(x)), ...newClosed].sort(pageOrder),
      newClosed,
      named: unseenClosed.slice(NEW_CLOSED_ROWS),
      foldedOpen: part.filter((x) => folded.includes(x)),
      foldedDone: part.filter((x) => x.status === "done" && !isNew(x))
    };
  };
  const top = split(main.filter((x) => milestoneOf(x) === null));
  const underMilestones = (goalParts.goal?.milestones ?? []).map((m) => split(main.filter((x) => milestoneOf(x) === m.id)));
  const otherUnseenClosed = unseenClosedOf(other);
  const otherNewClosed = otherUnseenClosed.slice(0, NEW_CLOSED_ROWS);
  const isOtherFolded = (x) => isOpen(x) ? !isHeld(x) && !isNew(x) && !hasChildRow(x) : x.status === "done" && !isNew(x);
  const otherFolded = other.filter(isOtherFolded);
  const otherShown = [...other.filter((x) => isOpen(x) && !otherFolded.includes(x)), ...otherNewClosed].sort(pageOrder);
  const shownIds = new Set([...top.shown, ...underMilestones.flatMap((p) => p.shown), ...otherShown].map((x) => x.id));
  const ctx = {
    isNew,
    isHeld,
    oldestAskOf,
    running,
    isTurnRunning: s.presence.isTurnRunning,
    now,
    lookId: look === null ? null : "look",
    lookText: LOOK_TEXT,
    isLookAtEnd: true
  };
  const lookId = (id) => look === null ? null : id;
  const foldCtx = { ...ctx, lookId: null, running: [] };
  const namedFolds = (prefix, named, depth) => ["done", "dropped"].flatMap((status) => {
    const closed = named.filter((x) => x.status === status);
    const names = closed.map((x) => x.name);
    const hidden = names.length - NAMED_FOLD_NAMES;
    const shown = [...names.slice(0, NAMED_FOLD_NAMES), ...hidden > 0 ? [namedFoldMore(hidden)] : []];
    return names.length === 0 ? [] : [
      {
        kind: "fold",
        id: `${prefix}also-${status}`,
        depth,
        ...SUBJECT_MARKS[status],
        text: `${NAMED_FOLD_TEXT[status]}${shown.join(", ")}`,
        subjectIds: (IS_FOLD_MORE_SEEN ? closed : closed.slice(0, NAMED_FOLD_NAMES)).map((x) => x.id)
      }
    ];
  });
  const rows = [
    ...running.filter((c) => c.subjectId === null || !shownIds.has(c.subjectId)).map((c) => childRow(c, null, 0)),
    ...partRows(top.shown, ctx, 0, namedFolds("", top.named, 0))
  ];
  const doneFold = (prefix, done, newClosed, depth) => done.length === 0 ? [] : [
    {
      kind: "done-fold",
      id: `${prefix}done`,
      depth,
      text: `${done.length}${newClosed.some((x) => x.status === "done") ? " more" : ""} done`,
      rows: ruledRows(partRows([...done].sort(pageOrder), foldCtx, depth + 1), false)
    }
  ];
  const foldRows = (prefix, p, depth) => [
    ...p.foldedOpen.length > 0 ? [
      {
        kind: "fold",
        id: `${prefix}open`,
        depth,
        ...SUBJECT_MARKS.queued,
        text: `${p.foldedOpen.length} more`,
        subjectIds: []
      }
    ] : [],
    ...doneFold(prefix, p.foldedDone, p.newClosed, depth)
  ];
  rows.push(...foldRows("", top, 0));
  if (otherShown.length > 0 || otherFolded.length > 0) {
    if (rows.at(-1)?.kind === "look")
      rows.pop();
    rows.push({ kind: "part", id: "other", depth: 0, text: OTHER_WORK });
    rows.push(...partRows(otherShown, { ...ctx, lookId: lookId("other-look") }, 0, namedFolds("other-", otherUnseenClosed.slice(NEW_CLOSED_ROWS), 0)));
    const otherFoldedOpen = otherFolded.filter(isOpen);
    if (otherFoldedOpen.length > 0)
      rows.push({ kind: "counts", id: "other-counts", depth: 0, counts: countsByMark(otherFoldedOpen) });
    rows.push(...doneFold("other-", otherFolded.filter((x) => x.status === "done"), otherNewClosed, 0));
  }
  const milestoneRows = (id, p) => ruledRows([
    ...partRows(p.shown, { ...ctx, lookId: lookId(`${id}-look`), isLookAtEnd: false }, 1, namedFolds(`${id}-`, p.named, 1)),
    ...foldRows(`${id}-`, p, 1)
  ], false);
  const g = goalParts.goal;
  const goal = g && {
    ...g,
    milestones: g.milestones.map((m, n) => ({ ...m, rows: milestoneRows(m.id, underMilestones[n]) }))
  };
  const head = o?.head ? { title: o.head.title, description: o.head.description || null } : null;
  return {
    isEmpty: head === null && rows.length === 0 && goal === null && !goalParts.canRestoreGoal,
    head,
    ...goalParts,
    goal,
    rows: ruledRows(rows, true),
    error: s.overviewFailure ? STATUS_FAILED : null,
    empty: {
      title: "Status",
      hint: "What this session's work is for, where each part stands, and what changed. It fills in once the work starts."
    }
  };
}

// ../hooks/ask-match.ts
function words2(text) {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
function recommendedOption(options, rec) {
  if (!rec)
    return null;
  const named = new Set(words2(rec));
  let best = null;
  for (const option of options) {
    const w = words2(option);
    if (w.length > words2(best ?? "").length && w.every((x) => named.has(x)))
      best = option;
  }
  const label = (text) => text.match(/^\s*\(?([a-z]|\d{1,2})\s*[:.)]/i)?.[1]?.toLowerCase();
  const byLabel = /^\s*(?:option\s+)?([a-z]|\d{1,2})\s*[.!]?\s*$/i.exec(rec)?.[1]?.toLowerCase();
  return best ?? (byLabel ? options.find((o) => label(o) === byLabel) ?? null : null);
}
var FILLER = new Set([
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
var GENERIC = new Set([
  "which",
  "what",
  "how",
  "when",
  "where",
  "whether",
  "why",
  "who",
  "pick",
  "choose",
  "select",
  "prefer",
  "want",
  "decide",
  "need",
  "like",
  "are",
  "was",
  "were",
  "been",
  "being",
  "can",
  "could",
  "would",
  "will",
  "shall",
  "might",
  "must",
  "does",
  "did",
  "has",
  "have",
  "had",
  "new",
  "current",
  "existing",
  "its",
  "our",
  "their",
  "now",
  "still",
  "also",
  "just",
  "again",
  "already",
  "instead",
  "yet"
]);
var STATES = new Set(["new", "current", "existing", "old", "previous"]);
var QUESTIONS = new Set(["how", "when", "where", "why", "who", "whether"]);
var PAST = new Set(["was", "were", "did", "had"]);
var FUTURE = new Set(["will", "shall"]);
var SYNONYMS = [
  ["vanish", "disappear"],
  ["remove", "delete"],
  ["folder", "directory", "directories"],
  ["config", "configuration"]
];
var MEANING = new Map(SYNONYMS.flatMap((group) => group.map((w) => [stem(w), stem(group[0])])));

// ../hooks/ledger-close.ts
function idNumber(id) {
  return Number(id.match(/\d+/)?.[0] ?? Number.NaN);
}
function inIdOrder(open, entry) {
  const at = open.findIndex((x) => idNumber(x.id) > idNumber(entry.id));
  return at < 0 ? [...open, entry] : [...open.slice(0, at), entry, ...open.slice(at)];
}
function reopenItem(ledger, id) {
  const item = ledger.closed.findLast((c) => c.id === id)?.item;
  if (!item || ledger.items.some((i) => i.id === id))
    return ledger;
  return { ...ledger, items: inIdOrder(ledger.items, item), closed: ledger.closed.filter((c) => c.id !== id) };
}
function reopenFinding(ledger, id) {
  const record = ledger.closedFindings.findLast((f) => f.id === id);
  if (!record || ledger.findings.some((f) => f.id === id))
    return ledger;
  const { how: _how, outcome: _outcome, closedAt: _closedAt, ...finding } = record;
  return {
    ...ledger,
    findings: inIdOrder(ledger.findings, finding),
    closedFindings: ledger.closedFindings.filter((f) => f.id !== id)
  };
}
var OVERTAKEN_OUTCOMES = "no longer applies|replaced|superseded|moot";
var OVERTAKEN = new RegExp(`^(?:closed by \\w+: )?(?:${OVERTAKEN_OUTCOMES})`, "i");
function closedState(d) {
  if (d.how === "dismissed")
    return "dismissed";
  if (d.how === "expired")
    return "lapsed";
  const isOvertaken = OVERTAKEN.test(d.outcome);
  return (d.how === "claude" || d.how === "update") && isOvertaken ? "lapsed" : "handled";
}
function closedAt(c) {
  return "closedAt" in c ? c.closedAt : c.at;
}

// ../hooks/open-targets.ts
function baseName(path) {
  return path.replace(/\/+$/, "").split("/").pop() ?? path;
}

// ../hooks/pr-checks.ts
function failingChecks(pr) {
  return pr.checks.filter((c) => c.bucket === "fail");
}
function cancelledChecks(pr) {
  return pr.checks.filter((c) => c.bucket === "cancelled");
}
var ACTIONS_RUN_URL = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/actions\/runs\/(\d+)/;
function runOf(c) {
  const m = ACTIONS_RUN_URL.exec(c.url ?? "");
  return m ? { repo: m[1], run: m[2] } : null;
}
function isSameRun(a, b) {
  return b !== null && a.repo === b.repo && a.run === b.run;
}
function failedSibling(pr, c) {
  const run = c.bucket === "cancelled" ? runOf(c) : null;
  return run ? pr.checks.find((f) => f.bucket === "fail" && isSameRun(run, runOf(f))) ?? null : null;
}
function blockingChecks(pr) {
  return [...failingChecks(pr), ...cancelledChecks(pr).filter((c) => !failedSibling(pr, c))];
}

// ../hooks/prs.ts
function namedPrs(text, refs) {
  const numbers = new Set([...text.matchAll(/#(\d+)\b/g)].map((m) => m[1]));
  const known = [...new Set(refs)];
  return [...numbers].flatMap((n) => {
    const named = known.filter((ref) => parseRef(ref).number === n);
    return named.length === 1 ? named : [];
  });
}
function parseRef(ref) {
  const [repo = "", number = ""] = ref.split("#");
  const [owner = "", name = ""] = repo.split("/");
  return { repo, owner, name, number };
}
function checkKey(c) {
  return c.workflow ? `${c.workflow} / ${c.name}` : c.name;
}
function isKeptPr(pr) {
  return pr.isYours !== false && pr.wasSeenOpen;
}
function waitingThreads(pr) {
  return pr.threads.filter((t) => t.isWaiting);
}
function threadsOnYou(pr, isSent) {
  return waitingThreads(pr).filter((t) => !t.isLinesChanged && !isSent(pr, t));
}
function prNeedsYou(pr, isSent) {
  return pr.state === "OPEN" && (pr.mergeable === "CONFLICTING" || blockingChecks(pr).length > 0 || threadsOnYou(pr, isSent).length > 0);
}
function checkCounts(pr) {
  const counts = { pass: 0, fail: 0, cancelled: 0, pending: 0, skip: 0 };
  for (const c of pr.checks)
    counts[c.bucket] += 1;
  return counts;
}
function threadsWaiting(count) {
  return `${count} ${count === 1 ? "thread" : "threads"} waiting on you`;
}
function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}
function readiness(pr, isSent = () => false, agent = "Claude") {
  const result = (status, head, reasonList = [], joint = ": ") => {
    const reasons = reasonList.join(", ");
    const unlisted = status === "ready" ? [] : reasonList.filter((r) => !listed.includes(r));
    return { status, text: reasons ? `${head}${joint}${reasons}` : head, head, unlisted };
  };
  const listed = [];
  if (pr.state === "MERGED")
    return result("merged", "Merged");
  if (pr.state !== "OPEN")
    return result("closed", "Closed");
  const { pass: passing, fail: failing, pending } = checkCounts(pr);
  const cancelled = blockingChecks(pr).length - failing;
  const waiting = waitingThreads(pr);
  const open = threadsOnYou(pr, isSent).length;
  const sent = waiting.filter((t) => isSent(pr, t)).length;
  const changed = waiting.filter((t) => t.isLinesChanged && !isSent(pr, t)).length;
  const isPresent = (b) => b !== null;
  const row = (r) => r === null ? r : (listed.push(r), r);
  const checksAndConflicts = [
    pr.mergeable === "CONFLICTING" ? `conflicts with ${pr.base}` : null,
    row(failing > 0 ? plural(failing, "failing check", "failing checks") : null),
    row(cancelled > 0 ? plural(cancelled, "cancelled check", "cancelled checks") : null)
  ];
  const threadsOnPerson = row(open > 0 ? threadsWaiting(open) : null);
  const isChangesRequested = pr.reviewDecision === "CHANGES_REQUESTED";
  const isAnythingOnPerson = [...checksAndConflicts, threadsOnPerson].some(isPresent);
  const changes = isChangesRequested ? "changes requested" : null;
  const onYou = isAnythingOnPerson ? [...checksAndConflicts, changes, threadsOnPerson].filter(isPresent) : [];
  const onOthers = [
    row(sent > 0 ? `${plural(sent, "thread", "threads")} sent to ${agent}` : null),
    row(changed > 0 ? `${plural(changed, "thread", "threads")} on changed lines` : null),
    pr.reviewDecision === "REVIEW_REQUIRED" ? "needs approval" : null,
    pending > 0 ? `${pending} ${pending === 1 ? "check" : "checks"} running` : null,
    pr.mergeable === "UNKNOWN" ? "GitHub is still checking for conflicts" : null
  ].filter(isPresent);
  if (pr.isDraft)
    return result("draft", "Draft", [...isAnythingOnPerson ? onYou : [changes].filter(isPresent), ...onOthers]);
  if (onYou.length > 0)
    return result("blocked", "Blocked", onYou);
  if (isChangesRequested)
    return result("waiting", "Waiting on the reviewer", ["changes requested", ...onOthers]);
  if (onOthers.length > 0)
    return result("waiting", "Waiting", onOthers);
  const isApproved = pr.reviewDecision === "APPROVED";
  return result("ready", "Ready to merge", [...isApproved ? ["approved"] : [], passing > 0 ? "checks pass" : "no checks ran", "no threads waiting on you"], isApproved ? ": " : ", ");
}
var STATUS_ORDER = { blocked: 0, ready: 1, draft: 2, waiting: 3, merged: 4, closed: 5 };
function rankOf(pr, ranked) {
  const at = ranked.indexOf(pr.ref);
  return at === -1 || pr.state !== "OPEN" ? null : at;
}
function inPrOrder(prs, ranked = []) {
  const place = (pr) => rankOf(pr, ranked) ?? Infinity;
  const status = new Map(prs.map((pr) => [pr, STATUS_ORDER[readiness(pr).status]]));
  const byPlace = (a, b) => {
    const [x, y] = [place(a), place(b)];
    return x === y ? 0 : x < y ? -1 : 1;
  };
  return [...prs].sort((a, b) => byPlace(a, b) || status.get(a) - status.get(b) || b.number - a.number || a.ref.localeCompare(b.ref));
}

// ../hooks/help-steps.ts
function helpLabel(help) {
  const label = help.kind === "open" ? `Open ${baseName(help.path)}` : help.kind === "copy" ? `Copy ${help.name ?? "snippet"}` : help.kind === "run" ? `Run ${help.name ?? help.command}` : help.kind === "terminal" ? `Copy ${help.name ?? help.command}` : `Open ${help.name ?? new URL(help.url).host}`;
  return clipLabel(label, 32);
}
function steps(helps) {
  const copy = helps.find((h) => h.kind === "copy");
  const open = helps.find((h) => h.kind === "open");
  if (!copy || !open || copy.kind !== "copy" || open.kind !== "open")
    return helps.map((h) => ({ label: helpLabel(h), step: [h] }));
  return helps.filter((h) => h !== copy).map((h) => h === open ? { label: clipLabel(`Copy ${copy.name ?? "snippet"} and open ${baseName(open.path)}`, 48), step: [copy, open] } : { label: helpLabel(h), step: [h] });
}
function prSteps(item, tracked) {
  const urls = new Map(tracked.map((pr) => [pr.ref, pr.url]));
  const links = namedPrs(item.ask, [...urls.keys()]).map((ref) => {
    const { repo, number } = parseRef(ref);
    const url = urls.get(ref) ?? `https://github.com/${repo}/pull/${number}`;
    return { kind: "link", url, name: `PR #${number}` };
  }).filter((l) => !item.helps.some((h) => h.kind === "link" && h.url === l.url));
  return links.length === 0 ? [] : [{ label: links.length === 1 ? helpLabel(links[0]) : `Open ${links.length} PRs`, step: links }];
}
function stepsOf(item, extraSteps) {
  return [...steps(item.helps), ...extraSteps];
}
function stepIconKind(step) {
  if (!step)
    return;
  if (step.step.some((h) => h.kind === "run"))
    return "run";
  const first = step.step[0]?.kind;
  return first === "copy" || first === "terminal" ? "copy" : first === "open" || first === "link" ? "open" : undefined;
}

// ../hooks/status-keys.ts
var GOAL_KEYS_ID = "goal";
var VIEW_ASK_LABELS = { question: "View question", task: "View task" };
function viewAsk(ask) {
  return {
    press: { action: "show-ask", askId: ask.id },
    label: VIEW_ASK_LABELS[ask.kind],
    hotkey: "v",
    kind: "view",
    emphasis: "normal"
  };
}
function statusKeyPlan(row) {
  if (row.kind === "done-fold")
    return [
      {
        press: { action: "toggle-fold", foldId: row.id },
        label: row.text,
        hotkey: "f",
        kind: "view",
        emphasis: "quiet"
      }
    ];
  return row.kind === "subject" && row.ask !== null ? [viewAsk(row.ask)] : [];
}
function milestoneKeyPlan(m) {
  return m.ask === null ? [] : [viewAsk(m.ask)];
}
var REMOVE_GOAL = {
  press: { action: "remove-goal" },
  label: "Remove",
  hotkey: "r",
  kind: "mark",
  emphasis: "quiet"
};
var RESTORE_GOAL = {
  press: { action: "restore-goal" },
  label: "Undo",
  hotkey: UNDO_KEY,
  kind: "mark",
  emphasis: "normal"
};
var newGoal = (emphasis) => ({
  press: { action: "type-goal", text: "" },
  label: "New",
  hotkey: "n",
  kind: "view",
  emphasis
});
function goalKeyPlan(page) {
  const g = page.goal;
  if (g === null)
    return [...page.canRestoreGoal ? [RESTORE_GOAL] : [], newGoal("quiet")];
  if (g.isMet)
    return [newGoal("normal"), REMOVE_GOAL];
  return [
    { press: { action: "type-goal", text: g.text }, label: "Edit", hotkey: "e", kind: "view", emphasis: "quiet" },
    REMOVE_GOAL
  ];
}

// ../hooks/pressed.ts
function offersUndo(c) {
  return c.how === "done" || c.how === "dismissed";
}
function isUndoable(c) {
  return offersUndo(c) && !c.isSentToAgent;
}
function retryOf(id, last) {
  if (!/^[if]\d+$/.test(id))
    return null;
  const step = /^step-(\d+)$/.exec(last.action);
  if (step)
    return { action: "step", id, step: Number(step[1]), label: last.text };
  switch (last.action) {
    case "answer":
      return { action: "answer", id, option: last.text };
    case "explain":
    case "compare":
    case "address":
    case "issue":
    case "discuss":
      return { action: last.action, id };
    default:
      return null;
  }
}
function isRepeatOf(last, action) {
  return last?.action === action && last.kind !== "local" && last.delivery?.state !== "failed";
}
function isHeldSend(last) {
  return last?.delivery?.state === "held";
}

// ../hooks/timing.ts
var SETTLED_MS = 5120;
var QUEUED_AFTER_MS = 1000;
var COMPARE_LIMIT_MS = 30 * 60000;
function isQueuedAt(last, now) {
  return last?.delivery?.state === "queued" && now - last.at >= QUEUED_AFTER_MS;
}
function pendingDeliveryAt(last, now) {
  if (last?.delivery?.state === "held")
    return "held";
  if (last?.delivery?.state === "unconfirmed")
    return "unconfirmed";
  if (last?.delivery?.state !== "queued")
    return null;
  return isQueuedAt(last, now) ? "queued" : "sending";
}
var FOLD_QUIET_MS = 1000;
function isListInUseSince(input, at, now) {
  return input !== null && now - input.last < FOLD_QUIET_MS && input.since <= at;
}
var NO_HOLDS = { replies: {}, discarded: {}, shownSince: null, listInput: null };
function isShownSince(at, shownSince) {
  return shownSince !== null && at >= shownSince;
}
function foldDueAt(state, lastTypedMessageAt, settleWindowMs) {
  const windowEndsAt = state.at + settleWindowMs;
  const isTypedSince = lastTypedMessageAt !== null && lastTypedMessageAt > state.at;
  return isTypedSince && !state.canUndo ? Math.min(lastTypedMessageAt, windowEndsAt) : windowEndsAt;
}
function isPressOutSince(pressOutSince, at) {
  return pressOutSince !== null && pressOutSince <= at;
}
function earliestOf(times) {
  const known = times.filter((t) => t !== null);
  return known.length > 0 ? Math.min(...known) : null;
}
function isSendOnItsWay(delivery) {
  return delivery === "held" || delivery === "sending" || delivery === "queued";
}
function isSettledInPlace(state, { shownSince, lastTypedMessageAt, listInput, now, settleWindowMs, undoShown, pressOutSince }, id) {
  const dueAt = foldDueAt(state, lastTypedMessageAt, settleWindowMs);
  const isUndoShown = id !== undefined && (undoShown ?? []).includes(id);
  const isWaiting = now < dueAt || isUndoShown || isSendOnItsWay(state.delivery) || isPressOutSince(pressOutSince, dueAt) || isListInUseSince(listInput, dueAt, now);
  return isShownSince(state.at, shownSince) && isWaiting;
}
function nextFoldAt(settled, {
  lastTypedMessageAt,
  listInput,
  now,
  settleWindowMs
}) {
  const times = settled.flatMap((state) => {
    const dueAt = foldDueAt(state, lastTypedMessageAt, settleWindowMs);
    if (dueAt > now)
      return [dueAt];
    const quietAt = listInput === null ? null : listInput.last + FOLD_QUIET_MS;
    const isQuietLater = quietAt !== null && quietAt > now;
    return !isSendOnItsWay(state.delivery) && isQuietLater ? [quietAt] : [];
  });
  return times.length > 0 ? Math.min(...times) : null;
}
function isDrawnInPlace(row, shownSince) {
  return row.state.is !== "settled" || isShownSince(row.state.at, shownSince);
}
function isUndoLeft(at, now, settleWindowMs) {
  return now - at < settleWindowMs;
}
function canUndoClose(closed, at, now, settleWindowMs) {
  return isUndoable(closed) && isUndoLeft(at, now, settleWindowMs);
}
var RUNNING_FRAME_MS = 300;
var RUNNING_PULSE_MS = RUNNING_FRAMES.length * RUNNING_FRAME_MS;

// ../hooks/rows.ts
var OPTIONS_FOLD_AT = 5;
var OPTION_LABEL_CHARS = 32;
var DOT = " · ";
var NEEDS_YOU_GROUPS = [
  { kind: "question", title: "Questions", list: "questions" },
  { kind: "task", title: "Tasks", list: "tasks" }
];
var CLOSED_SHOWN = 3;
function closedRowState(closed, at, now, settleWindowMs, delivery, isPressedAnswer = false) {
  const canUndoAnswer = isPressedAnswer && delivery === "held" && isUndoLeft(at, now, settleWindowMs);
  return {
    is: "settled",
    label: outcomeLabel(closed),
    at,
    canUndo: canUndoAnswer || canUndoClose(closed, at, now, settleWindowMs),
    offersUndo: isPressedAnswer || offersUndo(closed),
    closedAs: closedState(closed),
    delivery
  };
}
var isTerminalLike = (look) => look === "terminal" || look === "omp";
var ROW_COPY = {
  retry: "Try again",
  send: "Send",
  cancel: "Cancel",
  discard: "Discard",
  clickField: "Click the field to type",
  relevantFile: "Relevant file: ",
  allOptions: (count) => `All ${count} options`,
  undo: "Undo",
  reopen: "Reopen"
};
function closedLineAction(d) {
  if (canUndoRefused(d.delivery))
    return { label: ROW_COPY.undo, press: { id: d.id, action: "undo" } };
  return d.how === "dismissed" ? { label: ROW_COPY.reopen, press: { id: d.id, action: "undo" } } : null;
}
function recLineOf(item) {
  return item?.rec && item.recReason ? `Why ${item.rec}: ${item.recReason}` : null;
}
function optionDescriptionsOf(item, actions) {
  const descriptions = item?.optionDescriptions;
  if (!descriptions)
    return [];
  return actions.flatMap((a) => {
    if (a.press.action !== "answer" || !Object.hasOwn(descriptions, a.press.option))
      return [];
    const description = descriptions[a.press.option];
    return [{ label: clipLabel(a.press.option, OPTION_LABEL_CHARS), description, isFolded: a.isFolded }];
  });
}
function shownOptionDescriptions(row, isShowingAll) {
  return row.optionDescriptions.filter((o) => isShowingAll || !o.isFolded);
}
function rowHandle(row) {
  return row.number === null ? "•" : `${row.number})`;
}
function rowTitle(row, look) {
  return isTerminalLike(look) && row.number !== null ? `${rowHandle(row)} ${row.title}` : row.title;
}
function isWaitingRow(row) {
  return row.state.is === "open";
}
function waitingCount(rows) {
  return rows.filter((r) => r !== undefined && isWaitingRow(r)).length;
}
function isHandedOffDone(row) {
  const f = row.feedback;
  return row.state.is === "handedOff" && (f?.is === "done" || f?.is === "local" && f.result.state === "done");
}
var RUNNING_RESULT = { text: RUNNING_MARK, isRunning: true };
function rowResultMark(row) {
  if (row.state.is === "settled")
    return settledMark(row.state);
  const f = row.feedback;
  if (row.state.is === "open" && f?.is === "working")
    return RUNNING_RESULT;
  if (row.state.is !== "handedOff" || !f)
    return null;
  if (f.is === "sending" || f.is === "queued")
    return RUNNING_RESULT;
  return isHandedOffDone(row) ? { text: SUBJECT_MARKS.done.mark, isRunning: false, tone: "done" } : { text: "", isRunning: false };
}
function isSendMoving(delivery) {
  return delivery === "sending" || delivery === "queued";
}
function closedShown(closed, drawnSettled, isAllShown = false) {
  const listed = closed.filter((d) => !drawnSettled.has(d.id));
  return isAllShown ? listed : listed.slice(0, CLOSED_SHOWN);
}
function closedTotal(closed, drawnSettled) {
  return closed.filter((d) => !drawnSettled.has(d.id)).length;
}
function foldLabel(total) {
  return `${total} closed`;
}
function earlierLabel(total, shown) {
  return total > shown ? `Show ${total - shown} earlier` : null;
}
function shortAgo(ms) {
  const age = ago(ms);
  return age === "just now" ? "now" : age.replace(/ ago$/, "");
}
function sendStepOf(delivery) {
  return delivery === "queued" || delivery === "unconfirmed" ? delivery : delivery === "sending" ? "sending" : "arrived";
}
function replyLine(words) {
  return words.replace(/\s+/g, " ").trim();
}
function deliveryLabel(step, label, reply) {
  if (reply !== undefined) {
    const words = replyLine(reply);
    switch (step) {
      case "sending":
        return `Sending reply: ${words}`;
      case "queued":
        return `Queued reply: ${words}`;
      case "unconfirmed":
        return `Reply not confirmed: ${words}`;
      case "arrived":
        return `Replied: ${words}`;
    }
  }
  switch (step) {
    case "queued":
      return `Queued: ${label}`;
    case "unconfirmed":
      return `Not confirmed: ${label}`;
    default:
      return label;
  }
}
function settledMark(state) {
  return closedMark(state.closedAs, state.delivery);
}
function closedMark(state, delivery) {
  if (isSendMoving(delivery))
    return RUNNING_RESULT;
  return { text: delivery === null ? CLOSED_MARKS[state] : "", isRunning: false };
}
function canUndoRefused(delivery) {
  return delivery !== null && typeof delivery === "object" && delivery.canUndo;
}
function settledTone(state) {
  return state.delivery === null && state.closedAs === "handled" ? "done" : "muted";
}
function settledLabel(label, delivery, reply) {
  if (delivery && typeof delivery === "object")
    return `${label} · Not sent: ${delivery.error}`;
  return deliveryLabel(sendStepOf(delivery), label, reply);
}
function outcomeLabel(c) {
  return c.askedAs ? "Now a question in Asks" : capitalized(c.outcome);
}

// ../hooks/last-actions.ts
function isAwaitingReply(last, turns) {
  const pressed = last?.delivery?.state !== "failed" ? last?.turnsStarted : undefined;
  return pressed !== undefined && pressed <= turns.turnsStarted && turns.turnsApplied <= pressed;
}
function isHandedOff(last, turns) {
  return last?.kind === "handoff" && isAwaitingReply(last, turns);
}
function isFoldingPress(id, last) {
  return !id.startsWith("pr:") && last?.kind === "handoff" && last.action !== "address";
}
function isFixSent(last) {
  return last?.action === "address" && !last.isKept && last.delivery?.state !== "failed";
}
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
  if (action === null)
    return null;
  const { isHandoff, ...kept } = old;
  const isHandedOff = isHandoff ?? HANDOFF_IDS.test(action);
  return {
    ...kept,
    kind: isHandedOff ? "handoff" : "talk",
    action,
    text: /^Sent to (Claude|Codex) to /.test(old.text) ? "Address" : old.text.replace(/ sent$/, "")
  };
}
function upgradeLastActions(saved) {
  return Object.fromEntries(Object.entries(saved).flatMap(([key, entry]) => {
    const {
      tab: _tab,
      title: _title,
      index: _index,
      ...last
    } = entry;
    if ("kind" in last && last.kind)
      return [[key, last]];
    const upgraded = upgradedLastAction(key, last);
    return upgraded ? [[key, upgraded]] : [];
  }));
}

// ../hooks/presses.ts
function isPrRowId(id) {
  return id.startsWith("pr:") || id.includes(" ");
}

// ../hooks/press-reducer.ts
var STALE_TEXT = "This changed before your press. Nothing was sent.";
function noteText() {
  return STALE_TEXT;
}

// ../hooks/feedback.ts
function rowFeedbackText(row, look) {
  const f = row.feedback;
  if (!f)
    return null;
  if (!isHandedOffDone(row))
    return feedbackText(f, look);
  return f.is === "done" ? f.label : f.is === "local" ? localText(f.result, look) : feedbackText(f, look);
}
function pressUnderWaySince(f) {
  if (f?.is === "working" || f?.is === "sending")
    return f.at;
  return f?.is === "local" && f.result.state === "pending" ? f.result.at : null;
}
function feedbackOf(id, last, note, turns, now, reportedAt) {
  const result = last?.result;
  if (note && now - note.at < SETTLED_MS && note.at >= Math.max(last?.at ?? 0, result?.at ?? 0))
    return { is: "note", note: note.note, at: note.at };
  if (result && (result.state !== "done" || now - result.at < SETTLED_MS))
    return { is: "local", result };
  if (!last || last.kind === "local")
    return null;
  const delivery = last.delivery;
  const pending = pendingDeliveryAt(last, now);
  if (pending === "queued" || pending === "unconfirmed")
    return { is: pending, label: deliveryLabel(pending, last.text, last.reply), at: last.at };
  if (delivery?.state === "failed")
    return { is: "notSent", reason: delivery.reason, retry: retryOf(id, last) };
  const isAwaiting = isAwaitingReply(last, turns);
  const isUnreported = last.action === "compare" && !(reportedAt !== undefined && reportedAt >= last.at);
  const isPastLimit = now - last.at >= COMPARE_LIMIT_MS;
  const working = WORKING_LABELS[last.action];
  if (last.kind === "talk" && working && (isAwaiting || isUnreported && !isPastLimit))
    return { is: "working", label: working, at: last.at };
  if (pending === "sending")
    return { is: "sending", label: deliveryLabel("sending", last.text, last.reply), at: last.at };
  if (isUnreported)
    return { is: "noComparison", at: last.at };
  if (!isAwaiting && !isPrRowId(id) && isFoldingPress(id, last))
    return { is: "stillOpen", at: last.at };
  const isHandedStep = last.kind === "handoff" && last.action.startsWith("step-");
  return {
    is: "done",
    label: deliveryLabel("arrived", doneLabel(last), last.reply),
    at: last.at,
    ...isHandedStep ? { isHandedStep: true } : {},
    ...STILL_WAITING_AFTER.has(last.action) ? { isStillWaiting: true } : {}
  };
}
function feedbackIn(id, state, last, note, turns, now, reportedAt) {
  if (state.is === "settled")
    return null;
  const f = feedbackOf(id, last, note, turns, now, reportedAt);
  if (state.is !== "held")
    return f;
  const isFailedReply = f?.is === "notSent" && last?.action === "type" && last.at >= state.at;
  return f?.is === "note" || isFailedReply ? f : { is: "closed", label: state.label, at: state.at };
}
function pressFeedbackIn(id, state, last, turns, now, reportedAt) {
  return feedbackIn(id, state, last, undefined, turns, now, reportedAt);
}
var fixLabel = (f) => f.kind === "opportunity" ? "Do it" : "Fix";
var WORKING_LABELS = {
  explain: "Explaining…",
  compare: "Comparing…",
  discuss: "Discussing…",
  "thread-discuss": "Discussing…",
  "thread-draft": "Drafting a reply…",
  "pr-rank-again": "Ranking…"
};
var DONE_LABELS = {
  address: () => "Handed off",
  issue: () => "Asked to file",
  discuss: () => "Discussed",
  explain: () => "Explained",
  compare: () => "Compared",
  dismiss: () => "Dismissed",
  type: () => "Replied",
  "thread-address": () => "Addressed",
  "thread-discuss": () => "Discussed",
  "thread-draft": () => "Drafted a reply",
  "pr-conflicts": () => "Asked to resolve conflicts",
  "pr-merge": () => "Asked to merge",
  "pr-address-all": (text) => text.replace(/^Address\b/, "Addressed"),
  "check-fix": () => "Asked to fix",
  "pr-rank-again": () => "Ranked"
};
function doneLabel(last) {
  return DONE_LABELS[last.action]?.(last.text) ?? last.text;
}
var STILL_WAITING_AFTER = new Set(["check-fix"]);
function isFailure(f) {
  return f?.is === "notSent" || f?.is === "local" && f.result.state === "failed";
}
function isPressOut(f) {
  return f?.is === "working" || f?.is === "sending" || f?.is === "queued" || f?.is === "unconfirmed" || f?.is === "local" && f.result.state === "pending";
}
function pressOutAction(last, f) {
  if (!isPressOut(f))
    return null;
  return (f?.is === "local" ? f.result.action : last?.action) ?? null;
}
function outAction(last, f) {
  const action = f?.is === "unconfirmed" ? null : pressOutAction(last, f);
  return action === "type" ? null : action;
}
function isAgain(last, action, isOut) {
  return isRepeatOf(last, action) && (!isOut || last?.isRepeat === true);
}
var runIt = (look) => isTerminalLike(look) ? "Run it in a terminal, or type ! and paste." : "Run it in Terminal.";
var VERBS = {
  open: { pending: "Opening", done: "Opened", failed: "open" },
  copy: { pending: "Copying", done: "Copied", failed: "copy" },
  "refresh-prs": { pending: "Refreshing", done: "Refreshed", failed: "refresh" },
  rerun: { pending: "Starting a re-run of", done: "Started a re-run of", failed: "start a re-run of" }
};
function localText(r, look) {
  const isPrs = r.parts.length > 1 && r.parts.every((p) => p.kind === "open" && p.error === null && /^PR #\d+$/.test(p.name));
  const parts = isPrs ? [{ ...r.parts[0], name: `${r.parts.length} PRs` }] : r.parts;
  if (r.state === "pending")
    return `${parts.map((p) => `${VERBS[p.kind].pending} ${p.name}`).join(DOT)}…`;
  const text = parts.map((p) => p.error === null ? `${VERBS[p.kind].done} ${p.name}` : `Could not ${VERBS[p.kind].failed} ${p.name}: ${p.error}`).join(DOT);
  if (r.state === "failed")
    return text;
  const isCommand = parts.some((p) => p.kind === "copy" && p.isCommand);
  return `${text}${isCommand ? `. ${runIt(look)}` : ""}`;
}
function feedbackText(f, look) {
  switch (f.is) {
    case "note":
      return noteText();
    case "local":
      return f.result.state === "done" ? `✓ ${localText(f.result, look)}` : localText(f.result, look);
    case "sending":
      return f.label;
    case "queued":
      return f.label;
    case "unconfirmed":
      return f.label;
    case "notSent":
      return `Not sent: ${f.reason}`;
    case "done":
      return f.isHandedStep ? `✓ Handed off: ${f.label}` : `✓ ${f.label}`;
    case "working":
      return f.label;
    case "stillOpen":
      return "Still open";
    case "noComparison":
      return "No comparison came back";
    case "closed":
      return f.label;
  }
}

// ../hooks/action-plan.ts
var CHOICE_KEYS = [..."abcfghilm"];
function showsCompare(item) {
  return item.kind === "question" && item.isDesignChoice === true && item.options.length >= 2;
}
function stepKind(step) {
  return step.step.some((h) => h.kind === "run") ? "handoff" : "local";
}
var FOLLOW_UPS = new Set([
  "type",
  "explain",
  "compare",
  "discuss",
  "dismiss",
  "discard"
]);
var ACTION_KEYS = {
  done: "d",
  address: "a",
  issue: "i",
  type: "t",
  explain: "e",
  compare: "p",
  discuss: "d",
  dismiss: "x",
  discard: "x"
};
function actionsOf(row, last, state, feedback) {
  const { id, item, steps } = row;
  const pressing = pressOutAction(last, feedback);
  const out = outAction(last, feedback);
  const action = (press, label, kind, flags = {}) => {
    const pressAction = actionId(press);
    return {
      press,
      label: press.action !== "type" && isAgain(last, pressAction, pressing === pressAction) ? `${label} again` : label,
      kind,
      emphasis: flags.isPrimary || press.action === "done" || press.action === "address" ? "primary" : press.action === "discuss" || press.action === "explain" || press.action === "compare" || press.action === "dismiss" || press.action === "discard" ? "quiet" : "normal",
      ...press.action === "done" ? { icon: "done" } : press.action === "step" && stepIconKind(steps[press.step]) ? { icon: stepIconKind(steps[press.step]) } : {},
      isPrimary: flags.isPrimary ?? false,
      isFolded: flags.isFolded ?? false,
      isFollowUp: FOLLOW_UPS.has(press.action),
      ...ACTION_KEYS[press.action] ? { hotkey: ACTION_KEYS[press.action] } : {},
      isOut: out === pressAction
    };
  };
  if (state.is === "settled")
    return state.canUndo ? [action({ action: "undo", id }, ROW_COPY.undo, "view")] : [];
  if (state.is === "held")
    return [
      action({ action: "type", id, text: "" }, "Reply", "handoff"),
      action({ action: "discard", id }, ROW_COPY.discard, "view")
    ];
  const stepActions = steps.map((s, n) => action({ action: "step", id, step: n, label: s.label }, s.label, stepKind(s)));
  if (!item)
    return [
      action({ action: "address", id }, row.finding ? fixLabel(row.finding) : "Fix", "handoff"),
      action({ action: "issue", id }, ISSUE_LABEL, "handoff"),
      action({ action: "type", id, text: "" }, "Reply", "handoff"),
      action({ action: "explain", id }, "Explain", "talk"),
      action({ action: "discuss", id }, "Discuss", "talk"),
      action({ action: "dismiss", id }, "Dismiss", "mark")
    ];
  if (item.kind === "task")
    return [
      ...stepActions,
      action({ action: "done", id }, "Done", "mark"),
      action({ action: "type", id, text: "" }, "Reply", "handoff"),
      action({ action: "explain", id }, "Explain", "talk"),
      action({ action: "dismiss", id }, "Dismiss", "mark")
    ];
  const isFolding = item.options.length > OPTIONS_FOLD_AT;
  const options = item.rec && item.options.includes(item.rec) ? [item.rec, ...item.options.filter((o) => o !== item.rec)] : item.options;
  return [
    ...options.map((option, n) => action({ action: "answer", id, option }, clipLabel(option, OPTION_LABEL_CHARS), "mark", {
      isPrimary: option === item.rec,
      isFolded: isFolding && n >= OPTIONS_FOLD_AT - 1
    })),
    ...stepActions,
    action({ action: "type", id, text: "" }, "Reply", "mark"),
    action({ action: "explain", id }, "Explain", "talk"),
    ...showsCompare(item) ? [action({ action: "compare", id }, "Compare", "talk")] : [],
    action({ action: "dismiss", id }, "Dismiss", "mark")
  ];
}
function firstWaiting(rows) {
  return rows.find((r) => r.isWaiting)?.id ?? null;
}
function rowKeyPlan(r, isAllShown) {
  const shown = r.actions.filter((a) => isAllShown || !a.isFolded);
  const folded = r.actions.length - shown.length;
  const lastOption = shown.map((a) => a.press.action).lastIndexOf("answer");
  const keys = [];
  const more = [];
  const retry = r.feedback?.is === "notSent" ? r.feedback.retry : null;
  if (retry) {
    const kind = r.actions.find((a) => actionId(a.press) === actionId(retry))?.kind ?? "talk";
    keys.push({ slot: "retry", press: retry, kind, label: ROW_COPY.retry, emphasis: "normal", icon: "retry" });
  }
  let letters = 0;
  for (const [n, a] of shown.entries()) {
    const { press } = a;
    if (press.action === "answer" || press.action === "step") {
      const hotkey = letters < CHOICE_KEYS.length ? { hotkey: CHOICE_KEYS[letters++] } : {};
      keys.push({ slot: "choice", action: { ...a, press }, ...hotkey });
      if (n === lastOption && folded > 0)
        keys.push({
          slot: "allOptions",
          count: r.actions.filter((x) => x.press.action === "answer").length,
          label: ROW_COPY.allOptions(r.actions.filter((x) => x.press.action === "answer").length),
          emphasis: "quiet"
        });
    } else if (a.hotkey)
      (a.isFollowUp ? more : keys).push({
        slot: "action",
        action: a,
        hotkey: a.hotkey
      });
  }
  return { keys, more };
}

// ../hooks/band.ts
function isMaybeStale(view, isReadFailed = false) {
  return isReadFailed || view.status.error !== null || view.status.isRetrying;
}

// ../hooks/inbox-text.ts
function latestBatch(ledger) {
  return ledger.batchTurn === 0 ? [] : ledger.items.filter((i) => i.turn === ledger.batchTurn);
}
function numberOf(label) {
  const m = label?.match(/(?:^|[^A-Za-z\d])(?:[QqDd#]\s?)?(\d{1,2})(?!\d)/);
  return m ? Number(m[1]) : null;
}
function answerableBatch(ledger, promptTurn) {
  return ledger.batchTurn === promptTurn - 1 ? latestBatch(ledger) : [];
}
function batchNumbers(batch) {
  const hasLabels = batch.some((i) => numberOf(i.label) !== null);
  const byNumber = new Map;
  batch.forEach((item, at) => {
    const n = hasLabels ? numberOf(item.label) : at + 1;
    if (n !== null && !byNumber.has(n))
      byNumber.set(n, item);
  });
  return byNumber;
}
function questionNumbers(ledger, promptTurn) {
  const numbers = new Map;
  for (const [n, item] of batchNumbers(answerableBatch(ledger, promptTurn)))
    if (item.kind === "question")
      numbers.set(item.id, n);
  return numbers;
}
var TOLD_NOTHING = { inbox: null, closed: [] };

// ../hooks/view.ts
var HOLDS_UP_TEXT = "Holds up";
function needsYouOrder(ledger) {
  const newestReplyFirst = (kind) => ledger.items.filter((i) => i.kind === kind).sort((a, b) => b.turn - a.turn);
  return { questions: newestReplyFirst("question"), tasks: newestReplyFirst("task") };
}
function heldSubjectsOf(o, askId) {
  const milestones = o?.goal && !o.goal.isAwaitingMilestones ? o.milestones : [];
  const linkable = [...o?.subjects ?? [], ...milestones];
  return (o?.askSubjects[askId] ?? []).flatMap((id) => linkable.filter((s) => s.id === id && isOpen(s)));
}
function inboxView({
  ledger,
  lastActions,
  notes,
  turns,
  extraSteps,
  settleWindowMs,
  status,
  now,
  replies,
  discarded,
  shownSince,
  lastTypedMessageAt,
  listInput,
  undoShown
}) {
  const isFindingId = (id) => ledger.findings.some((f) => f.id === id) || ledger.closedFindings.some((f) => f.id === id);
  const isItemId = (id) => ledger.items.some((i) => i.id === id) || ledger.closed.some((c) => c.id === id);
  const pressOutSinceWhere = (isOnTab) => earliestOf(Object.entries(lastActions).map(([id, last]) => isOnTab(id) ? pressUnderWaySince(feedbackOf(id, last, undefined, turns, now)) : null));
  const placingOn = (pressOutSince) => ({
    shownSince,
    lastTypedMessageAt,
    listInput,
    now,
    settleWindowMs,
    undoShown,
    pressOutSince
  });
  const placingFor = {
    needsYou: placingOn(pressOutSinceWhere(isItemId)),
    findings: placingOn(pressOutSinceWhere(isFindingId))
  };
  const isInPlace = (id, at, canUndo, last) => isSettledInPlace({ at, canUndo, delivery: pendingDeliveryAt(last, now) }, isFindingId(id) ? placingFor.findings : placingFor.needsYou, id);
  const pressedSend = (c) => {
    const last = lastActions[c.id];
    return (c.how === "answered" || c.how === "done") && last?.kind === "mark" && last.at === closedAt(c) ? last : undefined;
  };
  const isOpen = (id) => ledger.items.some((i) => i.id === id) || ledger.findings.some((f) => f.id === id);
  const replyAfter = (c) => {
    const last = lastActions[c.id];
    return last?.action === "type" && last.at >= closedAt(c) && last.delivery?.state !== "failed" && isInPlace(c.id, last.at, false, last) ? last : null;
  };
  const isPressedAnswer = (c) => c.how === "answered" && lastActions[c.id]?.kind === "mark" && lastActions[c.id]?.at === closedAt(c);
  const isOwnClose = (c) => c.how === "done" || c.how === "dismissed" || isPressedAnswer(c);
  const isAnswerHeld = (c) => isPressedAnswer(c) && isHeldSend(lastActions[c.id]) && isUndoLeft(closedAt(c), now, settleWindowMs);
  const isHeld = (c) => {
    const since = replies[c.id];
    return since !== undefined && since <= closedAt(c) && !isOwnClose(c);
  };
  const isDiscarded = (c) => (discarded[c.id] ?? -Infinity) >= closedAt(c);
  const isPlaced = (c) => {
    const at = closedAt(c);
    return replyAfter(c) !== null || !isDiscarded(c) && (isHeld(c) || isInPlace(c.id, at, isAnswerHeld(c) || canUndoClose(c, at, now, settleWindowMs), pressedSend(c)));
  };
  const placedItems = new Map(ledger.closed.filter((d) => d.item && !isOpen(d.id) && isPlaced(d)).map((d) => [d.id, d]));
  const isFixSettled = (id) => {
    const last = lastActions[id];
    return isFixSent(last) && !isInPlace(id, last.at, isUndoLeft(last.at, now, settleWindowMs), last);
  };
  const placedFindings = new Map(ledger.closedFindings.filter((f) => !isOpen(f.id) && !isFixSettled(f.id) && isPlaced(f)).map((f) => [f.id, f]));
  const placed = [...placedFindings.keys()].reduce(reopenFinding, [...placedItems.keys()].reduce(reopenItem, ledger));
  const { questions, tasks } = needsYouOrder(placed);
  const numbers = questionNumbers(ledger, ledger.turn + 1);
  const stateOf = (id) => {
    const closed = placedItems.get(id) ?? placedFindings.get(id);
    if (closed) {
      const at = closedAt(closed);
      const reply = replyAfter(closed);
      if (reply)
        return {
          is: "settled",
          label: doneLabel(reply),
          at: reply.at,
          canUndo: false,
          offersUndo: false,
          delivery: pendingDeliveryAt(reply, now),
          closedAs: closedState(closed),
          ...reply.reply !== undefined ? { reply: reply.reply } : {}
        };
      if (isHeld(closed))
        return { is: "held", label: heldLabel(closed), at };
      return closedRowState(closed, at, now, settleWindowMs, "doneNotification" in closed && closed.doneNotification?.error !== undefined ? { error: closed.doneNotification.error, canUndo: isUndoable(closed) } : pendingDeliveryAt(pressedSend(closed), now), isPressedAnswer(closed));
    }
    const last = lastActions[id];
    const sent = ledger.findings.find((f) => f.id === id);
    if (sent && isFixSent(last))
      return {
        is: "settled",
        label: fixLabel(sent),
        at: last.at,
        canUndo: isUndoLeft(last.at, now, settleWindowMs),
        offersUndo: true,
        delivery: pendingDeliveryAt(last, now),
        closedAs: "handled"
      };
    return isHandedOff(last, turns) ? { is: "handedOff" } : { is: "open" };
  };
  const rowOf = (row) => {
    const state = stateOf(row.id);
    const last = lastActions[row.id];
    const feedback = feedbackIn(row.id, state, last, notes[row.id], turns, now, row.item?.reportedAt);
    const actions = actionsOf(row, last, state, pressFeedbackIn(row.id, state, last, turns, now, row.item?.reportedAt));
    const held = state.is === "open" ? heldSubjectsOf(ledger.overview, row.id) : [];
    return {
      ...row,
      state,
      feedback,
      actions,
      optionDescriptions: optionDescriptionsOf(row.item, actions),
      holdsUpLine: held.length > 0 ? `${HOLDS_UP_TEXT} ${held.map((s) => s.name).join(", ")}` : null,
      recLine: state.is === "open" ? recLineOf(row.item) : null
    };
  };
  const itemRow = (item) => {
    const n = numbers.get(item.id);
    return rowOf({
      id: item.id,
      type: item.kind,
      number: n ?? null,
      title: item.ask,
      at: item.at,
      detail: null,
      fileName: null,
      replyKind: item.kind === "question" ? "answer" : "reply",
      item,
      finding: null,
      steps: stepsOf(item, extraSteps[item.id] ?? [])
    });
  };
  const questionRows = questions.map(itemRow);
  const taskRows = tasks.map(itemRow);
  const counted = [...questionRows, ...taskRows].filter(isWaitingRow);
  const kinds = Object.keys(FINDING_GROUPS);
  const byGroup = (a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind);
  const findingRows = [...placed.findings].filter((f) => !isFixSettled(f.id)).reverse().sort(byGroup).map((finding) => rowOf({
    id: finding.id,
    type: "finding",
    number: null,
    title: finding.title,
    at: finding.at,
    detail: finding.detail,
    fileName: finding.path ? baseName(finding.path) : null,
    replyKind: "reply",
    item: null,
    finding,
    steps: []
  }));
  const held = new Set([...questionRows, ...taskRows, ...findingRows].filter((r) => r.state.is === "held").map((r) => r.id));
  const closed = [...ledger.closed].filter((d) => !held.has(d.id)).reverse().map((d) => {
    const delivery = d.doneNotification?.error !== undefined ? { error: d.doneNotification.error, canUndo: isUndoable(d) } : (d.how === "answered" || d.how === "done") && lastActions[d.id]?.kind === "mark" && lastActions[d.id]?.at === d.at ? pendingDeliveryAt(lastActions[d.id], now) : null;
    return { ...d, outcomeLabel: outcomeLabel(d), delivery, mark: closedMark(closedState(d), delivery) };
  });
  const fixesSent = ledger.findings.filter((f) => isFixSent(lastActions[f.id])).map((f) => {
    const outcome = fixLabel(f);
    const delivery = pendingDeliveryAt(lastActions[f.id], now);
    return {
      ...f,
      how: "answered",
      outcome,
      outcomeLabel: outcomeLabel({ ...f, outcome }),
      closedAt: lastActions[f.id].at,
      delivery,
      mark: closedMark(closedState({ how: "answered", outcome }), delivery)
    };
  });
  return {
    needsYou: {
      count: counted.length,
      questions: questionRows,
      tasks: taskRows,
      closed: { questions: closed.filter((d) => d.kind === "question"), tasks: closed.filter((d) => d.kind === "task") },
      pressOutSince: placingFor.needsYou.pressOutSince
    },
    findings: {
      count: findingRows.filter(isWaitingRow).length,
      pressOutSince: placingFor.findings.pressOutSince,
      rows: findingRows,
      closed: [
        ...ledger.closedFindings.filter((f) => !held.has(f.id)).map((f) => ({ ...f, outcomeLabel: outcomeLabel(f), delivery: null, mark: closedMark(closedState(f), null) })),
        ...fixesSent
      ].sort((a, b) => b.closedAt - a.closedAt)
    },
    status
  };
}
function heldLabel(c) {
  if (c.how === "answered")
    return `Answered: ${c.outcome}`;
  return c.how === "claude" ? capitalized(c.outcome) : `Closed: ${c.outcome}`;
}
var UPDATING_TEXT = "Updating…";
var RETRYING_TEXT = "Retrying the last update…";
var REFRESHING_PRS_TEXT = "Refreshing PRs…";
function footerStatus(tab, status, prs, statusPageError) {
  if (tab === "prs")
    return { text: prs.isFetching && prs.hasPrs ? REFRESHING_PRS_TEXT : null, error: null };
  const error = (tab === "overview" ? statusPageError : null) ?? status.error;
  return { text: status.isRetrying ? RETRYING_TEXT : status.isUpdating ? UPDATING_TEXT : null, error };
}
var NEXT_TRY = " It tries again after the next reply.";
var FAILED_UPDATE_TEXT = {
  waiting: `The inbox couldn't update from the agent's last reply. Questions, tasks and findings from it may be missing.${NEXT_TRY}`,
  "failed-again": `The inbox couldn't update from the agent's recent replies, even on a retry. Questions, tasks and findings from them may be missing.${NEXT_TRY}`,
  unreadable: `The inbox couldn't read this conversation. Questions, tasks and findings from the agent's last reply may be missing.${NEXT_TRY}`
};
function perTurnStatus(isUpdating, recovery) {
  const error = recovery === "none" || recovery === "retrying" ? null : FAILED_UPDATE_TEXT[recovery];
  return { isUpdating, isRetrying: recovery === "retrying", error };
}

// src/blocks.ts
var button = (id, label, emphasis, local = null) => ({
  id,
  label,
  emphasis,
  isOut: false,
  local
});

// src/draw-status.ts
var MERGED_CELLS = 150;
var toneOf = (t) => t;
var markOf = (mark, tone, isRunning) => ({
  text: mark,
  tone: toneOf(tone),
  isRunning
});
function keyButtons(id, keys) {
  return keys.map((k, n) => button(`${id} ${n}`, k.label, k.emphasis, k.press.action === "toggle-fold" ? { toggleFold: k.press.foldId } : null));
}
function rowBlocks(row, isUnfolded) {
  const rule = row.isRuledAbove ? [{ kind: "rule", id: `rule ${row.id}`, text: null, isDashed: false }] : [];
  if (row.kind === "subject") {
    const under = [
      row.text,
      row.merged ? mergedLine(row.merged, (t) => cellWidth(t) <= MERGED_CELLS) : null,
      row.was ? `${WAS_PREFIX}${row.was}` : null
    ].filter((l) => l !== null);
    return [
      ...rule,
      {
        kind: "status",
        id: row.id,
        depth: row.depth,
        mark: markOf(row.mark, row.tone, row.isRunning),
        name: row.name,
        isBold: false,
        stall: row.stall,
        under,
        buttons: keyButtons(row.id, statusKeyPlan(row))
      }
    ];
  }
  if (row.kind === "child")
    return [
      ...rule,
      {
        kind: "status",
        id: row.id,
        depth: row.depth,
        mark: markOf(row.mark, row.tone, row.isRunning),
        name: row.name,
        isBold: false,
        stall: row.stall,
        under: [],
        buttons: []
      }
    ];
  if (row.kind === "more")
    return [{ kind: "note", id: row.id, text: row.text, tone: "dim", isStrong: false, depth: row.depth }];
  if (row.kind === "look")
    return [{ kind: "rule", id: row.id, text: row.text, isDashed: true }];
  if (row.kind === "part")
    return [
      { kind: "gap", id: `gap ${row.id}` },
      { kind: "rule", id: row.id, text: row.text, isDashed: false }
    ];
  if (row.kind === "counts")
    return [
      ...rule,
      {
        kind: "note",
        id: row.id,
        text: row.counts.map((c) => `${c.mark} ${c.text}`).join(STALL_GAP),
        tone: "muted",
        isStrong: false,
        depth: row.depth
      }
    ];
  if (row.kind === "done-fold")
    return [
      ...rule,
      {
        kind: "fold",
        id: row.id,
        depth: row.depth,
        text: row.text,
        isOpen: isUnfolded(row.id),
        local: { toggleFold: row.id }
      }
    ];
  return [
    ...rule,
    {
      kind: "status",
      id: row.id,
      depth: row.depth,
      mark: markOf(row.mark, row.tone, false),
      name: row.text,
      isBold: false,
      stall: null,
      under: [],
      buttons: []
    }
  ];
}
function milestoneBlock(m) {
  return {
    kind: "status",
    id: m.id,
    depth: 0,
    mark: markOf(m.mark, m.tone, false),
    name: m.name,
    isBold: m.isChanged,
    stall: m.stall,
    under: [m.text, m.was ? `${WAS_PREFIX}${m.was}` : null].filter((l) => l !== null),
    buttons: keyButtons(m.id, milestoneKeyPlan(m))
  };
}
var note = (id, text, tone, isStrong = false) => ({
  kind: "note",
  id,
  text,
  tone,
  isStrong,
  depth: 0
});
function goalBlocks(page, isUnfolded) {
  const g = page.goal;
  const heading = {
    kind: "heading",
    id: "goal heading",
    text: g?.label ?? GOAL_HEADING,
    count: null,
    mark: null,
    buttons: keyButtons(GOAL_KEYS_ID, goalKeyPlan(page))
  };
  if (g === null)
    return [heading, note("goal text", NO_GOAL_TEXT, "dim")];
  const lines = [
    note("goal text", g.count === null ? g.text : `${g.text}${STALL_GAP}${g.count}`, null, true),
    ...g.was ? [note("goal was", `${WAS_PREFIX}${g.was}`, "dim")] : [],
    ...g.now ? [note("goal now", g.now, "dim")] : [],
    ...g.awaiting ? [note("goal awaiting", g.awaiting, "dim")] : []
  ];
  const milestones = g.milestones.flatMap((m) => [
    { kind: "gap", id: `gap ${m.id}` },
    milestoneBlock(m),
    ...unfoldedRows(m.rows, isUnfolded).flatMap((r) => rowBlocks(r, isUnfolded))
  ]);
  return [heading, ...lines, ...milestones];
}
function statusBlocks(page, isUnfolded) {
  if (page.isEmpty)
    return [
      note("empty title", page.empty.title, null, true),
      note("empty hint", page.empty.hint, "muted"),
      {
        kind: "heading",
        id: "goal keys",
        text: "",
        count: null,
        mark: null,
        buttons: keyButtons(GOAL_KEYS_ID, goalKeyPlan(page))
      }
    ];
  const description = page.head?.description;
  const head = page.goal === null && page.head ? [
    note("head title", page.head.title, null, true),
    ...description ? [note("head text", description, "muted")] : []
  ] : [];
  const top = [
    ...goalBlocks(page, isUnfolded),
    ...head.length > 0 ? [{ kind: "gap", id: "gap head" }, ...head] : []
  ];
  const rows = unfoldedRows(page.rows, isUnfolded).flatMap((r) => rowBlocks(r, isUnfolded));
  return rows.length > 0 ? [...top, { kind: "gap", id: "gap rows" }, ...rows] : top;
}

// src/draw.ts
var LOOK = "herdr";
var freshUi = (tab) => ({
  tab,
  selected: null,
  unfolded: [],
  closedAll: [],
  optionsShown: [],
  statusUnfolded: []
});
var toneOfFeedback = (f) => isFailure(f) ? "error" : f.is === "done" || f.is === "local" && f.result.state === "done" ? "done" : "muted";
var markOf2 = (m) => m ? { text: m.text, tone: m.isRunning ? "running" : m.tone ?? "muted", isRunning: m.isRunning } : null;
function rowButtons(row, isAllShown) {
  const { keys, more } = rowKeyPlan(row, isAllShown);
  return [...keys, ...more].map((k, n) => {
    const id = `${row.id} ${n}`;
    if (k.slot === "allOptions")
      return button(id, k.label, k.emphasis, { showOptions: row.id });
    if (k.slot === "retry")
      return button(id, k.label, k.emphasis);
    const { action } = k;
    return { ...button(id, action.label, action.emphasis), isOut: action.isOut };
  });
}
function rowBody(row, isAllShown, isNextBuild) {
  const lines = [
    { text: row.detail, tone: null },
    { text: row.fileName ? `${ROW_COPY.relevantFile}${row.fileName}` : null, tone: "dim" },
    ...shownOptionDescriptions(row, isAllShown).map((o) => ({ text: `${o.label}: ${o.description}`, tone: null })),
    { text: row.recLine, tone: "muted" },
    { text: isNextBuild ? row.holdsUpLine : null, tone: "needsYou" }
  ];
  return lines.flatMap((l) => l.text ? [{ text: l.text, tone: l.tone }] : []);
}
function rowBlock(row, ui, selected, screen) {
  const { state, feedback: f } = row;
  const isSettled = state.is === "settled";
  const isAllShown = ui.optionsShown.includes(row.id);
  const text = rowFeedbackText(row, LOOK);
  const isSelected = !isSettled && row.id === selected;
  return {
    kind: "row",
    id: row.id,
    depth: 0,
    mark: markOf2(rowResultMark(row)),
    title: rowTitle(row, LOOK),
    age: row.at === null ? null : shortAgo(screen.now - row.at),
    feedback: text && f ? { text, tone: toneOfFeedback(f) } : null,
    settled: isSettled ? { label: settledLabel(state.label, state.delivery, state.reply), tone: settledTone(state) } : null,
    isDim: isSettled,
    isSelectable: !isSettled,
    isSelected,
    body: isSelected ? rowBody(row, isAllShown, screen.isNextBuild) : [],
    buttons: isSelected ? rowButtons(row, isAllShown) : []
  };
}
function closedBlock(d, now) {
  const action = closedLineAction(d);
  return {
    kind: "row",
    id: `closed ${d.id}`,
    depth: 1,
    mark: markOf2(d.mark),
    title: d.title,
    age: shortAgo(now - d.at),
    feedback: { text: settledLabel(d.outcomeLabel, d.delivery), tone: "muted" },
    settled: null,
    isDim: true,
    isSelectable: false,
    isSelected: false,
    body: [],
    buttons: action ? [button(`closed ${d.id} 0`, action.label, "quiet")] : []
  };
}
function groupBlocks(g, ui, selected, screen) {
  const settled = new Set(g.rows.filter((r) => r.state.is === "settled").map((r) => r.id));
  const total = closedTotal(g.closed, settled);
  const count = waitingCount(g.rows);
  const out = [
    {
      kind: "heading",
      id: `group ${g.kind}`,
      text: g.title,
      count: count > 0 ? count : null,
      mark: g.mark,
      buttons: []
    },
    ...g.rows.map((r) => rowBlock(r, ui, selected, screen))
  ];
  if (g.rows.length === 0)
    out.push({
      kind: "note",
      id: `empty ${g.kind}`,
      text: groupEmptyText(g.title),
      tone: "dim",
      isStrong: false,
      depth: 0
    });
  if (total === 0)
    return out;
  const isOpen = ui.unfolded.includes(g.kind);
  out.push({
    kind: "fold",
    id: `fold ${g.kind}`,
    depth: 0,
    text: foldLabel(total),
    isOpen,
    local: { closedFold: g.kind }
  });
  if (!isOpen)
    return out;
  const shown = closedShown(g.closed, settled, ui.closedAll.includes(g.kind));
  out.push(...shown.map((d) => closedBlock(d, screen.now)));
  const earlier = earlierLabel(total, shown.length);
  if (earlier)
    out.push({ kind: "more", id: `earlier ${g.kind}`, depth: 1, text: earlier, local: { earlier: g.kind } });
  return out;
}
function groupsOf(view, tab, shownSince) {
  if (tab === "needsYou")
    return NEEDS_YOU_GROUPS.map((g) => ({
      kind: g.kind,
      title: g.title,
      mark: null,
      rows: view.needsYou[g.list].filter((r) => isDrawnInPlace(r, shownSince)),
      closed: view.needsYou.closed[g.list].map((d) => ({ ...d, title: d.ask }))
    }));
  return Object.keys(FINDING_GROUPS).map((kind) => ({
    kind,
    title: FINDING_GROUPS[kind].title,
    mark: { text: FINDING_GROUPS[kind].mark, tone: FINDING_GROUPS[kind].tone, isRunning: false },
    rows: view.findings.rows.filter((r) => r.finding?.kind === kind && isDrawnInPlace(r, shownSince)),
    closed: view.findings.closed.filter((f) => f.kind === kind).map((f) => ({ ...f, at: f.closedAt }))
  }));
}
function selectedOf(groups, selected) {
  const rows = groups.flatMap((g) => g.rows).filter(isWaitingRow);
  if (selected !== null && rows.some((r) => r.id === selected))
    return selected;
  return firstWaiting(rows.map((r) => ({ id: r.id, isWaiting: true })));
}
function rowTabBlocks(screen, ui, tab) {
  const groups = groupsOf(screen.view, tab, screen.shownSince);
  const isEmpty = groups.every((g) => g.rows.length === 0 && g.closed.length === 0);
  if (isEmpty) {
    const empty = emptyText(tab, screen.agent, isMaybeStale(screen.view));
    return [
      { kind: "note", id: "empty title", text: empty.title, tone: null, isStrong: true, depth: 0 },
      { kind: "note", id: "empty hint", text: empty.hint, tone: "muted", isStrong: false, depth: 0 }
    ];
  }
  const selected = selectedOf(groups, ui.selected);
  return groups.flatMap((g) => groupBlocks(g, ui, selected, screen));
}
var PRS_NOT_DRAWN = "This panel doesn't show PRs yet. They show in the inbox in the agent's own window.";
function tabCells(screen, tab) {
  const { view } = screen;
  const counts = { needsYou: view.needsYou.count, findings: view.findings.count, prs: view.prs.count };
  return shownTabs(screen.isNextBuild).map((t) => ({
    id: t.id,
    label: t.label,
    badge: tabBadge(t.id, counts),
    isSelected: t.id === tab
  }));
}
function chrome(screen, tab) {
  const status = footerStatus(tab, screen.view.status, { isFetching: false, hasPrs: false }, screen.view.statusPage.error);
  return { banners: tabBarBanners([], status.error, null), status: status.text };
}
function tabBlocks(screen, ui) {
  if (ui.tab === "overview")
    return statusBlocks(screen.view.statusPage, (id) => ui.statusUnfolded.includes(id));
  if (ui.tab === "prs")
    return [{ kind: "note", id: "prs", text: PRS_NOT_DRAWN, tone: "muted", isStrong: false, depth: 0 }];
  return rowTabBlocks(screen, ui, ui.tab);
}

// ../hooks/children.ts
var ENDED = new Set(["completed", "failed", "killed", "stopped"]);

// ../hooks/reply-parse.ts
function readKind(kind) {
  return kind === "task" || kind === "do" ? "task" : "question";
}

// ../hooks/ledger-update.ts
var EXPIRED = "expired, unanswered";
var NOT_AN_ANSWER = new RegExp(`^\\s*(?:done\\s*:|(?:${OVERTAKEN_OUTCOMES}|no longer relevant|dealt with)\\b)`, "i");

// ../hooks/status-upgrade-goal.ts
function time(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
function goalOf(saved) {
  const g = saved;
  const text = nonEmpty(g?.text);
  const setAt = time(g?.setAt);
  if (typeof saved !== "object" || text === null || setAt === null)
    return null;
  const isAwaitingMilestones = g?.isAwaitingMilestones === true;
  const isTyped = g?.source === "typed" || g?.source !== "inferred" && isAwaitingMilestones;
  return {
    text,
    setAt,
    metAt: time(g?.metAt),
    was: nonEmpty(g?.was),
    isAwaitingMilestones,
    source: isTyped ? "typed" : "inferred"
  };
}
function milestoneOf(saved) {
  const m = saved;
  const status = STATUSES.find((x) => x === m?.status);
  const changedAt = time(m?.changedAt);
  if (!m || typeof m.id !== "string" || typeof m.name !== "string" || !status || changedAt === null)
    return null;
  return {
    id: m.id,
    name: m.name,
    status,
    text: typeof m.text === "string" ? m.text : "",
    was: nonEmpty(m.was),
    changedAt,
    closedAt: time(m.closedAt) ?? (status === "done" || status === "dropped" ? changedAt : null)
  };
}
function milestonesOf(saved) {
  return (Array.isArray(saved) ? saved : []).map(milestoneOf).filter((m) => m !== null);
}
var isStringRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function goalRemovedOf(saved) {
  const r = saved;
  const goal = goalOf(r?.goal);
  if (goal === null || !isStringRecord(r?.serves) || !isStringRecord(r?.askSubjects))
    return null;
  const serves = Object.entries(r.serves).filter((e) => typeof e[1] === "string");
  const asks = Object.entries(r.askSubjects).filter((e) => Array.isArray(e[1]) && e[1].every((x) => typeof x === "string"));
  return {
    goal,
    milestones: milestonesOf(r.milestones),
    serves: Object.fromEntries(serves),
    askSubjects: Object.fromEntries(asks)
  };
}
function droppedMilestoneIds(milestones) {
  return new Set(milestones.filter((m) => m.status === "dropped").map((m) => m.id));
}
function goalFields(o, subjectIds) {
  const milestones = milestonesOf(o.milestones);
  const dropped = droppedMilestoneIds(milestones);
  const liveIds = new Set(milestones.filter((m) => !dropped.has(m.id)).map((m) => m.id));
  const savedServes = typeof o.serves === "object" && o.serves !== null ? Object.entries(o.serves) : [];
  const serves = Object.fromEntries(savedServes.filter((e) => subjectIds.has(e[0]) && typeof e[1] === "string" && (e[1] === "none" || liveIds.has(e[1]))));
  const saved = [
    ...Array.isArray(o.declinedGoals) ? o.declinedGoals : [],
    ...Array.isArray(o.removedGoals) ? o.removedGoals : []
  ];
  const keys = saved.flatMap((d) => typeof d === "string" ? [nameKey(d)] : []);
  const removed = [...new Set(keys)].filter((key) => key !== "");
  return {
    goal: goalOf(o.goal),
    removedGoals: removed.slice(-REMOVED_KEPT),
    goalRemoved: goalRemovedOf(o.goalRemoved),
    milestones,
    nextMilestoneId: Math.max(time(o.nextMilestoneId) ?? 1, milestones.length + 1),
    serves
  };
}

// ../hooks/status-upgrade.ts
var CHILD_KINDS = ["subagent", "workflow", "delegate"];
var DELEGATE_STATES = ["working", "blocked", "finished"];
function text(value) {
  return typeof value === "string" ? value : "";
}
function time2(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
var DROPPED_STATUSES = { "waits-on-you": "queued", problem: "queued" };
var OLD_MERGE = /^(.+?) folded in(?:; was: (.*))?$/s;
function wasAndMerged(was, merged) {
  const old = typeof was === "string" && typeof merged !== "string" ? OLD_MERGE.exec(was) : null;
  if (old)
    return { was: old[2] ?? null, merged: old[1] };
  return { was: typeof was === "string" ? was : null, merged: typeof merged === "string" ? merged : null };
}
function subjectOf(saved) {
  const s = saved;
  const status = STATUSES.find((x) => x === s?.status) ?? DROPPED_STATUSES[String(s?.status)];
  const changedAt = time2(s?.changedAt);
  if (!s || typeof s.id !== "string" || typeof s.name !== "string" || !status || changedAt === null)
    return null;
  return {
    id: s.id,
    name: s.name,
    status,
    text: text(s.text),
    ...wasAndMerged(s.was, s.merged),
    createdAt: time2(s.createdAt) ?? changedAt,
    changedAt,
    closedAt: time2(s.closedAt) ?? (status === "done" || status === "dropped" ? changedAt : null),
    into: typeof s.into === "string" ? s.into : null
  };
}
function childOf(saved) {
  const c = saved;
  const kind = CHILD_KINDS.find((k) => k === c?.kind);
  const startedAt = time2(c?.startedAt);
  if (!c || typeof c.id !== "string" || typeof c.ref !== "string" || !kind || startedAt === null)
    return null;
  return {
    id: c.id,
    ref: c.ref,
    kind,
    name: text(c.name),
    subjectId: typeof c.subjectId === "string" ? c.subjectId : null,
    startedAt,
    endedAt: time2(c.endedAt),
    lastActivityAt: time2(c.lastActivityAt),
    delegateState: DELEGATE_STATES.find((state) => state === c.delegateState) ?? null
  };
}
var OLD_STATUS = {
  working: "working",
  queued: "queued",
  "waits-on-you": "queued",
  "waits-on-other": "waits-on-other",
  problem: "queued",
  unknown: "queued",
  done: null,
  "ruled-out": null
};
function headOfGoal(goal) {
  const title = clipWords(text(goal), DESCRIPTION_KEPT);
  return title === "" ? null : { title, description: "" };
}
function headOf(saved) {
  const h = saved;
  const title = text(h?.title);
  return title === "" ? null : { title, description: text(h?.description) };
}
function fromLists(o) {
  const lastLookAt = time2(o.lastLookAt);
  const items = lastLookAt === null ? [] : ["workstreams", "queue", "open"].flatMap((k) => Array.isArray(o[k]) ? o[k] : []);
  const subjects = items.flatMap((raw) => {
    const item = raw;
    const status = OLD_STATUS[String(item?.status)] ?? null;
    if (!status || typeof item?.text !== "string")
      return [];
    return [
      { status, name: clipWords(item.text, NAME_KEPT), text: typeof item.detail === "string" ? item.detail : "" }
    ];
  }).filter((s, n, all) => all.findIndex((t) => nameKey(t.name) === nameKey(s.name)) === n).slice(0, OPEN_SUBJECTS).map((s, n) => ({
    id: `s${n + 1}`,
    ...s,
    text: clipWords(s.text, TEXT_KEPT),
    was: null,
    merged: null,
    createdAt: lastLookAt,
    changedAt: lastLookAt,
    closedAt: null,
    into: null
  }));
  return {
    ...EMPTY_SESSION_STATUS,
    head: headOfGoal(o.headline),
    subjects,
    nextId: subjects.length + 1,
    lastLookAt
  };
}
function missedOf(saved, ids) {
  const entries = typeof saved === "object" && saved !== null ? Object.entries(saved) : [];
  return Object.fromEntries(entries.filter(([id, at]) => ids.has(id) && (at === null || time2(at) !== null)));
}
function upgradeStatus(saved) {
  const o = saved;
  if (typeof o !== "object" || o === null)
    return null;
  if (typeof o.headline === "string")
    return fromLists(o);
  if (!Array.isArray(o.subjects))
    return null;
  const subjects = o.subjects.map(subjectOf).filter((s) => s !== null);
  const children = Array.isArray(o.children) ? o.children.map(childOf).filter((c) => c !== null) : [];
  const savedLinks = typeof o.askSubjects === "object" && o.askSubjects !== null ? Object.entries(o.askSubjects) : [];
  const goal = goalFields(o, new Set(subjects.map((s) => s.id)));
  const dropped = droppedMilestoneIds(goal.milestones);
  const askLinks = savedLinks.map(([ask, to]) => [
    ask,
    [to].flat().filter((id) => typeof id === "string" && !dropped.has(id))
  ]);
  const askSubjects = Object.fromEntries(askLinks.filter(([, ids]) => ids.length > 0));
  const look = o.look;
  const lookAt = time2(look?.startedAt);
  return {
    head: "head" in o ? headOf(o.head) : headOfGoal(o.goal),
    subjects,
    children,
    askSubjects,
    nextId: Math.max(time2(o.nextId) ?? 1, subjects.length + 1),
    nextChildId: Math.max(time2(o.nextChildId) ?? 1, children.length + 1),
    lastLookAt: time2(o.lastLookAt),
    missedInLastLook: missedOf(o.missedInLastLook, new Set(subjects.map((s) => s.id))),
    look: lookAt === null ? null : { startedAt: lookAt },
    ...goal
  };
}

// ../hooks/ledger.ts
var EMPTY = {
  overview: null,
  items: [],
  closed: [],
  findings: [],
  closedFindings: [],
  prs: [],
  prOrder: null,
  nextId: 1,
  turn: 0,
  batchTurn: 0,
  updates: 0
};
function upgradeLedger(ledger) {
  const {
    notes,
    decided,
    milestones: _milestones,
    card,
    ...rest
  } = ledger;
  const updates = typeof rest.updates === "number" ? rest.updates : card ? 1 : 0;
  return {
    ...rest,
    prOrder: rest.prOrder ? upgradePrOrder(rest.prOrder, rest.prs) : null,
    updates,
    overview: upgradeStatus(rest.overview),
    findings: [...rest.findings ?? [], ...notes ?? []],
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
function upgradePrOrder(order, prs) {
  return {
    ...order,
    why: order.why ?? null,
    statuses: order.statuses ?? null,
    dismissed: order.dismissed ?? order.refs.filter((ref) => !prs.includes(ref))
  };
}
var ASKED_AS = /^asked as (i\d+)$/;
function upgradeClosedFinding(f) {
  const asker = f.how === "update" ? ASKED_AS.exec(f.outcome)?.[1] : undefined;
  return asker && f.askedAs === undefined ? { ...f, askedAs: asker } : f;
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
function howFromOutcome(outcome) {
  if (outcome === "dismissed")
    return "dismissed";
  if (outcome === EXPIRED)
    return "expired";
  if (outcome === "done" || outcome === "you ran it")
    return "done";
  if (outcome.startsWith(CLOSED_BY_CLAUDE))
    return "claude";
  return "update";
}
var CLOSED_BY_CLAUDE = "closed by Claude";

// ../hooks/host-tasks.ts
var STATUSES2 = {
  pending: "pending",
  in_progress: "in-progress",
  "in-progress": "in-progress",
  completed: "done",
  done: "done",
  abandoned: "dropped",
  blocked: "blocked"
};
var recordOf = (raw) => typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
function upgradeHostTasks(saved) {
  if (!Array.isArray(saved))
    return [];
  return saved.flatMap((raw) => {
    const t = recordOf(raw);
    const status = STATUSES2[String(t.status)];
    return typeof t.id === "string" && typeof t.text === "string" && t.text !== "" && status ? [{ id: t.id, text: t.text, status }] : [];
  });
}

// ../hooks/gh.ts
var GH_TIMEOUT_MS = 20000;

// ../hooks/pr-fetch.ts
var MAX_PRS = 12;
var CLOSED_PR_REFRESH_MS = 60 * 60000;
var LIMIT_RETRY_MS = 5 * 60000;
function tabPrs(links) {
  const order = links.prOrder;
  const ranked = (order?.refs ?? []).filter((ref) => !links.prs.includes(ref) && !order?.dismissed.includes(ref));
  return [...links.prs, ...ranked];
}
function itemPrSteps(item, prState, linked) {
  const refs = prState.branchRef ? [...linked, prState.branchRef] : linked;
  return prSteps(item, refs.map((ref) => ({ ref, url: prState.views[ref]?.url ?? null })));
}
function isLeftOut(prState, ref) {
  const view = prState.views[ref];
  return view !== undefined && !isKeptPr(view);
}
function splitLinked(prState, links) {
  const ranked = new Set(links.prOrder?.refs ?? []);
  const shown = tabPrs(links).filter((ref) => !isLeftOut(prState, ref));
  const unranked = shown.filter((ref) => !ranked.has(ref));
  const older = unranked.slice(0, Math.max(0, unranked.length - MAX_PRS));
  return { tracked: shown.filter((ref) => !older.includes(ref)), older };
}
function olderPrsText(prState, links) {
  const { older } = splitLinked(prState, links);
  if (older.length === 0)
    return null;
  const numbers = older.map((ref) => `#${parseRef(ref).number}`).reverse();
  return `${older.length} older ${older.length === 1 ? "PR" : "PRs"} not shown: ${numbers.join(", ")}`;
}
var GH_TIMED_OUT_TEXT = `gh did not answer within ${GH_TIMEOUT_MS / 1000} seconds`;

// ../hooks/pr-press.ts
var RERUN_LABEL = "Re-run";
var PR_FIX_LABELS = {
  "pr-conflicts": "Resolve conflicts",
  "check-fix": "Fix"
};
var PR_READ_FIRST_LABELS = {
  ...PR_FIX_LABELS,
  "check-rerun": RERUN_LABEL
};
function lastPressOf(presses, rowId) {
  const last = presses.lastActions[rowId];
  const feedback = pressFeedbackIn(rowId, { is: "open" }, last, presses.turns, presses.now);
  return { last, pressing: pressOutAction(last, feedback), out: outAction(last, feedback) };
}
function withOut(row, actions) {
  return actions.map((a) => ({ ...a, isOut: a.press.action === row.out }));
}

// ../hooks/pr-refresh.ts
var PR_REFRESH_LABEL = "Refresh PRs";
function fetchFailureWords(f) {
  switch (f.kind) {
    case "limit":
      return f.resetsAt === null ? "GitHub's limit is used up" : `GitHub's limit resets at ${clockTime(f.resetsAt)}`;
    case "unreachable":
      return "could not reach GitHub";
    case "timed-out":
      return GH_TIMED_OUT_TEXT;
    case "error":
      return f.text;
  }
}
function tabWideProblem(prs) {
  if (prs.isGhMissing)
    return "gh was not found";
  if (prs.isGhSignedOut)
    return "gh is not signed in";
  return prs.failure ? fetchFailureWords(prs.failure) : null;
}
function unreadPrs(prs, links) {
  const { tracked } = splitLinked(prs, links);
  const refs = prs.branchRef && !tracked.includes(prs.branchRef) ? [...tracked, prs.branchRef] : tracked;
  return refs.flatMap((ref) => {
    const view = prs.views[ref];
    if (view?.error)
      return [{ ref, why: view.error, hasBlock: true }];
    const why = view ? null : prs.unread?.[ref];
    return why ? [{ ref, why, hasBlock: false }] : [];
  });
}
function refreshProblem(prs, links) {
  const tabWide = tabWideProblem(prs);
  if (tabWide)
    return tabWide;
  const unread = unreadPrs(prs, links);
  const [only] = unread;
  if (!only)
    return null;
  if (unread.length === 1)
    return `#${parseRef(only.ref).number} could not be read${only.hasBlock ? "" : `: ${only.why}`}`;
  const numbers = unread.map((u) => `#${parseRef(u.ref).number}`);
  const last = numbers.pop();
  return `${numbers.join(", ")} and ${last} could not be read`;
}
function prRefreshView(prs, links, presses, shownSince) {
  const problem = refreshProblem(prs, links);
  const row = lastPressOf(presses, PR_REFRESH_ID);
  const feedback = pressFeedbackIn(PR_REFRESH_ID, { is: "open" }, row.last, presses.turns, presses.now);
  const isMadeGood = problem === null && feedback?.is === "local" && feedback.result.state === "failed";
  const isPressShown = feedback !== null && !isMadeGood && row.last !== undefined && (row.pressing !== null || isShownSince(row.last.at, shownSince));
  if (problem === null && !isPressShown)
    return null;
  return {
    text: problem !== null && tabWideProblem(prs) === null ? problem : null,
    actions: problem === null ? [] : prRefreshActions(row),
    showsPress: isPressShown
  };
}
function prRefreshActions(row) {
  return withOut(row, [
    { press: { action: "pr-refresh" }, label: PR_REFRESH_LABEL, kind: "local", emphasis: "normal", icon: "retry" }
  ]);
}

// ../hooks/pr-rows.ts
function prThreadId(pr, t) {
  return threadRowId(pr.ref, t.id);
}
function threadRowId(ref, thread) {
  return `${ref} thread ${thread}`;
}
function checkRowId(ref, check) {
  return `${ref} check ${check}`;
}
function prMarkId(ref) {
  return `pr:${ref}`;
}
var RANK_AGAIN_ID = "pr:order";
var PR_REFRESH_ID = "pr:refresh";
function threadSentIn(lastActions) {
  return (pr, t) => {
    const last = lastActions[prThreadId(pr, t)];
    return last?.kind === "handoff" && last.delivery?.state !== "failed" && last.at > ((t.reply ?? t).at ?? 0);
  };
}

// ../hooks/saved-check-keys.ts
function savedCheckKey(checks, name) {
  if (checks.some((c) => checkKey(c) === name))
    return name;
  const named = checks.filter((c) => c.name === name);
  return named.length === 1 ? checkKey(named[0]) : name;
}
var CHECK_ROW_ID = /^(\S+) check (.+)$/;
function savedRowId(id, views) {
  const m = CHECK_ROW_ID.exec(id);
  return m ? checkRowId(m[1], savedCheckKey(views[m[1]]?.checks ?? [], m[2])) : id;
}
function withCheckKeys(s, views) {
  const order = s.ledger.prOrder;
  const statuses = order?.statuses;
  const upgradedStatuses = statuses && Object.fromEntries(Object.entries(statuses).map(([ref, status]) => [
    ref,
    { ...status, failing: status.failing.map((name) => savedCheckKey(views[ref]?.checks ?? [], name)) }
  ]));
  return {
    ...s,
    ledger: order ? { ...s.ledger, prOrder: { ...order, statuses: upgradedStatuses } } : s.ledger,
    sent: s.sent.map((x) => x.row === null ? x : { ...x, row: savedRowId(x.row, views) }),
    lastActions: Object.fromEntries(Object.entries(s.lastActions).map(([id, last]) => {
      const upgraded = savedRowId(id, views);
      return [upgraded in s.lastActions ? id : upgraded, last];
    }))
  };
}

// ../hooks/session-files.ts
var NO_PRS = { views: {}, branchRef: null, isFetching: false };
var NO_FAILURE = { lastFailure: null, recoveredAt: null };
var NO_CALL_FAILURES = { ledger: NO_FAILURE, status: NO_FAILURE };
var NO_TURN = { person: null, trigger: null, activity: [], press: null };
function emptySession() {
  return {
    ledger: EMPTY,
    turn: NO_TURN,
    told: TOLD_NOTHING,
    presence: {
      turnsStarted: 0,
      turnsApplied: 0,
      ledgerState: "current",
      hasDroppedReply: false,
      failedAttempts: 0,
      isConversationUnreadable: false,
      isUpdating: false,
      isTurnRunning: false,
      turnStartedAt: null,
      lastReplyAt: null,
      lastTypedMessageAt: null
    },
    place: null,
    pending: [],
    sent: [],
    lastActions: {},
    heldRows: [],
    shownSince: null,
    prViews: NO_PRS,
    stop: null,
    overviewFailure: null,
    callFailures: NO_CALL_FAILURES,
    lastOverviewCallAt: null,
    overviewTurn: 0,
    hostTasks: [],
    dialogQuestions: []
  };
}
function withoutStatedStep(presence) {
  const { statedStep: _statedStep, ...rest } = presence ?? {};
  return rest;
}
function upgradeSession(saved) {
  const views = saved.prViews?.views ?? {};
  return withCheckKeys(sessionFields(saved, views), views);
}
function sessionFields(saved, views) {
  const base = emptySession();
  return {
    ledger: saved.ledger ? { ...base.ledger, ...upgradeLedger({ ...saved.ledger, items: saved.ledger.items ?? [] }) } : base.ledger,
    turn: { ...base.turn, ...saved.turn },
    told: { ...base.told, ...saved.told },
    presence: { ...base.presence, ...withoutStatedStep(saved.presence) },
    place: saved.place ?? null,
    pending: (saved.pending ?? []).map((p) => ({ ...p, ex: { ...p.ex, tasks: p.ex.tasks ?? [] } })),
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
    shownSince: saved.shownSince ?? null,
    prViews: {
      ...NO_PRS,
      ...saved.prViews,
      views: Object.fromEntries(Object.entries(views).map(([ref, pr]) => [
        ref,
        {
          ...pr,
          isYours: pr.isYours ?? null,
          wasSeenOpen: pr.wasSeenOpen ?? pr.state === "OPEN",
          threads: pr.threads.map((t) => ({
            ...t,
            isLinesChanged: t.isLinesChanged ?? false,
            at: t.at ?? null,
            reply: t.reply && { ...t.reply, at: t.reply.at ?? null }
          }))
        }
      ])),
      isFetching: false
    },
    stop: saved.stop ?? null,
    overviewFailure: saved.overviewFailure ?? null,
    callFailures: { ...NO_CALL_FAILURES, ...saved.callFailures },
    lastOverviewCallAt: saved.lastOverviewCallAt ?? null,
    overviewTurn: saved.overviewTurn ?? 0,
    hostTasks: upgradeHostTasks(saved.hostTasks),
    dialogQuestions: (saved.dialogQuestions ?? []).map((q) => ({ ...q, descriptions: q.descriptions ?? {} }))
  };
}

// ../hooks/herdr.ts
var STATUS_TOKEN = "inbox";
var STOP_TOKEN = "inbox-stop";
var FOCUS_TOKEN = "inbox-focus";
var COUNT_TOKENS = {
  needsYou: "inbox-needs-you",
  findings: "inbox-findings",
  prs: "inbox-prs"
};
var CLEARED_TOKENS = Object.fromEntries([STATUS_TOKEN, STOP_TOKEN, FOCUS_TOKEN, ...Object.values(COUNT_TOKENS)].map((name) => [name, null]));
var HERDR_FORMAT = 1;
var SESSION_FIELDS = Object.keys(emptySession());

// src/files.ts
var sessionPath = (appHome, sessionId) => `${appHome}/inbox/sessions/${sessionId}.json`;
var sessionsFolder = (appHome) => `${appHome}/inbox/sessions`;
function isSessionChange(changed, appHome, sessionId) {
  const folder = sessionsFolder(appHome);
  return changed.some((p) => p === sessionPath(appHome, sessionId) || p === folder || p === `${folder}/`);
}
var isRecord = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
var SOURCE_FIELDS = ["host", "agent", "sessionId", "terminal"];
function readSession(text) {
  if (text === null)
    return { is: "missing" };
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    return { is: "torn" };
  }
  if (!isRecord(file))
    return { is: "refused", reason: "not an object" };
  const { format } = file;
  if (typeof format === "number" && format > HERDR_FORMAT)
    return { is: "newer", format };
  if (format !== HERDR_FORMAT)
    return { is: "refused", reason: `unknown format ${String(format)}` };
  const missing = SOURCE_FIELDS.find((field) => typeof file[field] !== "string" || file[field] === "");
  if (missing)
    return { is: "refused", reason: `no ${missing}` };
  if (typeof file.writtenAt !== "number")
    return { is: "refused", reason: "no writtenAt" };
  if (!isRecord(file.session))
    return { is: "refused", reason: "no session" };
  const envelope = file;
  return { is: "read", envelope, session: upgradeSession(file.session) };
}

// src/follow.ts
var SESSION_LABEL = "inbox.session";
function shownOf(where, address) {
  const t = where.terminals.find((x) => x.address === address);
  const sessionId = t?.labels?.[SESSION_LABEL];
  if (!sessionId)
    return { is: "no-inbox", terminal: address, program: t?.program?.name ?? null };
  return t?.program?.shell ? { is: "ended", terminal: address } : { is: "session", terminal: address, sessionId };
}
function follow(where, tab, last) {
  const inTab = where.panes.flatMap((p) => p.tab === tab && p.terminal ? [p.terminal] : []);
  const focused = where.focused?.tab === tab ? where.focused.terminal : null;
  const isLabeled = (address) => Boolean(where.terminals.find((x) => x.address === address)?.labels?.[SESSION_LABEL]);
  const address = [focused, last].find((a) => a !== null && inTab.includes(a)) ?? inTab.find(isLabeled) ?? inTab[0] ?? null;
  return address === null ? { is: "no-terminal" } : shownOf(where, address);
}

// ../hooks/arrivals.ts
var ARRIVAL_TABS = ROW_TABS.map((t) => t.id);

// ../hooks/pr-views.ts
var PR_DISMISSED_LABEL = "Dismissed";
var PR_MERGED_LABEL = "Merged";
var PR_CLOSED_LABEL = "Closed";
function isTracked(prState, links, ref) {
  return splitLinked(prState, links).tracked.includes(ref) || prState.branchRef === ref;
}
function dismissal(lastActions, ref) {
  const mark = lastActions[prMarkId(ref)];
  return mark?.action === "pr-dismiss" ? mark : null;
}
function openPrViews(drawn) {
  return drawn.filter((d) => d.state.is === "open").map((d) => d.pr);
}
function settledPrState(mark, now, settleWindowMs) {
  const closed = mark.text === PR_MERGED_LABEL ? { how: "update", outcome: PR_MERGED_LABEL } : mark.text === PR_CLOSED_LABEL ? { how: "expired", outcome: PR_CLOSED_LABEL } : { how: "dismissed", outcome: PR_DISMISSED_LABEL };
  const state = closedRowState(closed, mark.at, now, settleWindowMs, null);
  return { ...state, canUndo: isUndoLeft(mark.at, now, settleWindowMs), offersUndo: true };
}
function drawnPrs(prState, links, lastActions, placing) {
  const { now, settleWindowMs } = placing;
  const ranked = links.prOrder?.refs ?? [];
  const drawn = inPrOrder(Object.values(prState.views), ranked).flatMap((pr) => {
    if (isTracked(prState, links, pr.ref))
      return [{ pr, state: { is: "open" } }];
    const mark = dismissal(lastActions, pr.ref);
    if (mark === null)
      return [];
    const state = settledPrState(mark, now, settleWindowMs);
    return isSettledInPlace(state, placing, prMarkId(pr.ref)) ? [{ pr, state }] : [];
  });
  let rank = 0;
  return drawn.map((d) => ({ ...d, rank: rankOf(d.pr, ranked) === null ? null : ++rank }));
}

// ../hooks/pr-order.ts
var RANK_AGAIN_LABEL = "Rank again";
function prOrderText(order, drawn, now) {
  const isRanking = drawn.some((d) => d.rank !== null);
  if (!order || !isRanking)
    return null;
  return `${order.label ?? "Order"}${DOT}set by ${order.by} ${ago(now - order.at)}`;
}
function rankedStatusOf(pr) {
  return {
    status: readiness(pr).status,
    threads: waitingThreads(pr).map((t) => t.id),
    failing: blockingChecks(pr).map(checkKey)
  };
}
function hasChanged(was, is) {
  return is.status !== was.status || is.threads.some((id) => !was.threads.includes(id)) || is.failing.some((name) => !was.failing.includes(name));
}
function changedRankedPrs(order, prs) {
  const statuses = order.statuses ?? {};
  return inPrOrder(prs, order.refs).filter((pr) => {
    const was = statuses[pr.ref];
    return rankOf(pr, order.refs) !== null && was !== undefined && hasChanged(was, rankedStatusOf(pr));
  });
}
function prOrderView(order, drawn, presses, shownSince) {
  const title = prOrderText(order, drawn, presses.now);
  if (!order || title === null)
    return null;
  const count = changedRankedPrs(order, openPrViews(drawn)).length;
  const row = lastPressOf(presses, RANK_AGAIN_ID);
  const last = row.last;
  const isPressShownHere = last !== undefined && (row.pressing !== null || isShownSince(last.at, shownSince));
  const isForThisOrder = last !== undefined && last.at >= order.at;
  const showsPress = row.pressing !== null || isForThisOrder || isPressShownHere && count === 0;
  const isChangedShown = count > 0 || isPressShownHere;
  return {
    title,
    why: order.why,
    changed: isChangedShown ? {
      text: count > 0 ? `${count} ${count === 1 ? "PR" : "PRs"} changed since` : null,
      actions: count > 0 ? prOrderActions(row) : [],
      showsPress
    } : null
  };
}
function prOrderActions(row) {
  return withOut(row, [
    {
      press: { action: "pr-rank-again" },
      label: RANK_AGAIN_LABEL,
      kind: "talk",
      emphasis: "normal",
      hotkey: "g"
    }
  ]);
}

// ../hooks/session-view.ts
var PRESS_TIMEOUT_MS = 60000;
function withoutStaleResult(last, now) {
  if (last.result?.state !== "pending" || now - last.result.at <= PRESS_TIMEOUT_MS)
    return last;
  const { result: _result, ...rest } = last;
  return rest;
}
function withoutStalePending(lastActions, now) {
  return Object.fromEntries(Object.entries(lastActions).map(([id, last]) => [id, withoutStaleResult(last, now)]));
}
function updateRecovery(s) {
  const { presence } = s;
  if (presence.ledgerState !== "failed")
    return "none";
  if (presence.isUpdating)
    return "retrying";
  if (s.pending.length === 0 && presence.isConversationUnreadable)
    return "unreadable";
  return presence.failedAttempts > 1 ? "failed-again" : "waiting";
}
function sessionView(s, now, settleWindowMs, holds = NO_HOLDS, notes = {}) {
  const l = s.ledger;
  const lastActions = withoutStalePending(s.lastActions, now);
  const inbox = inboxView({
    ledger: l,
    lastActions,
    notes,
    turns: s.presence,
    extraSteps: Object.fromEntries(l.items.map((item) => [item.id, itemPrSteps(item, s.prViews, tabPrs(l))])),
    settleWindowMs,
    status: perTurnStatus(s.presence.isUpdating, updateRecovery(s)),
    now,
    ...holds,
    lastTypedMessageAt: s.presence.lastTypedMessageAt
  });
  return {
    ...inbox,
    lastActions,
    turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied },
    prs: prTabOf(s, lastActions, now, holds, settleWindowMs),
    statusPage: statusPage(s, now)
  };
}
function prTabOf(s, lastActions, now, { shownSince, listInput, undoShown }, settleWindowMs) {
  const pressOutSince = earliestOf(Object.entries(lastActions).map(([id, last]) => isPrRowId(id) ? pressUnderWaySince(feedbackOf(id, last, undefined, s.presence, now)) : null));
  const drawn = drawnPrs(s.prViews, s.ledger, lastActions, {
    shownSince,
    lastTypedMessageAt: s.presence.lastTypedMessageAt,
    listInput,
    now,
    settleWindowMs,
    undoShown,
    pressOutSince
  });
  const isSent = threadSentIn(lastActions);
  return {
    drawn,
    branchRef: s.prViews.branchRef,
    count: drawn.filter((d) => d.state.is === "open" && prNeedsYou(d.pr, isSent)).length,
    olderText: olderPrsText(s.prViews, s.ledger),
    order: prOrderView(s.ledger.prOrder, drawn, { lastActions, turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied }, now }, shownSince),
    isGhSignedOut: s.prViews.isGhSignedOut === true,
    failure: s.prViews.failure ?? null,
    refresh: prRefreshView({ ...s.prViews, isGhMissing: s.prViews.isGhMissing === true }, s.ledger, { lastActions, turns: { turnsStarted: s.presence.turnsStarted, turnsApplied: s.presence.turnsApplied }, now }, shownSince),
    pressOutSince
  };
}

// src/screen.ts
var message = (title, hint, isError = false) => ({
  is: "message",
  message: { title, hint, isError }
});
function messageOf(followed, read) {
  if (followed.is === "no-terminal")
    return message("No terminal in this tab", "Open an agent with the inbox in this tab to see it here.");
  if (followed.is === "no-inbox")
    return message("No inbox in this terminal", followed.program ? `${followed.program} runs here without the inbox.` : "Start an agent with the inbox here to see its questions and findings.");
  if (followed.is === "ended")
    return message("The session ended", "This terminal is back at its shell.");
  if (read === null)
    return message(READING_TEXT, null);
  if (read.is === "missing")
    return message("Waiting for the inbox", "The agent publishes its inbox here after its next reply.");
  if (read.is === "torn")
    return message(READING_TEXT, null);
  if (read.is === "newer")
    return message("This panel is out of date", `The agent writes its inbox in format ${read.format}. Update the inbox to read it.`, true);
  if (read.is === "refused")
    return message("Can't read this inbox", `Its file has ${read.reason}.`, true);
  return null;
}
function screenOf(followed, read, ui, o) {
  const shown = messageOf(followed, read);
  if (shown !== null || read?.is !== "read")
    return shown ?? message(READING_TEXT, null);
  const holds = { replies: {}, discarded: {}, shownSince: o.shownSince, listInput: null };
  const view = sessionView(read.session, o.now, SETTLED_MS, holds);
  const screen = { view, agent: read.envelope.agent, now: o.now, shownSince: o.shownSince, isNextBuild: o.isNextBuild };
  const rows = [...view.needsYou.questions, ...view.needsYou.tasks, ...view.findings.rows];
  const settled = rows.flatMap((r) => r.state.is === "settled" ? [r.state] : []);
  const placing = { lastTypedMessageAt: null, listInput: null, now: o.now, settleWindowMs: SETTLED_MS };
  return {
    is: "inbox",
    agent: screen.agent,
    tabs: tabCells(screen, ui.tab),
    ...chrome(screen, ui.tab),
    blocks: tabBlocks(screen, ui),
    foldAt: nextFoldAt(settled, placing)
  };
}

// src/main.ts
var REREAD_MS = 1e4;
var AGE_TICK_MS = 60000;
var TORN_RETRY_MS = 30;
var TORN_RETRIES = 5;
var TONE_COLORS = {
  needsYou: "blocked",
  issue: "blocked",
  warning: "blocked",
  done: "done",
  running: "working",
  error: "ansi1",
  muted: "muted",
  dim: "dim"
};
var colorOf = (t, tone) => t[tone === null ? "foreground" : TONE_COLORS[tone]];
function buttonEl(b, t, press) {
  const base = h_flex().id(`button ${b.id}`).h(28).px(10).flex_none().items_center().rounded(7).text_size(12).accessibility_label(b.label).child(b.label);
  const styled = b.emphasis === "primary" ? base.bg(t.solid).text_color(t.solid_foreground) : b.emphasis === "normal" ? base.bg(t.raised).border_1().border_color(t.border).text_color(t.foreground) : base.text_color(t.muted).hover((s) => s.bg(t.hover));
  if (b.isOut)
    return styled.opacity(0.5);
  return styled.cursor_pointer().on_click((_e, cx) => {
    cx.stop_propagation();
    press(b, cx);
  });
}
var buttonsEl = (buttons, t, press, indent) => h_flex().flex_wrap().gap(6).pt(6).pl(indent).children(buttons.map((b) => buttonEl(b, t, press)));
var markEl = (m, t) => div().w(14).flex_none().text_color(colorOf(t, m?.tone ?? null)).child(m?.text ?? "");
function rowEl(r, t, press, select) {
  const line = h_flex().gap(8).items_start().child(markEl(r.mark, t)).child(div().flex_1().min_w(0).text_color(r.isDim ? t.muted : t.foreground).when(!r.isSelected, (e) => e.truncate()).when(r.isSelected, (e) => e.font_semibold()).child(r.title)).when(r.age !== null, (e) => e.child(div().flex_none().text_size(11).text_color(t.dim).child(r.age ?? "")));
  const lines = [
    ...r.settled ? [{ text: r.settled.label, tone: r.settled.tone }] : [],
    ...r.feedback ? [r.feedback] : [],
    ...r.body
  ];
  return v_flex().id(`row ${r.id}`).px(8).py(6).ml(r.depth * 14).rounded(7).when(r.isSelected, (e) => e.bg(t.selected)).when(r.isSelectable && !r.isSelected, (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => select(r.id, cx))).child(line).children(lines.map((l) => div().pl(22).pt(2).text_size(12).whitespace_normal().text_color(colorOf(t, l.tone)).child(l.text))).when(r.buttons.length > 0, (e) => e.child(buttonsEl(r.buttons, t, press, 22)));
}
function statusEl(s, t, press) {
  const stall = s.stall ? [div().flex_none().text_color(colorOf(t, s.stall.tone)).child(`${STALL_GAP}${s.stall.text}`)] : [];
  return v_flex().px(8).py(4).ml(s.depth * 16).child(h_flex().gap(8).items_start().child(markEl(s.mark, t)).child(h_flex().flex_1().min_w(0).flex_wrap().child(div().when(s.isBold, (e) => e.font_semibold()).child(s.name)).children(stall))).children(s.under.map((l) => div().pl(22).text_size(12).text_color(t.muted).child(l))).when(s.buttons.length > 0, (e) => e.child(buttonsEl(s.buttons, t, press, 22)));
}
function blockEl(b, t, press, select) {
  if (b.kind === "row")
    return rowEl(b, t, press, select);
  if (b.kind === "status")
    return statusEl(b, t, press);
  if (b.kind === "heading")
    return h_flex().px(8).pt(12).pb(4).gap(6).items_center().when(b.mark !== null, (e) => e.child(div().text_color(colorOf(t, b.mark?.tone ?? null)).child(b.mark?.text ?? ""))).child(div().text_size(12).font_semibold().text_color(t.muted).child(b.text)).when(b.count !== null, (e) => e.child(div().text_size(11).text_color(t.blocked).child(String(b.count)))).child(div().flex_1()).children(b.buttons.map((x) => buttonEl(x, t, press)));
  if (b.kind === "fold" || b.kind === "more")
    return h_flex().id(`fold ${b.id}`).h(26).px(8).ml(b.depth * 14).gap(6).items_center().rounded(7).cursor_pointer().hover((s) => s.bg(t.hover)).accessibility_label(b.text).on_click((_e, cx) => press({ id: b.id, label: b.text, emphasis: "quiet", isOut: false, local: b.local }, cx)).when(b.kind === "fold", (e) => e.child(div().w(14).text_color(t.dim).child(b.kind === "fold" && b.isOpen ? "▾" : "▸"))).child(div().text_size(12).text_color(t.muted).child(b.text));
  if (b.kind === "note")
    return div().px(8).py(2).ml(b.depth * 16).whitespace_normal().text_color(b.isStrong ? t.foreground : colorOf(t, b.tone)).when(b.isStrong, (e) => e.font_semibold()).child(b.text);
  if (b.kind === "rule")
    return h_flex().px(8).py(6).gap(8).items_center().when(b.text !== null, (e) => e.child(div().text_size(11).text_color(t.dim).child(b.text ?? ""))).child(div().flex_1().h(1).bg(t.border));
  return div().h(8);
}
function bannerEl(b, t) {
  const color = b.tone === "error" ? t.ansi1 : b.tone === "warning" ? t.blocked : t.muted;
  return v_flex().px(14).py(8).border_b(1).border_color(t.border).bg(t.raised).text_size(12).child(div().font_semibold().text_color(color).child(b.lead)).when(b.body !== null, (e) => e.child(div().whitespace_normal().text_color(t.muted).child(b.body ?? "")));
}
function tabsEl(tabs, t, pick) {
  return h_flex().h(40).flex_none().px(8).gap(4).items_center().border_b(1).border_color(t.border).children(tabs.map((tab) => h_flex().id(`tab ${tab.id}`).h(28).px(10).gap(6).items_center().rounded(7).cursor_pointer().accessibility_label(tab.badge ? `${tab.label}, ${tab.badge}` : tab.label).when(tab.isSelected, (e) => e.bg(t.selected).font_semibold()).when(!tab.isSelected, (e) => e.text_color(t.muted).hover((s) => s.bg(t.hover))).on_click((_e, cx) => pick(tab.id, cx)).child(tab.label).when(tab.badge !== null, (e) => e.child(div().text_size(11).text_color(t.blocked).child(tab.badge ?? "")))));
}
function messageEl(m, t) {
  return v_flex().p(16).gap(4).child(div().font_semibold().text_color(m.isError ? t.ansi1 : t.foreground).child(m.title)).when(m.hint !== null, (e) => e.child(div().whitespace_normal().text_color(t.muted).child(m.hint ?? "")));
}
var toggled = (list, x) => list.includes(x) ? list.filter((y) => y !== x) : [...list, x];

class Inbox extends View {
  tab = null;
  last = null;
  followed = { is: "no-terminal" };
  sessionId = null;
  read = null;
  ui = freshUi("needsYou");
  shownSince = Date.now();
  isNextBuild = false;
  foldTimer = null;
  init(_props, cx) {
    cx.spawn(async (cx) => {
      this.isNextBuild = await readTextFile(`${appHome()}/mods/inbox/${NEXT_BUILD_MARK}`).catch(() => null) !== null;
      cx.notify();
    });
    cx.spawn(async (cx) => {
      for (;; ) {
        const changed = await watchFolder(sessionsFolder(appHome())).catch(() => null);
        if (changed === null)
          await cx.sleep(REREAD_MS);
        else if (this.sessionId && isSessionChange(changed, appHome(), this.sessionId))
          this.load(this.sessionId, cx);
      }
    });
    cx.timer.every(REREAD_MS, (cx) => this.sessionId && this.load(this.sessionId, cx));
    cx.timer.every(AGE_TICK_MS, (cx) => cx.notify());
  }
  load(sessionId, cx) {
    cx.spawn(async (cx) => {
      for (let n = 0;; n++) {
        const text = await readTextFile(sessionPath(appHome(), sessionId)).catch((e) => e);
        const read = typeof text === "string" || text === null ? readSession(text) : { is: "refused", reason: String(text) };
        if (read.is === "torn" && n < TORN_RETRIES) {
          await cx.sleep(TORN_RETRY_MS);
          continue;
        }
        if (this.sessionId === sessionId)
          this.read = read;
        cx.notify();
        return;
      }
    });
  }
  track(cx) {
    const own = panes().find((p) => p.pane === props()?.pane);
    this.tab ??= own?.tab ?? focused()?.tab ?? null;
    if (this.tab === null)
      return;
    this.followed = follow({ focused: focused(), panes: panes(), terminals: terminals() }, this.tab, this.last);
    if (this.followed.is !== "no-terminal")
      this.last = this.followed.terminal;
    const sessionId = this.followed.is === "session" ? this.followed.sessionId : null;
    if (sessionId === this.sessionId)
      return;
    this.sessionId = sessionId;
    this.read = null;
    this.ui = freshUi(this.ui.tab);
    this.shownSince = Date.now();
    if (sessionId)
      this.load(sessionId, cx);
  }
  press(b, cx) {
    const l = b.local;
    if (l === null)
      return;
    const ui = this.ui;
    if ("showOptions" in l)
      ui.optionsShown = toggled(ui.optionsShown, l.showOptions);
    else if ("closedFold" in l)
      ui.unfolded = toggled(ui.unfolded, l.closedFold);
    else if ("earlier" in l)
      ui.closedAll = [...ui.closedAll, l.earlier];
    else
      ui.statusUnfolded = toggled(ui.statusUnfolded, l.toggleFold);
    cx.notify();
  }
  render(cx) {
    this.track(cx);
    const t = theme();
    const now = Date.now();
    const screen = screenOf(this.followed, this.read, this.ui, {
      now,
      shownSince: this.shownSince,
      isNextBuild: this.isNextBuild
    });
    const press = (b, cx) => this.press(b, cx);
    const select = (id, cx) => {
      this.ui.selected = id;
      cx.notify();
    };
    const pick = (tab, cx) => {
      this.ui = { ...this.ui, tab, selected: null };
      cx.notify();
    };
    this.foldTimer?.cancel();
    const foldAt = screen.is === "inbox" ? screen.foldAt : null;
    this.foldTimer = foldAt === null ? null : cx.timer.after(Math.max(0, foldAt - now), (cx) => cx.notify());
    const header = h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border).child(div().font_semibold().child("Inbox")).when(screen.is === "inbox", (e) => e.child(div().text_size(12).text_color(t.muted).child(screen.is === "inbox" ? screen.agent : ""))).child(div().flex_1()).when(screen.is === "inbox" && screen.status !== null, (e) => e.child(div().text_size(11).text_color(t.dim).child(screen.is === "inbox" ? screen.status ?? "" : "")));
    const root = v_flex().id("inbox").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13).child(header);
    if (screen.is === "message")
      return root.child(messageEl(screen.message, t));
    return root.child(tabsEl(screen.tabs, t, pick)).children(screen.banners.map((b) => bannerEl(b, t))).child(div().flex_1().min_h(0).relative().child(v_flex().id("inbox-list").absolute().inset_0().overflow_y_scroll().p(6).children(screen.blocks.map((b) => blockEl(b, t, press, select)))).child(Scrollbar.vertical("inbox-list").absolute().inset_0()));
  }
}
export {
  Inbox as default
};
