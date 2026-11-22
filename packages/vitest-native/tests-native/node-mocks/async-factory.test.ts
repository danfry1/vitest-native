/**
 * An async factory fails by name until it settles (R9), and is called once: the first
 * require starts it, and the test's import and later requires share its result. The
 * failure is also printed once, for a package that swallows require errors, and gives its
 * advice once.
 */
import { expect, it, vi } from "vitest";
import { requireFrom } from "dispatch-consumer-lib";

const runs = vi.hoisted(() => ({ count: 0 }));
vi.mock("dispatch-target-lib", async () => {
  runs.count++;
  return { source: "async" };
});

it("names an async factory that has not settled, and says so once", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    let error: unknown;
    try {
      requireFrom("dispatch-target-lib");
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toMatchObject({ code: "MOCK_NOT_SEEN_BY_NODE" });
    // The reason, then the advice, given once (#896).
    const message = String((error as Error).message);
    expect(message).toContain("its factory is async and has not settled");
    expect(message.match(/import the (?:mocked )?module in the test/gi)).toHaveLength(1);
    expect(() => requireFrom("dispatch-target-lib")).toThrow();
    expect(
      warn.mock.calls.filter(
        ([m]) => String(m).includes("MOCK_NOT_SEEN") || String(m).includes("dispatch-target-lib"),
      ),
    ).toHaveLength(1);
  } finally {
    warn.mockRestore();
  }
  expect(runs.count).toBe(1);
});

it("serves it once settled, without running it again", async () => {
  const target = await import("dispatch-target-lib");
  expect(target.source).toBe("async");
  expect(requireFrom("dispatch-target-lib").source).toBe("async");
  expect(runs.count).toBe(1);
});
