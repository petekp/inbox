import { div } from 'gpui-kit'
import type { Color, Element } from 'gpui-kit'
import { h_flex, v_flex } from 'gpui-base'
import { partPt } from '../../core/view/row-parts'
import type { RowPart } from '../../core/view/row-parts'
import { LEAVE_FADE_MS, ROW_FADE_MS, enterDelayMs } from '../../core/view/row-motion'
import { isOpenRow } from './blocks'
import type { Aged, Block, BodyLine, Button, LineBlock, PrBlock, RowBlock, Tone } from './blocks'
import {
  BUTTON_LABEL_X,
  CONTROL_GAP,
  EDGE,
  END_SPACE,
  INSET,
  INSIDE_GAP,
  LINE_HEIGHT,
  MARK_W,
  NEST,
  SEP,
  TEXT_X,
  bodyTextColor,
  colorOf,
  faintOf,
} from './paint-theme'
import { fieldEl } from './paint-field'
import { emptyEl } from './paint-empty'
import { buttonEl, buttonsEl, fadeEl, lineEl, markEl } from './paint-parts'
import { foldChevronEl } from './paint-chevron'
import { isStatusUnder } from './held-line'
import { underId } from './under-line'
import { statusEl, statusPartEl } from './paint-status-line'
import type { RowMotion } from './motion'
import type { SwapMotion } from './form-swap'
import { padOf, sizeEl, titleEl } from './paint-space'
import { PATH_X, lineColor } from './paint-strokes'
import { panelId, prHeadId, restId } from './heights'
import { prStatusEl, prTailEls } from './paint-pr-status'
import type { PrLine } from './pr-status'
import type { Paint, Theme } from './paint-theme'
import { bannerEl } from './paint-chrome'
import { markTintOf, titleColorOf } from './paint-title-tint'
import { titleTextEl } from './paint-title-text'
import { addedOptionsEls, titleLineEls } from './paint-row-lines'
import { noteEl, ruleEl, ruleLine } from './paint-notes'
import { partedEl } from './paint-parted'
import { DOT } from '../../core/view/rows'
import { ARM_END, answersEl, armEl, isSideBySide, trunkEl } from './paint-tree'

const NO_BREAK_SPACE = '\u00a0'

/**
 * A paragraph of two colors. gpui-kit has no inline span, so each word is an item of a wrapping row, followed by a
 * no-break space. That space is as wide as the font's own at any text size, and a line end does not trim it. A word
 * wider than the line wraps inside its item. The paragraph flows as one text, and its wrapped lines start back at the
 * row's left edge.
 */
const wordEls = (text: string, color: Color): Element[] =>
  text
    .split(' ')
    .filter(word => word)
    .map(word => statusPartEl(`${word}${NO_BREAK_SPACE}`).text_color(color))

/**
 * A line of text `indent` in from its row's edge. A line of DOT-joined parts, such as a fold's note or a thread's place
 * and author, breaks between its parts, so no line starts or ends with a dot.
 */
const partedTextEl = (text: string, color: Color, indent: number, t: Theme): Element =>
  text.includes(DOT)
    ? div()
        .pl(indent)
        .pt(INSIDE_GAP)
        .child(
          partedEl(
            text.split(DOT).map(part => statusPartEl(part).text_color(color)),
            t.muted,
          ),
        )
    : lineEl(text, color, indent)

/** A press's result under its buttons. An aged result's age draws faint whatever the result's color. */
function feedbackEl(f: { text: string; tone: Tone; aged?: Aged }, t: Theme): Element {
  const cut = f.aged?.lead.length ?? f.text.length
  if (f.tone === 'muted' || cut >= f.text.length) return partedTextEl(f.text, colorOf(t, f.tone), 0, t).pt(CONTROL_GAP)

  return h_flex()
    .flex_wrap()
    .pt(CONTROL_GAP)
    .children([...wordEls(f.text.slice(0, cut), colorOf(t, f.tone)), ...wordEls(f.text.slice(cut), faintOf(t))])
}

