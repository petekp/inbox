/** One thing the person does in the Codex tab. `n` picks a target in drawn order, wrapping past the last. */
export type CodexEv =
  | { is: 'wait'; ms: number }
  | { is: 'key'; key: string }
  | { is: 'click'; on: 'row' | 'button' | 'tab'; n: number }
  | { is: 'type'; text: string }

/**
 * `freezeOn` names a rule: the page pauses its animations at that rule's first failure, for a capture. `cutOpacity` is
 * `CUT_OPACITY`: text at it or above that a box cuts counts as a cut.
 */
export type CodexSpec = { events: CodexEv[]; isReduced: boolean; restMs: number; cutOpacity: number; freezeOn?: string }

/** A rule a frame broke, found in the page. `at` is ms since the first event. */
export type PageFailure = { rule: string; at: number; after: number; detail: string }

export type PageRun = { failures: PageFailure[]; notes: string[]; frames: number; isFrozen?: boolean }

/**
 * Runs a case in the tab page `codex/scripts/tab-page.sh` serves, sampling every animation frame, and checks the frame
 * rules there, since sending every frame out would slow the frames it samples. It is sent into the page as source, so
 * it uses nothing from outside its own body.
 */
export async function drive(spec: CodexSpec): Promise<PageRun> {
  const CUT_FROM = 0.05
  const CUT_TO = 0.95
  const JUMP_PX = 8
  const STILL_PX = 0.5
  const PAGE_MS = 50
  const REDUCED_FRAMES = 3
  const SPIKE = 3
  const frame = document.getElementById('tab') as HTMLIFrameElement
  const d = frame.contentDocument as Document
  const win = frame.contentWindow as Window & typeof globalThis
  const failures: PageFailure[] = []
  const notes: string[] = []
  const t0 = performance.now()
  let after = -1
  let pageAt = -Infinity
  const now = () => Math.round(performance.now() - t0)
  const seen = new Set<string>()
  let isFrozen = false
  const fail = (rule: string, detail: string, key = detail) => {
    if (seen.has(rule + key)) return
    seen.add(rule + key)
    failures.push({ rule, at: now(), after, detail })
    if (rule === spec.freezeOn && !isFrozen) {
      isFrozen = true
      for (const a of d.getAnimations()) a.pause()
    }
  }
  win.addEventListener('error', e => fail('no-throw', String(e.message)))
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
  const isScroller = (el: Element) => /auto|scroll/.test(win.getComputedStyle(el).overflowY)
  const scrollOf = (el: Element) => {
    let y = win.scrollY
    for (let e = el.parentElement; e; e = e.parentElement) if (isScroller(e)) y += e.scrollTop
    return y
  }

  type Seen = { top: number; height: number }
  let lastBoxes = new Map<string, Seen>()
  type Step = { top: number; height: number; from: number }
  let lastSteps = new Map<string, Step>()
  let stepsBefore = new Map<string, Step>()
  let wasPageFrame = false
  let lastClips = new Map<Element, number>()
  let lastShares = new Map<Element, number>()
  let reducedMoves = new Map<string, number>()
  let frames = 0
  let isRunning = true
  const sample = () => {
    frames++
    const style = new Map<Element, { opacity: number; clip: [number, number] | null }>()
    const styleOf = (el: Element) => {
      let s = style.get(el)
      if (!s) {
        const cs = win.getComputedStyle(el)
        const isClip = cs.overflowY === 'hidden' || cs.overflowY === 'clip'
        const r = isClip ? el.getBoundingClientRect() : null
        s = { opacity: Number(cs.opacity), clip: r ? [r.top, r.bottom] : null }
        style.set(el, s)
      }
      return s
    }
    const clips = new Map<Element, number>()
    const shares = new Map<Element, number>()
    const isPageFrame = now() - pageAt < PAGE_MS
    for (const el of d.querySelectorAll<HTMLElement>('body *:not(script):not(style)')) {
      const texts = [...el.childNodes].filter(n => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')
      const own = texts
        .map(n => n.textContent ?? '')
        .join('')
        .trim()
      if (!own) continue
      if (/NaN|undefined|\[object Object\]/.test(own))
        fail('bad-text', `${el.tagName.toLowerCase()} draws "${own.slice(0, 60)}"`)
      let opacity = 1
      let top = -Infinity
      let bottom = Infinity
      let clipper: Element | null = null
      for (let e: Element | null = el; e && e !== d.documentElement; e = e.parentElement) {
        const s = styleOf(e)
        opacity *= s.opacity
        if (e !== el && s.clip) {
          if (s.clip[0] > top || s.clip[1] < bottom) clipper = e
          top = Math.max(top, s.clip[0])
          bottom = Math.min(bottom, s.clip[1])
        }
      }
      if (opacity < spec.cutOpacity) continue
      if (!clipper) {
        shares.set(el, 1)
        continue
      }
      const range = d.createRange()
      range.setStartBefore(texts[0] as ChildNode)
      range.setEndAfter(texts[texts.length - 1] as ChildNode)
      const r = range.getBoundingClientRect()
      if (r.height <= 0) continue
      const share = Math.max(0, Math.min(r.bottom, bottom) - Math.max(r.top, top)) / r.height
      const h = clipper.getBoundingClientRect().height
      clips.set(clipper, h)
      const was = lastClips.get(clipper)
      const isMoving = was !== undefined && Math.abs(was - h) > STILL_PX
      shares.set(el, share)
      const wasShare = lastShares.get(el)
      const isPushedOut = !isMoving && wasShare !== undefined && wasShare >= CUT_TO
      if ((isMoving || isPushedOut) && !isPageFrame && share > CUT_FROM && share < CUT_TO) {
        const box = (clipper as HTMLElement).closest<HTMLElement>('[data-motion]')?.dataset.motion ?? clipper.className
        const how = isMoving ? '' : ', pushed past the edge of a box that holds still'
        fail(
          'cut',
          `"${own.slice(0, 50)}" shows at ${opacity.toFixed(2)} with ${Math.round(share * 100)}% of it in its box ${box}${how}`,
          `${own} ${box}`,
        )
      }
    }
    lastClips = clips
    lastShares = shares
    const boxes = new Map<string, Seen>()
    for (const el of d.querySelectorAll<HTMLElement>('[data-motion]')) {
      const r = el.getBoundingClientRect()
      boxes.set(el.dataset.motion ?? '', { top: r.top + scrollOf(el), height: r.height })
    }
    const steps = new Map<string, Step>()
    for (const [id, b] of boxes) {
      const was = lastBoxes.get(id)
      if (was) steps.set(id, { top: b.top - was.top, height: b.height - was.height, from: was.top })
    }
    const size = (s: Step | undefined) => (s ? Math.max(Math.abs(s.top), Math.abs(s.height)) : 0)
    const spikes = [...lastSteps].filter(([id, s]) => {
      const by = size(s)
      return by >= JUMP_PX && by > SPIKE * Math.max(size(stepsBefore.get(id)), size(steps.get(id)))
    })
    const grown = spikes.filter(([, s]) => Math.abs(s.height) >= JUMP_PX)
    const isGliding = (s: Step | undefined) => s !== undefined && Math.abs(s.height) >= 1
    const stalled = [...lastSteps].filter(
      ([id, s]) => Math.abs(s.height) < STILL_PX && isGliding(stepsBefore.get(id)) && isGliding(steps.get(id)),
    )
    for (const [id, s] of wasPageFrame || spec.isReduced ? [] : spikes) {
      const isPushed = grown.some(([gid, g]) => gid !== id && g.from < s.from && Math.abs(g.height + g.top - s.top) < 1)
      const stall = stalled.find(([gid, g]) => gid !== id && g.from < s.from && Math.abs(g.top - s.top) < 1)
      if (Math.abs(s.height) >= JUMP_PX)
        fail('jump', `${id} ${s.height > 0 ? 'grew' : 'shrank'} ${Math.abs(s.height).toFixed(1)} px in one frame`)
      else if (stall)
        fail(
          'jump',
          `${stall[0]}'s height stood still for one frame of its glide, so the boxes below moved ${Math.abs(s.top).toFixed(1)} px`,
          stall[0],
        )
      else if (!isPushed) fail('jump', `${id} moved ${Math.abs(s.top).toFixed(1)} px in one frame`)
    }
    if (spec.isReduced && !isPageFrame)
      for (const [id, s] of steps) {
        const run = size(s) > STILL_PX ? (reducedMoves.get(id) ?? 0) + 1 : 0
        if (run === REDUCED_FRAMES) fail('reduced', `${id} moved in ${run} frames in a row with reduced motion`)
        reducedMoves.set(id, run)
      }
    stepsBefore = lastSteps
    lastSteps = steps
    lastBoxes = boxes
    wasPageFrame = isPageFrame
    pressShows()
    if (isRunning && !isFrozen) win.requestAnimationFrame(sample)
  }
  win.requestAnimationFrame(sample)

  /**
   * The `press-shows` rule: the frames that answer a press, the first after the click and the first after the server's
   * reply to it, show what the press brought to the pressed button's box. What it brought is a text the box did not
   * show when the press or reply came. When the box shows one at the cut opacity before the next input, the next
   * reply or `PRESS_WINDOW_MS`, one must start to show, or the pressed label go, within `SHOWS_WITHIN_MS` of the first frame.
   * A press that settles a row or brings it back swaps its form, fading the old out before the new comes in, and the
   * row closing shows the press.
   */
  const PRESS_WINDOW_MS = 1000
  const SHOWS_WITHIN_MS = 40
  const STARTED = 0.01
  type Answer = {
    at: number
    box: string
    label: string
    by: string
    had: Set<string>
    first?: number
    isShown?: boolean
    isDone?: boolean
  }
  const answers: Answer[] = []
  const inputs: number[] = []
  const rootOf = (box: string) => d.querySelector(`[data-motion="${win.CSS.escape(box)}"]`)
  const textsOf = (box: string) => {
    const out = new Map<string, number>()
    for (const el of rootOf(box)?.querySelectorAll('*') ?? []) {
      const own = [...el.childNodes]
        .filter(n => n.nodeType === 3)
        .map(n => n.textContent ?? '')
        .join('')
        .trim()
      if (own) out.set(own, Math.max(out.get(own) ?? 0, opacityOf(el)))
    }
    return out
  }
  const answer = (box: string, label: string, by: string) => {
    const had = new Set([...textsOf(box)].filter(([, o]) => o > 0).map(([t]) => t))
    answers.push({ at: now(), box, label, by, had })
  }
  const pressShows = () => {
    const t = now()
    for (const a of answers.filter(a => !a.isDone)) {
      if (t - a.at > PRESS_WINDOW_MS || inputs.some(x => x > a.at && x <= t)) {
        a.isDone = true
        continue
      }
      a.first ??= t
      const isFormSwap = rootOf(a.box)?.classList.contains('swaps-form') === true
      if (isFormSwap && t === a.first) {
        a.isDone = true
        continue
      }
      const texts = textsOf(a.box)
      const brought = [...texts].filter(([text]) => !a.had.has(text))
      const isEarly = t - a.first <= SHOWS_WITHIN_MS
      if (isEarly && (brought.some(([, o]) => o >= STARTED) || !(texts.get(a.label) ?? 0))) a.isShown = true
      const later = brought.find(([, o]) => o >= spec.cutOpacity)
      if (!later) continue
      a.isDone = true
      const own = a.by === 'person' ? 'its own frame' : "the frame after the server's reply"
      if (!a.isShown)
        fail(
          'press-shows',
          `the press "${a.label}" on ${a.box} showed nothing it brought in ${own}: "${later[0].slice(0, 50)}" first showed ${t - a.first} ms later`,
        )
    }
  }
  const replies = new Map<unknown, { box: string; label: string }>()
  let lastPress: { box: string; label: string } | null = null
  addEventListener('message', e => {
    const m = e.data
    if (e.source === win && m?.method === 'tools/call' && m.params?.name === 'inbox_press' && lastPress)
      replies.set(m.id, lastPress)
  })
  win.addEventListener('message', e => {
    const p = replies.get(e.data?.id)
    if (!p || e.data.method) return
    inputs.push(now())
    answer(p.box, p.label, 'server')
  })

  const opacityOf = (el: Element) => {
    let opacity = 1
    for (let e: Element | null = el; e && e !== d.documentElement; e = e.parentElement)
      opacity *= Number(win.getComputedStyle(e).opacity)
    return opacity
  }
  const boxName = (el: Element) => {
    const motion = el.closest<HTMLElement>('[data-motion]')?.dataset.motion ?? ''
    return `${motion} ${el.className}`.trim()
  }
  /**
   * The rest-space rule, once every move has come to rest: no clipped box is taller than its content, and no blank
   * line's worth of space sits between two things a motion box draws, its nested boxes' included. It sets each clipped box's height to auto for a
   * moment to measure its content, and puts it back before the page draws again.
   */
  const restSpace = () => {
    for (const el of d.querySelectorAll<HTMLElement>('[data-motion], [data-motion] *')) {
      if (!/hidden|clip/.test(win.getComputedStyle(el).overflowY)) continue
      const height = el.getBoundingClientRect().height
      if (height <= 0) continue
      const style = el.getAttribute('style')
      el.style.setProperty('height', 'auto', 'important')
      const content = el.getBoundingClientRect().height
      if (style === null) el.removeAttribute('style')
      else el.setAttribute('style', style)
      if (height - content > STILL_PX)
        fail('rest-space', `${boxName(el)} rests ${(height - content).toFixed(1)} px taller than its content`)
    }
    type Drawn = { top: number; bottom: number; line: number; text: string }
    const drawn = new Map<Element, Drawn[]>()
    for (const el of d.querySelectorAll<HTMLElement>('[data-motion] *')) {
      const texts = [...el.childNodes].filter(n => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')
      const isField = el instanceof win.HTMLInputElement || el instanceof win.HTMLTextAreaElement
      if ((texts.length === 0 && !isField) || opacityOf(el) < spec.cutOpacity) continue
      const control = el.closest('button, input, textarea, select')
      const range = d.createRange()
      if (control) range.selectNode(control)
      else {
        range.setStartBefore(texts[0] as ChildNode)
        range.setEndAfter(texts[texts.length - 1] as ChildNode)
      }
      const r = range.getBoundingClientRect()
      if (r.height <= 0) continue
      const cs = win.getComputedStyle(el)
      const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2
      const text = isField
        ? 'a text field'
        : texts
            .map(n => n.textContent ?? '')
            .join('')
            .trim()
            .slice(0, 40)
      for (
        let entry = el.closest('[data-motion]');
        entry;
        entry = entry.parentElement?.closest('[data-motion]') ?? null
      )
        drawn.set(entry, [...(drawn.get(entry) ?? []), { top: r.top, bottom: r.bottom, line, text }])
    }
    for (const [entry, list] of drawn) {
      const sorted = list.sort((a, b) => a.top - b.top)
      let bottom = sorted[0]?.bottom ?? 0
      for (const x of sorted.slice(1)) {
        if (x.top - bottom >= x.line - STILL_PX)
          fail(
            'rest-space',
            `${boxName(entry)} rests with ${(x.top - bottom).toFixed(1)} px of blank space above "${x.text}"`,
          )
        bottom = Math.max(bottom, x.bottom)
      }
    }
  }
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && !el.closest('[inert]')
  }
  const press = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    const at = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup'])
      el.dispatchEvent(new (type.startsWith('pointer') ? win.PointerEvent : win.MouseEvent)(type, at))
    el.click()
  }
  const label = (el: Element) => (el.textContent ?? '').trim().slice(0, 40)
  for (const [i, e] of spec.events.entries()) {
    if (isFrozen) break
    after = i
    if (e.is !== 'wait') inputs.push(now())
    if (e.is === 'wait') {
      await sleep(e.ms)
      notes.push('')
    } else if (e.is === 'key') {
      const target = (d.activeElement as HTMLElement | null) ?? d.body
      target.dispatchEvent(new win.KeyboardEvent('keydown', { key: e.key, bubbles: true, cancelable: true }))
      if (/^[1-4?]$|^Escape$/.test(e.key)) pageAt = now()
      notes.push(`pressed ${e.key}`)
    } else if (e.is === 'type') {
      const field = [...d.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')].find(visible)
      if (field) {
        const proto = field instanceof win.HTMLInputElement ? win.HTMLInputElement : win.HTMLTextAreaElement
        Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set?.call(field, field.value + e.text)
        field.dispatchEvent(new win.Event('input', { bubbles: true }))
      }
      notes.push(field ? 'typed in the open field' : 'no field to type in')
    } else {
      const sets = {
        row: [...d.querySelectorAll<HTMLElement>('[data-motion] button')].filter(
          b => visible(b) && !b.closest('.panel') && b === b.closest('[data-motion]')?.querySelector('button'),
        ),
        button: [...d.querySelectorAll<HTMLElement>('.panel button, .pr-body button')].filter(visible),
        tab: [...d.querySelectorAll<HTMLElement>('[data-tab]')].filter(visible),
      }
      const list = sets[e.on]
      const el = list[e.n % Math.max(1, list.length)]
      const box = el?.closest<HTMLElement>('[data-motion]')?.dataset.motion
      if (el && box !== undefined && e.on === 'button') {
        lastPress = { box, label: label(el) }
        answer(box, label(el), 'person')
      }
      if (el) {
        press(el)
        if (e.on === 'tab') pageAt = now()
      }
      notes.push(el ? `clicked ${e.on} "${label(el)}"` : `no ${e.on} to click`)
    }
  }
  after = spec.events.length
  for (let t = 0; t < spec.restMs && !isFrozen; t += 50) await sleep(50)
  isRunning = false
  await sleep(50)
  if (!isFrozen) restSpace()

  return { failures, notes, frames, isFrozen }
}
