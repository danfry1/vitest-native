/**
 * Releases are cut from the changeset queue, so a change to shipped source with no
 * entry reaches users with no changelog line and contributes nothing to the version
 * bump. Nothing checked for it.
 *
 * The gap was measured rather than supposed: of thirteen pull requests opened in a
 * single session, exactly two touched `packages/vitest-native/src/` — a new warning
 * users would see when the precompiled registry cannot be built, and a change to
 * what `doctor` reports about a project's config. Neither had a changeset, and every
 * gate on both was green.
 *
 * Comment-only edits and internal refactors genuinely need no release note. They
 * need `bunx changeset --empty`, which records that decision instead of leaving it
 * to be inferred from an absence.
 */
import { describe, expect, it } from "vitest";
import { assessChangeset } from "../scripts/check-changeset.mjs";

const SRC = "packages/vitest-native/src/cli/doctor.ts";

describe("assessChangeset", () => {
  it("requires one when shipped source changes", () => {
    const result = assessChangeset([SRC, "packages/vitest-native/tests/doctor.test.ts"]);
    expect(result.ok).toBe(false);
    expect(result.shipped).toEqual([SRC]);
  });

  it("is satisfied by a changeset alongside the change", () => {
    expect(assessChangeset([SRC, ".changeset/some-fix.md"]).ok).toBe(true);
  });

  it("does not require one when no shipped source changed", () => {
    const result = assessChangeset([
      ".github/workflows/ci.yml",
      "packages/vitest-native/scripts/check-package-size.mjs",
      "packages/vitest-native/tests/a.test.ts",
      "website/guide/plugin-options.md",
    ]);
    expect(result.ok).toBe(true);
    expect(result.shipped).toEqual([]);
  });

  it("does not accept the changeset README as a changeset", () => {
    // It is the only .md that lives there permanently, so counting it would make
    // every check pass forever.
    expect(assessChangeset([SRC, ".changeset/README.md"]).ok).toBe(false);
  });

  it("does not accept the changeset config as a changeset", () => {
    expect(assessChangeset([SRC, ".changeset/config.json"]).ok).toBe(false);
  });

  it("reports every shipped file, not just the first", () => {
    const files = [SRC, "packages/vitest-native/src/native/registry.mjs"];
    expect(assessChangeset(files).shipped).toEqual(files);
  });

  it("does not mistake a similarly-named path for shipped source", () => {
    // `scripts/` and `tests/` sit beside `src/` under the same package.
    const result = assessChangeset([
      "packages/vitest-native/src-notes/todo.md",
      "packages/vitest-native/scripts/src/helper.mjs",
    ]);
    expect(result.shipped).toEqual([]);
  });
});
