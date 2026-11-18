/**
 * The Expo latest-supported check (VN_CONSUMERS=expo-latest, ci.yml on every push to main)
 * installs each supported SDK at its newest patch. Its SDK list comes from
 * SUPPORTED_EXPO_SDKS, and each SDK's fixture must pin that SDK
 * (scripts/support/expo-latest.mjs).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPO_SDK_FIXTURES,
  expoLatestEntries,
  fixtureExpoPin,
  MINIMUM_NPM,
  runEachExpoEntry,
} from "../scripts/support/expo-latest.mjs";
import { SUPPORTED_EXPO_SDKS } from "../src/peer-requirements.js";

const supportedSdks = () => {
  const sdks: number[] = [];
  for (let sdk = SUPPORTED_EXPO_SDKS.minimum; sdk <= SUPPORTED_EXPO_SDKS.maximum; sdk++) {
    sdks.push(sdk);
  }
  return sdks;
};

describe("the Expo latest-supported SDK list", () => {
  it("has one entry per supported SDK, each on its fixture with expo following the SDK", () => {
    const entries = expoLatestEntries();
    expect(entries.map((entry) => entry.sdk)).toEqual(supportedSdks());
    for (const { fixture, sdk, expo } of entries) {
      expect(fixture).toBe(EXPO_SDK_FIXTURES[sdk as keyof typeof EXPO_SDK_FIXTURES]);
      expect(expo).toBe(`~${sdk}.0.0`);
      expect(fixtureExpoPin(fixture)).toMatch(new RegExp(String.raw`^${sdk}\.`));
    }
  });

  it("fails when a supported SDK has no fixture", () => {
    for (const sdk of supportedSdks()) {
      const fixtures: Record<number, string> = { ...EXPO_SDK_FIXTURES };
      delete fixtures[sdk];
      expect(() => expoLatestEntries({ fixtures })).toThrow(
        `Expo SDK ${sdk} is supported (SUPPORTED_EXPO_SDKS) but has no fixture`,
      );
    }
  });

  it("fails when the supported range grows past the listed fixtures", () => {
    const supported = { ...SUPPORTED_EXPO_SDKS, maximum: SUPPORTED_EXPO_SDKS.maximum + 1 };
    expect(() => expoLatestEntries({ supported })).toThrow(
      `Expo SDK ${supported.maximum} is supported (SUPPORTED_EXPO_SDKS) but has no fixture`,
    );
  });

  it("fails when a fixture is listed for an SDK outside the supported range", () => {
    const supported = { ...SUPPORTED_EXPO_SDKS, minimum: SUPPORTED_EXPO_SDKS.minimum + 1 };
    expect(() => expoLatestEntries({ supported })).toThrow(
      `EXPO_SDK_FIXTURES lists ${EXPO_SDK_FIXTURES[SUPPORTED_EXPO_SDKS.minimum as 57]} for Expo SDK ${SUPPORTED_EXPO_SDKS.minimum}, outside the supported`,
    );
  });

  it("fails, naming both SDKs, when a fixture pins a different SDK from its entry", () => {
    const fixture = EXPO_SDK_FIXTURES[SUPPORTED_EXPO_SDKS.maximum as 58];
    const pinOf = (name: string) => (name === fixture ? "59.0.3" : fixtureExpoPin(name));
    expect(() => expoLatestEntries({ pinOf })).toThrow(
      `consumer-tests/${fixture} pins expo 59.0.3 (SDK 59), but its latest-supported entry is SDK ${SUPPORTED_EXPO_SDKS.maximum}`,
    );
  });
});

describe("runEachExpoEntry", () => {
  const entries = [
    { fixture: "expo-sdk57", sdk: 57, expo: "~57.0.0" },
    { fixture: "expo", sdk: 58, expo: "~58.0.0" },
  ];

  it("runs every SDK after one fails, reports each result and version, then fails", () => {
    const ran: string[] = [];
    const logged: string[] = [];
    let thrown: Error | undefined;
    try {
      runEachExpoEntry(
        entries,
        (entry: (typeof entries)[number], resolved: (v: Record<string, string>) => void) => {
          ran.push(entry.fixture);
          resolved({ expo: `${entry.sdk}.0.9`, "react-native": `0.${entry.sdk + 29}.1` });
          if (entry.sdk === 57) throw new Error("npm test exited with code 1");
        },
        { log: (line: string) => logged.push(line), npmVersion: MINIMUM_NPM },
      );
    } catch (error) {
      thrown = error as Error;
    }
    expect(ran).toEqual(["expo-sdk57", "expo"]);
    expect(thrown?.message).toBe("Expo versions: 1 of 2 failed (expo-sdk57); see the list above");
    const text = logged.join("\n");
    expect(text).toContain(
      "expo-sdk57 (SDK 57): failed: npm test exited with code 1 (expo 57.0.9, react-native 0.86.1)",
    );
    expect(text).toContain("expo (SDK 58): passed (expo 58.0.9, react-native 0.87.1)");
  });

  it("reports an entry that failed before it resolved its versions", () => {
    const logged: string[] = [];
    expect(() =>
      runEachExpoEntry(
        [entries[1]],
        () => {
          throw new Error("npm install exited with code 1");
        },
        { log: (line: string) => logged.push(line), npmVersion: MINIMUM_NPM },
      ),
    ).toThrow("Expo versions: 1 of 1 failed (expo)");
    expect(logged.join("\n")).toContain(
      "expo (SDK 58): failed: npm install exited with code 1 (versions not resolved)",
    );
  });

  it("does not throw when every SDK passes", () => {
    const logged: string[] = [];
    runEachExpoEntry(
      entries,
      (_entry: unknown, resolved: (v: Record<string, string>) => void) => resolved({ expo: "x" }),
      { log: (line: string) => logged.push(line), npmVersion: MINIMUM_NPM },
    );
    expect(logged.join("\n")).toContain("expo (SDK 58): passed (expo x)");
  });
});

// #909: Expo SDK 57's newest patches pin react 19.2.3, while expo-router's
// react-server-dom-webpack peer resolves to a release that asks for react ^19.2.9. npm 11.20
// installs that tree; npm 11.19 stops with ERESOLVE. The Expo legs refuse an older npm by name.
/** Whether `version` is MINIMUM_NPM or newer, comparing each part as a number. */
const atLeastMinimum = (version: string) => {
  const [a, b] = [version, MINIMUM_NPM].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};

