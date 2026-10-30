// Writes hooks/compare-page.html from the parts in hooks/compare-page/. An agent builds a comparison by appending
// JSON to that one file, and Prettier cannot format it whole, since it ends in an open <plaintext> element. Each
// part is a file Prettier can check on its own, so the generator puts back the indent its tag gives it.
//
// Usage: node scripts/build-compare-page.mjs [--check]
//
// With --check, writes nothing and exits 1 when the page differs from what the parts build.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGE = join(ROOT, 'hooks', 'compare-page.html')
const PARTS = join(ROOT, 'hooks', 'compare-page')

const indented = (name, indent) =>
  readFileSync(join(PARTS, name), 'utf8')
    .replace(/\n$/, '')
    .split('\n')
    .map(line => (line === '' ? line : indent + line))
    .join('\n')

const page = [
  '<!doctype html>',
  '<!--',
  indented('instructions.txt', '  '),
  '-->',
  '<html lang="en">',
  '  <head>',
  '    <meta charset="utf-8" />',
  '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
  '    <title>Comparison</title>',
  '    <style>',
  indented('styles.css', '      '),
  '    </style>',
  '    <script>',
  indented('script.js', '      '),
  '    </script>',
  '  </head>',
  '  <body>',
  indented('body.html', '    '),
  '    <plaintext id="compare-data" hidden>',
  '',
].join('\n')

if (process.argv.includes('--check')) {
  if (readFileSync(PAGE, 'utf8') !== page) {
    console.error('hooks/compare-page.html differs from its parts. Run: node scripts/build-compare-page.mjs')
    process.exit(1)
  }
} else {
  writeFileSync(PAGE, page)
}
