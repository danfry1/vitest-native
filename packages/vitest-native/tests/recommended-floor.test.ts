/**
 * Recommended floors (docs/upstream-policy.md §2): a peer below one still runs, with an
 * upstream bug users would meet, so it gets a warning naming the bug and the release
 * that fixes it, never a refusal. The first is Vitest 5.1.0 (vitest-dev/vitest#11682).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runDoctor } from "../src/cli/doctor.js";
import {
  PEER_REQUIREMENTS,
  RECOMMENDED_FLOORS,
  belowRecommendedMessage,
} from "../src/peer-requirements.js";

function project(vitestVersion: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vn-recommended-"));
  const files: Record<string, object> = {
    "package.json": { name: "app" },
    "node_modules/vitest/package.json": { name: "vitest", version: vitestVersion },
    "node_modules/vite/package.json": { name: "vite", version: "8.3.5" },
    "node_modules/react/package.json": { name: "react", version: "19.2.0" },
  };
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), JSON.stringify(content));
  }
  return root;
}

describe("recommended floors", () => {
  it("records Vitest 5.1.0 as recommended, above the hard floor of 5.0.0", () => {
    const vitest = PEER_REQUIREMENTS.find((peer) => peer.name === "vitest")!;
    expect(vitest.minimum).toBe("5.0.0");
    expect(RECOMMENDED_FLOORS.vitest).toMatchObject({
      version: "5.1.0",
      issue: "vitest-dev/vitest#11682",
    });
  });

  it("names the upstream issue and the fixing release below the floor, and nothing at or above it", () => {
    const message = belowRecommendedMessage("vitest", "5.0.5");
    expect(message).toContain("vitest 5.0.5 is below the recommended 5.1.0");
    expect(message).toContain("vitest-dev/vitest#11682");
    expect(message).toContain("It still runs");
    for (const version of ["5.1.0", "5.1.3", "5.2.0"]) {
      expect(belowRecommendedMessage("vitest", version)).toBeNull();
    }
    expect(belowRecommendedMessage("react", "19.0.0")).toBeNull();
  });

  it("is a doctor warning, not a failure", () => {
    const below = runDoctor(project("5.0.5")).lines.join("\n");
    expect(below).toContain("✓ vitest 5.0.5");
    expect(below).toMatch(/vitest 5\.0\.5 is below the recommended 5\.1\.0/);
    expect(below).not.toMatch(/✗[^\n]*vitest 5\.0\.5/);
    const at = runDoctor(project("5.1.0")).lines.join("\n");
    expect(at).toContain("✓ vitest 5.1.0");
    expect(at).not.toContain("below the recommended");
  });
});
