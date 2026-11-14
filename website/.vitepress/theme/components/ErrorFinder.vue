<script setup lang="ts">
// "Find your error": paste a message, or a few words of it, and get the error-code and
// troubleshooting entries it matches. The index is read from both pages at build time
// (website/.vitepress/error-index.ts); the search runs in the browser (error-search.ts).
// Only the errors and troubleshooting pages import it, so no other page loads the index.
import { withBase } from 'vitepress'
import { computed, ref } from 'vue'
import { data as index } from '../../errors.data'
import { findErrors, searchable } from '../../error-search'

const query = ref('')
// Nothing is said until the query has a word or a code to search by.
const ready = computed(() => searchable(query.value))
const results = computed(() => (ready.value ? findErrors(index, query.value) : []))

function snippet(text: string): string {
  return text.length > 180 ? `${text.slice(0, 180).replace(/\s+\S*$/, '')}…` : text
}
</script>

<template>
  <section class="finder" aria-labelledby="finder-title">
    <!-- Not a heading: the page outline lists only the page's own sections. -->
    <label id="finder-title" class="label" for="finder-input">Find your error</label>
    <p id="finder-hint" class="hint">
      Paste the message, or a few words of it. A code such as <code>UNSUPPORTED_PEER</code> finds
      its entry directly.
    </p>
    <textarea
      id="finder-input"
      v-model="query"
      aria-describedby="finder-hint"
      rows="2"
      spellcheck="false"
      autocomplete="off"
      placeholder="[vitest-native] …"
    />
    <p class="count" aria-live="polite">
      <template v-if="ready">
        <template v-if="results.length">{{ results.length }} {{ results.length === 1 ? 'match' : 'matches' }}</template>
        <template v-else>
          Nothing matched. Try a shorter part of the message, or see
          <a :href="withBase('/guide/troubleshooting#still-stuck')">Still stuck?</a>
        </template>
      </template>
    </p>
    <ol v-if="results.length" class="results">
      <li v-for="entry in results" :key="entry.link">
        <a class="result" :href="withBase(entry.link)">
          <span class="title" :class="{ code: entry.kind === 'Error code' }">{{ entry.title }}</span>
          <span class="kind">{{ entry.kind }}<template v-if="entry.group"> · {{ entry.group }}</template></span>
          <span class="snippet">{{ snippet(entry.text) }}</span>
        </a>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.finder {
  margin: 24px 0 32px;
  padding: 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg-soft);
}
.finder .label {
  display: block;
  margin: 0 0 6px;
  font-weight: 600;
  font-size: 17px;
  line-height: 1.4;
  letter-spacing: -0.01em;
}
.finder .hint {
  margin: 0 0 10px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}
textarea {
  display: block;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
}
/* Below 16px, phones zoom the page in when the box takes focus. */
@media (max-width: 640px) {
  textarea {
    font-size: 16px;
  }
}
textarea::placeholder {
  color: var(--vp-c-text-3);
}
textarea:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}
.count {
  min-height: 1.6em;
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
.results {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}
.results li {
  margin: 0;
}
.results li + li {
  margin-top: 8px;
}
.result {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  text-decoration: none;
}
.result:hover {
  border-color: var(--vp-c-brand-1);
}
.result:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}
.title {
  font-size: 15px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
  overflow-wrap: anywhere;
}
.title.code {
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
}
.kind {
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.snippet {
  font-size: 13px;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}
</style>
