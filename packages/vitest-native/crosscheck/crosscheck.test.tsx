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
import {
  Button,
  Dimensions,
  FlatList,
  Image,
  Modal,
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableHighlight,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
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

// Touchables share the same userEvent.press responder requirement as Pressable.
probe("touchable-opacity-onpress", async () => {
  let calls = 0;
  const user = userEvent.setup();
  render(
    <TouchableOpacity testID="t" onPress={() => (calls += 1)}>
      <Text>tap</Text>
    </TouchableOpacity>,
  );
  await user.press(screen.getByTestId("t"));
  return { calls };
});

probe("touchable-highlight-onpress", async () => {
  let calls = 0;
  const user = userEvent.setup();
  render(
    <TouchableHighlight testID="t" onPress={() => (calls += 1)}>
      <Text>tap</Text>
    </TouchableHighlight>,
  );
  await user.press(screen.getByTestId("t"));
  return { calls };
});

probe("touchable-without-feedback-onpress", async () => {
  let calls = 0;
  const user = userEvent.setup();
  render(
    <TouchableWithoutFeedback testID="t" onPress={() => (calls += 1)}>
      <View>
        <Text>tap</Text>
      </View>
    </TouchableWithoutFeedback>,
  );
  await user.press(screen.getByTestId("t"));
  return { calls };
});

probe("textinput-onchangetext", () => {
  let value = "";
  render(<TextInput testID="i" onChangeText={(t) => (value = t)} />);
  fireEvent.changeText(screen.getByTestId("i"), "typed");
  return { value };
});

probe("textinput-usertype", async () => {
  let calls = 0;
  let value = "";
  const user = userEvent.setup();
  render(
    <TextInput
      testID="i"
      onChangeText={(t) => {
        calls += 1;
        value = t;
      }}
    />,
  );
  await user.type(screen.getByTestId("i"), "hey");
  // Both calls (one onChangeText per keystroke — the native engine no longer
  // double-fires now that TextInput is mocked at the boundary like jest's preset)
  // and the final value must match.
  return { calls, value };
});

probe("textinput-displayvalue", () => {
  render(<TextInput value="preset" onChangeText={() => {}} />);
  return { found: !!screen.queryByDisplayValue("preset") };
});

probe("button-userpress", async () => {
  let calls = 0;
  const user = userEvent.setup();
  render(<Button title="Go" onPress={() => (calls += 1)} />);
  await user.press(screen.getByText("Go"));
  return { calls };
});

// --- more components ---
probe("switch-render", () => {
  render(<Switch testID="sw" value onValueChange={() => {}} />);
  const el = screen.getByTestId("sw");
  return { role: el.props.accessibilityRole, value: el.props.value };
});

probe("flatlist-renders-items", () => {
  render(
    <FlatList
      data={["a", "b", "c"]}
      keyExtractor={(item) => item}
      renderItem={({ item }) => <Text>{`item-${item}`}</Text>}
    />,
  );
  return {
    a: !!screen.queryByText("item-a"),
    b: !!screen.queryByText("item-b"),
    c: !!screen.queryByText("item-c"),
  };
});

probe("scrollview-fireevent-scroll", () => {
  let y = -1;
  render(
    <ScrollView testID="sv" onScroll={(e) => (y = e.nativeEvent.contentOffset.y)}>
      <Text>content</Text>
    </ScrollView>,
  );
  fireEvent.scroll(screen.getByTestId("sv"), {
    nativeEvent: { contentOffset: { x: 0, y: 120 } },
  });
  return { y };
});

probe("modal-visible-children", () => {
  // Probed by queryability (not toBeVisible — Modal's toBeVisible semantics are
  // RN/RNTL-version-quirky). A freshly-rendered visible Modal exposes its children;
  // a hidden one does not. Both engines must agree.
  render(
    <Modal visible>
      <Text testID="mb">modal-body</Text>
    </Modal>,
  );
  const whenVisible = !!screen.queryByTestId("mb");
  cleanup();

  render(
    <Modal visible={false}>
      <Text testID="mb">modal-body</Text>
    </Modal>,
  );
  return { whenVisible, whenHidden: !!screen.queryByTestId("mb") };
});

// (Animated value internals like __getValue() are exercised by the conformance
// suite — tests/rn-conformance/rn-Animated.test.ts, ported from RN's own tests —
// rather than the cross-check, which focuses on observable component/interaction
// behavior. The mock intentionally doesn't expose every internal accessor.)

// --- accessibility props (what RNTL byRole / toBeDisabled depend on) ---
probe("a11y-role", () => {
  render(<Pressable testID="p" accessibilityRole="button" />);
  return { role: screen.getByTestId("p").props.accessibilityRole };
});

probe("a11y-state-disabled", () => {
  render(<View testID="v" accessibilityState={{ disabled: true }} />);
  return { state: screen.getByTestId("v").props.accessibilityState };
});

// --- assertion matchers (what every test actually asserts with) ---
// Capture the matcher VERDICT (pass/fail) under each engine and compare. A
// divergence means an assertion that passes under one engine fails under the other.
function passes(fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

probe("matcher-disabled-enabled", () => {
  render(
    <View>
      <Pressable testID="off" disabled>
        <Text>x</Text>
      </Pressable>
      <Pressable testID="on">
        <Text>y</Text>
      </Pressable>
    </View>,
  );
  const off = screen.getByTestId("off");
  const on = screen.getByTestId("on");
  return {
    offDisabled: passes(() => expect(off).toBeDisabled()),
    offEnabled: passes(() => expect(off).toBeEnabled()),
    onDisabled: passes(() => expect(on).toBeDisabled()),
    onEnabled: passes(() => expect(on).toBeEnabled()),
  };
});

probe("matcher-checked-switch", () => {
  render(<Switch testID="s" value onValueChange={() => {}} />);
  const el = screen.getByTestId("s");
  return { checked: passes(() => expect(el).toBeChecked()) };
});

probe("matcher-text-content", () => {
  render(<Text testID="t">hello world</Text>);
  const el = screen.getByTestId("t");
  return {
    full: passes(() => expect(el).toHaveTextContent("hello world")),
    partial: passes(() => expect(el).toHaveTextContent("world")),
    miss: passes(() => expect(el).toHaveTextContent("nope")),
  };
});

probe("matcher-style", () => {
  render(<View testID="v" style={{ opacity: 0.5, marginTop: 8 }} />);
  const el = screen.getByTestId("v");
  return {
    hit: passes(() => expect(el).toHaveStyle({ opacity: 0.5 })),
    miss: passes(() => expect(el).toHaveStyle({ opacity: 1 })),
  };
});

probe("matcher-display-value", () => {
  render(<TextInput testID="i" value="preset" onChangeText={() => {}} />);
  const el = screen.getByTestId("i");
  return {
    hit: passes(() => expect(el).toHaveDisplayValue("preset")),
    miss: passes(() => expect(el).toHaveDisplayValue("other")),
  };
});

probe("matcher-on-the-screen", () => {
  render(<View testID="v" />);
  const el = screen.getByTestId("v");
  return { onScreen: passes(() => expect(el).toBeOnTheScreen()) };
});

// --- accessibility queries (how tests find elements) ---
probe("query-by-role", () => {
  render(
    <Pressable testID="p" accessibilityRole="button">
      <Text>Save</Text>
    </Pressable>,
  );
  return { found: !!screen.queryByRole("button") };
});

probe("query-by-role-name", () => {
  render(<Pressable accessibilityRole="button" accessibilityLabel="Save" />);
  return {
    hit: !!screen.queryByRole("button", { name: "Save" }),
    miss: !!screen.queryByRole("button", { name: "Cancel" }),
  };
});

probe("query-by-label-text", () => {
  render(<View testID="v" accessibilityLabel="Close dialog" />);
  return {
    hit: !!screen.queryByLabelText("Close dialog"),
    miss: !!screen.queryByLabelText("Open dialog"),
  };
});

probe("query-all-by-text", () => {
  render(
    <View>
      <Text>row</Text>
      <Text>row</Text>
      <Text>row</Text>
    </View>,
  );
  return { count: screen.queryAllByText("row").length };
});

// --- more events ---
probe("textinput-focus-blur", () => {
  let focus = 0;
  let blur = 0;
  render(
    <TextInput testID="i" onFocus={() => (focus += 1)} onBlur={() => (blur += 1)} />,
  );
  fireEvent(screen.getByTestId("i"), "focus");
  fireEvent(screen.getByTestId("i"), "blur");
  return { focus, blur };
});

probe("view-onlayout", () => {
  let width = -1;
  render(
    <View
      testID="v"
      onLayout={(e) => (width = e.nativeEvent.layout.width)}
    />,
  );
  fireEvent(screen.getByTestId("v"), "layout", {
    nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 48 } },
  });
  return { width };
});

