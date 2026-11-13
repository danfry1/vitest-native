<script setup lang="ts">
// "See it work": `vitest-native migrate`, then `migrate --write`, on a sample app. The
// output is the CLI's own (replay/*.txt, written and checked by
// packages/vitest-native/tests/site-replay.e2e.test.ts), shown a line at a time once the
// terminal scrolls into view. Under reduced motion it shows everything at once, and screen
// readers get the whole transcript, not the animation.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import migrateOutput from '../../replay/migrate.txt?raw'
import writeOutput from '../../replay/write.txt?raw'

type Step = { command: string; output: string[] }

const steps: Step[] = [
  { command: 'npx vitest-native migrate', output: migrateOutput.trimEnd().split('\n') },
  { command: 'npx vitest-native migrate --write', output: writeOutput.trimEnd().split('\n') },
]
// Each command's characters, then its lines, as one sequence of frames.
const frames = steps.flatMap((step, index) => [
  ...Array.from({ length: step.command.length }, (_, typed) => ({ index, typed: typed + 1, lines: 0 })),
  ...step.output.map((_, line) => ({ index, typed: step.command.length, lines: line + 1 })),
])
const transcript = steps.map((step) => `$ ${step.command}\n${step.output.join('\n')}`).join('\n\n')

const frame = ref(0)
const playing = ref(false)
const done = computed(() => frame.value >= frames.length - 1)
const screen = ref<HTMLElement>()
let timer: ReturnType<typeof setTimeout> | undefined
let observer: IntersectionObserver | undefined

/** What is on screen: each step up to the current frame. */
const shown = computed(() => {
  const at = frames[frame.value]
  return steps
    .map((step, index) => {
      if (index < at.index) return { command: step.command, output: step.output, typing: false }
      if (index > at.index) return null
      return {
        command: step.command.slice(0, at.typed),
        output: step.output.slice(0, at.lines),
        typing: at.typed < step.command.length,
      }
    })
    .filter((step) => step !== null)
})

/** A wrapped line starts under its text, not under its bullet or its indent. */
function hang(line: string): Record<string, string> {
  const indent = line.length - line.trimStart().length
  const bullet = line.trimStart().startsWith('• ') ? 2 : 0
  return { paddingInlineStart: `${indent + bullet}ch`, textIndent: `-${bullet}ch` }
}

/** A section heading of the report (`Mapped automatically:`), a done line, or text. */
function kind(line: string): string {
  if (line.startsWith('✓')) return 'done'
  return /^\S.{0,38}:$/.test(line) ? 'heading' : ''
}

function tick() {
  if (done.value) {
    playing.value = false
    return
  }
  frame.value++
  // Keep the newest line in view, inside the terminal only.
  requestAnimationFrame(() => screen.value?.scrollTo({ top: screen.value.scrollHeight }))
  const at = frames[frame.value]
  // Typing is quick; output lines come a little slower, and a pause before each command.
  const typing = at.typed < steps[at.index].command.length
  timer = setTimeout(tick, typing ? 35 : at.lines === 0 ? 500 : 60)
}

function play() {
  if (done.value) frame.value = 0
  playing.value = true
  clearTimeout(timer)
  timer = setTimeout(tick, 300)
}

function pause() {
  playing.value = false
  clearTimeout(timer)
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    frame.value = frames.length - 1
    return
  }
  // Start once the terminal is on screen, so the reader sees it from the first command.
  observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      observer?.disconnect()
      play()
    }
  }, { threshold: 0.4 })
  if (screen.value) observer.observe(screen.value)
})

onBeforeUnmount(() => {
  clearTimeout(timer)
  observer?.disconnect()
})
</script>

<template>
  <figure class="replay">
    <figcaption class="bar">
      <span class="label">Sample app</span>
      <span class="note">
        A small React Native app with a typical Jest setup, not your project. Its files are in
        <a href="https://github.com/danfry1/vitest-native/tree/main/packages/vitest-native/tests/fixtures/sample-app">the repository</a>.
      </span>
      <button
        v-if="playing"
        type="button"
        class="control"
        @click="pause"
      >Pause</button>
      <button v-else type="button" class="control" @click="play">{{ done ? 'Replay' : 'Play' }}</button>
    </figcaption>
    <div ref="screen" class="screen" aria-hidden="true">
      <div v-for="step in shown" :key="step.command" class="step">
        <div class="command">
          <span class="prompt">$</span> {{ step.command }}<span v-if="step.typing" class="cursor" />
        </div>
        <div
          v-for="(line, index) in step.output"
          :key="index"
          :class="['line', kind(line)]"
          :style="hang(line)"
        >{{ line.trimStart() || '\u00a0' }}</div>
      </div>
    </div>
    <pre class="transcript">{{ transcript }}</pre>
  </figure>
</template>

<style scoped>
.replay {
  margin: 24px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  overflow: hidden;
  background: var(--vp-code-block-bg);
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--vp-c-divider);
  font-size: 13px;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}
.label {
  padding: 1px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.note {
  flex: 1 1 16rem;
}
.control {
  margin-inline-start: auto;
  padding: 3px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 13px;
  font-weight: 500;
}
.control:hover {
  border-color: var(--vp-c-brand-1);
}
.control:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}
.screen {
  height: 26rem;
  overflow: auto;
  padding: 14px 16px 18px;
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--vp-c-text-1);
}
.step + .step {
  margin-top: 14px;
}
.command {
  font-weight: 600;
}
.prompt {
  color: var(--vp-c-text-3);
}
.cursor {
  display: inline-block;
  width: 0.55em;
  height: 1.1em;
  margin-inline-start: 1px;
  vertical-align: text-bottom;
  background: var(--vp-c-text-2);
}
.line {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--vp-c-text-2);
}
.line.heading {
  color: var(--vp-c-text-1);
  font-weight: 600;
}
.line.done {
  color: var(--vp-c-brand-1);
}
/* Read by screen readers in place of the animation; not shown. */
.transcript {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: pre-wrap;
}
@media (max-width: 640px) {
  .screen {
    height: 22rem;
    font-size: 12px;
  }
}
</style>
