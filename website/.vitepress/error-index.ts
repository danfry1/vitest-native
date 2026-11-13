// The index the "find your error" box searches: every error code on the errors page and
// every entry on the troubleshooting page, read at build time from the pages themselves.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const GUIDE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../guide')

export interface ErrorEntry {
  /** The code (`UNSUPPORTED_PEER`) or the troubleshooting entry's heading, as plain text. */
  title: string
  /** `/guide/errors#UNSUPPORTED_PEER` */
  link: string
  kind: 'Error code' | 'Troubleshooting'
  /** The errors page's section (`Configuration`), or empty. */
  group: string
  /** The entry's text, without Markdown. */
  text: string
}

/**
 * Markdown to the words a reader sees. Inline code is kept as written (`__mocks__`,
 * `Array<string>`, `findBy*`), links keep their text, and fenced code blocks, markup and
 * the page's closing "Next:" line are dropped.
 */
export function plain(markdown: string): string {
  const spans: string[] = []
  return (
    markdown
      .replace(/^\s*(```|~~~)[\s\S]*?^\s*\1/gm, ' ')
      // Inline code is set aside (as a private-use character and its number) before any
      // markup is removed, then put back.
      .replace(/`([^`\n]+)`/g, (_, code: string) => `${spans.push(code) - 1}`)
      .replace(/^Next: .*$/gm, '')
      .replace(/^\s*:::.*$/gm, '')
      .replace(/<\/?[A-Za-z][^<>]*>/g, ' ')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\s*\{#[^}]+\}/g, '')
      .replace(/\*\*|(^|\W)__(?=\w)|(?<=\w)__(?=\W|$)/g, '$1')
      .replace(/(^|[\s(])[_*]([^_*\s][^_*]*)[_*](?=[\s.,;:)]|$)/g, '$1$2')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
      .replace(/^\s*\|?[\s|:-]+\|?\s*$/gm, '')
      .replace(/\s\|\s|^\||\|$/gm, ' ')
      .replace(/^#+\s*/gm, '')
      .replace(/(\d+)/g, (_, at: string) => spans[Number(at)])
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * A page's entries at one heading level: heading, explicit id, the section above it, and its
 * body up to the next heading of the same or a higher level. Deeper headings stay in the body.
 */
function entries(markdown: string, level: '##' | '###') {
  // Lines inside fenced code are never headings.
  const lines = markdown.replace(/^(```|~~~)[\s\S]*?^\1/gm, (block) => block.replace(/^#/gm, ' #')).split('\n')
  const found: { heading: string; id: string; group: string; body: string[] }[] = []
  let current: (typeof found)[number] | undefined
  let group = ''
  for (const line of lines) {
    const heading = /^(#+) (.*)$/.exec(line)
    if (heading && heading[1].length < level.length) {
      if (heading[1] === '##') group = plain(heading[2].replace(/\s*\{#[^}]+\}\s*$/, ''))
      current = undefined
    } else if (heading && heading[1] === level) {
      const id = /\{#([^}]+)\}\s*$/.exec(heading[2])?.[1]
      const text = heading[2].replace(/\s*\{#[^}]+\}\s*$/, '')
      if (!id) throw new Error(`"${text}" has no {#id}: the error finder links each entry by its id`)
      current = { heading: text, id, group: level === '###' ? group : '', body: [] }
      found.push(current)
    } else {
      current?.body.push(line)
    }
  }
  return found
}

export function errorIndex(
  errorsPage: string = fs.readFileSync(path.join(GUIDE, 'errors.md'), 'utf8'),
  troubleshootingPage: string = fs.readFileSync(path.join(GUIDE, 'troubleshooting.md'), 'utf8'),
): ErrorEntry[] {
  const codes = entries(errorsPage, '###').map(({ heading, id, group, body }) => ({
    title: plain(heading),
    link: `/guide/errors#${id}`,
    kind: 'Error code' as const,
    group,
    text: plain(body.join('\n')),
  }))
  const symptoms = entries(troubleshootingPage, '##')
    // The page's closing entry points elsewhere, and one that only links an error code is
    // found through that code.
    .filter(({ id, body }) => id !== 'still-stuck' && !/^\s*See \[`[A-Z_]+`\]\(\/guide\/errors#/.test(body.join('\n')))
    .map(({ heading, id, body }) => ({
      title: plain(heading),
      link: `/guide/troubleshooting#${id}`,
      kind: 'Troubleshooting' as const,
      group: '',
      text: plain(body.join('\n')),
    }))
  return [...codes, ...symptoms]
}
