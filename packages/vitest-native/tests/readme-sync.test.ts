import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { expoSdkList, PEER_REQUIREMENTS, SUPPORTED_EXPO_SDKS } from "../src/peer-requirements.js";

// GitHub shows the repository's README.md and npm shows the package's, so the two are
// one document kept in two places. They had drifted to 575 and 1045 lines with
// different component counts and different Jest advice. The package copy differs only
// inside the contributors markers, which scripts/contributors.mjs fills in the
// repository copy alone. Their Requirements table is read from the sources the plugin
// and CI use, so a version-range change that leaves it behind fails here.
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "../..");
const ROOT_README = path.join(repoRoot, "README.md");
const PACKAGE_README = path.join(packageRoot, "README.md");

const CONTRIBUTORS = /<!-- contributors:start -->[\s\S]*?<!-- contributors:end -->/;
const outsideContributors = (file: string) =>
  fs.readFileSync(file, "utf8").replace(CONTRIBUTORS, "<!-- contributors -->");

function requirementRows(file: string): Map<string, string> {
  const text = fs.readFileSync(file, "utf8");
  const section = text.slice(text.indexOf("## Requirements"), text.indexOf("## Learn more"));
  return new Map(
    [...section.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm)]
      .filter(([, name]) => name !== "" && !/^-+$/.test(name))
      .map(([, name, value]) => [name, value]),
  );
}

const peer = (name: string) => PEER_REQUIREMENTS.find((p) => p.name === name)!;
const majors = (name: string) => {
  const { minimum, maximumMajor } = peer(name);
  const first = Number(minimum.split(".")[0]);
  return Array.from({ length: maximumMajor! - first }, (_, i) => `${first + i}.x`);
};
const list = (items: string[]) =>
  items.length === 2 ? items.join(" or ") : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;

describe("README.md", () => {
  it("is the same document in the repository and in the package, outside the contributors list", () => {
    expect(outsideContributors(PACKAGE_README)).toBe(outsideContributors(ROOT_README));
  });

  it("states the supported versions the plugin and CI use", () => {
    const rows = requirementRows(PACKAGE_README);
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    const { rn } = JSON.parse(
      fs.readFileSync(path.join(repoRoot, ".github", "rn-matrix.json"), "utf8"),
    );
    const [node22, node24] = (manifest.engines.node as string)
      .split("||")
      .map((range) => range.trim().match(/>=(\d+\.\d+)/)![1]);

    expect(rows.get("Node.js")).toBe(`${node22}+ on Node 22, or ${node24}+`);
    expect(rows.get("Vitest")).toBe(list(majors("vitest")));
    expect(rows.get("Vite")).toBe(
      list(Object.values(peer("vite").minimumByMajor!).map((v) => `^${v}`)),
    );
    expect(rows.get("React")).toBe(`${peer("react").minimum.split(".")[0]} or later`);
    expect(rows.get("React Native")).toBe(`${rn[0]}–${rn.at(-1)}`);
    expect(rows.get("Expo SDK")).toBe(expoSdkList("and", SUPPORTED_EXPO_SDKS));
    expect(rows.get("React Native Testing Library")).toBe(
      `${list(majors("@testing-library/react-native"))} (optional)`,
    );
  });
});
