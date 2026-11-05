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

// The rows of the first table under "## Requirements", up to the next heading.
function requirementRows(file: string): Map<string, string> {
  const text = fs.readFileSync(file, "utf8");
  const from = text.indexOf("## Requirements");
  const to = text.indexOf("\n## ", from + 1);
  const section = text.slice(from, to === -1 ? undefined : to);
  return new Map(
    [...section.matchAll(/^\|\s*([^|]*?)\s*\|\s*([^|]+?)\s*\|$/gm)]
      .filter(([, name, value]) => name !== "" && !/^-+$/.test(name) && !/^-+$/.test(value))
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

  // "22.13.0" is written "22.13", "22.22.3" as is.
  const shortVersion = (version: string) => version.replace(/\.0$/, "");

  function expectedRequirements(): Map<string, string> {
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    const { rn } = JSON.parse(
      fs.readFileSync(path.join(repoRoot, ".github", "rn-matrix.json"), "utf8"),
    );
    const nodeRanges = (manifest.engines.node as string).split("||").map((range) => range.trim());
    // The row's sentence has one floor per Node line; a third range needs a new sentence.
    expect(nodeRanges, "engines.node").toHaveLength(2);
    const [node22, node24] = nodeRanges.map((range) => shortVersion(range.match(/>=(\S+)/)![1]));
    return new Map([
      ["Node.js", `${node22}+ on Node 22, or ${node24}+`],
      ["Vitest", list(majors("vitest"))],
      ["Vite", list(Object.values(peer("vite").minimumByMajor!).map((v) => `^${v}`))],
      ["React", `${peer("react").minimum.split(".")[0]} or later`],
      ["React Native", `${rn[0]}–${rn.at(-1)}`],
      ["Expo SDK", expoSdkList("and", SUPPORTED_EXPO_SDKS)],
      [
        "React Native Testing Library",
        `${list(majors("@testing-library/react-native"))} (optional)`,
      ],
    ]);
  }

  it.each([
    ["README.md", PACKAGE_README],
    ["website/guide/install.md", path.join(repoRoot, "website/guide/install.md")],
  ])("%s states the supported versions the plugin and CI use", (_name, file) => {
    expect(Object.fromEntries(requirementRows(file))).toEqual(
      Object.fromEntries(expectedRequirements()),
    );
  });
});
