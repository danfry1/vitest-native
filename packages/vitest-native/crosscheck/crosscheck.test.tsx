/**
 * Differential cross-check corpus.
 *
 * The SAME probes run under both engines (`engine: 'mock'` and `engine: 'native'`,
 * the latter executing real React Native). Each probe returns a small, canonical,
 * JSON-serializable value capturing an *observable behavior* a real test would
 * assert — a query result, a fired-event count, a resolved style, an accessibility
 * prop. The orchestrator (`scripts/crosscheck.mjs`) runs this file once per engine
 * and fails if any probe's value differs.
 *
 * We compare behavior, not raw render trees: real RN and the pure-JS mock attach
 * different incidental host props/wrappers, but the things tests actually depend on
 * must match. A divergence here is exactly "the mock drifted from real RN."
 *
 * Run via `bun run crosscheck` (both engines + diff). This file is not part of the
 * normal `test` / `test:native` suites.
 */
import { afterAll, afterEach, expect, test } from "vitest";
import * as React from "react";
import { Button, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { cleanup, fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import fs from "node:fs";

afterEach(cleanup);

const results: Record<string, unknown> = {};
function probe(name: string, run: () => unknown | Promise<unknown>) {
  test(name, async () => {
    results[name] = await run();
  });
}

// --- queries ---
probe("text-renders", () => {
  render(<Text>cross-check</Text>);
  return { found: !!screen.queryByText("cross-check") };
});

probe("testid-query", () => {
  render(<View testID="box" />);
  return { found: !!screen.queryByTestId("box") };
});

probe("nested-text", () => {
  render(
    <View>
      <Text>alpha</Text>
      <Text>beta</Text>
    </View>,
  );
  return { alpha: !!screen.queryByText("alpha"), beta: !!screen.queryByText("beta") };
});

probe("placeholder-query", () => {
  render(<TextInput placeholder="your name" />);
  return { found: !!screen.queryByPlaceholderText("your name") };
});

probe("button-renders-title", () => {
  render(<Button title="Submit" onPress={() => {}} />);
  return { found: !!screen.queryByText("Submit") };
});

// --- events ---
// Interactive press uses userEvent (the full press gesture), which exercises the
// real responder path under the native engine — the realistic way apps test taps.
// (NOTE: bare `fireEvent.press` diverges here — it fires the mock's direct onPress
//  but not real RN's responder-driven Pressable. A real finding; tracked separately.)
probe("pressable-fires-onpress", async () => {
  let calls = 0;
  const user = userEvent.setup();
  render(
    <Pressable testID="p" onPress={() => (calls += 1)}>
      <Text>tap</Text>
    </Pressable>,
  );
  await user.press(screen.getByTestId("p"));
  return { calls };
});

probe("pressable-disabled-suppresses-press", async () => {
  let calls = 0;
  const user = userEvent.setup();
  render(
    <Pressable testID="p" disabled onPress={() => (calls += 1)}>
      <Text>tap</Text>
    </Pressable>,
  );
  await user.press(screen.getByTestId("p"));
  return { calls };
});

probe("textinput-onchangetext", () => {
  let value = "";
  render(<TextInput testID="i" onChangeText={(t) => (value = t)} />);
  fireEvent.changeText(screen.getByTestId("i"), "typed");
  return { value };
});

// --- accessibility props (what RNTL byRole / toBeDisabled depend on) ---
probe("a11y-role", () => {
  render(<Pressable testID="p" accessibilityRole="button" />);
  return { role: screen.getByTestId("p").props.accessibilityRole };
});

probe("a11y-state-disabled", () => {
  render(<View testID="v" accessibilityState={{ disabled: true }} />);
  return { state: screen.getByTestId("v").props.accessibilityState };
});

// --- pure APIs ---
probe("stylesheet-flatten", () => StyleSheet.flatten([{ margin: 1 }, { margin: 3, padding: 2 }]));
probe("platform-os", () => ({ os: Platform.OS }));
probe("stylesheet-create-identity", () => {
  const s = StyleSheet.create({ a: { flex: 1 } });
  return { a: s.a };
});

afterAll(() => {
  const out = process.env.CROSSCHECK_OUT;
  if (out) fs.writeFileSync(out, JSON.stringify(results, null, 2));
  // Keep the file green as a normal suite too: every probe must have produced a value.
  expect(Object.keys(results).length).toBeGreaterThan(0);
});
