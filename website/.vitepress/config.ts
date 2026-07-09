import { defineConfig } from 'vitepress'

const description =
  'Run your React Native tests under Vitest against real React Native — the same JS that ships in your app, mocking only the native-module boundary. One plugin, two engines.'

export default defineConfig({
  title: 'vitest-native',
  description,
  lang: 'en-US',
  base: '/vitest-native/',
  cleanUrls: true,
  lastUpdated: true,
  sitemap: { hostname: 'https://danfry1.github.io/vitest-native/' },
  head: [
    ['link', { rel: 'icon', href: '/vitest-native/favicon.svg', type: 'image/svg+xml' }],
    ['meta', { name: 'theme-color', content: '#10b3a3' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'vitest-native' }],
    ['meta', { property: 'og:image', content: 'https://danfry1.github.io/vitest-native/og-card.svg' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: 'https://danfry1.github.io/vitest-native/og-card.svg' }],
    ['meta', { property: 'og:title', content: 'vitest-native — Test React Native with Vitest' }],
    ['meta', { name: 'twitter:title', content: 'vitest-native — Test React Native with Vitest' }],
  ],
  themeConfig: {
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
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'How It Works', link: '/guide/how-it-works' },
            { text: 'Plugin Options', link: '/guide/plugin-options' },
            { text: 'Third-Party Presets', link: '/guide/presets' },
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
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'API Coverage', link: '/api/coverage' },
            { text: 'Fidelity Report', link: '/guide/fidelity' },
            { text: 'Fidelity Matrix', link: '/guide/fidelity-matrix' },
            { text: 'Comparison with Jest', link: '/guide/comparison' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
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
