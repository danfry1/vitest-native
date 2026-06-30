// Generates a large, diverse, idiomatic vitest-native suite to prove hot == default
// at scale. Every template is written the way a normal app would write it
// (host-element queries, real hooks/listeners/Animated/timers with proper
// cleanup) — NO jest-compat, NO resident monkeypatching. Templates deliberately
// touch the resident surfaces hot must reset between files; interleaved checker
// files detect listener accumulation across the whole run.
//
// Usage: node generate.mjs [count]   (default 120)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "generated");
const N = Number(process.argv[2] ?? 120);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const head = `import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react-native";
import * as React from "react";`;

const templates = {
  // useState + press
  counter: (n) => `${head}
import { Pressable, Text, View } from "react-native";
function C() {
  const [c, setC] = React.useState(0);
  return (<View><Text testID="v${n}">val:{c}</Text>
    <Pressable accessibilityRole="button" onPress={() => setC((x) => x + 1)}><Text>inc${n}</Text></Pressable></View>);
}
test("counter ${n}", async () => {
  await render(<C />);
  await fireEvent.press(screen.getByText("inc${n}"));
  await fireEvent.press(screen.getByText("inc${n}"));
  expect(screen.getByTestId("v${n}")).toHaveTextContent("val:2");
});`,

  // TextInput + validation
  form: (n) => `${head}
import { Pressable, Text, TextInput, View } from "react-native";
function F() {
  const [e, setE] = React.useState("");
  const ok = e.includes("@");
  return (<View><TextInput testID="i${n}" value={e} onChangeText={setE} />
    {!ok ? <Text testID="err${n}">bad</Text> : <Text testID="ok${n}">ok</Text>}</View>);
}
test("form ${n}", async () => {
  await render(<F />);
  expect(screen.getByTestId("err${n}")).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByTestId("i${n}"), "a@b.co");
  expect(screen.getByTestId("ok${n}")).toBeOnTheScreen();
});`,

  // FlatList add
  list: (n) => `${head}
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
function L() {
  const [items, setItems] = React.useState(["seed${n}"]);
  const [d, setD] = React.useState("");
  return (<View><TextInput testID="d${n}" value={d} onChangeText={setD} />
    <Pressable accessibilityRole="button" onPress={() => setItems((i) => [...i, d])}><Text>add${n}</Text></Pressable>
    <FlatList data={items} keyExtractor={(x, i) => x + i} renderItem={({ item }) => <Text>{item}</Text>} /></View>);
}
test("list ${n}", async () => {
  await render(<L />);
  expect(screen.getByText("seed${n}")).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByTestId("d${n}"), "added${n}");
  await fireEvent.press(screen.getByText("add${n}"));
  expect(screen.getByText("added${n}")).toBeOnTheScreen();
});`,

  // Modal + backdrop dismiss (paper's exact failure pattern)
  modal: (n) => `${head}
import { Modal, Pressable, Text, View } from "react-native";
function D({ onClose }) {
  return (<Modal visible transparent onRequestClose={onClose}>
    <Pressable testID="bd${n}" accessibilityRole="button" onPress={onClose} />
    <View testID="body${n}"><Text>dialog${n}</Text></View></Modal>);
}
test("modal ${n}", async () => {
  const onClose = vi.fn();
  await render(<D onClose={onClose} />);
  await fireEvent.press(screen.getByTestId("bd${n}"));
  expect(onClose).toHaveBeenCalledTimes(1);
});`,

  // real Animated fade -> resolves to target opacity
  animated: (n) => `${head}
import { Animated, Text } from "react-native";
function A() {
  const o = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => { Animated.timing(o, { toValue: 1, duration: 150, useNativeDriver: false }).start(); }, [o]);
  return <Animated.View testID="f${n}" style={{ opacity: o }}><Text>fade${n}</Text></Animated.View>;
}
test("animated ${n}", async () => {
  await render(<A />);
  expect(screen.getByTestId("f${n}")).toHaveStyle({ opacity: 1 });
});`,

  // AppState listener via useEffect with cleanup (resident emitter)
  appstate: (n) => `${head}
import { AppState, Text } from "react-native";
function W() {
  const [s, setS] = React.useState(AppState.currentState);
  React.useEffect(() => { const sub = AppState.addEventListener("change", setS); return () => sub.remove(); }, []);
  return <Text testID="as${n}">{String(s)}</Text>;
}
test("appstate ${n}", async () => {
  await render(<W />);
  expect(screen.getByTestId("as${n}")).toBeOnTheScreen();
});`,

  // interval ticker with fake timers + cleanup (timer surface)
  ticker: (n) => `${head}
import { Text } from "react-native";
function T() {
  const [t, setT] = React.useState(0);
  React.useEffect(() => { const id = setInterval(() => setT((x) => x + 1), 100); return () => clearInterval(id); }, []);
  return <Text testID="t${n}">tick:{t}</Text>;
}
test("ticker ${n}", async () => {
  vi.useFakeTimers();
  try {
    await render(<T />);
    await act(async () => { vi.advanceTimersByTime(350); });
    expect(screen.getByTestId("t${n}")).toHaveTextContent("tick:3");
  } finally { vi.useRealTimers(); }
});`,

  // shared module store: must start fresh each file (module-reset probe at scale)
  store: (n) => `${head}
import { bumpTotal, readTotal } from "../sharedStore.js";
test("store fresh ${n}", () => {
  expect(readTotal()).toBe(0);
  bumpTotal();
  bumpTotal();
  expect(readTotal()).toBe(2);
});`,

  // DeviceEventEmitter subscriber with cleanup — feeds the accumulation checkers
  subscriber: (n) => `${head}
import { DeviceEventEmitter, Text } from "react-native";
function S() {
  React.useEffect(() => { const sub = DeviceEventEmitter.addListener("ACCUM_EVT", () => {}); return () => sub.remove(); }, []);
  return <Text testID="sub${n}">sub${n}</Text>;
}
test("subscriber ${n}", async () => {
  await render(<S />);
  expect(screen.getByTestId("sub${n}")).toBeOnTheScreen();
});`,
};

// Interleaved checker: no listeners may have accumulated on the resident emitter
// from prior files (cleanup + per-file reset must have removed every one).
const checker = (n) => `import { expect, test } from "vitest";
import { DeviceEventEmitter } from "react-native";
test("no leaked ACCUM_EVT listeners at file ${n}", () => {
  expect(DeviceEventEmitter.listenerCount("ACCUM_EVT")).toBe(0);
});`;

const keys = Object.keys(templates);
let written = 0;
for (let i = 0; i < N; i++) {
  const key = keys[i % keys.length];
  const name = String(i).padStart(3, "0");
  fs.writeFileSync(path.join(outDir, `${name}-${key}.test.tsx`), `${templates[key](i)}\n`);
  written++;
  // Drop an accumulation checker every 8 files (after some subscribers have run).
  if (i % 8 === 7) {
    fs.writeFileSync(path.join(outDir, `${name}-zcheck.test.tsx`), `${checker(i)}\n`);
    written++;
  }
}
console.log(`generated ${written} files (${N} components + checkers) in ${path.relative(here, outDir)}`);
