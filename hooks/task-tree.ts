import type { SessionStatus, TaskHistoryEvent, TaskLinks, TaskNode, TaskProgressSegments, TaskTree } from '../types'

export const TASK_HISTORY_LIMIT = 100
export const TASK_NOTES_LIMIT = 40
export const TASK_NOTE_LENGTH = 2000
export const TASK_HISTORY_DETAIL_LENGTH = 2000
export const TASK_NODE_LIMIT = 200
export const TASK_DEPTH_LIMIT = 8
export const TASK_TITLE_LENGTH = 100
export const TASK_WEIGHT_MIN = 0.1
export const TASK_WEIGHT_MAX = 100
export const TASK_AGENT_NAME_LENGTH = 32
export const TASK_MACHINE_ALIAS_LENGTH = 100
const TASK_HISTORY_SOURCE_LENGTH = 100

type TaskLinkProblem = 'invalid-pr' | 'invalid-issue' | 'invalid-owner'

type TaskTreeError =
  'duplicate-id' | 'unknown-task' | 'unknown-parent' | 'cycle' | 'limit' | 'invalid-weight' | TaskLinkProblem

type TaskLinkInputResult = { ok: true; provided: boolean; links?: TaskLinks } | { ok: false; reason: TaskLinkProblem }

type TaskTreeResult = { ok: true; tree: TaskTree } | { ok: false; reason: TaskTreeError }

const failed = (reason: TaskTreeError): TaskTreeResult => ({ ok: false, reason })
const succeeded = (tree: TaskTree): TaskTreeResult => ({ ok: true, tree })

function hasTask(tree: TaskTree, id: string): boolean {
  return tree.some(task => task.id === id)
}

function boundedHistory(history: TaskHistoryEvent[], event: TaskHistoryEvent): TaskHistoryEvent[] {
  return [...history, event].slice(-TASK_HISTORY_LIMIT)
}

function eventIsValid(event: TaskHistoryEvent): boolean {
  return (
    Number.isFinite(event.at) &&
    event.source.length > 0 &&
    event.source.length <= TASK_HISTORY_SOURCE_LENGTH &&
    (event.detail === undefined || event.detail.length <= TASK_HISTORY_DETAIL_LENGTH)
  )
}

function notesAreValid(notes: string[]): boolean {
  return notes.length <= TASK_NOTES_LIMIT && notes.every(note => note.length <= TASK_NOTE_LENGTH)
}

function notesOf(notes: string[]): string[] {
  return notes.slice(0, TASK_NOTES_LIMIT).map(note => note.slice(0, TASK_NOTE_LENGTH))
}

function hasValidWeight(weight: number): boolean {
  return Number.isFinite(weight) && weight >= TASK_WEIGHT_MIN && weight <= TASK_WEIGHT_MAX
}

function validGitHubLink(value: string, kind: 'pull' | 'issue'): boolean {
  const match =
    /^https:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})?\/([A-Za-z0-9_.-]{1,100})\/(pull|issues)\/[1-9]\d*$/.exec(
      value,
    )
  return Boolean(match && match[1] !== '.' && match[1] !== '..' && match[2] === (kind === 'pull' ? 'pull' : 'issues'))
}

function validAgentName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(value.trim())
}

function validMachineAlias(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= TASK_MACHINE_ALIAS_LENGTH
}

function linksProblem(links: TaskLinks): TaskLinkProblem | null {
  if (links.pr !== undefined && (typeof links.pr !== 'string' || !validGitHubLink(links.pr, 'pull')))
    return 'invalid-pr'
  if (links.issue !== undefined && (typeof links.issue !== 'string' || !validGitHubLink(links.issue, 'issue')))
    return 'invalid-issue'
  if (
    links.owner !== undefined &&
    (!links.owner || !validAgentName(links.owner.agent) || !validMachineAlias(links.owner.machine))
  )
    return 'invalid-owner'
  return null
}

