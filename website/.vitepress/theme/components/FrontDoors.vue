<script setup lang="ts">
import { withBase } from 'vitepress'

// Where to start, by where the reader is today. Each card is one link, led by the first
// command that path runs. The Jest path is wider: a suite moving from Jest is the common
// way in, and its first command, compare, is the one only this project has.
const doors = [
  {
    id: 'jest',
    title: "I'm on Jest today",
    commands: ['npx vitest-native compare', 'npx vitest-native migrate --write'],
    line: 'See what differs on your own suite, then let migrate write the config.',
    link: '/migration/from-jest',
    tag: 'Start here',
  },
  {
    id: 'new',
    title: 'New project',
    commands: ['npx vitest-native init'],
    line: 'Writes the config for a bare React Native or an Expo app.',
    link: '/guide/install',
  },
  {
    id: 'library',
    title: 'Library author',
    commands: ["reactNative({ engine: 'mock' })"],
    line: "No React Native at all, or its real code with 'native'.",
    link: '/guide/engines',
  },
]
</script>

<template>
  <section class="front-doors" aria-labelledby="front-doors-title">
    <h2 id="front-doors-title">Where to start</h2>
    <div class="doors">
      <a
        v-for="door in doors"
        :key="door.id"
        :class="['door', `door-${door.id}`]"
        :href="withBase(door.link)"
      >
        <span class="head">
          <span class="icon" aria-hidden="true">
            <!-- Two arrows passing: moving a suite across. -->
            <svg v-if="door.id === 'jest'" viewBox="0 0 24 24">
              <path d="M4 8h13m0 0-3.5-3.5M17 8l-3.5 3.5M20 16H7m0 0 3.5-3.5M7 16l3.5 3.5" />
            </svg>
            <!-- A new file. -->
            <svg v-else-if="door.id === 'new'" viewBox="0 0 24 24">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5M12 11v6M9 14h6" />
            </svg>
            <!-- A package. -->
            <svg v-else viewBox="0 0 24 24">
              <path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" />
              <path d="M4 7.5 12 12l8-4.5M12 12v9" />
            </svg>
          </span>
          <span v-if="door.tag" class="tag">{{ door.tag }}</span>
        </span>
        <span class="title">{{ door.title }}</span>
        <span class="commands">
          <code v-for="command in door.commands" :key="command">{{ command }}</code>
        </span>
        <span class="line">{{ door.line }}</span>
        <span class="arrow" aria-hidden="true">→</span>
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
  grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}
@media (max-width: 960px) {
  .doors {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .door-jest {
    grid-column: 1 / -1;
  }
}
@media (max-width: 640px) {
  .doors {
    grid-template-columns: minmax(0, 1fr);
  }
}
.door {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 22px 22px 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  text-decoration: none !important;
  transition:
    border-color 0.2s,
    transform 0.2s,
    box-shadow 0.2s;
}
.door:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-2px);
  box-shadow: 0 10px 24px -14px rgba(0, 0, 0, 0.35);
}
.door:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
  border-color: var(--vp-c-brand-1);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}
.icon svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.tag {
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}
.title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.commands {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.commands code {
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  line-height: 1.5;
  padding: 4px 9px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 7px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  white-space: nowrap;
}
.line {
  flex: 1;
  font-size: 14px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
  padding-right: 24px;
}
.arrow {
  position: absolute;
  right: 20px;
  bottom: 18px;
  font-size: 16px;
  color: var(--vp-c-text-2);
  transition:
    transform 0.2s,
    color 0.2s;
}
.door:hover .arrow,
.door:focus-visible .arrow {
  transform: translateX(3px);
  color: var(--vp-c-brand-1);
}
@media (prefers-reduced-motion: reduce) {
  .door,
  .arrow {
    transition: none;
  }
  .door:hover {
    transform: none;
  }
  .door:hover .arrow,
  .door:focus-visible .arrow {
    transform: none;
  }
}
</style>
