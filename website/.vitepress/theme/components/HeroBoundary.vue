<script setup lang="ts">
import { withBase } from 'vitepress'

// The compact boundary diagram: what runs for real in a test, and where vitest-native's
// mock boundary sits. Static; the interactive version (Jest's preset, the native engine and
// the mock engine) comes with the How It Works diagram.
const layers = [
  { name: 'Your test', detail: 'Testing Library: render, queries, events' },
  { name: 'Your components', detail: 'the code that ships in your app' },
  { name: 'React Native', detail: 'View, Text, ScrollView, Pressable…' },
]
</script>

<template>
  <figure class="boundary" aria-labelledby="boundary-caption">
    <ol class="layers">
      <li v-for="layer in layers" :key="layer.name" class="layer">
        <span class="layer-name">{{ layer.name }}</span>
        <span class="layer-detail">{{ layer.detail }}</span>
        <span class="layer-state">runs</span>
      </li>
      <li class="line" aria-hidden="true"><span>mocked below this line</span></li>
      <li class="layer native">
        <span class="layer-name">Native side</span>
        <span class="layer-detail">native modules, host components</span>
        <span class="layer-state">mocked</span>
      </li>
    </ol>
    <figcaption id="boundary-caption">
      What runs in a vitest-native test. Jest's React Native preset also swaps
      <code>View</code>, <code>Text</code> and <code>ScrollView</code> for stand-ins.
      <a :href="withBase('/guide/comparison#where-the-mock-boundary-sits')">Compare the boundaries</a>
    </figcaption>
  </figure>
</template>

<style scoped>
.boundary {
  margin: 0;
  width: 100%;
  max-width: 30rem;
  padding: 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg-soft);
  text-align: start;
}
.layers {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.layer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas: 'name state' 'detail state';
  gap: 2px 12px;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
}
.layer-name {
  grid-area: name;
  font-size: 15px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.layer-detail {
  grid-area: detail;
  font-size: 13px;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}
.layer-state {
  grid-area: state;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.line {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 0;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--vp-c-text-2);
  white-space: nowrap;
}
.line::before,
.line::after {
  content: '';
  flex: 1;
  border-top: 2px dashed var(--vp-c-text-3);
}
.layer.native {
  background: transparent;
  border: 1.5px dashed var(--vp-c-text-3);
}
figcaption {
  margin-top: 14px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
figcaption code {
  font-size: 12px;
}
figcaption a {
  color: var(--vp-c-brand-1);
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 2px;
}
figcaption a:hover {
  color: var(--vp-c-brand-2);
}
</style>
