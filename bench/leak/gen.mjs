// Generates an ordered set of identical leakage-probe files. Each file asserts
// that two kinds of state start CLEAN, then dirties them. Run in a single worker
// with a fixed order, a correct isolator passes every file; a leaky runtime fails
// every file after the first (it sees the previous file's mutation).
import fs from "node:fs";
import path from "node:path";

const N = Number(process.argv[2] || 5);
const dir = path.dirname(new URL(import.meta.url).pathname);
const names = Array.from({ length: N }, (_, i) => String.fromCharCode(97 + i)); // a,b,c,...

for (const name of names) {
  fs.writeFileSync(
    path.join(dir, `${name}.test.tsx`),
    `import { store } from "./store";
import { DeviceEventEmitter } from "react-native";

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
`,
  );
}
console.log(`generated ${N} leak files (${N * 2} tests): ${names.join(", ")}`);
