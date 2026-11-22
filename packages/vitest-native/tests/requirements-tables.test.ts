/**
 * The requirement tables written by hand (both READMEs, docs/versioning.md's support
 * policy) state what the startup checks enforce. Each row is held to its source of truth:
 * src/node-range.ts, PEER_REQUIREMENTS, SUPPORTED_REACT_NATIVE and SUPPORTED_EXPO_SDKS.
 * A range change that skips a table fails here. The landing page and install page are
 * held to the same sources in site-support.test.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SUPPORTED_NODE } from "../src/node-range";
import { PEER_REQUIREMENTS, SUPPORTED_REACT_NATIVE, expoSdkList } from "../src/peer-requirements";

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.resolve(PACKAGE, "../..");
const DOCS = {
  "README.md": path.join(REPO, "README.md"),
  "packages/vitest-native/README.md": path.join(PACKAGE, "README.md"),
  "docs/versioning.md": path.join(PACKAGE, "docs/versioning.md"),
};

/** A table row's second cell, by the row's first cell. */
function cell(text: string, name: string): string | undefined {
  return new RegExp(`^\\|\\s*${name}\\s*\\|([^|]+)\\|`, "m").exec(text)?.[1]?.trim();
}

function peer(name: string) {
  const found = PEER_REQUIREMENTS.find((entry) => entry.name === name);
  if (!found) throw new Error(`no peer requirement for ${name}`);
  return found;
}

/** `22.22.3` → `22.22.3`, `24.12.0` → `24.12`, `26.0.0` → `26`: as the docs write a floor. */
const short = (version: string) => version.replace(/(\.0)+$/, "");

/** What each row must say, from the sources: every fact, in any of the docs' wordings. */
function expectedFacts(): Record<string, string[]> {
  const nodeFacts = SUPPORTED_NODE.split("||").map((set) => {
    const floor = /(?:^|\s)>=\s*(\d+(?:\.\d+)*)/.exec(set.trim())?.[1];
    if (!floor) throw new Error(`no >= floor in "${set}"`);
    const bounded = /<\s*\d+/.test(set);
    // A bounded line is written "22.22.3+ on Node 22"; the open-ended last one "26+".
    return bounded ? `${short(floor)}+ on Node ${floor.split(".")[0]}` : `${short(floor)}+`;
  });
  const vitest = peer("vitest");
  const vite = peer("vite");
  const react = peer("react");
  const rntl = peer("@testing-library/react-native");
  const rntlMajors: string[] = [];
  for (let major = Number(rntl.minimum.split(".")[0]); major < (rntl.maximumMajor ?? 0); major++) {
    rntlMajors.push(`${major}.x`);
  }
  const { minimumMinor, maximumMinor } = SUPPORTED_REACT_NATIVE;
  return {
    "Node(?:\\.js)?": nodeFacts,
    Vitest: [`${vitest.minimum.split(".")[0]}.x`],
    Vite: [vite.minimum],
    React: [react.minimum.split(".")[0]],
    "React Native": [`0.${minimumMinor}–0.${maximumMinor}`],
    "Expo SDK": [expoSdkList("and")],
    "React Native Testing Library": rntlMajors,
  };
}

describe("the requirement tables", () => {
  for (const [doc, file] of Object.entries(DOCS)) {
    it(`${doc} states the ranges the startup checks enforce`, () => {
      const text = fs.readFileSync(file, "utf8");
      for (const [row, facts] of Object.entries(expectedFacts())) {
        const value = cell(text, row);
        expect([doc, row, value !== undefined]).toEqual([doc, row, true]);
        for (const fact of facts)
          expect([doc, row, value]).toEqual([doc, row, expect.stringContaining(fact)]);
      }
    });
  }

  it("is the same in the repository README and the package README", () => {
    const section = (file: string) =>
      /^## Requirements\n[\s\S]*?(?=^## )/m.exec(fs.readFileSync(file, "utf8"))?.[0];
    expect(section(DOCS["packages/vitest-native/README.md"])).toBe(section(DOCS["README.md"]));
  });
});
