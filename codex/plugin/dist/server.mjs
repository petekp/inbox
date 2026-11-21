// Built by codex/build.mjs from codex/src and core/. Do not edit.

// src/companion-listener.ts
import { createHash } from "node:crypto";
import net from "node:net";
import { chmod, lstat, mkdir, readFile, unlink, realpath } from "node:fs/promises";
import { join } from "node:path";

// ../core/domain/status-limits.ts
var GOAL_LEFT_MS = 30 * 6e4;
var IDLE_AFTER_MS = 24 * 60 * 6e4;
var CHILD_KEPT_MS = 24 * 60 * 6e4;
var OPEN_STATUSES = ["working", "queued", "waits-on-other"];
var STATUSES = [...OPEN_STATUSES, "done", "dropped"];
var SUFFIXES = ["ing", "ed", "es", "s"];
function stem(word) {
  if (/\d/.test(word)) return word;
  const suffix = SUFFIXES.find((s) => word.endsWith(s) && word.length - s.length >= 3) ?? "";
  const cut = word.slice(0, word.length - suffix.length);
  const base = cut.length > 3 && cut.endsWith("e") ? cut.slice(0, -1) : cut;
  return base.replace(/([b-df-hj-np-tv-z])\1$/, "$1");
}

// ../core/domain/ask-match.ts
var SYNONYMS = [
  ["vanish", "disappear"],
  ["remove", "delete"],
  ["folder", "directory", "directories"],
  ["config", "configuration"]
];
var MEANING = new Map(SYNONYMS.flatMap((group) => group.map((w) => [stem(w), stem(group[0])])));

// ../core/domain/ask-subject.ts
var EMPTY_WORDS = new Set(
  `a about above after again ahead all already also an and any anything are as at back be been before being below both
but by can could did do does doing done each either else every everything first for from get go going had has have
here how i if in into is it its just last later lets let me more my need next no not now of ok okay on once one ones
only or other others our out over own rest same should so some something soon still such sure than that the their
them then there these they this those to today too until up us want was way we were what when where whether which who why
will with would yes yet you your
approve proceed continue start stop wait hold skip leave keep drop cancel finish resume restart retry redo
run merge push pull commit deploy ship publish open close post send file fix build make try test check
review mark ready use take add remove delete update change apply land rebase install copy move create write draft
edit set show see look pick choose decide answer reply tell say ask like prefer handle follow work
pr prs branch thing step plan design option variant version note rule issue item task question proposal idea
code problem stuff part green current new old latest previous mentioned proposed suggested remaining pending`.split(
    /\s+/
  )
);

// ../core/domain/ledger-close.ts
var OVERTAKEN_OUTCOMES = "no longer applies|replaced|superseded|moot";
var OVERTAKEN = new RegExp(`^(?:closed by \\w+: )?(?:${OVERTAKEN_OUTCOMES})`, "i");

// ../core/domain/text.ts
var segmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter(void 0, { granularity: "grapheme" }) : null;
var LEADING_JAMO = String.raw`[\u1100-\u115F\uA960-\uA97C]`;
var VOWEL_JAMO = String.raw`[\u1160-\u11A7\uD7B0-\uD7C6]`;
var TRAILING_JAMO = String.raw`[\u11A8-\u11FF\uD7CB-\uD7FB]`;
var SYLLABLE = String.raw`[\uAC00-\uD7A3]`;
var OPEN_SYLLABLE = `[${Array.from({ length: 19 * 21 }, (_, i) => String.fromCharCode(44032 + i * 28)).join("")}]`;
var HANGUL = `(?:${LEADING_JAMO}*(?:${VOWEL_JAMO}+|${OPEN_SYLLABLE}${VOWEL_JAMO}*|${SYLLABLE})${TRAILING_JAMO}*|${LEADING_JAMO}+|${TRAILING_JAMO}+)`;
var FLAG = String.raw`[\u{1F1E6}-\u{1F1FF}]{2}`;
var EXTEND = String.raw`\p{M}\p{Emoji_Modifier}\u{E0020}-\u{E007F}‌ﾞﾟำຳ`;
var GRAPHEME = new RegExp(
  String.raw`[${EXTEND}\u200D]+|(?:${FLAG}|${HANGUL}|[^${EXTEND}\u200D])(?:[${EXTEND}]|\u200D[^${EXTEND}\u200D]?)*`,
  "gu"
);
var EMOJI = new RegExp("\\p{Emoji_Presentation}|\\uFE0F", "u");