/** A line under a row's title, `above` under the part above it, with its part of the tree that hangs from the row's mark. */
const bodyLineEl = (
  l: Omit<BodyLine, 'part'> & { part?: RowPart },
  above: number,
  t: Theme,
  isSelected: boolean,
  answers: Button[] = [],
  p: Paint | null = null,
  isInert = false,
): Element => {
  const under = isSelected ? t.selected : t.background
  const color = lineColor(t, under)
  const textColor = bodyTextColor(t, l, under)
  if (answers.length > 0 && p) {
    const trunk =
      l.tree === 'tee' ? [trunkEl(0, null, t, isSelected)] : l.tree === 'last' ? [trunkEl(0, above, t, isSelected)] : []

    return h_flex()
      .relative()
      .min_w(0)
      .pt(above)
      .child(answersEl(answers, p, isInert, l.tree === 'last', t, isSelected))
      .children(trunk)
  }
  const armAt = above + LINE_HEIGHT / 2
  const arm = armEl(PATH_X - EDGE + 1, ARM_END, armAt, color)
  const strokes =
    l.tree === 'trunk'
      ? [trunkEl(0, null, t, isSelected)]
      : l.tree === 'tee'
        ? [trunkEl(0, null, t, isSelected), arm]
        : l.tree === 'last'
          ? [trunkEl(0, armAt + 1, t, isSelected), arm]
          : []
  const line = l.lead
    ? h_flex()
        .flex_wrap()
        .pl(MARK_W)
        .pt(above)
        .children([...wordEls(l.lead, t.foreground), ...wordEls(l.text, textColor)])
    : partedTextEl(l.text, textColor, l.isOptionNote ? MARK_W + BUTTON_LABEL_X : MARK_W, t).pt(above)

  return line.relative().children(strokes)
}

function rowEl(r: RowBlock, p: Paint): Element {
  const { t } = p
  const m = p.motion.get(r.id)
  const isLeaving = m?.state === 'leaving'
  const isOpen = isOpenRow(r)
  const isPressable = r.isSelectable && !isLeaving
  const swap = m?.swap ?? null
  const shown = swap?.from ?? r
  const hasTree = (m?.closing ?? shown).body.some(l => l.tree !== undefined)
  const mark = markEl(shown.mark, t, markTintOf(shown, p)).id(`mark ${r.id}`)
  const trunk = trunkEl(LINE_HEIGHT, null, t, r.isSelected).id(`trunk ${r.id}`)
  const line = h_flex()
    .id(`title ${r.id}`)
    .items_start()
    .when(isPressable && isOpen, e => e.on_click((e, cx) => p.collapse(r.id, true, cx, e.modifiers.alt)))
    .when(hasTree, e => e.relative().child(swap?.from ? swapFadeEl(swap, trunk) : panelFadeEl(r, m, p, trunk)))
    .child(swap?.isMarkSwapped ? swapFadeEl(swap, mark) : mark)
    .child(titleTextEl(r, p, titleColorOf(r, p)))
    .when(r.age !== null, e =>
      e.child(
        div()
          .flex_none()
          .ml(INSET)
          .text_color(faintOf(t, r.isSelected ? t.selected : t.background))
          .child(r.age ?? ''),
      ),
    )
  const lines = titleLineEls(
    r,
    shown,
    m,
    p,
    (l, n) => {
      const above = partPt(n === 0 ? 'title' : 'titleStatus', 'titleStatus')
      const el = bodyLineEl(hasTree ? { ...l, tree: 'trunk' } : l, above, t, r.isSelected)

      return l.isHidden ? el.opacity(0) : el
    },
    el => panelFadeEl(r, m, p, el),
  )
  const titleEnd: RowPart = lines.length > 0 ? 'titleStatus' : 'title'

  return v_flex()
    .id(`row ${r.id}`)
    .pl(EDGE + r.depth * NEST)
    .pr(EDGE)
    .py(padOf(r))
    .when(r.isSelected, e => e.bg(t.selected))
    .when(isPressable && !isOpen, e =>
      e
        .hover(s => s.bg(t.hover))
        .on_click((e, cx) => (r.isCollapsed ? p.collapse(r.id, false, cx, e.modifiers.alt) : p.select(r.id, cx))),
    )
    .child(titleEl(r, p, line))
    .child(
      sizeEl(
        restId(r.id),
        p,
        v_flex()
          .id(`form ${r.id}`)
          .when(swap !== null, e => swapFadeEl(swap, e))
          .children(lines)
          .children(panelEl(r, shown, m, p, isLeaving, titleEnd)),
      ),
    )
}

/**
 * A row's body lines, each `partGap` under the part above, from `titleEnd`, the title's last part. Answers that
 * `isSideBySide` lets share the first answer's line, as the last branch, with the recommendation's reason on one line
 * under them in place of each answer's note. Returns the lines and the last part they draw.
 */
