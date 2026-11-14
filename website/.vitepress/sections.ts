// The site's sections, in reading order: what the top nav names and the sidebar lists. A page
// keeps its URL whichever section lists it, because vitest-native's messages and earlier
// releases link to those URLs; the sections are drawn over the pages, not their folders.
// tests/site-sections.test.ts checks that every page is in exactly one section.

export interface SectionPage {
  text: string
  link: string
}

export interface Section {
  text: string
  /** Where the section's nav item goes. */
  link: string
  pages: SectionPage[]
}

export const SECTIONS: Section[] = [
  {
    text: 'Get started',
    link: '/guide/',
    pages: [
      { text: 'What is vitest-native', link: '/guide/' },
      { text: 'Installation', link: '/guide/install' },
      { text: 'Quick start', link: '/guide/quick-start' },
      { text: 'Choosing an engine', link: '/guide/engines' },
      { text: 'Comparison with Jest', link: '/guide/comparison' },
    ],
  },
  {
    text: 'Guide',
    link: '/guide/writing-tests',
    pages: [
      { text: 'Writing tests', link: '/guide/writing-tests' },
      { text: 'Mocking', link: '/guide/mocking' },
      { text: 'Third-party presets', link: '/guide/presets' },
      { text: 'Test helpers', link: '/guide/helpers' },
      { text: 'Matchers & snapshots', link: '/guide/matchers' },
      { text: 'Expo', link: '/guide/expo' },
      { text: 'Coverage', link: '/guide/coverage' },
      { text: 'Hot runtime (experimental)', link: '/guide/hot-runtime' },
      { text: 'How it works', link: '/guide/how-it-works' },
    ],
  },
  {
    text: 'Migrate',
    link: '/migration/from-jest',
    pages: [
      { text: 'From Jest', link: '/migration/from-jest' },
      { text: 'jest-compat layer', link: '/guide/jest-compat' },
      { text: 'From vitest-react-native', link: '/migration/from-vitest-react-native' },
      { text: 'Upgrading to 0.15', link: '/migration/upgrading-to-0-15' },
    ],
  },
  {
    text: 'Reference',
    link: '/guide/plugin-options',
    pages: [
      { text: 'Plugin options', link: '/guide/plugin-options' },
      { text: 'CLI', link: '/guide/cli' },
      { text: 'Error codes', link: '/guide/errors' },
      { text: 'Troubleshooting', link: '/guide/troubleshooting' },
      { text: 'Mock engine API coverage', link: '/api/coverage' },
    ],
  },
  {
    text: 'Proof',
    link: '/guide/validation-model',
    pages: [
      { text: 'How it is verified', link: '/guide/validation-model' },
      { text: 'Fidelity report', link: '/guide/fidelity' },
      { text: 'Fidelity matrix', link: '/guide/fidelity-matrix' },
    ],
  },
  {
    text: 'Releases',
    link: '/releases/',
    pages: [
      { text: 'All releases', link: '/releases/' },
      { text: '0.14', link: '/releases/0.14' },
    ],
  },
]

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A regular expression matching the section's pages, for the nav item's `activeMatch`. */
export function activeMatch(section: Section): string {
  return `^(${section.pages.map((page) => escape(page.link)).join('|')})$`
}

export function nav() {
  return SECTIONS.map((section) => ({
    text: section.text,
    link: section.link,
    activeMatch: activeMatch(section),
  }))
}

/**
 * One sidebar on every page. Each section folds, and once the page's script runs VitePress
 * opens the one holding the page being read. Only pages of the site are listed: the footer's
 * previous and next links follow the sidebar, so a link out would become a page's "Next".
 */
export function sidebar() {
  return SECTIONS.map((section) => ({
    text: section.text,
    collapsed: true,
    items: section.pages,
  }))
}
