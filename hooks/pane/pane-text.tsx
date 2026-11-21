import { parseInline } from '../../core/view/inline'
import type { PaneBase } from './pane-context'
import type { TerminalSpan } from './terminal-text'

/** The pane's formatted text: inline Markdown, and lines already wrapped into spans. */
export function paneText({ Text, pal }: Pick<PaneBase, 'Text' | 'pal'>) {
  const inlineText = (text: string) =>
    parseInline(text).map((s, n) => (
      <Text key={String(n)}>
        <Text
          bold={s.bold}
          italic={s.italic}
          strikethrough={s.strike}
          underline={s.link ? true : undefined}
          color={s.code ? 'permission' : undefined}
        >
          {s.text}
        </Text>
        {s.link ? <Text color={pal.muted}>{` ${s.link}`}</Text> : null}
      </Text>
    ))
  const terminalText = (lines: TerminalSpan[][]) =>
    lines.flatMap((line, n) => [
      ...(n > 0 ? ['\n'] : []),
      ...line.map((span, i) => (
        <Text
          key={`${n}-${i}`}
          bold={span.bold}
          italic={span.italic}
          strikethrough={span.strike}
          underline={span.link ? true : undefined}
          color={
            span.isNeedsYou
              ? (pal.tone.needsYou ?? pal.mark.needsYou)
              : span.isDone
                ? (pal.tone.done ?? pal.mark.done)
                : span.isLinkAddress || span.isMuted
                  ? pal.muted
                  : span.code
                    ? 'permission'
                    : undefined
          }
        >
          {span.text}
        </Text>
      )),
    ])

  return { inlineText, terminalText }
}
