<script setup lang="ts">
import { withBase } from 'vitepress'

// Where the mock boundary sits under Jest's React Native preset, the native engine and the
// mock engine: three columns over the same layers, each cell filled by what that layer is
// in that setup, with a dashed line where the mocking starts. The facts are
// guide/comparison.md's ("Where the mock boundary sits") and guide/how-it-works.md's ("The
// native engine, specifically"); a change there belongs here too.

type State = 'real' | 'standin' | 'mocked' | 'reimplemented'
type Cell = { state: State; mark?: string }

const columns = [
  { id: 'jest', name: "Jest's React Native preset", short: 'Jest preset', host: 'View' },
  { id: 'native', name: "vitest-native · engine: 'native'", short: "'native'", host: 'RCTView' },
  { id: 'mock', name: "vitest-native · engine: 'mock'", short: "'mock'", host: 'View' },
]

const rows: { name: string; examples: string; cells: Cell[] }[] = [
  {
    name: 'Your test',
    examples: 'Testing Library',
    cells: [{ state: 'real' }, { state: 'real' }, { state: 'real' }],
  },
  {
    name: 'Your components',
    examples: 'the code you ship',
    cells: [{ state: 'real' }, { state: 'real' }, { state: 'real' }],
  },
  {
    name: 'React Native components',
    examples: 'View, Text, ScrollView, Image',
    cells: [{ state: 'standin', mark: '1' }, { state: 'real', mark: '2' }, { state: 'reimplemented' }],
  },
  {
    name: 'React Native JavaScript',
    examples: 'StyleSheet, Platform, Animated',
    cells: [{ state: 'real', mark: '3' }, { state: 'real' }, { state: 'reimplemented' }],
  },
  {
    name: 'Native side',
    examples: 'native modules, host components',
    cells: [{ state: 'mocked' }, { state: 'mocked' }, { state: 'reimplemented' }],
  },
]

const notes = [
  { mark: '1', text: 'View, Text, ScrollView, TextInput, Image and Modal render as flat stand-ins named after the component.' },
  { mark: '2', text: 'Except TextInput, a passthrough as in Jest’s preset, so onChangeText fires once per keystroke.' },
  { mark: '3', text: 'Except useColorScheme, Vibration, Linking, AppState and Clipboard, which are mocked.' },
]

const LABEL: Record<State, string> = {
  real: 'runs',
  standin: 'stand-in',
  mocked: 'mocked',
  reimplemented: 'reimplemented',
}

// The boundary in each column sits above its first layer that does not run as it ships.
const boundaryRow = columns.map((_, c) => rows.findIndex((row) => row.cells[c].state !== 'real'))
</script>

<template>
  <figure class="boundary" aria-labelledby="boundary-caption">
    <div class="grid" role="table" aria-label="What runs, by setup">
      <div class="row head" role="row">
        <span class="corner" role="columnheader"><span class="sr-only">Layer</span></span>
        <span v-for="col in columns" :key="col.id" :class="['col-head', col.id]" role="columnheader"
          ><span class="long">{{ col.name }}</span><span class="short" aria-hidden="true">{{ col.short }}</span></span
        >
      </div>

      <div v-for="(row, r) in rows" :key="row.name" class="row" role="row">
        <span class="layer" role="rowheader">
          <span class="layer-name">{{ row.name }}</span>
          <span class="layer-examples">{{ row.examples }}</span>
        </span>
        <span
          v-for="(cell, c) in row.cells"
          :key="c"
          :class="['cell', cell.state, { 'below-line': boundaryRow[c] === r }]"
          role="cell"
        >
          <span class="cell-label">{{ LABEL[cell.state] }}<sup v-if="cell.mark">{{ cell.mark }}</sup></span>
        </span>
      </div>

      <div class="row result" role="row">
        <span class="layer" role="rowheader">
          <span class="layer-name">A rendered <code>&lt;View&gt;</code></span>
          <span class="layer-examples">the host it shows up as</span>
        </span>
        <span v-for="col in columns" :key="col.id" :class="['host', col.id]" role="cell">
          <code>&lt;{{ col.host }}&gt;</code>
        </span>
      </div>
    </div>

    <div class="foot">
      <ul class="legend" aria-label="Key">
        <li><span class="swatch real" aria-hidden="true"></span>runs as it ships</li>
        <li><span class="swatch standin" aria-hidden="true"></span>stand-in or mocked</li>
        <li><span class="swatch reimplemented" aria-hidden="true"></span>reimplemented</li>
        <li><span class="swatch line" aria-hidden="true"></span>mock boundary</li>
      </ul>
      <ol class="notes">
        <li v-for="note in notes" :key="note.mark"><sup>{{ note.mark }}</sup> {{ note.text }}</li>
      </ol>
      <p id="boundary-caption" class="caption">
        Each column is one way to run the same test. vitest-native's native engine draws the line lowest:
        only the native side is mocked.
        <a :href="withBase('/guide/comparison#where-the-mock-boundary-sits')">The details</a>
      </p>
    </div>
  </figure>
