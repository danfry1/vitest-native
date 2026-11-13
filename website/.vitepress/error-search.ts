// The "find your error" search, in the browser. A message rarely carries its code (Vitest's
// reporter drops it), so entries are found by the words they share with the message:
//
//   1. a code in the text, or the start of one, finds its entry first;
//   2. an entry whose heading the message quotes comes next;
//   3. the rest rank by the words they share, a rare word counting for more than a common one,
//      and a word in the heading twice.

export interface Searchable {
  title: string
  text: string
}

const CODE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g
// The start of a code being typed: `UNSUPPORTED_PE`.
const CODE_START = /\b[A-Z]{3,}_[A-Z0-9_]*$/
// Words every message shares, which would rank every entry alike.
const COMMON = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'not', 'are', 'was', 'its', 'has', 'have',
  'but', 'can', 'cannot', 'when', 'which', 'your', 'you', 'use', 'set', 'run', 'one', 'all', 'any',
  'vitest', 'native', 'vitest-native', 'test', 'tests', 'file', 'files', 'error', 'errors', 'see',
  'found', 'failed', 'warning', 'only', 'will', 'been', 'into', 'than', 'then', 'there',
])

/** A word without a plural `s`, so `hooks` and `hook` meet. */
const singular = (word: string) =>
  word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word

/** A text's words: lowercase, and each part of a code too (`source_evaluated_twice` gives `twice`). */
function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_.*@/-]+/)
    .map((word) => word.replace(/^[.*/_-]+|[.*/_-]+$/g, ''))
    .flatMap((word) => (word.includes('_') ? [word, ...word.split('_')] : [word]))
    .filter(Boolean)
}

/**
 * The words a query is matched by: three letters or more, singular, and without digits
 * (versions, timings and line numbers describe the reader's setup, not the error), paths or
 * common words.
 */
export function queryWords(query: string): string[] {
  // A path names the reader's project, not the error.
  const words = tokens(query.replace(/(?:[A-Za-z]:)?(?:[\\/][\w.@-]+){2,}/g, ' '))
    .filter((word) => word.length >= 3 && !/\d/.test(word) && !COMMON.has(word))
    .map(singular)
  return [...new Set(words)]
}

/** Whether the query has anything to search by: a word, a code, or the start of one. */
export function searchable(query: string): boolean {
  return queryWords(query).length > 0 || /\b[A-Z]{3,}_/.test(query)
}

/**
 * The phrases of a heading a message can contain: its quoted text (`"Invalid hook call"
 * warnings` gives `invalid hook call`), and each part between ` / ` or `: `.
 */
function phrases(title: string): string[] {
  const lowered = title.toLowerCase()
  const quoted = [...lowered.matchAll(/["“]([^"”]+)["”]/g)].map((match) => match[1])
  const parts = lowered.split(/\s+\/\s+|:\s+/).map((part) => part.replace(/["“”]/g, ''))
  return [...quoted, ...parts]
    .map((part) => part.trim())
    .filter((part) => part.split(/\s+/).length >= 2)
}

interface Prepared<T> {
  entry: T
  words: Set<string>
  titleWords: Set<string>
  phrases: string[]
}

// Each index is read into words once, not on every keystroke.
const prepared = new WeakMap<object, Prepared<Searchable>[]>()

function prepare<T extends Searchable>(index: T[]): Prepared<T>[] {
  let entries = prepared.get(index)
  if (!entries) {
    entries = index.map((entry) => ({
      entry,
      words: new Set(tokens(`${entry.title} ${entry.text}`).map(singular)),
      titleWords: new Set(tokens(entry.title).map(singular)),
      phrases: phrases(entry.title),
    }))
    prepared.set(index, entries)
  }
  return entries as Prepared<T>[]
}

/** The entries for a pasted message or a few words, best first. */
export function findErrors<T extends Searchable>(index: T[], query: string, limit = 6): T[] {
  const codes = new Set(query.match(CODE) ?? [])
  const start = CODE_START.exec(query.trim())?.[0]
  const byCode = index.filter(
    (entry) => codes.has(entry.title) || (start !== undefined && entry.title.startsWith(start)),
  )
  const words = queryWords(query)
  if (words.length === 0) return byCode.slice(0, limit)
  const entries = prepare(index)
  const lowered = query.toLowerCase()

  const holders = (word: string) => entries.filter(({ words: own }) => own.has(word)).length
  const known = words.filter((word) => holders(word) > 0)
  const weight = new Map(known.map((word) => [word, Math.log((index.length + 1) / holders(word))]))
  // A word no entry has (a component's name, a package's) says nothing about which entry
  // fits: it counts as a typical word, so it neither decides the match nor vanishes.
  const sorted = [...weight.values()].sort((a, b) => a - b)
  const typical = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
  const total =
    known.reduce((sum, word) => sum + weight.get(word)!, 0) + (words.length - known.length) * typical

  const scored = entries
    .filter(({ entry }) => !byCode.includes(entry))
    .map(({ entry, words: own, titleWords, phrases: quotable }) => {
      const found = known.filter((word) => own.has(word))
      const score = found.reduce(
        (sum, word) => sum + weight.get(word)! * (titleWords.has(word) ? 2 : 1),
        0,
      )
      const share = found.reduce((sum, word) => sum + weight.get(word)!, 0) / total
      const quoted = quotable.some((phrase) => lowered.includes(phrase))
      return { entry, found: found.length, share, quoted, score }
    })
    // A word or two must all be found. A longer text needs a quoted heading, or two of its
    // words carrying at least a third of its weight.
    .filter(({ found, share, quoted }) =>
      quoted || (words.length <= 2 ? found === words.length : found >= 2 && share >= 1 / 3),
    )
  // Quoted headings first; the rest within a third of the best of them, so one strong match
  // does not hide the others.
  const quoted = scored.filter(({ quoted: is }) => is).sort((a, b) => b.score - a.score)
  const rest = scored.filter(({ quoted: is }) => !is).sort((a, b) => b.score - a.score)
  const best = rest[0]?.score ?? 0
  const ranked = [...quoted, ...rest.filter(({ score }) => score >= best / 3)]
  return [...byCode, ...ranked.map(({ entry }) => entry)].slice(0, limit)
}
