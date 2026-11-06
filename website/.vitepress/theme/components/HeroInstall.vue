<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

// The install command in the hero, for each package manager. The reader's choice is a
// convenience kept in localStorage; the page works the same without it.
// The same packages the install page installs, so the landing page's first test runs.
const PACKAGES = 'vitest vite vitest-native @testing-library/react-native'
const managers = [
  { id: 'npm', command: `npm i -D ${PACKAGES}` },
  { id: 'pnpm', command: `pnpm add -D ${PACKAGES}` },
  { id: 'yarn', command: `yarn add -D ${PACKAGES}` },
  { id: 'bun', command: `bun add -d ${PACKAGES}` },
] as const
type Manager = (typeof managers)[number]['id']
const STORAGE_KEY = 'vitest-native:package-manager'

const selected = ref<Manager>('npm')
const copied = ref(false)
const command = computed(() => managers.find((m) => m.id === selected.value)!.command)
const commandEl = ref<HTMLElement | null>(null)
const tabEls = ref<HTMLButtonElement[]>([])

onMounted(() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (managers.some((m) => m.id === saved)) selected.value = saved as Manager
  } catch {
    // Storage blocked: keep npm.
  }
})

function select(id: Manager) {
  selected.value = id
  copied.value = false
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

// Arrow keys, Home and End move between tabs, as in a WAI-ARIA tablist.
function onKey(event: KeyboardEvent, index: number) {
  const last = managers.length - 1
  const targets: Record<string, number> = {
    ArrowRight: index === last ? 0 : index + 1,
    ArrowLeft: index === 0 ? last : index - 1,
    Home: 0,
    End: last,
  }
  const next = targets[event.key]
  if (next === undefined) return
  event.preventDefault()
  select(managers[next].id)
  tabEls.value[next]?.focus()
}

async function copy() {
  try {
    await navigator.clipboard.writeText(command.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // No clipboard access: select the text so the reader can copy it.
    const range = document.createRange()
    if (commandEl.value) {
      range.selectNodeContents(commandEl.value)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  }
}
</script>

<template>
  <div class="hero-install">
    <div class="tabs" role="tablist" aria-label="Package manager">
      <button
        v-for="(manager, index) in managers"
        :key="manager.id"
        :ref="(el) => (tabEls[index] = el as HTMLButtonElement)"
        role="tab"
        type="button"
        :id="`hero-install-tab-${manager.id}`"
        :aria-selected="selected === manager.id"
        :tabindex="selected === manager.id ? 0 : -1"
        aria-controls="hero-install-panel"
        @click="select(manager.id)"
        @keydown="onKey($event, index)"
      >
        {{ manager.id }}
      </button>
    </div>
    <div
      id="hero-install-panel"
      class="panel"
      role="tabpanel"
      :aria-labelledby="`hero-install-tab-${selected}`"
    >
      <code ref="commandEl"><span class="prompt" aria-hidden="true">$ </span>{{ command }}</code>
      <button type="button" class="copy" @click="copy">
        {{ copied ? 'Copied' : 'Copy' }}
      </button>
      <span class="sr-only" aria-live="polite">{{ copied ? 'Command copied' : '' }}</span>
    </div>
  </div>
</template>

<style scoped>
.hero-install {
  margin-top: 28px;
  max-width: 560px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  overflow: hidden;
}
.tabs {
  display: flex;
  gap: 2px;
  padding: 6px 8px 0;
  border-bottom: 1px solid var(--vp-c-divider);
}
.tabs button {
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  padding: 6px 12px;
  color: var(--vp-c-text-2);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tabs button[aria-selected='true'] {
  color: var(--vp-c-text-1);
  border-bottom-color: var(--vp-c-brand-1);
}
.tabs button:focus-visible,
.copy:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
  border-radius: 4px;
}
.panel {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  min-width: 0;
}
.panel code {
  flex: 1;
  min-width: 0;
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-1);
  /* Wraps rather than scrolls, so nothing is out of reach of the keyboard. */
  white-space: normal;
  overflow-wrap: anywhere;
}
.prompt {
  color: var(--vp-c-text-3);
  user-select: none;
}
.copy {
  flex: none;
  font-size: 13px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
}
.copy:hover {
  border-color: var(--vp-c-brand-1);
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
