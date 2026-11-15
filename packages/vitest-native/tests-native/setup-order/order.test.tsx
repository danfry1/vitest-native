import { expect, it } from "vitest";

it("runs the project's setup file after the engine's, which lets it import react-native", () => {
  const seen = (globalThis as { __userSetup?: { os: string; style: object; jest: string } })
    .__userSetup;
  expect(seen?.os).toBe("ios");
  expect(seen?.style).toEqual({ flex: 1, opacity: 0.5 });
  if (process.env.VN_SETUP_ORDER_COMPAT === "1") expect(seen?.jest).toBe("function");
});
