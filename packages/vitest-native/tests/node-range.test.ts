import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { SUPPORTED_NODE, assertSupportedNode, satisfiesNodeRange } from "../src/node-range.js";
import { reactNative } from "../src/index.js";

function thrown(fn: () => unknown): { code?: string; message: string } {
  try {
    fn();
  } catch (error) {
    return error as { code?: string; message: string };
  }
  throw new Error("expected a throw");
}

describe("the supported Node range", () => {
  it("is engines.node, in this package and the workspace root", () => {
    for (const file of ["../package.json", "../../../package.json"]) {
      const manifest = JSON.parse(fs.readFileSync(new URL(file, import.meta.url), "utf8")) as {
        engines: { node: string };
      };
      expect(manifest.engines.node, file).toBe(SUPPORTED_NODE);
    }
  });

  it.each(["22.22.3", "22.23.0", "24.12.0", "24.13.0", "26.0.0", "26.13.0", "v27.1.0", "28.0.0"])(
    "starts on Node %s",
    (version) => {
      expect(() => assertSupportedNode(version)).not.toThrow();
    },
  );

  it.each(["22.22.3-rc.1", "24.12.0-rc.1"])("does not admit the prerelease %s", (version) => {
    expect(satisfiesNodeRange(version, SUPPORTED_NODE)).toBe(false);
    expect(thrown(() => assertSupportedNode(version)).code).toBe("UNSUPPORTED_NODE");
  });

  it.each(["22.13.0", "22.22.2", "24.3.0", "24.11.1"])(
    "on Node %s, below its line's floor, says an update within the major is enough",
    (version) => {
      const error = thrown(() => assertSupportedNode(version));
      expect(error.code).toBe("UNSUPPORTED_NODE");
      expect(error.message).toContain(`Node ${version} is not supported`);
      expect(error.message).toContain(version.startsWith("22") ? "22.22.3" : "24.12.0");
      expect(error.message).toContain("An update within your Node major is enough");
    },
  );

  it.each(["20.19.4", "23.11.0", "25.2.0"])(
    "on Node %s, an unsupported line, names the supported lines",
    (version) => {
      const error = thrown(() => assertSupportedNode(version));
      expect(error.code).toBe("UNSUPPORTED_NODE");
      expect(error.message).toContain(`Node ${version} is not supported`);
      expect(error.message).toContain(SUPPORTED_NODE);
      expect(error.message).not.toContain("within your Node major");
    },
  );
});

describe("reactNative() checks the Node version first", () => {
  const real = Object.getOwnPropertyDescriptor(process.versions, "node")!;
  afterEach(() => {
    Object.defineProperty(process.versions, "node", real);
  });

  it("stops with UNSUPPORTED_NODE on a Node below the floor", () => {
    Object.defineProperty(process.versions, "node", { ...real, value: "22.22.2" });
    expect(thrown(() => reactNative()).code).toBe("UNSUPPORTED_NODE");
  });
});
