import * as launch from './launch/timeline'

/** Each video's timeline module, by the video's id. Each exports `VIDEO`, its cuts, and `timeline(cut)`, its beats. */
export const TIMELINES = { launch }

export const VIDEOS = Object.values(TIMELINES).map(t => t.VIDEO)