describe("the npm the Expo legs install with", () => {
  const entries = [{ fixture: "expo", sdk: 58, expo: "~58.0.0" }];

  it.each(["11.19.0", "10.9.2", "11.19.9", "9.99.99"])(
    "refuses npm %s before installing anything, naming the minimum",
    (npmVersion) => {
      const ran: string[] = [];
      expect(() =>
        runEachExpoEntry(entries, (entry: { fixture: string }) => ran.push(entry.fixture), {
          log: () => {},
          npmVersion,
        }),
      ).toThrow(
        `The Expo consumer runs need npm ${MINIMUM_NPM} or newer; this is npm ${npmVersion}`,
      );
      expect(ran).toEqual([]);
    },
  );

  it.each([MINIMUM_NPM, "11.20.1", "11.21.0", "11.100.0", "12.0.0", "100.0.0"])(
    "runs on npm %s",
    (npmVersion) => {
      const ran: string[] = [];
      runEachExpoEntry(entries, (entry: { fixture: string }) => ran.push(entry.fixture), {
        log: () => {},
        npmVersion,
      });
      expect(ran).toEqual(["expo"]);
    },
  );

  it("refuses a version it cannot read", () => {
    expect(() => runEachExpoEntry(entries, () => {}, { log: () => {}, npmVersion: "" })).toThrow(
      `The Expo consumer runs need npm ${MINIMUM_NPM} or newer; could not read`,
    );
  });

  it("reads the installed npm when no version is given", () => {
    const installed = execFileSync("npm", ["--version"], {
      encoding: "utf8",
      shell: process.platform === "win32",
    }).trim();
    const ran: string[] = [];
    const call = () =>
      runEachExpoEntry(entries, (entry: { fixture: string }) => ran.push(entry.fixture), {
        log: () => {},
      });
    if (atLeastMinimum(installed)) {
      call();
      expect(ran).toEqual(["expo"]);
    } else {
      expect(call).toThrow(`this is npm ${installed}`);
      expect(ran).toEqual([]);
    }
  });

  it("is at or below the npm CI pins for every job that runs an Expo leg", () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    let checked = 0;
    for (const file of ["ci.yml", "compat-check.yml"]) {
      const text = fs.readFileSync(path.join(root, ".github/workflows", file), "utf8");
      // Each job: a two-space-indented key up to the next one.
      for (const job of text.split(/\n(?= {2}[\w-]+:\n)/)) {
        if (!/VN_CONSUMERS: expo-(latest|next)/.test(job)) continue;
        const pins = [...job.matchAll(/npm-version: .*?(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
        expect(pins, `${file}: ${job.split("\n")[1]}`).not.toEqual([]);
        for (const pin of pins) expect(atLeastMinimum(pin), `${file} pins npm ${pin}`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it("is the version the contributor guide names", () => {
    const guide = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../../CONTRIBUTING.md"),
      "utf8",
    );
    expect(guide).toContain(`npm ${MINIMUM_NPM} or newer`);
    expect(guide).toContain("VN_CONSUMERS=expo-latest");
  });
});

describe("where the Expo latest-supported legs run", () => {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const read = (file: string) => fs.readFileSync(path.resolve(packageRoot, file), "utf8");

  it("is the comment above them: ci.yml on main pushes, and compat-check.yml", () => {
    const script = read("scripts/test-consumers.mjs");
    const call = script.indexOf('if (only === "expo-latest")');
    expect(call).toBeGreaterThan(-1);
    // The `//` lines directly above the call, as one sentence.
    const above = script.slice(0, call).split("\n").slice(0, -1);
    const lines: string[] = [];
    while (above.at(-1)?.trim().startsWith("//")) lines.unshift(above.pop()!.trim().slice(2));
    const comment = lines.join(" ").replace(/\s+/g, " ");
    expect(comment).toContain("every push to main (ci.yml expo-latest)");
    expect(comment).toContain("compat-check.yml");
    expect(comment).not.toMatch(/on a schedule \(compat-check\.yml\), never/);
    // The jobs the comment names run this leg.
    const ci = read("../../.github/workflows/ci.yml");
    expect(ci).toMatch(/\n {2}expo-latest:\n[\s\S]*?VN_CONSUMERS: expo-latest/);
    expect(read("../../.github/workflows/compat-check.yml")).toContain("VN_CONSUMERS: expo-latest");
  });
});

describe("test-consumers.mjs", () => {
  const source = fs.readFileSync(
    path.resolve(import.meta.dirname, "../scripts/test-consumers.mjs"),
    "utf8",
  );

  it("runs the expo-latest leg on the derived list, not a hand-written one", () => {
    expect(source).toContain(
      'if (only === "expo-latest") runExpoVersions(tarball, only, expoLatestEntries());',
    );
    expect(source).not.toMatch(/expo:\s*"~\d+\.0\.0"/);
  });

  it("runs every Expo entry through runEachExpoEntry", () => {
    const start = source.indexOf("function runExpoVersions(");
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("\n}\n", start));
    expect(body).toMatch(
      /^function runExpoVersions\([^)]*\) \{\n(?:\s*\/\/.*\n)*\s*runEachExpoEntry\(entries, /,
    );
    expect(body).not.toMatch(/\bfor \(/);
  });
});