// ../core/domain/ledger-update.ts
var NOT_AN_ANSWER = new RegExp(`^\\s*(?:done\\s*:|(?:${OVERTAKEN_OUTCOMES}|no longer relevant|dealt with)\\b)`, "i");

// ../core/domain/ledger.ts
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

// ../core/domain/inbox-text.ts
var TOLD_NOTHING = { inbox: null, closed: [] };

// ../core/domain/gh.ts
var GH_TIMEOUT_MS = 2e4;
var UNSTARTABLE_CODE = -1;
var TIMED_OUT_CODE = -2;

// ../core/domain/pr-fetch.ts
var CLOSED_PR_REFRESH_MS = 60 * 6e4;
var LIMIT_RETRY_MS = 5 * 6e4;
var GH_TIMED_OUT_TEXT = `gh did not answer within ${GH_TIMEOUT_MS / 1e3} seconds`;

// ../core/view/tabs.ts
var TAB_NAMES = [
  { id: "overview", label: "Status", symbol: "\u{1F9ED}" },
  { id: "needsYou", label: "Asks", symbol: "\u{1F64B}" },
  { id: "findings", label: "Finds", symbol: "\u{1F50D}" },
  { id: "prs", label: "PRs", symbol: "\u{1F500}" }
];
var numbered = (tabs) => tabs.map((t, n) => ({ ...t, hotkey: String(n + 1) }));
var SHOWN_TABS = numbered(TAB_NAMES);
function isRowTab(tab) {
  return tab !== "overview";
}
var ROW_TABS = TAB_NAMES.filter((t) => isRowTab(t.id));

