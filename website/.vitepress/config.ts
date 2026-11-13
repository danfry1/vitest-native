import { defineConfig } from 'vitepress'
import { groupIconMdPlugin, groupIconVitePlugin } from 'vitepress-plugin-group-icons'
import { BASE, OG_IMAGE, SITE_URL, canonicalUrl } from './site.ts'
import { slugify } from './anchors.ts'

const description =
  "A Vitest plugin for React Native. Your components run React Native's real JavaScript; only the native side is mocked."

export default defineConfig({
  title: 'vitest-native',
  description,
  lang: 'en-US',
  base: BASE,
  cleanUrls: true,
  lastUpdated: true,
  sitemap: { hostname: `${SITE_URL}/` },
  // One canonical URL per page, on the published address, whichever host serves the build.
  // The not-found page has none: a host serves it for every missing address.
  transformHead: ({ pageData }) =>
    pageData.isNotFound || pageData.relativePath === '404.md'
      ? []
      : [['link', { rel: 'canonical', href: canonicalUrl(pageData.relativePath) }]],
  head: [
    ['link', { rel: 'icon', href: `${BASE}favicon.svg`, type: 'image/svg+xml' }],
    ['meta', { name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' }],
    ['meta', { name: 'theme-color', content: '#0a0a0a', media: '(prefers-color-scheme: dark)' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'vitest-native' }],
    // A PNG: X, Facebook, LinkedIn and Slack do not render an SVG og:image.
    ['meta', { property: 'og:image', content: OG_IMAGE }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:image:alt', content: 'vitest-native: Test React Native as it ships.' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: OG_IMAGE }],
    ['meta', { property: 'og:title', content: 'vitest-native: Test React Native as it ships' }],
    ['meta', { name: 'twitter:title', content: 'vitest-native: Test React Native as it ships' }],
  ],
  // Icons on code-group tabs (npm, pnpm, yarn, bun) and file-name labels.
  markdown: {
    // Quiet, low-saturation code colours in both themes, so the green accent stays rare.
    theme: { light: 'vitesse-light', dark: 'vitesse-dark' },
    // Keeps an error code's spelling in links to it (see anchors.ts).
    anchor: { slugify },
    config(md) {
      md.use(groupIconMdPlugin)
    },
  },
  vite: {
    plugins: [groupIconVitePlugin()],
  },
  themeConfig: {
    logo: { light: '/logo.svg', dark: '/logo-dark.svg', alt: '' },
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/danfry1/vitest-native' }],
    editLink: {
      pattern: 'https://github.com/danfry1/vitest-native/edit/main/website/:path',
      text: 'Edit this page on GitHub',
    },
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'API Coverage', link: '/api/coverage' },
      {
        text: 'Migrating',
        items: [
          { text: 'From Jest', link: '/migration/from-jest' },
          { text: 'From vitest-react-native', link: '/migration/from-vitest-react-native' },
          { text: 'Upgrading to 0.15', link: '/migration/upgrading-to-0-15' },
        ],
      },
      {
        text: 'Resources',
        items: [
          { text: 'Changelog', link: 'https://github.com/danfry1/vitest-native/blob/main/packages/vitest-native/CHANGELOG.md' },
          { text: 'npm', link: 'https://www.npmjs.com/package/vitest-native' },
          { text: 'llms.txt', link: '/llms.txt', target: '_blank' },
        ],
      },
    ],
    sidebar: {
      '/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is vitest-native', link: '/guide/' },
            { text: 'Installation', link: '/guide/install' },
            { text: 'Quick Start', link: '/guide/quick-start' },
            { text: 'Choosing an Engine', link: '/guide/engines' },
            { text: 'Hot Runtime', link: '/guide/hot-runtime' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'How It Works', link: '/guide/how-it-works' },
            { text: 'Plugin Options', link: '/guide/plugin-options' },
            { text: 'Third-Party Presets', link: '/guide/presets' },
            { text: 'Expo', link: '/guide/expo' },
            { text: 'Coverage', link: '/guide/coverage' },
            { text: 'Matchers & Snapshots', link: '/guide/matchers' },
            { text: 'Mocking', link: '/guide/mocking' },
            { text: 'Test Helpers', link: '/guide/helpers' },
            { text: 'CLI', link: '/guide/cli' },
          ],
        },
        {
          text: 'Migrating',
          items: [
            { text: 'From Jest', link: '/migration/from-jest' },
            { text: 'jest-compat Layer', link: '/guide/jest-compat' },
            { text: 'From vitest-react-native', link: '/migration/from-vitest-react-native' },
            { text: 'Upgrading to 0.15', link: '/migration/upgrading-to-0-15' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'API Coverage', link: '/api/coverage' },
            { text: 'Validation Model', link: '/guide/validation-model' },
            { text: 'Fidelity Report', link: '/guide/fidelity' },
            { text: 'Fidelity Matrix', link: '/guide/fidelity-matrix' },
            { text: 'Comparison with Jest', link: '/guide/comparison' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
            { text: 'Error Codes', link: '/guide/errors' },
          ],
        },
      ],
    },
    outline: { level: [2, 3] },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Daniel Fry',
    },
  },
})
