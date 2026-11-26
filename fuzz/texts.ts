import type { Rng } from './rng'

const ch = (code: number) => String.fromCodePoint(code)
const ESC = ch(0x1b)
const BEL = ch(0x07)

/** Each class of text a field can draw from. */
const TEXT_CLASSES = {
  plain: ['Fix the flaky test', 'Ship it', 'Rename the settings page', 'Yes', 'No'],
  long: [
    'Decide whether the background sync should retry on every network change or only after the person opens the app again, since retries drain the battery',
    'Run npm login to authenticate with the npm registry',
  ],
  word: ['Supercalifragilisticexpialidocious'.repeat(6), 'a'.repeat(240), 'https://example.com/' + 'path/'.repeat(30)],
  cjk: ['同步失败时是否重试', '設定画面の名前を変更しますか', '한국어 제목이 길게 이어집니다 그리고 계속됩니다'],
  emoji: [
    '🚀 Launch',
    `👩${ch(0x200d)}👩${ch(0x200d)}👧${ch(0x200d)}👦 family`,
    `🏳${ch(0xfe0f)}${ch(0x200d)}🌈 flag`,
    '🇯🇵🇺🇸 flags',
    '👍🏽 ok',
    `❤${ch(0xfe0f)} heart`,
  ],
  rtl: ['هل نعيد المحاولة؟', 'לשנות את שם הדף', 'Mixed עברית and English ثم عربي'],
  combining: [
    `e${ch(0x301)}${ch(0x301)} n${ch(0x303)}`,
    `Z${ch(0x324)}${ch(0x354)}a${ch(0x308)}${ch(0x356)}l${ch(0x36e)}g${ch(0x30c)}o`,
    'नमस्ते क्षत्रिय',
  ],
  invisible: [
    `zero${ch(0x200b)}width${ch(0x200b)}spaces`,
    `${ch(0x2060)}joiner${ch(0x2060)}`,
    `soft${ch(0xad)}hyphen`,
    `${ch(0xfeff)}bom`,
  ],
  whitespace: ['tab\there', 'two\nlines', '  padded  ', '\n\nleading newlines', 'trailing\n'],
  markdown: ['`code` and **bold**', '[link](https://example.com)', '# Heading', '- a list item', '> quote'],
  ansi: [`${ESC}[31mred${ESC}[0m text`, `half ${ESC}[1`, `${ESC}]8;;https://x${BEL}link${ESC}]8;;${BEL}`],
  glyphs: ['✓ Done · Undo … ↵ ❯', '├─ └─ │', '◆ ◇ ● ○'],
  empty: [''],
} as const

type TextClass = keyof typeof TEXT_CLASSES

const CLASSES = Object.keys(TEXT_CLASSES) as TextClass[]

/** A text from one or two classes; plain text with chance `plain`, so most rows still read like real ones. */
export function text(rng: Rng, plain = 0.4): string {
  if (rng.chance(plain)) return rng.pick(TEXT_CLASSES.plain)
  const parts = rng.chance(0.3) ? 2 : 1

  return Array.from({ length: parts }, () => rng.pick(TEXT_CLASSES[rng.pick(CLASSES)])).join(' ')
}

/** A text from `text`, cut to the `max` characters of the field it fills, since the inbox refuses a call with a longer one. */
export function fitting(rng: Rng, max: number, plain = 0.4): string {
  const t = text(rng, plain)

  return t.trim().length <= max ? t : t.trim().slice(0, max)
}
