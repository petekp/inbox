import { useEffect, useState } from 'react'
import { continueRender, delayRender, staticFile } from 'remotion'

/** Geist, a variable font, for the captions, labels and end card, and Geist Mono for the end card's word. */
export const SANS = 'Geist, sans-serif'
export const GEIST_MONO = '"Geist Mono", monospace'

let loaded: Promise<unknown> | undefined
function loadFonts() {
  loaded ??= Promise.all(
    [
      new FontFace('Geist', `url(${staticFile('fonts/Geist.woff2')})`, { weight: '100 900' }),
      new FontFace('Geist Mono', `url(${staticFile('fonts/GeistMono-600.woff2')})`, { weight: '600' }),
    ].map(f => f.load().then(font => (document.fonts as FontFaceSet & { add: (font: FontFace) => void }).add(font))),
  )
  return loaded
}

/** Holds the render until the fonts have loaded, and says whether they have. */
export function useFonts(): boolean {
  const [handle] = useState(() => delayRender('Loading fonts'))
  const [isReady, setReady] = useState(false)
  useEffect(() => {
    void loadFonts().then(() => {
      setReady(true)
      continueRender(handle)
    })
  }, [handle])
  return isReady
}
