<script setup lang="ts">
import { withBase } from 'vitepress'

// Where to start, by where the reader is today.
const doors = [
  {
    title: "I'm on Jest today",
    body: 'Run compare on your own suite to see what differs, then migrate writes the Vitest config. Both runners can run side by side until you switch.',
    link: '/migration/from-jest',
    cta: 'Migrate from Jest',
  },
  {
    title: 'New project',
    body: 'Install, run init, and write your first test. It works the same in a bare React Native app and in Expo.',
    link: '/guide/install',
    cta: 'Install',
  },
  {
    title: 'Library author',
    body: "Test a library against React Native's real code with the native engine, or with no React Native at all on the mock engine.",
    link: '/guide/engines',
    cta: 'Choose an engine',
  },
]
</script>

<template>
  <section class="front-doors" aria-labelledby="front-doors-title">
    <h2 id="front-doors-title">Where to start</h2>
    <div class="doors">
      <a v-for="door in doors" :key="door.link" class="door" :href="withBase(door.link)">
        <span class="title">{{ door.title }}</span>
        <span class="body">{{ door.body }}</span>
        <span class="cta">{{ door.cta }} <span aria-hidden="true">→</span></span>
      </a>
    </div>
  </section>
</template>

<style scoped>
.front-doors {
  margin: 8px 0 16px;
}
.front-doors h2 {
  margin: 0 0 16px;
  padding: 0;
  border: 0;
  font-size: 20px;
}
.doors {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
@media (max-width: 768px) {
  .doors {
    grid-template-columns: minmax(0, 1fr);
  }
}
.door {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition: border-color 0.2s;
}
.door:hover {
  border-color: var(--vp-c-brand-1);
}
.door:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .door {
    transition: none;
  }
}
.title {
  font-size: 17px;
  font-weight: 600;
}
.body {
  flex: 1;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.cta {
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-brand-1);
}
</style>