function bodyEls(
  from: RowBlock,
  isSelected: boolean,
  p: Paint,
  isInert: boolean,
  titleEnd: RowPart,
): { els: Element[]; end: RowPart } {
  const buttonOf = (id: string | undefined) => from.buttons.filter(b => b.id === id)
  const sideBySide = isSideBySide(from, p) ? from.sideBySide : null
  const answers = sideBySide ? from.buttons.filter(b => sideBySide.optionIds.includes(b.id)) : []
  const first = from.body.find(l => l.optionId)
  const shown: BodyLine[] = sideBySide
    ? from.body.flatMap((l): BodyLine[] => {
        if (l === first)
          return [
            { ...l, part: 'answers', tree: 'last' },
            ...(sideBySide.recLine
              ? [
                  {
                    part: 'reason' as const,
                    text: sideBySide.recLine,
                    tone: 'muted' as const,
                    isOptionNote: true as const,
                  },
                ]
              : []),
          ]

        return l.optionId || l.isOptionNote ? [] : [l]
      })
    : from.body
  let end = titleEnd
  const els = shown.map(l => {
    const above = partPt(end, l.part)
    end = l.part
    const buttons = l.part === 'answers' ? answers : buttonOf(l.optionId)

    return bodyLineEl(l, above, p.t, isSelected, buttons, p, isInert)
  })

  return { els: addedOptionsEls(from, shown, els, p), end }
}

/**
 * `el` fading as a row changes form between settled and not settled: the lines under the title of the form it leaves,
 * or its mark, fade out, and those of the form it takes fade in (`swapMotion`).
 */
const swapFadeEl = (swap: SwapMotion | null, el: Element): Element =>
  swap ? el.opacity(swap.opacity).transition('opacity', { duration: swap.fadeMs, easing: 'ease-out' }) : el

/**
 * A row's panel: its body, its buttons or text field, and a status its buttons put under them, each `partGap` under
 * the part above. A closing row keeps the panel of its open form drawn, without clicks, while it fades, and a row that
 * changes form keeps the panel of the form it leaves, `shown`, while its lines fade. The panel's opacity glides as the
 * row opens or closes, and it reports its height, so a closing row's box can leave it out.
 */
function panelEl(
  r: RowBlock,
  shown: RowBlock,
  m: RowMotion | undefined,
  p: Paint,
  isLeaving: boolean,
  titleEnd: RowPart,
): Element[] {
  const from = m?.closing ?? shown
  const isInert = isLeaving || from !== r
  const actions = from.buttons.filter(b => !b.isOption)
  const hasAnswers = from.buttons.some(b => b.isOption)
  const followsAnswers = hasAnswers && actions[0]?.emphasis !== 'quiet'
  const body = bodyEls(from, r.isSelected, p, isInert, titleEnd)
  const end: RowPart = from.field ? 'field' : actions.length > 0 ? 'buttons' : body.end
  const parts = [
    ...body.els,
    ...(actions.length > 0
      ? [buttonsEl(actions, p, MARK_W, isInert, followsAnswers, partPt(body.end, 'buttons'))]
      : []),
    ...(from.field ? [fieldEl(from.field, p, MARK_W, isInert, m?.field).pt(partPt(body.end, 'field'))] : []),
    ...underEls(r, m?.closing ?? shown, m, p, partPt(end, 'result')),
  ]
  if (parts.length === 0) return []
  const key = panelId(r.id)

  return [
    panelFadeEl(
      r,
      m,
      p,
      v_flex()
        .id(key)
        .on_size_change((size, cx) => p.measure(key, size, cx))
        .children(parts),
    ),
  ]
}

/**
 * `el` fading as the row's panel fades while the row opens or closes. The trunk beside a wrapped title fades with the
 * panel, so the tree comes and goes whole with the lines it joins. The panel of a form a row leaves keeps what it
 * showed while it fades out with that form's lines.
 */
function panelFadeEl(r: RowBlock, m: RowMotion | undefined, p: Paint, el: Element): Element {
  const opacity = m?.swap?.panel ?? m?.panel ?? null
  if (opacity === null) return el
  const height = p.heights.get(panelId(r.id)) ?? 0
  const turnBackFadeMs = m?.panelFadeMs ?? null
  const delay = m?.isPanelWaiting && turnBackFadeMs === null ? enterDelayMs(height) : 0
  const duration = turnBackFadeMs ?? ROW_FADE_MS[m?.state ?? 'open']

  return fadeEl(el, panelId(r.id), opacity, { duration, delay }, p)
}

/**
 * The status under a row's buttons, such as "Sending…". It fades in once the row's box is nearly open, and out while
 * the box holds, as `underMotion` says. A row drawn with no motion, as a tab's first draw, shows it at rest. The form a
 * row leaves as it changes form, `from`, fades its status out from the opacity it shows, while the row's box holds its
 * height, so a status still fading in, as Undo's "Sending…" when the row comes back, never shows whole.
 */
