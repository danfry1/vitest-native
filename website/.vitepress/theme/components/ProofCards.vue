<script setup lang="ts">
// How the project is checked: four cards, each a number read at build time from its source
// (website/.vitepress/proof.ts), what it does and does not cover, and where to check it.
// The fourth has no number: it is the reader's own suite.
import { withBase } from 'vitepress'
import { data } from '../../proof.data'

const { crossCheck, museum, ported } = data
const TREE = 'https://github.com/danfry1/vitest-native/tree/main/packages/vitest-native'
const BLOB = 'https://github.com/danfry1/vitest-native/blob/main/packages/vitest-native'

function list(items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0]
}
</script>

<template>
  <div class="proof">
    <article class="card">
      <p class="figure">
        <span class="number">{{ crossCheck.probesMatching }}&thinsp;/&thinsp;{{ crossCheck.probes }}</span>
        <span class="unit">probes agree</span>
      </p>
      <h3 class="title">The mock engine against real React Native</h3>
      <p class="text">
        Each probe runs the same assertions under the mock engine and under React Native
        {{ crossCheck.reactNative }}, and a difference fails CI. They reach
        {{ crossCheck.apisReached }} of {{ crossCheck.apis }} mocked APIs and
        {{ crossCheck.componentsReached }} of {{ crossCheck.components }} mocked components;
        the rest are not measured.
      </p>
      <a class="check" :href="withBase('/guide/fidelity')">Fidelity report →</a>
    </article>

    <article class="card">
      <p class="figure">
        <span class="number">{{ museum.exhibits }}</span>
        <span class="unit">bugs, each a runnable test</span>
      </p>
      <h3 class="title">The bug museum</h3>
      <p class="text">
        Each exhibit is a small project that reproduces a real bug. {{ museum.proven }} are
        proven: they fail on a build that has the bug and pass on one without it.
        {{ museum.open }} are open bugs, shown failing; the rest are not yet proven.
      </p>
      <a class="check" :href="`${BLOB}/validation/bug-museum/STATUS.md`">Status of every exhibit</a>
    </article>

    <article class="card">
      <p class="figure">
        <span class="number">{{ ported.tests }}</span>
        <span class="unit">tests from React Native's own suite</span>
      </p>
      <h3 class="title">React Native's tests, ported</h3>
      <p class="text">
        Ported from React Native's {{ list(ported.areas) }} tests and run against the mock
        engine; {{ ported.skipped }} are skipped.
      </p>
      <a class="check" :href="`${TREE}/tests/rn-conformance`">The ported tests</a>
    </article>

    <article class="card yours">
      <p class="figure">
        <code class="number command">compare</code>
        <span class="unit">on your own suite</span>
      </p>
      <h3 class="title">Your suite, not ours</h3>
      <p class="text">
        <code>npx vitest-native compare</code> runs your Jest and your Vitest and lists every test
        that passes under Jest and not under Vitest.
      </p>
      <a class="check" :href="withBase('/guide/cli#compare')">How compare works →</a>
    </article>
  </div>
</template>

<style scoped>
.proof {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 20px 0 16px;
}
@media (max-width: 760px) {
  .proof {
    grid-template-columns: minmax(0, 1fr);
  }
}
.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 22px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg-soft);
}
.card.yours {
  border-color: var(--vp-c-brand-1);
}
.figure {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  margin: 0;
  line-height: 1.1;
}
.number {
  font-size: 34px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-1);
}
.number.command {
  padding: 0;
  font-size: 26px;
  background: none;
}
.unit {
  font-size: 14px;
  color: var(--vp-c-text-2);
}
.title {
  margin: 4px 0 0;
  padding: 0;
  border: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--vp-c-text-1);
}
.text {
  flex: 1;
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.check {
  align-self: flex-start;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.check:hover {
  color: var(--vp-c-brand-2);
}
.check:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
  border-radius: 2px;
}
</style>
