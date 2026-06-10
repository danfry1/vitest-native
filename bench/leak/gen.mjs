// Generates an ordered set of identical leakage-probe files. Each file asserts
// that four kinds of state start CLEAN, then dirties them. Run in a single worker
// with a fixed order, a correct isolator passes every file; a leaky runtime fails
// every file after the first (it sees the previous file's mutation).
//
// Classes:
//   A — user-module singleton (module-runner graph; vitest's own reset covers it)
//   B — resident RN listener registry (DeviceEventEmitter, Node require cache)
//   C — globalThis pollution
//   D — resident RN mutable module state (Dimensions.set)
// B/C/D are what the hot runtime's surgical reset (src/native/reset.mjs) exists for.
import fs from "node:fs";
import path from "node:path";

const N = Number(process.argv[2] || 5);
const dir = path.dirname(new URL(import.meta.url).pathname);
const names = Array.from({ length: N }, (_, i) =>
  i < 26 ? String.fromCharCode(97 + i) : `z${String(i).padStart(3, "0")}`,
);

for (const name of names) {
  fs.writeFileSync(
    path.join(dir, `${name}.test.tsx`),
    `import { store } from "./store";
import { DeviceEventEmitter, Dimensions } from "react-native";

const FILE = "${name}";

// Class A — user-module singleton (Zustand/Redux/config-object shaped).
// A correct isolator re-evaluates ./store per file, so userCount starts at 0.
test(\`[\${FILE}] user-module store starts clean\`, () => {
  expect(store.userCount).toBe(0);
  store.userCount += 1; // dirty it for the next file
});

// Class B — React Native's own stateful surface. RN is externalized in the
// native engine, so its listener registry lives in the worker's Node cache,
// NOT Vitest's module runner. A correct isolator still starts each file at 0.
test(\`[\${FILE}] RN DeviceEventEmitter starts clean\`, () => {
  expect(DeviceEventEmitter.listenerCount("leak-probe")).toBe(0);
  DeviceEventEmitter.addListener("leak-probe", () => {}); // dirty it for the next file
});

// Class C — globalThis pollution (test shims, polyfills, debug flags).
test(\`[\${FILE}] globalThis starts clean\`, () => {
  expect((globalThis as any).__leakProbeGlobal).toBeUndefined();
  (globalThis as any).__leakProbeGlobal = FILE; // dirty it for the next file
});

// Class D — resident RN module state mutated through a public API.
// Dimensions.set persists in the worker's Node cache exactly like Class B.
test(\`[\${FILE}] RN Dimensions starts clean\`, () => {
  expect(Dimensions.get("window").width).not.toBe(9999);
  Dimensions.set({ window: { ...Dimensions.get("window"), width: 9999 } });
});
`,
  );
}
console.log(`generated ${N} leak files (${N * 4} tests): ${names[0]}..${names[N - 1]}`);