/** Reads the task links supplied by the tool, preserving omitted fields and allowing null to clear a link. */
export function taskLinksFromInput(input: Record<string, unknown>, previous?: TaskLinks): TaskLinkInputResult {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key)
  const provided = ['pr', 'issue', 'owner_agent', 'owner_machine'].some(has)
  if (!provided) return { ok: true, provided: false }

  const links: TaskLinks = { ...previous }
  for (const kind of ['pr', 'issue'] as const) {
    if (!has(kind)) continue
    const value = input[kind]
    if (value === null) {
      delete links[kind]
    } else if (typeof value !== 'string' || !validGitHubLink(value, kind === 'pr' ? 'pull' : 'issue')) {
      return { ok: false, reason: kind === 'pr' ? 'invalid-pr' : 'invalid-issue' }
    } else {
      links[kind] = value
    }
  }

  const hasAgent = has('owner_agent')
  const hasMachine = has('owner_machine')
  if (hasAgent || hasMachine) {
    const agent = input.owner_agent
    const machine = input.owner_machine
    if ((hasAgent && agent === undefined) || (hasMachine && machine === undefined))
      return { ok: false, reason: 'invalid-owner' }
    if (agent === null || machine === null) {
      if (
        (hasAgent && agent === null && hasMachine && machine !== null) ||
        (hasMachine && machine === null && hasAgent && agent !== null)
      )
        return { ok: false, reason: 'invalid-owner' }
      delete links.owner
    } else {
      const nextAgent = hasAgent ? agent : previous?.owner?.agent
      const nextMachine = hasMachine ? machine : previous?.owner?.machine
      if (!validAgentName(nextAgent) || !validMachineAlias(nextMachine)) return { ok: false, reason: 'invalid-owner' }
      links.owner = { agent: nextAgent.trim(), machine: nextMachine.trim() }
    }
  }

  const problem = linksProblem(links)
  return problem
    ? { ok: false, reason: problem }
    : { ok: true, provided: true, ...(Object.keys(links).length ? { links } : {}) }
}

export function taskLinkProblemText(problem: TaskLinkProblem): string {
  if (problem === 'invalid-pr')
    return 'pr must be a GitHub pull request URL like https://github.com/owner/repo/pull/123.'
  if (problem === 'invalid-issue')
    return 'issue must be a GitHub issue URL like https://github.com/owner/repo/issues/123.'
  return `owner_agent must match the Herdr agent-name pattern [a-z][a-z0-9_-]{0,31}; owner_machine must be a non-empty alias up to ${TASK_MACHINE_ALIAS_LENGTH} characters. Provide both when adding an owner; on update, one can change an existing owner. Pass null alone to clear the owner.`
}

/** Depth of a new node under `parentId`, counting roots as level one. */
function depthUnder(tree: TaskTree, parentId: string | null): number {
  let depth = 1
  let ancestor = parentId
  const seen = new Set<string>()
  while (ancestor !== null) {
    if (seen.has(ancestor)) return Infinity
    seen.add(ancestor)
    depth++
    ancestor = tree.find(node => node.id === ancestor)?.parentId ?? null
  }
  return depth
}

function subtreeHeight(tree: TaskTree, id: string, seen = new Set<string>()): number {
  if (seen.has(id)) return Infinity
  const path = new Set(seen).add(id)
  const children = tree.filter(node => node.parentId === id)
  return children.length === 0 ? 1 : 1 + Math.max(...children.map(child => subtreeHeight(tree, child.id, path)))
}

function validTitle(title: string): boolean {
  return title.trim().length > 0 && title.length <= TASK_TITLE_LENGTH
}

/** Adds a node without changing the input tree. The node id, parent and source are supplied by the caller. */
export function createTask(tree: TaskTree, node: TaskNode, source: string): TaskTreeResult {
  if (hasTask(tree, node.id)) return failed('duplicate-id')
  if (node.parentId !== null && !hasTask(tree, node.parentId)) return failed('unknown-parent')
  if (tree.length >= TASK_NODE_LIMIT || depthUnder(tree, node.parentId) > TASK_DEPTH_LIMIT) return failed('limit')
  if (!validTitle(node.title) || node.detail.length > TASK_HISTORY_DETAIL_LENGTH) return failed('limit')
  if (!hasValidWeight(node.weight)) return failed('invalid-weight')
  const linkProblem = node.links ? linksProblem(node.links) : null
  if (linkProblem) return failed(linkProblem)
  if (!notesAreValid(node.notes) || node.history.length > TASK_HISTORY_LIMIT || !node.history.every(eventIsValid)) {
    return failed('limit')
  }
  const event: TaskHistoryEvent = { at: node.createdAt, source, kind: 'created' }
  if (!eventIsValid(event)) return failed('limit')

  return succeeded([
    ...tree,
    {
      ...node,
      notes: [...node.notes],
      history: boundedHistory(node.history, event),
      ...(node.links
        ? { links: { ...node.links, ...(node.links.owner ? { owner: { ...node.links.owner } } : {}) } }
        : {}),
    },
  ])
}

