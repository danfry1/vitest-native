// RNTL's auto-cleanup without `test.globals` (see vitest.no-globals.config.mts). Each
// test observes what the previous test's afterEach did, so they run in order.
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { describe, expect, test, vi } from "vitest";

const FILES_SEEN = Symbol.for("vitest-native.no-globals.files-seen");
const proc = process as unknown as Record<symbol, number>;
proc[FILES_SEEN] = (proc[FILES_SEEN] ?? 0) + 1;

let unmounted = 0;
function Tracked({ label }: { label: string }) {
  React.useEffect(
    () => () => {
      unmounted++;
    },
    [],
  );
  return <Text>{label}</Text>;
}

test("runs without Vitest's globals", () => {
  expect(typeof (globalThis as Record<string, unknown>).afterEach).toBe("undefined");
});

describe("a rendered tree", () => {
  test("renders", async () => {
    await render(<Tracked label="first screen" />);
    expect(screen.getByText("first screen")).toBeTruthy();
  });

  test("is unmounted after its test, and screen is reset", () => {
    expect(unmounted).toBe(1);
    expect(() => screen.getByText("first screen")).toThrow();
  });
});

describe("a test that leaves fake timers installed", () => {
  test("renders under fake timers and does not restore them", async () => {
    vi.useFakeTimers();
    await render(<Tracked label="fake-timer screen" />);
  });

  test("is still cleaned up, without the cleanup waiting on a faked timer", () => {
    vi.useRealTimers();
    expect(unmounted).toBe(2);
  });
});

describe("RNTL_SKIP_AUTO_CLEANUP", () => {
  test("renders with the opt-out set", async () => {
    process.env.RNTL_SKIP_AUTO_CLEANUP = "true";
    await render(<Tracked label="kept screen" />);
  });

  test("leaves the tree mounted", async () => {
    delete process.env.RNTL_SKIP_AUTO_CLEANUP;
    expect(unmounted).toBe(2);
    expect(screen.getByText("kept screen")).toBeTruthy();
  });

  test("and cleanup resumes once it is unset", () => {
    expect(unmounted).toBe(3);
  });
});
