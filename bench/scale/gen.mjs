// Scale-benchmark corpus generator. Emits N representative RNTL component-test
// files into scale/__suite__/, framework-neutral so the SAME files run under
// jest (RN preset), vitest-native native stock (isolate:true), native hot, and
// the mock engine. Each file mounts a stateful component, fires a press, renders
// a FlatList, and asserts a StyleSheet — a realistic RN unit-test shape that
// exercises render + events + the host-component boundary (not a micro probe).
//
// Usage: node scale/gen.mjs [N]   (default 50)
import fs from "node:fs";
import path from "node:path";

const N = Number(process.argv[2] || 50);
const dir = path.join(import.meta.dirname, "__suite__");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

for (let i = 0; i < N; i++) {
  fs.writeFileSync(
    path.join(dir, `card${i}.test.tsx`),
    `import React from "react";
import { View, Text, Pressable, FlatList, StyleSheet } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react-native";

const styles = StyleSheet.create({ box: { padding: ${i % 12} } });

function Card() {
  const [n, setN] = React.useState(0);
  return (
    <View style={styles.box}>
      <Text>title-${i}</Text>
      <Pressable onPress={() => setN((v) => v + 1)}>
        <Text>{\`count-\${n}\`}</Text>
      </Pressable>
      <FlatList
        data={[1, 2, 3, 4, 5]}
        keyExtractor={(x) => String(x)}
        renderItem={({ item }) => <Text>{\`row-\${item}\`}</Text>}
      />
    </View>
  );
}

test("card ${i} renders title and rows", () => {
  render(<Card />);
  expect(screen.getByText("title-${i}")).toBeTruthy();
  expect(screen.getByText("row-3")).toBeTruthy();
});

test("card ${i} press increments", () => {
  render(<Card />);
  fireEvent.press(screen.getByText("count-0"));
  expect(screen.getByText("count-1")).toBeTruthy();
});

test("card ${i} stylesheet flattens", () => {
  expect(StyleSheet.flatten([styles.box, { margin: 1 }])).toEqual({ padding: ${i % 12}, margin: 1 });
});
`,
  );
}

console.log(`generated ${N} files (${N * 3} tests) in scale/__suite__/`);