/** Updates task facts and records the update time and source. */
export function updateTask(
  tree: TaskTree,
  id: string,
  changes: Partial<
    Pick<TaskNode, 'status' | 'weight' | 'title' | 'detail' | 'goalId' | 'streamId' | 'mergedIntoId'>
  > & {
    links?: TaskLinks | null
  },
  at: number,
  source: string,
): TaskTreeResult {
  const task = tree.find(node => node.id === id)
  if (!task) return failed('unknown-task')
  if (
    (changes.title !== undefined && !validTitle(changes.title)) ||
    (changes.detail?.length ?? 0) > TASK_HISTORY_DETAIL_LENGTH
  )
    return failed('limit')
  if (changes.weight !== undefined && !hasValidWeight(changes.weight)) return failed('invalid-weight')
  const linkProblem = changes.links ? linksProblem(changes.links) : null
  if (linkProblem) return failed(linkProblem)
  const event: TaskHistoryEvent = {
    at,
    source,
    kind: 'updated',
    ...(changes.links !== undefined ? { detail: 'links updated' } : {}),
  }
  if (!eventIsValid(event)) return failed('limit')

  return succeeded(
    tree.map(node => {
      if (node.id !== id) return node
      const { links, ...fields } = changes
      const updated = { ...node, ...fields, updatedAt: at, history: boundedHistory(node.history, event) }
      if (links === null) delete updated.links
      else if (links !== undefined) updated.links = { ...links, ...(links.owner ? { owner: { ...links.owner } } : {}) }
      if (updated.prMergedApplied && updated.links?.pr && updated.links.pr !== updated.prMergedApplied)
        delete updated.prMergedApplied
      return updated
    }),
  )
}

/** Moves a node under another node, refusing a missing parent or a cycle. */
export function moveTask(
  tree: TaskTree,
  id: string,
  parentId: string | null,
  at: number,
  source: string,
): TaskTreeResult {
  const task = tree.find(node => node.id === id)
  if (!task) return failed('unknown-task')
  if (parentId !== null && !hasTask(tree, parentId)) return failed('unknown-parent')
  if (parentId === id) return failed('cycle')

  let ancestor = parentId
  const visited = new Set<string>()
  while (ancestor !== null) {
    if (ancestor === id || visited.has(ancestor)) return failed('cycle')
    visited.add(ancestor)
    ancestor = tree.find(node => node.id === ancestor)?.parentId ?? null
  }
  if (depthUnder(tree, parentId) - 1 + subtreeHeight(tree, id) > TASK_DEPTH_LIMIT) return failed('limit')

  const event: TaskHistoryEvent = { at, source, kind: 'moved' }
  if (!eventIsValid(event)) return failed('limit')

  return succeeded(
    tree.map(node =>
      node.id === id ? { ...node, parentId, updatedAt: at, history: boundedHistory(node.history, event) } : node,
    ),
  )
}

/** Marks a task done and records when and where it was completed. */
export function completeTask(tree: TaskTree, id: string, at: number, source: string, detail?: string): TaskTreeResult {
  const task = tree.find(node => node.id === id)
  if (!task) return failed('unknown-task')
  const event: TaskHistoryEvent = { at, source, kind: 'completed', ...(detail === undefined ? {} : { detail }) }
  if (!eventIsValid(event)) return failed('limit')

  return succeeded(
    tree.map(node =>
      node.id === id ? { ...node, status: 'done', updatedAt: at, history: boundedHistory(node.history, event) } : node,
    ),
  )
}

/** Adds a bounded note and records it in the task history. */
export function addTaskNote(tree: TaskTree, id: string, note: string, at: number, source: string): TaskTreeResult {
  const task = tree.find(node => node.id === id)
  if (!task) return failed('unknown-task')
  if (task.notes.length >= TASK_NOTES_LIMIT || note.length > TASK_NOTE_LENGTH) return failed('limit')
  const event: TaskHistoryEvent = { at, source, kind: 'note', detail: note }
  if (!eventIsValid(event)) return failed('limit')

  return succeeded(
    tree.map(node =>
      node.id === id
        ? { ...node, notes: [...node.notes, note], updatedAt: at, history: boundedHistory(node.history, event) }
        : node,
    ),
  )
}

/** Appends a bounded fact while retaining only the newest history events. */
export function appendTaskHistory(tree: TaskTree, id: string, event: TaskHistoryEvent): TaskTreeResult {
  const task = tree.find(node => node.id === id)
  if (!task) return failed('unknown-task')
  if (!eventIsValid(event)) return failed('limit')

  return succeeded(
    tree.map(node =>
      node.id === id
        ? { ...node, history: boundedHistory(node.history, event), updatedAt: Math.max(node.updatedAt, event.at) }
        : node,
    ),
  )
}

export function taskRootGroups(tree: TaskTree): { id: string; roots: TaskNode[] }[] {
  const groups = new Map<string, TaskNode[]>()
  for (const task of tree.filter(task => task.parentId === null)) {
    const key = task.streamId ? `stream:${task.streamId}` : `task:${task.id}`
    const roots = groups.get(key)
    if (roots) roots.push(task)
    else groups.set(key, [task])
  }
  return [...groups.values()].map(roots => ({ id: roots[0]!.id, roots }))
}

