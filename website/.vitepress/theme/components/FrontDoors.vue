<script setup lang="ts">
import { withBase } from 'vitepress'
import { ref } from 'vue'

// Where to start, by where the reader is today. Every card reads the same way: an icon and
// a title, one line on what it gets you, the code that starts it, and a link on one shared
// baseline. The three are equals: same width, no ranking. The link covers the card, so
// the whole card opens it; the copy buttons sit above that cover, so a command can be
// copied without leaving the page.

const copied = ref<string | null>(null)

async function copy(text: string, event: MouseEvent) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = text
    setTimeout(() => {
      if (copied.value === text) copied.value = null
    }, 1800)
  } catch {
    // No clipboard access: select the command so the reader can copy it.
    const code = (event.currentTarget as HTMLElement).parentElement?.querySelector('code')
    if (!code) return
    const range = document.createRange()
    range.selectNodeContents(code)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
}

const jestSteps = [
  { label: 'Compare', note: 'see what differs on your suite', command: 'npx vitest-native compare' },
  { label: 'Migrate', note: 'write the Vitest config', command: 'npx vitest-native migrate --write' },
]
const newSteps = [
  { label: 'Set up', note: 'write the Vitest config', command: 'npx vitest-native init' },
  { label: 'Run', note: 'in watch mode', command: 'npx vitest' },
]
const choices = [
  { label: 'Renders components', engine: "engine: 'native'" },
  { label: 'Logic only', engine: "engine: 'mock'" },
]
</script>

<template>
  <section class="front-doors" aria-labelledby="front-doors-title">
    <h2 id="front-doors-title">Where to start</h2>
    <div class="doors">
      <!-- On Jest today: compare, then migrate. -->
      <article class="door">
        <header class="head">
          <span class="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M4 8h13m0 0-3.5-3.5M17 8l-3.5 3.5M20 16H7m0 0 3.5-3.5M7 16l3.5 3.5" />
            </svg>
          </span>
          <h3 class="title">I'm on Jest today</h3>
        </header>
        <p class="promise">Find out what changes on your own suite before you switch anything.</p>
        <ol class="steps">
          <li v-for="(step, index) in jestSteps" :key="step.label" class="step">
            <span class="num" aria-hidden="true">{{ index + 1 }}</span>
            <div class="step-body">
              <span class="step-label">{{ step.label }} <span class="step-note">· {{ step.note }}</span></span>
              <div class="codeline">
                <code
                  ><template v-for="(word, w) in step.command.split(' ')" :key="w"
                    ><span class="word">{{ word }}</span>{{ w < step.command.split(' ').length - 1 ? ' ' : '' }}</template
                  ></code
                >
                <button type="button" class="copy" :aria-label="`Copy ${step.command}`" :title="copied === step.command ? 'Copied' : 'Copy'" @click="copy(step.command, $event)">
                  <svg v-if="copied === step.command" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 7" /></svg>
                  <svg v-else viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                </button>
              </div>
            </div>
          </li>
        </ol>
        <a class="cta" :href="withBase('/migration/from-jest')">Migrate from Jest<span class="arrow" aria-hidden="true">→</span></a>
      </article>

      <!-- New project: set up, then run. -->
      <article class="door">
        <header class="head">
          <span class="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5M12 11v6M9 14h6" />
            </svg>
          </span>
          <h3 class="title">New project</h3>
        </header>
        <p class="promise">Set up a bare React Native or Expo app and run your first test.</p>
        <ol class="steps">
          <li v-for="(step, index) in newSteps" :key="step.label" class="step">
            <span class="num" aria-hidden="true">{{ index + 1 }}</span>
            <div class="step-body">
              <span class="step-label">{{ step.label }} <span class="step-note">· {{ step.note }}</span></span>
              <div class="codeline">
                <code
                  ><template v-for="(word, w) in step.command.split(' ')" :key="w"
                    ><span class="word">{{ word }}</span>{{ w < step.command.split(' ').length - 1 ? ' ' : '' }}</template
                  ></code
                >
                <button type="button" class="copy" :aria-label="`Copy ${step.command}`" :title="copied === step.command ? 'Copied' : 'Copy'" @click="copy(step.command, $event)">
                  <svg v-if="copied === step.command" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 7" /></svg>
                  <svg v-else viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                </button>
              </div>
            </div>
          </li>
        </ol>
        <a class="cta" :href="withBase('/guide/install')">Start a project<span class="arrow" aria-hidden="true">→</span></a>
      </article>

      <!-- Library author: choose by what the library does. -->
      <article class="door">
        <header class="head">
          <span class="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" />
              <path d="M4 7.5 12 12l8-4.5M12 12v9" />
            </svg>
          </span>
          <h3 class="title">Library author</h3>
        </header>
        <p class="promise">Pick the engine by what your library does.</p>
        <dl class="choices">
          <div v-for="choice in choices" :key="choice.label" class="choice">
            <dt>{{ choice.label }}</dt>
            <dd><code>{{ choice.engine }}</code></dd>
          </div>
        </dl>
        <p class="aside">Either way, the same tests and the same Testing Library API.</p>
        <a class="cta" :href="withBase('/guide/engines#testing-a-library')">Choose an engine<span class="arrow" aria-hidden="true">→</span></a>
      </article>
    </div>
    <span class="sr-only" aria-live="polite">{{ copied ? 'Command copied' : '' }}</span>
  </section>
