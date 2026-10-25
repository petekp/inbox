import * as launch from './launch/timeline'
import * as omp from './omp/timeline'

/** Each video's timeline module, by the video's id. Each exports `VIDEO`, its cuts, and `timeline(cut)`, its beats. */
export const TIMELINES = { launch, omp }

export const VIDEOS = Object.values(TIMELINES).map(t => t.VIDEO)