function underEls(r: RowBlock, from: RowBlock, m: RowMotion | undefined, p: Paint, above: number): Element[] {
  const line = isStatusUnder(from) ? from.feedback : null
  const isLeftForm = from !== r
  const leaving = line && { line, opacity: 0, fadeMs: LEAVE_FADE_MS, delayMs: 0 }
  const atRest = line && { line, opacity: null, fadeMs: 0, delayMs: 0 }
  const u = isLeftForm ? leaving : m ? m.under : atRest
  if (!u?.line) return []
  const key = underId(r.id)

  return [
    bodyLineEl(u.line, above, p.t, r.isSelected)
      .id(key)
      .on_size_change((size, cx) => p.measure(key, size, cx))
      .when(u.opacity !== null, e => fadeEl(e, key, u.opacity ?? 1, { duration: u.fadeMs, delay: u.delayMs }, p)),
  ]
}

/**
 * A PR's title, with its number muted at the line's right end, then where it stands and
 * its buttons. In a narrow pane the number leads the status line instead, so the title keeps its width.
 */
function prEl(b: PrBlock, p: Paint, isInert: boolean): Element {
  const { t } = p
  const title = h_flex()
    .items_start()
    .child(div().flex_1().min_w(0).font_semibold().whitespace_normal().child(b.title))
    .when(!p.isNarrow, e => e.child(div().flex_none().ml(INSET).text_color(t.muted).child(b.number)))
  const statusParts = (l: PrLine) => [
    ...(p.isNarrow ? [div().flex_none().text_color(t.muted).child(b.number)] : []),
    ...(l.status ? [statusPartEl(l.status.text).text_color(colorOf(t, l.status.tone))] : []),
    ...l.unlisted.map(u => statusPartEl(u).text_color(t.muted)),
  ]
  const tail = prTailEls(b, p, {
    error: text => lineEl(text, t.ansi1, 0),
    buttons: (buttons, isGoing) => buttonsEl(buttons, p, 0, isInert || isGoing),
    result: f => feedbackEl(f, t),
  })

  return v_flex()
    .pl(EDGE)
    .pr(EDGE)
    .child(sizeEl(prHeadId(b.id), p, title))
    .child(
      prStatusEl(b, p, l =>
        div()
          .pt(INSIDE_GAP)
          .child(partedEl(statusParts(l), t.muted)),
      ),
    )
    .children(tail)
}

function textLineEl(b: LineBlock, p: Paint, isInert: boolean): Element {
  const { t } = p

  return v_flex()
    .pl(EDGE)
    .pr(EDGE)
    .child(
      h_flex()
        .gap(CONTROL_GAP)
        .items_center()
        .child(
          div()
            .flex_1()
            .min_w(0)
            .whitespace_normal()
            .child(b.text ?? ''),
        )
        .when(b.buttons.length > 0, e =>
          e.child(
            h_flex()
              .flex_none()
              .gap(CONTROL_GAP)
              .children(b.buttons.map(x => buttonEl(x, p, isInert))),
          ),
        ),
    )
    .when(b.under !== null, e => e.child(lineEl(b.under ?? '', t.muted, 0)))
    .when(b.feedback !== null, e => e.child(feedbackEl(b.feedback!, t)))
}

/** A group's heading. A marked one hangs its mark in the mark column, with its text where its rows' text starts. One with no mark starts at the edge, where its rows' marks do. A label heading starts at the edge and rules the goal's text to its buttons. */
function headingEl(b: Extract<Block, { kind: 'heading' }>, p: Paint, isInert: boolean): Element {
  const { t } = p
  const buttons = h_flex()
    .flex_none()
    .gap(CONTROL_GAP)
    .items_center()
    .children(b.buttons.map(x => buttonEl(x, p, isInert)))
  if (b.isLabel)
    return h_flex()
      .flex_wrap()
      .pl(EDGE)
      .pr(EDGE)
      .gap(CONTROL_GAP)
      .items_center()
      .child(
        h_flex()
          .min_w(0)
          .items_center()
          .when(b.mark !== null, e => e.child(markEl(b.mark, t)))
          .child(statusPartEl(b.text).text_color(b.mark?.tone ? colorOf(t, b.mark.tone) : t.muted)),
      )
      .child(ruleLine(t).min_w(END_SPACE))
      .child(buttons)

  return h_flex()
    .pl(EDGE)
    .pr(EDGE)
    .items_center()
    .when(b.mark !== null, e => e.child(markEl(b.mark, t)))
    .child(div().min_w(0).whitespace_normal().font_semibold().child(b.text))
    .when(b.count !== null, e => e.child(div().text_color(t.muted).child(`${SEP}${b.count}`)))
    .child(div().flex_1())
    .when(b.aside !== undefined, e =>
      e.child(
        div()
          .flex_none()
          .ml(INSET)
          .font_family(p.mono)
          .text_color(t.muted)
          .child(b.aside ?? ''),
      ),
    )
    .child(buttons)
}

