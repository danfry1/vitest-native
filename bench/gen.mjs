// Generates N identical-shape component test files (framework-neutral: works under
// jest, vitest-native native, and vitest-native mock). Each file: a component render,
// a FlatList render, and a StyleSheet assertion — representative of real RN unit tests.
import fs from "node:fs";
import path from "node:path";
const N = Number(process.argv[2] || 25);
const dir = path.join(import.meta.dirname, "shared");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
for (let i = 0; i < N; i++) {
  fs.writeFileSync(
    path.join(dir, `card${i}.test.tsx`),
    `import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { View, Text, Pressable, StyleSheet, FlatList } from "react-native";
const s = StyleSheet.create({ box: { padding: ${i % 12} } });
function r(el: React.ReactElement) { let t: any; act(() => { t = TestRenderer.create(el); }); return t; }
test("card ${i} renders", () => {
  const t = r(<View style={s.box}><Text>title-${i}</Text><Pressable onPress={() => {}}><Text>btn</Text></Pressable></View>);
  expect(JSON.stringify(t.toJSON())).toContain("title-${i}");
});
test("card ${i} list", () => {
  const t = r(<FlatList data={[1,2,3,4,5]} keyExtractor={(x)=>String(x)} renderItem={({item})=><Text>{\`row-\${item}\`}</Text>} />);
  expect(t.toJSON()).toBeTruthy();
});
test("card ${i} stylesheet", () => { expect(StyleSheet.flatten([s.box, { margin: 1 }])).toEqual({ padding: ${i % 12}, margin: 1 }); });
`,
  );
}
console.log(`generated ${N} files (${N * 3} tests) in shared/`);
