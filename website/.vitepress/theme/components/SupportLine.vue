<script setup lang="ts">
// The supported versions, read at build time from the package's startup checks.
import { data as items } from '../../support.data'
</script>

<template>
  <p class="support-line">
    <span class="status">Pre-1.0</span>
    <!-- Each dot stays with the item after it, so no line ends on a dot. -->
    <span v-for="item in items" :key="item.name" class="item"
      ><span class="sep" aria-hidden="true">· </span>{{ item.name }} {{ item.versions }}</span
    >
  </p>
</template>

<style scoped>
.support-line {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.status {
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.item {
  white-space: nowrap;
}
.sep {
  color: var(--vp-c-text-3);
}
</style>
