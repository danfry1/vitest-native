import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { SUPPORTED_NODE, assertSupportedNode } from "../src/node-range.js";

describe("the supported Node range", () => {
  it("is engines.node, in this package and the workspace root", () => {
    for (const file of ["../package.json", "../../../package.json"]) {
      const manifest = JSON.parse(fs.readFileSync(new URL(file, import.meta.url), "utf8")) as {
        engines: { node: string };
      };
      expect(manifest.engines.node, file).toBe(SUPPORTED_NODE);
    }
  });

  it.each(["22.22.3", "22.23.0", "24.12.0", "24.13.0", "26.0.0", "26.13.0", "v27.1.0"])(
    "starts on Node %s",
    (version) => {
      expect(() => assertSupportedNode(version)).not.toThrow();
    },
  );

  it.each(["20.19.4", "22.13.0", "22.22.2", "23.11.0", "24.3.0", "24.11.1", "25.2.0"])(
    "stops on Node %s with UNSUPPORTED_NODE, naming the range and the update",
    (version) => {
      let error: unknown;
      try {
        assertSupportedNode(version);
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({ code: "UNSUPPORTED_NODE" });
      const message = String((error as Error).message);
      expect(message).toContain(`Node ${version} is not supported`);
      expect(message).toContain(SUPPORTED_NODE);
      expect(message).toContain("An update within your Node major is enough");
    },
  );
});
