// Two test.projects given the same jestMockTransform() instance (Vitest re-creates the
// plugins of an `extends: true` project, so a shared instance is one a config passes to
// several projects): each gets the manual mocks of its own root only, though
// root-mocks-projects/a and b mock the same package differently.
import "./support/fresh-dist.mts";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { reactNative } from "../dist/index.mjs";
import { jestCompatAliases, jestMockTransform } from "../dist/jest-compat.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "root-mocks-projects");
const shared = jestMockTransform();

export default defineConfig({
  test: {
    projects: ["a", "b"].map((name) => ({
      root: path.join(fixture, name),
      plugins: [reactNative({ engine: "native", hotRuntime: false }), shared],
      resolve: { alias: { ...jestCompatAliases() } },
      test: {
        name,
        environment: "node",
        globals: true,
        setupFiles: [path.resolve(here, "../dist/jest-compat/setup.mjs")],
        include: ["*.test.ts"],
      },
    })),
  },
});
