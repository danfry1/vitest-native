import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import 'virtual:group-icons.css'
import FrontDoors from './components/FrontDoors.vue'
import HeroBoundary from './components/HeroBoundary.vue'
import HeroInstall from './components/HeroInstall.vue'
import SupportLine from './components/SupportLine.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  // The hero's install command and supported versions sit under its buttons, and the
  // boundary diagram fills its second column.
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'home-hero-actions-after': () => [h(HeroInstall), h(SupportLine)],
      'home-hero-image': () => h(HeroBoundary),
    }),
  enhanceApp({ app }) {
    app.component('FrontDoors', FrontDoors)
  },
} satisfies Theme