</template>

<style scoped>
.boundary {
  margin: 24px 0;
  padding: 20px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg-soft);
  display: grid;
  gap: 20px;
  overflow-x: auto;
}

/* Four columns: the layer names, then one column per setup. */
.grid {
  display: grid;
  gap: 6px;
  min-width: 560px;
}
.row {
  display: grid;
  grid-template-columns: minmax(150px, 1.15fr) repeat(3, minmax(0, 1fr));
  gap: 6px;
  align-items: stretch;
}
.col-head {
  align-self: end;
  padding: 0 4px 4px;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--vp-c-text-2);
}
.col-head .short {
  display: none;
}
.col-head.native {
  color: var(--vp-c-text-1);
}
.layer {
  display: grid;
  align-content: center;
  gap: 1px;
  padding: 8px 4px;
}
.layer-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.layer-name code {
  font-size: 12.5px;
}
.layer-examples {
  font-family: var(--vp-font-family-mono);
  font-size: 11.5px;
  color: var(--vp-c-text-2);
}

/* A cell's fill says what the layer is in that setup. */
.cell {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 52px;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
}
.cell.real {
  background: var(--vp-c-bg);
}
.cell.standin,
.cell.mocked {
  border-style: dashed;
  border-color: var(--vp-c-text-3);
  background: repeating-linear-gradient(135deg, transparent 0 6px, var(--vp-c-divider) 6px 7.5px);
}
.cell.reimplemented {
  border-style: dotted;
  border-color: var(--vp-c-text-3);
  background-image: radial-gradient(var(--vp-c-text-3) 1px, transparent 1.3px);
  background-size: 9px 9px;
}
.cell-label {
  font-family: var(--vp-font-family-mono);
  font-size: 11.5px;
  padding: 1px 7px;
  border-radius: 5px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
}
.cell.real .cell-label {
  color: var(--vp-c-text-1);
}
sup {
  font-size: 9.5px;
  margin-left: 1px;
}

/* The boundary: a dashed rule above the first layer that is not the real thing. */
.cell.below-line::before {
  content: '';
  position: absolute;
  left: -3px;
  right: -3px;
  top: -5px;
  border-top: 2px dashed var(--vp-c-text-1);
}

.host {
  display: grid;
  place-items: center;
  padding: 10px 4px;
  border-radius: 8px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
}
.host code,
.layer-name code {
  background: none !important;
  padding: 0 !important;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-1);
}
.host code {
  font-size: 14px;
  font-weight: 600;
}
.host.native {
  border-color: var(--vp-c-text-3);
}

.foot {
  display: grid;
  gap: 10px;
}
.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  font-size: 12.5px;
  color: var(--vp-c-text-2);
}
.legend li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.swatch {
  width: 22px;
  height: 14px;
  border-radius: 4px;
  border: 1px solid var(--vp-c-divider);
}
.swatch.real {
  background: var(--vp-c-bg);
}
.swatch.standin {
  border-style: dashed;
  border-color: var(--vp-c-text-3);
  background: repeating-linear-gradient(135deg, transparent 0 3px, var(--vp-c-text-3) 3px 4px);
}
.swatch.reimplemented {
  border-style: dotted;
  border-color: var(--vp-c-text-3);
  background-image: radial-gradient(var(--vp-c-text-3) 1px, transparent 1.2px);
  background-size: 5px 5px;
}
.swatch.line {
  height: 0;
  border: 0;
  border-top: 2px dashed var(--vp-c-text-1);
  border-radius: 0;
}
.notes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 3px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}
.caption {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--vp-c-text-1);
}
.caption a {
  color: var(--vp-c-brand-1);
  font-weight: 500;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* On a phone the layer names move above their row, and the three setups share the width. */
@media (max-width: 640px) {
  .boundary {
    padding: 14px;
  }
  .grid {
    min-width: 0;
  }
  .row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .layer,
  .corner {
    grid-column: 1 / -1;
    padding: 6px 2px 0;
  }
  .corner {
    display: none;
  }
  .cell-label {
    font-size: 10.5px;
    padding: 1px 4px;
  }
  .col-head {
    text-align: center;
    font-family: var(--vp-font-family-mono);
  }
  .col-head .long {
    display: none;
  }
  .col-head .short {
    display: inline;
  }
}
</style>
