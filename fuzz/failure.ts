/** A rule a case broke: where, when, after which event, and what was seen. */
export type Failure = {
  look: string
  rule: string
  /** Milliseconds since the case began. */
  at: number
  /** The index of the event that ran last, or the count of events once they all ran. */
  after: number
  detail: string
  /** What the look drew there: lines, or a frame's texts and boxes. */
  seen?: unknown
}