// ../core/view/help.ts
var FINDING_GROUPS = {
  issue: { title: "Issues", mark: "\u25B2", tone: "issue" },
  opportunity: { title: "Opportunities", mark: "\u2726", tone: "opportunity" }
};
var NEEDS_YOU_MARKS = {
  question: { mark: "?", tone: "needsYou" },
  task: { mark: "\u2611", tone: "tasks" }
};
var SUBJECT_MARKS = {
  working: { mark: "\u25CF", tone: "working" },
  queued: { mark: "\u25CB", tone: null },
  "waits-on-other": { mark: "\u25CC", tone: null },
  done: { mark: "\u2713", tone: "done" },
  dropped: { mark: "\u2717", tone: null }
};
var HELD_MARK = { mark: "\u25C6", tone: "needsYou" };
var RUNNING_FRAMES = ["\u25CF", "\u25C9", "\u25CE", "\u25C9"];
var RUNNING_MARK = RUNNING_FRAMES[0];
var IDLE_MARK = { mark: "\u25D0", tone: "working" };
var CLOSED_MARKS = {
  handled: SUBJECT_MARKS.done.mark,
  dismissed: "\u2715",
  lapsed: SUBJECT_MARKS.dropped.mark
};
var PR_MARKS = {
  waiting: { text: HELD_MARK.mark, tone: "needsYou" },
  sent: { text: SUBJECT_MARKS.done.mark, tone: "done" },
  failing: { text: FINDING_GROUPS.issue.mark, tone: "error" },
  cancelled: { text: "\u2298", tone: null }
};
var stoppedWords = (what) => `Stopped before it finished: ${what}`;
var MARK_LEGEND = [
  {
    mark: RUNNING_MARK,
    tone: "working",
    isRunning: true,
    words: "Working. It moves while the work runs or your message is on its way."
  },
  { mark: IDLE_MARK.mark, tone: IDLE_MARK.tone, isRunning: false, words: "Working, with nothing running right now" },
  { mark: SUBJECT_MARKS.queued.mark, tone: null, isRunning: false, words: "Queued: not started yet" },
  {
    mark: SUBJECT_MARKS["waits-on-other"].mark,
    tone: null,
    isRunning: false,
    words: "Waits on something other than you, such as a build or a review"
  },
  { mark: HELD_MARK.mark, tone: HELD_MARK.tone, isRunning: false, words: "Waits on you" },
  {
    mark: NEEDS_YOU_MARKS.question.mark,
    tone: NEEDS_YOU_MARKS.question.tone,
    isRunning: false,
    words: "A question the agent asked you"
  },
  {
    mark: NEEDS_YOU_MARKS.task.mark,
    tone: NEEDS_YOU_MARKS.task.tone,
    isRunning: false,
    words: "A step only you can do"
  },
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

// ../core/view/status-page-parts.ts
var CHILD_MARK = SUBJECT_MARKS.working;
var STALL_GAP = " \xB7 ";
var DAY_MS = 24 * 60 * 6e4;

// ../core/view/status-folds.ts
var COUNTS_GAP = STALL_GAP.replace(" ", "\xA0");

// ../core/view/timing.ts
var COMPARE_LIMIT_MS = 30 * 6e4;
function listInputOf(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  const { since, last } = raw;
  const isTime2 = (x) => typeof x === "number" && Number.isFinite(x);
  return isTime2(since) && isTime2(last) ? { since, last } : null;
}
var RUNNING_FRAME_MS = 300;
var RUNNING_PULSE_MS = RUNNING_FRAMES.length * RUNNING_FRAME_MS;

// ../core/view/rows.ts
var NEEDS_YOU_GROUPS = [
  { kind: "question", title: "Questions", list: "questions", mark: NEEDS_YOU_MARKS.question },
  { kind: "task", title: "Tasks", list: "tasks", mark: NEEDS_YOU_MARKS.task }
];
var ASK_MARK = { text: HELD_MARK.mark, isRunning: false, tone: HELD_MARK.tone };

// ../core/view/session-files.ts
var NO_PRS = { views: {}, branchRef: null, isFetching: false };
var NO_FAILURE = { lastFailure: null, recoveredAt: null };
var NO_CALL_FAILURES = { ledger: NO_FAILURE, status: NO_FAILURE };
var NO_ANSWERS = { ledger: null, status: null };
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
    remoteCommandFloor: 0,
    commandWrite: null,
    heldRows: [],
    collapsed: {},
    shownSince: null,
    prViews: NO_PRS,
    stop: null,
    overviewFailure: null,
    callFailures: NO_CALL_FAILURES,
    lastAnswers: NO_ANSWERS,
    lastOverviewCallAt: null,
    overviewTurn: 0,
    hostTasks: [],
    dialogQuestions: [],
    toolFields: null
  };
}
var SESSION_FILE = /^[\w-]{1,100}\.json$/;
var isSessionFile = (name) => SESSION_FILE.test(name);

// ../core/view/session-presentation.ts
var SESSION_FIELDS = Object.keys(emptySession()).filter(
  (field) => field !== "remoteCommandFloor" && field !== "commandWrite" && field !== "lastAnswers"
);

// ../core/remote/herdr.ts
var STATUS_TOKEN = "inbox";
var STOP_TOKEN = "inbox-stop";
var FOCUS_TOKEN = "inbox-focus";
var COUNT_TOKENS = {
  needsYou: "inbox-needs-you",
  findings: "inbox-findings",
  prs: "inbox-prs"
};
var CLEARED_TOKENS = Object.fromEntries(
  [STATUS_TOKEN, STOP_TOKEN, FOCUS_TOKEN, ...Object.values(COUNT_TOKENS)].map((name) => [name, null])
);
function herdrAppHome(env) {
  const home = env.HOME?.startsWith("/") ? env.HOME : null;
  const named = env.HERDR_APP_HOME;
  return named ? named.startsWith("/") ? named : null : home && `${home}/.config/herdr-app`;
}
function herdrTarget(env) {
  const pane = env.HERDR_PANE_ID;
  if (pane) return { kind: "pane", pane };
  const terminal = env.HC_TERMINAL_ID;
  if (!terminal) return null;
  const home = env.HOME?.startsWith("/") ? env.HOME : null;
  const appHome = herdrAppHome(env);
  const installed = (name) => home ? [name, `${home}/.local/bin/${name}`] : [name];
  return { kind: "terminal", terminal, appHome, hc: installed("hc"), herdrApp: installed("herdr-app") };
}
var HERDR_FORMAT = 1;

