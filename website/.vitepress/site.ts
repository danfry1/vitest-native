// Where the site lives. The address comes from the package's own constant, so the links
// vitest-native prints and the site's canonical links, sitemap and social card agree.
// The site is served at its domain's root. SITE_BASE sets another base for a build, such
// as /vitest-native/ for a full copy on GitHub Pages.
import { SITE_URL } from '../../packages/vitest-native/src/docs-url.mjs'

export { SITE_URL }

/** The path the site is served under, with a slash at each end. */
export const BASE = normalizeBase(process.env.SITE_BASE ?? '/')

export function normalizeBase(base: string): string {
  const trimmed = base.replace(/^\/+|\/+$/g, '')
  return trimmed ? `/${trimmed}/` : '/'
}

/** The social card, by absolute URL: link previews fetch it from outside the site. */
export const OG_IMAGE = `${SITE_URL}/og-card.png`

/**
 * A page's canonical URL from its source file: `guide/install.md` is `/guide/install`,
 * `guide/index.md` is `/guide/`, `index.md` is `/`. Previews and the old address point
 * search engines at the one published copy.
 */
export function canonicalUrl(relativePath: string): string {
  const page = relativePath.replace(/\\/g, '/').replace(/\.md$/, '')
  const path = page === 'index' ? '' : page.endsWith('/index') ? page.slice(0, -'index'.length) : page
  return `${SITE_URL}/${path}`
}