export function weightedTaskProgress(tree: TaskTree, rootIds?: string | string[]): number {
  const children = new Map<string | null, TaskNode[]>()
  for (const task of tree) children.set(task.parentId, [...(children.get(task.parentId) ?? []), task])
  const progress = (task: TaskNode): number => {
    if (task.status === 'done') return 1
    if (task.status === 'dropped') return 0
    return weightedAverage((children.get(task.id) ?? []).map(child => [progress(child), child.weight]))
  }

  // prettier-ignore
  const roots = rootIds === undefined ? (children.get(null) ?? []) : tree.filter(task => Array.isArray(rootIds) ? rootIds.includes(task.id) : task.id === rootIds)
  return weightedAverage(roots.map(task => [progress(task), task.weight]))
}

function weightedAverage(values: [number, number][]): number {
  const total = values.reduce((sum, [, weight]) => sum + weight, 0)
  return total ? values.reduce((sum, [value, weight]) => sum + value * weight, 0) / total : 0
}

/** Shares each root's weight across its active children and reports the work in each task state. */
export function weightedTaskProgressSegments(
  tree: TaskTree,
  stalledTasks: ReadonlySet<string> = new Set(),
  rootId?: string,
): TaskProgressSegments {
  const children = new Map<string | null, TaskNode[]>()
  for (const task of tree) children.set(task.parentId, [...(children.get(task.parentId) ?? []), task])

  const segments: TaskProgressSegments = { total: 0, done: 0, working: 0, stalled: 0, waiting: 0, queued: 0 }
  const add = (task: TaskNode, weight: number, path: ReadonlySet<string>) => {
    if (task.status === 'dropped' || path.has(task.id)) return
    if (task.status === 'done') {
      segments.total += weight
      segments.done += weight
      return
    }
    const descendants = children.get(task.id) ?? []
    const active = descendants.filter(child => child.status !== 'dropped')
    if (active.length > 0) {
      const total = active.reduce((sum, child) => sum + child.weight, 0)
      const nextPath = new Set(path).add(task.id)
      for (const child of active) add(child, (weight * child.weight) / total, nextPath)
      return
    }
    segments.total += weight
    if (task.status === 'working') segments[stalledTasks.has(task.id) ? 'stalled' : 'working'] += weight
    else if (task.status === 'waits-on-other') segments.waiting += weight
    else segments.queued += weight
  }

  for (const root of children.get(null) ?? [])
    if (rootId === undefined || root.id === rootId) add(root, root.weight, new Set())

  return segments
}

/** Converts the current Status work rows once, retaining source order and their explicit goal links. */
export function taskTreeFromStatus(status: SessionStatus | null): TaskTree {
  if (!status) return []
  const goalId = status.goal && !status.goal.isAwaitingMilestones ? `goal-${status.goal.setAt}` : undefined
  const milestones = status.milestones.map(milestone => {
    const node: TaskNode = {
      id: milestone.id,
      parentId: null,
      status: milestone.status,
      weight: 1,
      title: milestone.name,
      detail: milestone.text,
      notes: notesOf(milestone.was ? [milestone.was] : []),
      createdAt: milestone.changedAt,
      updatedAt: milestone.closedAt ?? milestone.changedAt,
      history: [{ at: milestone.changedAt, source: 'status', kind: 'imported' }],
      ...(goalId ? { goalId } : {}),
    }
    if (milestone.closedAt !== null) {
      node.history = [
        ...node.history,
        {
          at: milestone.closedAt,
          source: 'status',
          kind: milestone.status === 'done' ? 'completed' : 'updated',
          detail: milestone.status,
        },
      ]
    }
    return node
  })
  const milestoneIds = new Set(milestones.map(node => node.id))
  const subjectIds = new Set(status.subjects.map(subject => subject.id))
  const subjects = status.subjects.map(subject => {
    const served = status.serves[subject.id]
    const milestoneId = typeof served === 'string' && served !== 'none' && milestoneIds.has(served) ? served : null
    const mergedIntoId = subject.into && subjectIds.has(subject.into) ? subject.into : undefined
    const parentId = milestoneId
    const notes = notesOf([subject.was, subject.merged].filter((note): note is string => note !== null))
    const node: TaskNode = {
      id: subject.id,
      parentId,
      status: subject.status,
      weight: 1,
      title: subject.name,
      detail: subject.text,
      notes,
      createdAt: subject.createdAt,
      updatedAt: subject.closedAt ?? subject.changedAt,
      history: [
        { at: subject.createdAt, source: 'status', kind: 'created' },
        { at: subject.changedAt, source: 'status', kind: 'imported' },
      ],
      ...(goalId && milestoneId ? { goalId } : {}),
      ...(mergedIntoId ? { mergedIntoId } : {}),
    }
    if (subject.closedAt !== null) {
      node.history = [
        ...node.history,
        {
          at: subject.closedAt,
          source: 'status',
          kind: subject.status === 'done' ? 'completed' : 'updated',
          detail: subject.status,
        },
      ]
    }
    return node
  })

  return [...milestones, ...subjects]
}
