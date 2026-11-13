// How the site turns a heading, or the hash of a Markdown link, into an anchor id.
//
// An error code's entry has its code as its id (`/guide/errors#UNSUPPORTED_PEER`): the
// links vitest-native prints in its messages use that spelling. VitePress passes the hash
// of every Markdown link through the same function as headings, so with its default a link
// to `#UNSUPPORTED_PEER` was written as `#unsupported-peer` and reached no entry. A code is
// kept as written; everything else is slugified as VitePress does.

const CODE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/

// VitePress's default (`slugify` in @mdit-vue/shared, which VitePress does not export).
// tests/site-anchors.test.ts checks it against the ids VitePress gives the site's headings.
const CONTROL = /[\u0000-\u001f]/g // eslint-disable-line no-control-regex
const SPECIAL = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g
const COMBINING = /[̀-ͯ]/g

export function slugify(text: string): string {
  if (CODE.test(text)) return text
  return text
    .normalize('NFKD')
    .replace(COMBINING, '')
    .replace(CONTROL, '')
    .replace(SPECIAL, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase()
}
