/**
 * scripts/scratch-install.mjs: a throwaway fixture install keeps the release cooldown and
 * the repository's resolutions, so it cannot pull young transitive packages. Nothing here
 * touches the network: bun, the registry's publish times and semver are stubbed.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import {
  chooseOverrides,
  nonRegistryPackages,
  scratchInstall,
} from "../scripts/scratch-install.mjs";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-09T12:00:00Z");
const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A bun.lock as bun writes it: trailing commas, `[id, registry, meta, integrity]` rows. */
function bunLock(
  top: Record<string, string>,
  packages: Record<string, [string, Record<string, string>?]>,
): string {
  const rows = Object.entries(packages)
    .map(
      ([key, [id, deps]]) =>
        `    "${key}": ["${id}", "", ${JSON.stringify(deps ? { dependencies: deps } : {})}, "sha512-x"],`,
    )
    .join("\n");
  return `{\n  "lockfileVersion": 1,\n  "workspaces": {\n    "": {\n      "name": "scratch",\n      "dependencies": ${JSON.stringify(top)},\n    },\n  },\n  "packages": {\n${rows}\n  },\n}\n`;
}

const REPO_LOCK = bunLock(
  {},
  {
    vite: ["vite@8.3.5", { rolldown: "1.2.15" }],
    rolldown: ["rolldown@1.2.15"],
    "@react-native/codegen": ["@react-native/codegen@0.88.0"],
    debug: ["debug@4.4.0"],
    "foo/debug": ["debug@2.6.9"],
    react: ["react@19.2.4"],
    picomatch: ["picomatch@4.0.3"],
  },
);

/** Exact-or-caret satisfaction, enough for these fixtures. */
const satisfies = (pairs: [string, string][]) =>
  pairs.map(([version, range]) =>
    range.startsWith("^")
      ? version.split(".")[0] === range.slice(1).split(".")[0] && version >= range.slice(1)
      : version === range,
  );

function scratch(dependencies: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "vn-scratch-"));
  temps.push(dir);
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "scratch", dependencies }),
  );
  return dir;
}

/** A bun stub: each `--lockfile-only` writes the lock for the overrides now in package.json. */
function fakeBun(resolve: (overrides: Record<string, string>) => string) {
  const calls: string[][] = [];
  const exec = (command: string, args: string[], cwd: string) => {
    calls.push([command, ...args]);
    if (args.includes("--lockfile-only")) {
      const manifest = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
      fs.writeFileSync(path.join(cwd, "bun.lock"), resolve(manifest.overrides ?? {}));
    }
  };
  return { exec, calls };
}

/** The scratch tree: react-native's pinned codegen, and vite at whatever is newest or overridden. */
const scratchResolution = (overrides: Record<string, string>) =>
  bunLock(
    { "react-native": "0.86.3", react: "19.2.8" },
    {
      "react-native": [
        "react-native@0.86.3",
        { "@react-native/codegen": "0.86.3", vite: "^8.3.0" },
      ],
      "@react-native/codegen": ["@react-native/codegen@0.86.3"],
      react: ["react@19.2.8"],
      // vite pins its rolldown exactly, as the real one does.
      vite: [
        `vite@${overrides.vite ?? "8.3.7"}`,
        { rolldown: overrides.vite ? "1.2.15" : "1.2.18" },
      ],
      rolldown: [`rolldown@${overrides.vite ? "1.2.15" : "1.2.18"}`],
    },
  );