// ../core/remote/herdr-press-file.ts
var PRESS_TARGETS = {
  answer: "id",
  type: "id",
  explain: "id",
  "show-explanation": "id",
  compare: "id",
  done: "id",
  dismiss: "id",
  address: "id",
  issue: "id",
  discuss: "id",
  undo: "id",
  discard: "id",
  step: "id",
  "remove-goal": "id",
  "restore-goal": "id",
  "take-goal": "id",
  "thread-address": "ref",
  "thread-draft": "ref",
  "thread-discuss": "ref",
  "thread-open": "ref",
  "pr-conflicts": "ref",
  "pr-address-all": "ref",
  "pr-merge": "ref",
  "pr-open": "ref",
  "pr-dismiss": "ref",
  "pr-undo": "ref",
  "check-fix": "ref",
  "check-rerun": "ref",
  log: "ref",
  "pr-rank-again": null,
  "pr-refresh": null,
  "pr-clear-finished": null
};
var isRecord = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
var isTimes = (x) => isRecord(x) && Object.values(x).every((at) => typeof at === "number");
function pressProblem(press) {
  if (!isRecord(press) || typeof press.action !== "string") return "press has no action";
  if (!Object.hasOwn(PRESS_TARGETS, press.action)) return `unknown action ${press.action}`;
  const target = PRESS_TARGETS[press.action];
  return target === null || typeof press[target] === "string" ? null : `${press.action} has no ${target}`;
}
function holdsProblem(holds) {
  if (!isRecord(holds)) return "no holds";
  if (!isTimes(holds.replies) || !isTimes(holds.discarded)) return "holds without replies or discarded times";
  return holds.shownSince === null || typeof holds.shownSince === "number" ? null : "holds without shownSince";
}
function resultProblem(result) {
  if (result === void 0) return null;
  return isRecord(result) && (result.error === null || typeof result.error === "string") ? null : "result without error";
}
var isTime = (x) => typeof x === "number" && Number.isFinite(x);
function lookProblem(look) {
  if (!isRecord(look) || !isTime(look.startedAt) || !isTime(look.endedAt)) return "look without its times";
  if (look.endedAt < look.startedAt) return "look ends before it starts";
  if (!isTime(look.drawnWrittenAt)) return "look without when its Status was written";
  return isTimes(look.shown) ? null : "look without shown rows";
}
function pressFile(text) {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not JSON" };
  }
  if (!isRecord(file)) return { ok: false, reason: "not an object" };
  if (file.format === 2 && file.kind === "viewer") {
    const ids = (value) => Array.isArray(value) && value.length <= 256 && value.every((id) => typeof id === "string" && /^[\w-]{1,100}$/.test(id));
    const integer = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
    const valid = typeof file.id === "string" && /^[\w-]{16,100}$/.test(file.id) && typeof file.session === "string" && /^[\w-]{1,100}$/.test(file.session) && isTime(file.issuedAt) && integer(file.generation) && integer(file.sequence) && typeof file.active === "boolean" && typeof file.listActive === "boolean" && (file.seenAt === void 0 || isTime(file.seenAt)) && (file.visibleForMs === void 0 || isTime(file.visibleForMs) && file.visibleForMs >= 0) && ["overview", "needsYou", "findings", "prs"].includes(String(file.tab)) && ids(file.replies) && ids(file.shownRows);
    return valid ? { ok: true, file } : { ok: false, reason: "invalid remote viewer" };
  }
  if (file.format === 2 && file.kind === "command") {
    const isGoalPress = isRecord(file.press) && file.press.id === "goal";
    const valid = typeof file.id === "string" && /^[a-z0-9]{1,12}-[a-zA-Z0-9_-]{16,100}$/.test(file.id) && typeof file.session === "string" && /^[\w-]{1,100}$/.test(file.session) && isTime(file.issuedAt) && Number.isSafeInteger(file.issuedAt) && file.issuedAt >= 0 && typeof file.expected === "string" && file.expected.length <= 16e3 && pressProblem(file.press) === null && isRecord(file.press) && typeof file.press.id === "string" && (isGoalPress || /^[if]\d{1,16}$/.test(file.press.id)) && (file.press.action === "type" ? typeof file.press.text === "string" && file.press.text.trim() !== "" && file.press.text.length <= 8e3 : file.press.action === "answer" ? !isGoalPress && typeof file.press.option === "string" && file.press.option.length <= 8e3 && file.press.option.trim() !== "" : (isGoalPress ? ["remove-goal", "restore-goal", "take-goal"] : ["done", "address", "undo", "dismiss", "discuss", "explain", "compare", "issue", "discard"]).includes(String(file.press.action)));
    return valid ? { ok: true, file } : { ok: false, reason: "invalid remote command" };
  }
  if (file.format !== HERDR_FORMAT) return { ok: false, reason: `unknown format ${String(file.format)}` };
  if (typeof file.id !== "string" || file.id === "") return { ok: false, reason: "no id" };
  if ("look" in file) {
    const reason2 = lookProblem(file.look);
    return reason2 ? { ok: false, reason: reason2 } : { ok: true, file };
  }
  if ("prsShown" in file) {
    return isRecord(file.prsShown) && isTime(file.prsShown.at) ? { ok: true, file } : { ok: false, reason: "prsShown without a time" };
  }
  if ("collapse" in file) {
    const c = file.collapse;
    const isCollapse = isRecord(c) && typeof c.row === "string" && typeof c.isCollapsed === "boolean" && isTime(c.at);
    return isCollapse ? { ok: true, file } : { ok: false, reason: "collapse without row or time" };
  }
  if (typeof file.pressedAt !== "number" || !Number.isFinite(file.pressedAt))
    return { ok: false, reason: "no pressedAt" };
  const reason = pressProblem(file.press) ?? holdsProblem(file.holds) ?? resultProblem(file.result);
  if (reason) return { ok: false, reason };
  const read = file;
  return { ok: true, file: { ...read, holds: { ...read.holds, listInput: listInputOf(read.holds.listInput) } } };
}

