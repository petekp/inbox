import type { ComponentType } from 'react'
import { Composition } from 'remotion'

import { Video as Launch } from './launch/Video'
import { Video as Omp } from './omp/Video'
import { VIDEOS } from './videos'

/** Each video's component, which draws one of its cuts by the cut's id. */
const COMPONENTS: Record<string, ComponentType<{ cut: string }>> = { launch: Launch, omp: Omp }

export function Root() {
  return (
    <>
      {VIDEOS.flatMap(video =>
        video.cuts.map(cut => (
          <Composition
            key={cut.id}
            id={cut.id}
            component={COMPONENTS[video.id]!}
            durationInFrames={cut.frames}
            fps={cut.fps}
            width={cut.width}
            height={cut.height}
            defaultProps={{ cut: cut.id }}
          />
        )),
      )}
    </>
  )
}