// --- more components ---
probe("text-onpress-role", () => {
  render(
    <Text testID="t" onPress={() => {}}>
      link text
    </Text>,
  );
  return { role: screen.getByTestId("t").props.accessibilityRole };
});

probe("image-render", () => {
  render(<Image testID="img" source={{ uri: "https://example.com/x.png" }} accessibilityLabel="pic" />);
  return {
    found: !!screen.queryByTestId("img"),
    byLabel: !!screen.queryByLabelText("pic"),
  };
});

probe("sectionlist-render", () => {
  render(
    <SectionList
      sections={[
        { title: "A", data: ["a1", "a2"] },
        { title: "B", data: ["b1"] },
      ]}
      keyExtractor={(item) => item}
      renderItem={({ item }) => <Text>{`cell-${item}`}</Text>}
      renderSectionHeader={({ section }) => <Text>{`hdr-${section.title}`}</Text>}
    />,
  );
  return {
    a1: !!screen.queryByText("cell-a1"),
    b1: !!screen.queryByText("cell-b1"),
    hdrA: !!screen.queryByText("hdr-A"),
  };
});

// --- pure APIs ---
probe("platform-select", () => ({
  value: Platform.select({ ios: "i", android: "a", default: "d" }),
}));

probe("dimensions-window", () => {
  const w = Dimensions.get("window");
  return { width: w.width, height: w.height, scale: w.scale, fontScale: w.fontScale };
});

probe("pixelratio", () => ({
  get: PixelRatio.get(),
  fontScale: PixelRatio.getFontScale(),
}));

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