// src/companion-listener.ts
async function scope(dir2) {
  const path = join(dir2, "companion.json");
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 16384 || info.uid !== process.getuid?.() || (info.mode & 63) !== 0)
    throw new Error("The companion configuration must be a private file owned by this user.");
  const value = JSON.parse(await readFile(path, "utf8"));
  if (!value || typeof value !== "object" || !("enabled" in value) || value.enabled !== true || !("sessions" in value) || !Array.isArray(value.sessions) || value.sessions.length > 64)
    throw new Error("The companion connection is not enabled.");
  const sessions = [];
  for (const row of value.sessions) {
    if (!row || typeof row.id !== "string" || !isSessionFile(`${row.id}.json`) || typeof row.name !== "string" || row.name.length > 160)
      throw new Error("The companion session configuration is invalid.");
    sessions.push({ id: row.id, name: row.name });
  }
  return sessions;
}
function parse(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid companion request.");
  const v = value;
  if (v.version !== 1) throw new Error("Unsupported companion protocol.");
  const keys = Object.keys(v).sort().join(",");
  if (v.operation === "list" && keys === "operation,version") return { version: 1, operation: "list" };
  if (typeof v.session !== "string" || !isSessionFile(`${v.session}.json`))
    throw new Error("Invalid companion session.");
  if (v.operation === "view" && keys === "opened,operation,session,version" && typeof v.opened === "boolean")
    return { version: 1, operation: "view", session: v.session, opened: v.opened };
  if (v.operation === "apply" && keys === "file,operation,session,version") {
    const file = pressFile(JSON.stringify(v.file));
    if (file.ok && file.file.format === 2 && file.file.session === v.session)
      return { version: 1, operation: "apply", session: v.session, file: file.file };
  }
  throw new Error("Invalid companion operation.");
}
async function liveSocket(path) {
  return new Promise((resolve) => {
    const client = net.createConnection(path);
    const finish = (live) => {
      client.destroy();
      resolve(live);
    };
    client.once("connect", () => finish(true));
    client.once("error", () => finish(false));
    client.setTimeout(500, () => finish(true));
  });
}
async function startCompanion(dir2, handler, log) {
  try {
    await scope(dir2);
  } catch (error) {
    if (error.code !== "ENOENT")
      log(error instanceof Error ? error.message : "Companion configuration failed.");
    return async () => {
    };
  }
  const profile = createHash("sha256").update(await realpath(dir2)).digest("hex");
  const folder = join(dir2, "companion");
  await mkdir(folder, { mode: 448 }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
  const folderInfo = await lstat(folder);
  if (!folderInfo.isDirectory() || folderInfo.isSymbolicLink() || folderInfo.uid !== process.getuid?.() || (folderInfo.mode & 63) !== 0)
    throw new Error("The companion socket folder must be private.");
  const path = join(folder, "bridge.sock");
  if (Buffer.byteLength(path) > 103) throw new Error("The companion socket path is too long.");
  const existing = await lstat(path).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing) {
    if (!existing.isSocket() || existing.uid !== process.getuid?.() || await liveSocket(path)) return async () => {
    };
    const current2 = await lstat(path);
    if (current2.ino !== existing.ino) return async () => {
    };
    await unlink(path);
  }
  const clients = /* @__PURE__ */ new Set();
  let active = 0;
  const server = net.createServer((client) => {
    if (clients.size >= 8) {
      client.destroy();
      return;
    }
    clients.add(client);
    const deadline = setTimeout(() => client.destroy(), 9e4);
    deadline.unref();
    client.once("close", () => {
      clearTimeout(deadline);
      clients.delete(client);
    });
    client.on("error", () => {
    });
    client.setTimeout(9e4, () => client.destroy());
    let input = Buffer.alloc(0), started = false;
    client.on("data", (chunk) => {
      if (started) {
        client.destroy();
        return;
      }
      input = Buffer.concat([input, typeof chunk === "string" ? Buffer.from(chunk) : chunk]);
      if (input.length > 65536) {
        client.destroy();
        return;
      }
      const end = input.indexOf(10);
      if (end < 0) return;
      started = true;
      if (active >= 8) {
        client.destroy();
        return;
      }
      active++;
      void (async () => {
        try {
          if (input.subarray(end + 1).toString().trim() !== "")
            throw new Error("Use one request per connection.");
          const request = parse(JSON.parse(input.subarray(0, end).toString("utf8")));
          const sessions = await scope(dir2);
          if ("session" in request && !sessions.some((s) => s.id === request.session))
            throw new Error("This chat is not shared with the companion.");
          const result = await (await handler())(request, sessions);
          const response = JSON.stringify({ ok: true, profile, result });
          if (Buffer.byteLength(response) > 4 * 1024 * 1024) throw new Error("The companion response is too large.");
          client.end(response + "\n");
        } catch (error) {
          client.end(
            JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Companion request failed." }) + "\n"
          );
        } finally {
          active--;
        }
      })();
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, resolve);
  });
  server.on("error", (error) => log(error.message));
  await chmod(path, 384);
  const owned = await lstat(path);
  return async () => {
    for (const client of clients) client.destroy();
    await new Promise((resolve) => server.close(() => resolve()));
    const current2 = await lstat(path).catch(() => null);
    if (current2?.ino === owned.ino) await unlink(path);
  };
}

// src/server-main.ts
import { readdir, stat as stat2 } from "node:fs/promises";
import { dirname, join as join4 } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

// src/data-dir.ts
import { readFile as readFile2 } from "node:fs/promises";
import { homedir } from "node:os";
import { join as join2 } from "node:path";
function dataDir(env, pluginRoot2) {
  const fromEnv = env.INBOX_DATA || env.PLUGIN_DATA;
  if (fromEnv) return fromEnv;
  const m = pluginRoot2.match(/^(.*)\/plugins\/cache\/([^/]+)\/([^/]+)\/[^/]+$/);
  if (m) return `${m[1]}/plugins/data/${m[3]}-${m[2]}`;
  return join2(homedir(), ".codex", "inbox-dev");
}
async function devBuild(dir2) {
  try {
    const d = JSON.parse(await readFile2(join2(dir2, "dev.json"), "utf8"));
    if (typeof d.pid !== "number") return null;
    process.kill(d.pid, 0);
    return d;
  } catch {
    return null;
  }
}

// src/detached-update.ts
import { spawn } from "node:child_process";
function detachedUpdate(dir2, env, script) {
  return (sessionId, mode) => {
    const child = spawn(process.execPath, [script, sessionId, ...mode ? [mode] : []], {
      detached: true,
      stdio: "ignore",
      env: { ...env, INBOX_DATA: dir2 }
    });
    child.unref();
  };
}

// src/herdr-log.ts
import { appendFile, mkdir as mkdir2, stat, writeFile } from "node:fs/promises";
import { join as join3 } from "node:path";
var HERDR_LOG_BYTES = 64 * 1024;
function herdrLog(dir2) {
  const path = join3(dir2, "herdr.log");
  return (text) => void (async () => {
    const size = await stat(path).then(
      (s) => s.size,
      () => 0
    );
    const line = `${(/* @__PURE__ */ new Date()).toISOString()} ${text}
`;
    await mkdir2(dir2, { recursive: true });
    await (size > HERDR_LOG_BYTES ? writeFile(path, line) : appendFile(path, line));
  })().catch(() => void 0);
}

// src/run.ts
import { execFile } from "node:child_process";
var run = (args, { cwd, timeoutMs, env, input }) => new Promise((resolve) => {
  const [file = "", ...rest] = args;
  try {
    const child = execFile(
      file,
      rest,
      { cwd, env: { ...process.env, ...env }, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, encoding: "utf8" },
      (err, stdout, stderr) => {
        const signal = err?.killed ? void 0 : err?.signal ?? void 0;
        const errorCode = typeof err?.code === "string" ? err.code : void 0;
        const error = errorCode && !stderr ? err.message : String(stderr);
        resolve({
          code: exitCodeOf(err),
          stdout: String(stdout),
          stderr: error,
          ...signal ? { signal } : {},
          ...errorCode ? { errorCode } : {}
        });
      }
    );
    child.stdin?.on("error", () => {
    });
    child.stdin?.end(input);
  } catch (err) {
    const errorCode = err.code;
    resolve({
      code: UNSTARTABLE_CODE,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
      ...typeof errorCode === "string" ? { errorCode } : {}
    });
  }
});
function exitCodeOf(err) {
  if (!err) return 0;
  if (err.killed) return TIMED_OUT_CODE;
  return typeof err.code === "number" ? err.code : UNSTARTABLE_CODE;
}

// src/shared-daemon.ts
var PS_TIMEOUT_MS = 5e3;
var INIT_PID = 1;
var MAX_ANCESTORS = 6;
var isSharedDaemon = (command) => /(^|\/)codex\s.*\bapp-server\b/.test(command) && /--managed-daemon\b|--listen[ =]unix:\/\//.test(command);
async function isUnderSharedDaemon(pid, run2) {
  let current2 = pid;
  for (let level = 0; level < MAX_ANCESTORS && current2 > INIT_PID; level++) {
    const r = await run2(["ps", "-o", "ppid=,command=", "-p", String(current2)], { cwd: "/", timeoutMs: PS_TIMEOUT_MS });
    const match = r.code === 0 ? /^\s*(\d+)\s+(.*)$/.exec(r.stdout.trim()) : null;
    if (!match) return false;
    const [, parent, command] = match;
    if (isSharedDaemon(command ?? "")) return true;
    current2 = Number(parent);
  }
  return false;
}
async function withoutSharedTerminal(env, run2, pid, log) {
  const where = env.HERDR_PANE_ID ?? env.HC_TERMINAL_ID;
  if (!where) return;
  if (!await isUnderSharedDaemon(pid, run2).catch(() => false)) return;
  log(
    `Herdr ${where} ignored: Codex runs this thread in a daemon shared by every Codex CLI, so ${where} is where the daemon started, not necessarily where this thread runs. The inbox reports to no terminal.`
  );
  delete env.HERDR_PANE_ID;
  delete env.HC_TERMINAL_ID;
}

// src/server-main.ts
var here = dirname(fileURLToPath(import.meta.url));
var pluginRoot = dirname(here);
var dir = dataDir(process.env, pluginRoot);
var BUNDLE = join4("dist", "server-handler.mjs");
await withoutSharedTerminal(process.env, run, process.ppid, herdrLog(dir));
var exists = (path) => stat2(path).then(
  () => true,
  () => false
);
var versionParts = (version) => version.split(".").map((n) => Number.parseInt(n, 10) || 0);
function compareVersions(a, b) {
  const [pa, pb] = [versionParts(a), versionParts(b)];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
async function installedBundle() {
  const own = join4(pluginRoot, BUNDLE);
  if (await exists(own)) return own;
  const versions = (await readdir(dirname(pluginRoot)).catch(() => [])).filter((name) => /^\d/.test(name));
  for (const version of versions.sort(compareVersions).reverse()) {
    const bundle = join4(dirname(pluginRoot), version, BUNDLE);
    if (await exists(bundle)) return bundle;
  }
  return null;
}
async function handlerPath() {
  const server = (await devBuild(dir))?.server;
  if (server && await exists(server)) return server;
  return installedBundle();
}
var current = null;
var lastLoaded = null;
var loadError = null;
var isPluginFolderGone = false;
function load(url, path) {
  const handle = import(url).then(
    (m) => m.createHandler(
      dir,
      () => loadError,
      () => isPluginFolderGone,
      detachedUpdate(dir, process.env, join4(here, "update.mjs"))
    )
  );
  handle.then(
    (h) => {
      lastLoaded = h;
      loadError = null;
    },
    (err) => {
      loadError = `${path}: ${err instanceof Error ? err.message : String(err)}`;
      process.stderr.write(`inbox: could not load ${loadError}
`);
    }
  );
  return handle;
}
async function currentHandler() {
  const path = await handlerPath();
  isPluginFolderGone = path === null;
  if (path === null) {
    if (lastLoaded) return lastLoaded;
    throw new Error(`no ${BUNDLE} in ${dirname(pluginRoot)}`);
  }
  const { mtimeMs } = await stat2(path).catch(() => ({ mtimeMs: -1 }));
  const key = `${pathToFileURL(path).href}?v=${mtimeMs}`;
  if (current?.key !== key) current = { key, handle: load(key, path) };
  const { handle } = current;
  try {
    return await handle;
  } catch (err) {
    if (lastLoaded) return lastLoaded;
    throw err;
  }
}
var reply = (r) => process.stdout.write(`${JSON.stringify(r)}
`);
var ready = Promise.resolve();
var companion = herdrTarget(process.env) ? Promise.resolve(async () => {
}) : startCompanion(dir, async () => (await currentHandler()).companion, herdrLog(dir)).catch((error) => {
  herdrLog(dir)(error instanceof Error ? error.message : "Companion could not start.");
  return async () => {
  };
});
process.stdin.once("end", () => {
  void companion.then((stop) => stop());
});
createInterface({ input: process.stdin, crlfDelay: Infinity }).on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  const handler = ready.then(currentHandler);
  ready = handler.catch(() => void 0);
  void handler.then(
    (handle) => handle(message).then((r) => {
      if (r) reply(r);
    }),
    (err) => {
      if (message.id === void 0) return;
      const why = err instanceof Error ? err.message : String(err);
      reply({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32603, message: `The inbox server could not load: ${why}` }
      });
    }
  );
});
