<script setup lang="ts">
// The hero's second column: a real test (hero/Counter.test.tsx, run as written by the
// packed doc-snippet run) and the output of running it (hero/run.txt), which that run
// compares with a fresh one, so neither can drift from what vitest-native does.
import HeroCode from '../../hero/HeroCode.md'
import runOutput from '../../hero/run.txt?raw'

type Line = { kind: 'banner' | 'pass' | 'fail' | 'total'; text: string; detail?: string }

const lines: Line[] = runOutput
  .trimEnd()
  .split('\n')
  .map((text): Line => {
    const banner = /^\[vitest-native\] (engine: native — )(real react-native@\S+)(.*)$/.exec(text)
    if (banner) return { kind: 'banner', text: banner[1], detail: banner[2] }
    if (text.startsWith('✓')) return { kind: 'pass', text: text.slice(1).trim() }
    if (text.startsWith('×')) return { kind: 'fail', text: text.slice(1).trim() }
    return { kind: 'total', text }
  })
</script>

<template>
  <figure class="hero-demo" aria-label="A test, and the output of running it">
    <div class="editor">
      <HeroCode />
    </div>
    <div class="terminal" role="group" aria-label="Run output">
      <div class="command"><span class="prompt" aria-hidden="true">$</span> npx vitest run</div>
      <div v-for="(line, index) in lines" :key="index" :class="['line', line.kind]">
        <template v-if="line.kind === 'banner'">
          <span class="dim">[vitest-native]</span> {{ line.text }}<strong>{{ line.detail }}</strong>
        </template>
        <template v-else-if="line.kind === 'pass'">
          <span class="mark" aria-label="passed">✓</span> {{ line.text }}
        </template>
        <template v-else-if="line.kind === 'fail'">
          <span class="mark" aria-label="failed">×</span> {{ line.text }}
        </template>
        <template v-else>{{ line.text }}</template>
      </div>
    </div>
  </figure>
</template>

<style scoped>
.hero-demo {
  margin: 0;
  width: 100%;
  max-width: 40rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  overflow: hidden;
  background: var(--vp-code-block-bg);
  text-align: start;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 12px 32px -12px rgba(0, 0, 0, 0.12);
}
.editor :deep(.vp-code-block-title-bar) {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  height: auto;
  padding: 10px 18px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: transparent;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--vp-c-text-2);
}
/* An editor tab's dot, in the text colour: the file is open, not modified. */
.editor :deep(.vp-code-block-title-bar)::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--vp-c-text-3);
}
.editor :deep(.vp-code-block-title-text) {
  height: auto;
  padding: 0;
  line-height: 1.5;
}
.editor :deep(div[class*='language-']) {
  position: relative;
  margin: 0;
  border-radius: 0;
  background: var(--vp-code-block-bg);
}
.editor :deep(pre) {
  margin: 0;
  padding: 16px 0;
  overflow-x: auto;
  background: transparent !important;
}
.editor :deep(code) {
  display: block;
  width: fit-content;
  min-width: 100%;
  padding: 0 20px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  line-height: 1.7;
}
.editor :deep(.line) {
  white-space: pre;
}
.editor :deep(.lang),
.editor :deep(.copy) {
  display: none;
}
.terminal {
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  padding: 14px 20px 16px;
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--vp-c-text-1);
  overflow-wrap: anywhere;
}
.command {
  color: var(--vp-c-text-2);
  margin-bottom: 4px;
}
.prompt,
.dim {
  color: var(--vp-c-text-3);
}
.banner {
  color: var(--vp-c-text-2);
}
.banner strong {
  font-weight: 600;
  color: var(--vp-c-brand-1);
}
.pass .mark {
  color: var(--vp-c-brand-1);
}
.fail .mark {
  color: var(--vp-c-danger-1);
}
.total {
  color: var(--vp-c-text-1);
}
.total:first-of-type {
  margin-top: 6px;
}
</style>
