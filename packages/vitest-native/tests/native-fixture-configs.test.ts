// Vitest 4 resolves an inline `extends: true` project by loading its config file again,
// without the run's `--mode`. A native-suite config that both declares such a project
// and picks its shape by mode therefore gets a different config for the project, here
// one without this plugin, which only the Vitest 4 CI legs showed.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DIR = path.resolve(__dirname, "../tests-native");

describe("native fixture configs", () => {
  it("never choose their shape by mode when they declare an extends: true project", () => {
    const offenders = fs
      .readdirSync(DIR)
      .filter((name) => /^vitest\..*config\.mts$/.test(name))
      .filter((name) => {
        // Code only: comments may name both.
        const source = fs
          .readFileSync(path.join(DIR, name), "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/.*$/gm, "");
        return /extends:\s*true/.test(source) && /\bmode\b/.test(source);
      });
    expect(offenders).toEqual([]);
  });
});