</template>

<style scoped>
.front-doors {
  margin: 8px 0 16px;
}
.front-doors h2 {
  margin: 0 0 20px;
  padding: 0;
  border: 0;
  font-size: 20px;
}
.doors {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: stretch;
}
@media (max-width: 960px) {
  .doors {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* The card. Its link stretches over it (.cta::after), so clicking anywhere opens it. */
.door {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg-soft);
  transition:
    border-color 0.2s,
    transform 0.2s,
    box-shadow 0.2s;
}
.door:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-2px);
  box-shadow: 0 10px 24px -16px rgba(0, 0, 0, 0.35);
}
.door:has(.cta:focus-visible) {
  border-color: var(--vp-c-brand-1);
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}
.icon svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.3;
  color: var(--vp-c-text-1);
}
.promise {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}

/* A command: quiet, in the code colours, with its copy button. */
.codeline {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px 8px 8px 12px;
  border-radius: 8px;
  background: var(--vp-code-block-bg);
  border: 1px solid var(--vp-c-divider);
}
.codeline code,
.choice code {
  /* Plain text inside its box: no inline-code chip of its own. */
  background: none !important;
  padding: 0 !important;
  border-radius: 0 !important;
}
.codeline code {
  flex: 1;
  min-width: 0;
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--vp-c-text-1);
  /* A long command wraps between words, never inside one, rather than scrolling. */
  white-space: normal;
}
.word {
  white-space: nowrap;
}
.copy {
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  color: var(--vp-c-text-2);
  border: 1px solid transparent;
}
.copy svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.copy:hover {
  color: var(--vp-c-text-1);
  border-color: var(--vp-c-divider);
}
.copy:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 1px;
}

/* The Jest flow: numbered steps joined by a thin line. */
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 14px;
}
.step {
  position: relative;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 12px;
}
/* The line from one step's number down to the next one's. */
.step:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 11.5px;
  top: 30px;
  bottom: -13px;
  border-left: 1px solid var(--vp-c-divider);
}
.num {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  margin-top: 1px;
  border-radius: 50%;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--vp-c-text-1);
}
.step-body {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.step-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.step-note {
  font-weight: 400;
  color: var(--vp-c-text-2);
}

/* The library choice: what the library does, then the engine. */
.choices {
  margin: 0;
  display: grid;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-code-block-bg);
  overflow: hidden;
}
.choice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
}
.choice + .choice {
  border-top: 1px solid var(--vp-c-divider);
}
.choice dt {
  font-size: 13.5px;
  color: var(--vp-c-text-1);
}
.choice dd {
  margin: 0;
}
.choice code {
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  color: var(--vp-c-text-1);
  white-space: nowrap;
}

.aside {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
}

/* The link: one baseline row at the foot of every card. */
.cta {
  margin-top: auto;
  padding-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  text-decoration: none !important;
}
.cta::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 14px;
}
.cta:focus-visible {
  outline: none;
}
.arrow {
  transition: transform 0.2s;
}
.door:hover .cta,
.cta:focus-visible {
  color: var(--vp-c-brand-1);
}
.door:hover .arrow,
.cta:focus-visible .arrow {
  transform: translateX(3px);
}
@media (prefers-reduced-motion: reduce) {
  .door,
  .arrow {
    transition: none;
  }
  .door:hover,
  .door:hover .arrow,
  .cta:focus-visible .arrow {
    transform: none;
  }
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
