/** Where a subject of the session's work stands. `done` and `dropped` close it. */
export type SubjectStatus = 'working' | 'queued' | 'waits-on-other' | 'done' | 'dropped'

/** One piece of the session's work that the person would name: a feature, a fix, a release or a stream. */
export type Subject = {
  id: string
  /** The handle the person would use, at most a few words. */
  name: string
  status: SubjectStatus
  /** Where it stands, in a few words. */
  text: string
  /** The plan a reversal replaced, shown until the person looks. */
  was: string | null
  /** The names of the subjects dropped into this one since the person last looked, shown until they look. */
  merged: string | null
  createdAt: number
  /** When its status or where it stands last changed. Code sets it; the model never writes a time. */
  changedAt: number
  closedAt: number | null
  /** The subject a DROP moved this one's work into. A subject with one never shows. */
  into: string | null
}

/** What kind of work runs apart from the session's own turn. */
export type ChildKind = 'subagent' | 'background' | 'workflow' | 'delegate'

/** Work that runs apart from the turn. Code sets every field from the host's events except `subjectId`, which the Status call links. */
export type Child = {
  id: string
  /** The host's handle for it: a tool call id, a task id or a delegate's Herdr name. */
  ref: string
  kind: ChildKind
  name: string
  subjectId: string | null
  startedAt: number
  endedAt: number | null
  /** When it last did anything. Null when the host reports no activity for its kind. */
  lastActivityAt: number | null
  /**
   * What a delegate does: `working` once this session prompted it or Herdr showed it working, `blocked` while Herdr
   * shows it at a question or an approval, and `finished` once Herdr shows it ready after it worked. Null for other
   * kinds, and for a delegate nothing has shown working yet.
   */
  delegateState: DelegateState | null
}

/** The top of the Status page: what the session is focused on now. */
export type StatusHead = {
  /** A short name for the focus, like a subject's name. */
  title: string
  /** One line on what the session is doing about it. Empty until the Status call writes one. */
  description: string
}

export type DelegateState = 'working' | 'blocked' | 'finished'

/** The outcome the person set for the session's work. Only a press sets or changes it. */
export type StatusGoal = {
  text: string
  setAt: number
  /** When every milestone was first done together. Code sets it, and the goal stays until the person replaces it. */
  metAt: number | null
  /** The goal this one replaced, shown until the person looks. */
  was: string | null
  /** Whether the milestones still belong to an earlier goal, until a Status call after this goal was set has written. */
  isAwaitingMilestones: boolean
}

/** A goal the Status call proposed from the person's own words, waiting for the person to use it, edit it or decline it. */
export type ProposedGoal = {
  text: string
  milestones: { name: string; status: SubjectStatus }[]
  at: number
}

/** An outcome the goal needs. The Status call writes and moves it by id, as it does a subject. */
export type Milestone = {
  id: string
  name: string
  status: SubjectStatus
  /** Where it stands, in a few words. */
  text: string
  /** The plan a change replaced, shown until the person looks. */
  was: string | null
  changedAt: number
  closedAt: number | null
}

/** What a subject serves: one milestone by its id, or `none` for work the goal does not need. */
export type Serves = string | 'none'

/** The Status tab's list. The Status call changes it by id; code keeps the order and every time. */
export type SessionStatus = {
  /** Null until the Status call writes it. */
  head: StatusHead | null
  subjects: Subject[]
  children: Child[]
  /** The subject or milestone each ask holds up, by the ask's item id, as the Status call linked them. */
  askSubjects: Record<string, string>
  nextId: number
  nextChildId: number
  goal: StatusGoal | null
  proposedGoal: ProposedGoal | null
  /** The name keys of goals the person declined, newest last, so the call does not propose them again. */
  declinedGoals: string[]
  milestones: Milestone[]
  nextMilestoneId: number
  /** What each subject serves, by subject id, as the Status call linked them. A subject with no entry is not linked yet. */
  serves: Record<string, Serves>

  /** When the person last looked: the last time a look ended. Null before the first look. */
  lastLookAt: number | null
  /** The look in progress, while the Status tab is shown. Null otherwise. */
  look: { startedAt: number } | null
}

/** The folder a session started in, and its branch when the host last read it. */
export type Place = { folder: string; branch: string | null }
