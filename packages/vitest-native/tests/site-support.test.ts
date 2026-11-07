import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { nodeVersions, peerVersions, supportItems } from "../../../website/.vitepress/support.ts";
import { SUPPORTED_NODE } from "../src/node-range";
import { PEER_REQUIREMENTS, SUPPORTED_REACT_NATIVE } from "../src/peer-requirements";

// The landing page's supported-versions line is read from the startup checks at build
// time (website/.vitepress/support.ts). This holds its formatting to those checks, and the
// install page's requirements table, which is written by hand, to the same line.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const INSTALL = path.join(repoRoot, "website/guide/install.md");
const UPGRADING = path.join(repoRoot, "website/migration/upgrading-to-0-15.md");

describe("the landing page's supported versions", () => {
  it("lists one floor for each Node line the package accepts", () => {
    expect(nodeVersions(">=22.22.3 <23 || >=24.12.0 <25 || >=26.0.0")).toBe(
      "22.22.3+, 24.12+ or 26+",
    );
    expect(nodeVersions(SUPPORTED_NODE).split(/, | or /)).toHaveLength(
      SUPPORTED_NODE.split("||").length,
    );
  });

  it("states a peer's range from its floor and ceiling", () => {
    expect(peerVersions({ minimum: "5.0.0", maximumMajor: 6 })).toBe("5");
    expect(peerVersions({ minimum: "8.0.5", maximumMajor: 9 })).toBe("^8.0.5");
    expect(peerVersions({ minimum: "13.0.0", maximumMajor: 15 })).toBe("13–14");
    expect(peerVersions({ minimum: "19.0.0" })).toBe("19+");
    expect(peerVersions({ minimum: "19.1.0" })).toBe("19.1.0+");
  });

  it("names React Native, Expo, Vitest and Node", () => {
    expect(supportItems().map((item) => item.name)).toEqual([
      "React Native",
      "Expo SDK",
      "Vitest",
      "Node",
    ]);
  });

  it("agrees with the upgrade guide's table, row for row", () => {
    // Each row of the table, keyed by its first cell: [versions, what an older one does].
    const rows = new Map(
      fs
        .readFileSync(UPGRADING, "utf8")
        .split("\n")
        .filter((line) => line.startsWith("|") && !/^\|\s*(\||-)/.test(line))
        .map((line) =>
          line
            .split("|")
            .slice(1, -1)
            .map((cell) => cell.trim()),
        )
        .map(([name, versions, older]) => [name, { versions, older }]),
    );
    const LABELS: Record<string, string> = {
      vitest: "Vitest",
      vite: "Vite",
      react: "React",
      "@testing-library/react-native": "React Native Testing Library",
    };
    const items = new Map(supportItems().map((item) => [item.name, item.versions]));
    const { minimumMinor, maximumMinor } = SUPPORTED_REACT_NATIVE;
    const expected = new Map<string, { versions: string; older: RegExp }>([
      ["Node", { versions: "", older: /^stops at startup with .*UNSUPPORTED_NODE/ }],
      ...PEER_REQUIREMENTS.map(
        (peer) =>
          [
            LABELS[peer.name] ?? peer.name,
            {
              versions: peerVersions(peer),
              older: peer.optional ? /^warns$/ : /^stops with .*UNSUPPORTED_PEER/,
            },
          ] as const,
      ),
      [
        "React Native (native engine)",
        {
          versions: items.get("React Native")!,
          older: new RegExp(
            `^below 0\\.${minimumMinor} stops with .*UNSUPPORTED_PEER.*; above 0\\.${maximumMinor} warns$`,
          ),
        },
      ],
      ["Expo SDK", { versions: items.get("Expo SDK")!, older: /^warns$/ }],
    ]);
    expect([...rows.keys()].sort()).toEqual([...expected.keys()].sort());
    for (const [name, { versions, older }] of expected) {
      const row = rows.get(name)!;
      if (name === "Node")
        for (const floor of nodeVersions().split(/, | or /))
          expect(row.versions, name).toContain(floor.replace(/\+$/, ""));
      else expect(row.versions, name).toBe(versions);
      expect(row.older, name).toMatch(older);
    }
  });

  it("agrees with the install page's requirements table", () => {
    const table = fs.readFileSync(INSTALL, "utf8");
    const row = (name: string) =>
      new RegExp(`^\\|\\s*${name}\\s*\\|([^|]+)\\|`, "m").exec(table)?.[1];
    const items = new Map(supportItems().map((item) => [item.name, item.versions]));
    expect(row("React Native")).toContain(items.get("React Native"));
    expect(row("Expo SDK")).toContain(items.get("Expo SDK"));
    expect(row("Vitest")).toContain(`${items.get("Vitest")}.x`);
  });
});
