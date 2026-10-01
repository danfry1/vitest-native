import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { changelogSection, releaseChannel } from "../scripts/release-channel.mjs";

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../scripts/release-channel.mjs",
);

describe("releaseChannel", () => {
  it("sends prereleases to next and releases to latest", () => {
    expect(releaseChannel("0.14.0")).toEqual({ distTag: "latest", prerelease: false });
    expect(releaseChannel("0.14.0-rc.0")).toEqual({ distTag: "next", prerelease: true });
    expect(releaseChannel("1.0.0-beta.2")).toEqual({ distTag: "next", prerelease: true });
  });
});

describe("changelogSection", () => {
  const changelog = `# vitest-native

## 0.14.0

### Minor Changes

- abc: the new default

## 0.13.0

- older
`;

  it("returns the version's section without its heading", () => {
    expect(changelogSection(changelog, "0.14.0")).toBe(
      "### Minor Changes\n\n- abc: the new default",
    );
    expect(changelogSection(changelog, "0.13.0")).toBe("- older");
  });

  it("falls back to the base version for a prerelease", () => {
    expect(changelogSection(changelog, "0.14.0-rc.0")).toBe(
      "### Minor Changes\n\n- abc: the new default",
    );
    expect(changelogSection(changelog, "0.15.0-rc.0")).toBe(null);
  });

  it("finds the current version in the shipped changelog", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(path.dirname(SCRIPT), "..", "package.json"), "utf8"),
    );
    const real = fs.readFileSync(path.join(path.dirname(SCRIPT), "..", "CHANGELOG.md"), "utf8");
    expect(changelogSection(real, pkg.version)).toBeTruthy();
  });
});

describe("the CLI the release workflow runs", () => {
  it("prints the channel and writes the notes", () => {
    const notes = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vn-release-")), "notes.md");
    const result = spawnSync(process.execPath, [SCRIPT, "0.14.0-rc.0", "--notes-file", notes], {
      encoding: "utf8",
    });
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("dist-tag=next\nprerelease=true\n");
    expect(fs.readFileSync(notes, "utf8")).toMatch(/^### /);
  });
});