describe("scratch-install", () => {
  it("refuses a top level that is not exact versions", async () => {
    const dir = scratch({ "react-native": "^0.86.3", vitest: "file:../vitest-native.tgz" });
    const { exec, calls } = fakeBun(scratchResolution);
    await expect(scratchInstall(dir, { exec, satisfies, repoLockText: REPO_LOCK })).rejects.toThrow(
      "react-native@^0.86.3",
    );
    expect(calls).toEqual([]);
  });

  it("overrides to the repository's single resolution only where every range accepts it", () => {
    const overrides = chooseOverrides({
      repoLock: JSON.parse(REPO_LOCK.replace(/,(\s*[}\]])/g, "$1")),
      scratchLock: JSON.parse(
        bunLock(
          { react: "19.2.8", "react-native": "0.86.3" },
          {
            "react-native": [
              "react-native@0.86.3",
              {
                "@react-native/codegen": "0.86.3",
                picomatch: "2.3.1",
                vite: "^8.3.0",
                debug: "^4.0.0",
              },
            ],
            "@react-native/codegen": ["@react-native/codegen@0.86.3"],
            // Two ranges, neither met by the repository's 4.0.3, ahead of vite: each
            // candidate's verdicts must stay its own.
            picomatch: ["picomatch@2.3.1"],
            "debug/picomatch": ["picomatch@1.2.0", {}],
            vite: ["vite@8.3.7", { rolldown: "1.2.18" }],
            rolldown: ["rolldown@1.2.18"],
            debug: ["debug@4.4.3", { picomatch: "^1.0.0" }],
            react: ["react@19.2.8"],
          },
        ).replace(/,(\s*[}\]])/g, "$1"),
      ),
      topLevel: new Set(["react", "react-native"]),
      satisfies,
    });
    // vite: one repo version inside ^8.3.0. codegen: RN asks for its own exact release.
    // rolldown: vite 8.3.7 asks for 1.2.18 exactly (the second pass, under vite's override,
    // resolves the repository's). debug: the repository resolves two versions. react: the approval's.
    expect(overrides).toEqual({ vite: "8.3.5" });
  });

  it("refuses a resolution with a package younger than the cooldown, before installing", async () => {
    const dir = scratch({ "react-native": "0.86.3", react: "19.2.8" });
    const { exec, calls } = fakeBun(scratchResolution);
    const publishTime = (name: string) => NOW - (name === "@react-native/codegen" ? 1 : 30) * DAY;
    await expect(
      scratchInstall(dir, {
        exec,
        satisfies,
        publishTime,
        now: NOW,
        repoLockText: REPO_LOCK,
        log() {},
      }),
    ).rejects.toThrow("@react-native/codegen@0.86.3 (1.0 d)");
    expect(calls.some((call) => call.includes("--frozen-lockfile"))).toBe(false);
  });

  it("runs every bun call with the cooldown and without install scripts", async () => {
    const dir = scratch({ "react-native": "0.86.3", react: "19.2.8" });
    const { exec, calls } = fakeBun(scratchResolution);
    const result = await scratchInstall(dir, {
      exec,
      satisfies,
      publishTime: () => NOW - 30 * DAY,
      now: NOW,
      repoLockText: REPO_LOCK,
      log() {},
    });
    expect(calls).toEqual([
      ["bun", "install", "--lockfile-only", "--ignore-scripts", "--minimum-release-age=604800"],
      ["bun", "install", "--lockfile-only", "--ignore-scripts", "--minimum-release-age=604800"],
      ["bun", "install", "--frozen-lockfile", "--ignore-scripts", "--minimum-release-age=604800"],
    ]);
    // The second pass took the repository's vite, and vite brought the repository's
    // rolldown with it, so a third pass found nothing more to override.
    expect(result.overrides).toEqual({ vite: "8.3.5" });
    expect(fs.readFileSync(path.join(dir, "bunfig.toml"), "utf8")).toContain(
      "minimumReleaseAge = 604800",
    );
  });
  it("finds every package not from the registry, but the top level's own file: tarball", () => {
    const lock = JSON.parse(
      bunLock(
        { "vitest-native": "file:../vitest-native.tgz", react: "19.2.8" },
        {
          "vitest-native": ["vitest-native@file:../vitest-native.tgz"],
          react: ["react@19.2.8"],
          "@scope/from-github": ["@scope/from-github@github:someone/repo#0123abc"],
          "from-ssh": ["from-ssh@git+ssh://git@github.com/someone/repo.git#0123abc"],
          "from-url": ["from-url@https://example.com/from-url-1.0.0.tgz"],
          // A nested copy is not the approval's, even under the same name.
          "react/vitest-native": ["vitest-native@file:../elsewhere.tgz"],
          "local-path": ["local-path@file:../somewhere"],
        },
      ).replace(/,(\s*[}\]])/g, "$1"),
    );
    expect(
      nonRegistryPackages(lock, { dependencies: { "vitest-native": "file:../vitest-native.tgz" } }),
    ).toEqual([
      "@scope/from-github@github:someone/repo#0123abc",
      "from-ssh@git+ssh://git@github.com/someone/repo.git#0123abc",
      "from-url@https://example.com/from-url-1.0.0.tgz",
      "local-path@file:../somewhere",
      "vitest-native@file:../elsewhere.tgz",
    ]);
  });

  it("refuses a transitive package from git before checking ages or installing", async () => {
    const dir = scratch({ "react-native": "0.86.3", react: "19.2.8" });
    const { exec, calls } = fakeBun((overrides) =>
      scratchResolution(overrides).replace(
        '    "rolldown": [',
        '    "from-git": ["from-git@github:someone/repo#0123abc", "", {}, "x"],\n    "rolldown": [',
      ),
    );
    const looked: string[] = [];
    await expect(
      scratchInstall(dir, {
        exec,
        satisfies,
        publishTime: (name: string) => (looked.push(name), NOW - 30 * DAY),
        now: NOW,
        repoLockText: REPO_LOCK,
        log() {},
      }),
    ).rejects.toThrow("from-git@github:someone/repo#0123abc");
    expect(looked).toEqual([]);
    expect(calls.some((call) => call.includes("--frozen-lockfile"))).toBe(false);
  });
});