/** Other work's counts: the label, then each mark in its tone with its count, as parts so a count stays with its mark. */
const countsEl = (counts: NonNullable<Extract<Block, { kind: 'fold' }>['counts']>, t: Theme): Element => {
  const items = counts.items.map(c =>
    h_flex()
      .flex_none()
      .children([
        div().flex_none().text_color(colorOf(t, c.mark.tone)).child(c.mark.text),
        statusPartEl(`${NO_BREAK_SPACE}${c.text}`).text_color(t.muted),
      ]),
  )
  const [first, ...rest] = items
  const head = h_flex()
    .flex_wrap()
    .min_w(0)
    .children([...wordEls(counts.label, t.muted), ...(first ? [first] : [])])

  return partedEl([head, ...rest], t.muted)
}

function foldEl(b: Extract<Block, { kind: 'fold' | 'more' }>, p: Paint, isInert: boolean): Element {
  const { t } = p
  const press: Button = {
    id: b.id,
    label: b.text,
    emphasis: 'quiet',
    isOut: false,
    hotkey: null,
    does: { is: 'view', change: b.change },
  }
  const fold = b.kind === 'fold' ? b : null
  const mark = fold?.mark

  return h_flex()
    .id(`fold ${b.id}`)
    .pl(mark === undefined ? TEXT_X + b.depth * NEST : EDGE)
    .pr(EDGE)
    .py(padOf(b))
    .items_start()
    .text_color(fold?.level === 'faint' ? faintOf(t) : t.muted)
    .accessibility_label(b.text)
    .when(!isInert, e => e.on_click((e, cx) => p.press(press, cx, e.modifiers.alt)))
    .when(mark !== undefined, e => e.child(markEl(mark ?? null, t)))
    .child(fold?.counts ? countsEl(fold.counts, t) : div().min_w(0).whitespace_normal().child(b.text))
    .when(fold !== null, e =>
      e.child(foldChevronEl(t, { isOpen: fold?.isOpen ?? false, isLive: !isInert, level: fold?.level ?? 'muted' })),
    )
}

/**
 * A rule from edge to edge, between two groups or two PRs, so the marks of the group below sit inside the break. A
 * labelled one starts its label where text after a mark starts.
 */
export function blockEl(b: Block, p: Paint): Element {
  const { t } = p
  const isLeaving = p.motion.get(b.id)?.state === 'leaving'
  if (b.kind === 'row') return rowEl(b, p)
  if (b.kind === 'status') return statusEl(b, p, isLeaving)
  if (b.kind === 'pr') return prEl(b, p, isLeaving)
  if (b.kind === 'line') return textLineEl(b, p, isLeaving)
  if (b.kind === 'heading') return headingEl(b, p, isLeaving)
  if (b.kind === 'empty') return emptyEl(b, p, isLeaving)
  if (b.kind === 'fold' || b.kind === 'more') return foldEl(b, p, isLeaving)
  if (b.kind === 'rule') return ruleEl(b, t)
  if (b.kind === 'field') {
    const m = p.motion.get(b.id)
    const isShownAsOpening = m?.state === 'entering' && m.box !== null && m.fadeMs === 0
    const keepsButtonsFade = isLeaving ? { isOpen: true, delayMs: 0 } : null
    const delayMs = enterDelayMs(p.heights.get(b.id) ?? 0)
    const opening = isShownAsOpening ? { isOpen: m.box === 'open', delayMs } : keepsButtonsFade

    return div()
      .pl(b.isAtEdge ? EDGE : TEXT_X)
      .pr(EDGE)
      .child(fieldEl(b.field, p, 0, isLeaving, opening))
  }
  if (b.kind === 'note')
    return noteEl(
      b,
      t,
      (b.buttons ?? []).map(x => buttonEl(x, p, isLeaving)),
    )
  if (b.kind === 'caption') return div().pl(EDGE).pr(EDGE).text_color(t.muted).child(b.text)
  if (b.kind === 'banner')
    return bannerEl(
      b.banner,
      t,
      b.buttons.map(x => buttonEl(x, p, isLeaving)),
      b.feedback ? feedbackEl(b.feedback, t) : null,
    )

  return div()
}
