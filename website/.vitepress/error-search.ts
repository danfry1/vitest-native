// The "find your error" search, in the browser: a code in the pasted text finds its entry
// first, then entries rank by how many of the text's words they contain.

export interface Searchable {
  title: string
  text: string
}

const CODE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g
// Words every message shares, which would rank every entry alike.
const COMMON = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'not', 'are', 'was', 'its', 'has', 'have',
  'but', 'can', 'cannot', 'when', 'which', 'your', 'you', 'use', 'set', 'run', 'one', 'all', 'any',
  'vitest', 'native', 'vitest-native', 'test', 'tests', 'file', 'files', 'error', 'errors', 'see',
  'found', 'failed', 'warning', 'only', 'will', 'been', 'into', 'than', 'then', 'there',
])

/** The words a query is matched by: lowercase, three letters or more, paths and common words left out. */
export function queryWords(query: string): string[] {
  const words = query
    .replace(/\[vitest-native\]/g, ' ')
    // A path names the reader's project, not the error.
    .replace(/(?:[A-Za-z]:)?(?:[\\/][\w.@-]+){2,}/g, ' ')
    .toLowerCase()
    .split(/[^a-z0-9_.*@/-]+/)
    .map((word) => word.replace(/^[.*/-]+|[.*/-]+$/g, ''))
    .filter((word) => word.length >= 3 && !COMMON.has(word))
  return [...new Set(words)]
}

/** A text's words, each also without a plural `s`, for matching `hooks` to `hook`. */
function wordsOf(text: string): Set<string> {
  const words = text.toLowerCase().split(/[^a-z0-9_.*@/-]+/).map((word) => word.replace(/^[.*/-]+|[.*/-]+$/g, ''))
  return new Set(words.flatMap((word) => (word.endsWith('s') ? [word, word.slice(0, -1)] : [word])))
}

/**
 * The phrases of a heading a message can contain: its quoted text (`"Invalid hook call"
 * warnings` gives `invalid hook call`), and each part between ` / ` or `: `.
 */
function phrases(title: string): string[] {
  const lowered = title.toLowerCase()
  const quoted = [...lowered.matchAll(/["“]([^"”]+)["”]/g)].map((match) => match[1])
  const parts = lowered.split(/\s+\/\s+|:\s+/).map((part) => part.replace(/["“”]/g, ''))
  return [...quoted, ...parts].map((part) => part.trim()).filter((part) => part.split(/\s+/).length >= 2)
}

/**
 * The entries for a pasted message or a few words, best first. A code in the text finds its
 * entry first. Then each entry scores the words it shares with the text, a rare word counting
 * for more than a common one, and an entry whose heading the text quotes ranks first.
 */
export function findErrors<T extends Searchable>(index: T[], query: string, limit = 6): T[] {
  const codes = new Set(query.match(CODE) ?? [])
  const byCode = index.filter((entry) => codes.has(entry.title))
  const words = queryWords(query)
  if (words.length === 0) return byCode.slice(0, limit)
  const lowered = query.toLowerCase()
  // Whole words, so `read` does not match `already`.
  const haystacks = index.map((entry) => wordsOf(`${entry.title} ${entry.text}`))
  const weight = new Map(
    words.map((word) => {
      const holders = haystacks.filter((haystack) => haystack.has(word)).length
      // A word no entry has weighs most: a message about something the pages never mention
      // matches nothing well.
      return [word, Math.log((index.length + 1) / Math.max(holders, 1))]
    }),
  )
  const total = words.reduce((sum, word) => sum + weight.get(word)!, 0)
  const scored = index
    .map((entry, at) => {
      const found = words.filter((word) => haystacks[at].has(word))
      const title = wordsOf(entry.title)
      const quoted = phrases(entry.title).some((phrase) => lowered.includes(phrase))
      // A word in the heading counts twice.
      const score =
        found.reduce((sum, word) => sum + weight.get(word)! * (title.has(word) ? 2 : 1), 0) +
        (quoted ? 100 : 0)
      const share = found.reduce((sum, word) => sum + weight.get(word)!, 0) / total
      return { entry, found: found.length, share, quoted, score }
    })
    // A word or two must all be found. A longer text needs a quoted heading, or two of its
    // words carrying at least a third of its weight.
    .filter(
      ({ entry, found, share, quoted }) =>
        !byCode.includes(entry) &&
        (quoted || (words.length <= 2 ? found === words.length : found >= 2 && share >= 1 / 3)),
    )
    .sort((a, b) => b.score - a.score)
  const best = scored[0]?.score ?? 0
  const ranked = scored.filter(({ score }) => score >= best / 3).map(({ entry }) => entry)
  return [...byCode, ...ranked].slice(0, limit)
}
