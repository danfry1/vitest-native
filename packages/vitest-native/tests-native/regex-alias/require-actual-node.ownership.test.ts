/**
 * Under experimental.ownershipModel the project's aliases have one record, the shared
 * resolver's, which holds RegExp aliases too. So a jest.requireActual Node answers (here
 * in the test body, outside any factory) applies `^@partial-mock/(.*)$` as the imports
 * do. With the flag off Node is given string aliases only, and this request throws
 * REQUIRE_ACTUAL_ALIAS_UNSUPPORTED. Runs in vitest.regex-alias.config.mts --mode ownership.
 */
import { expect, it } from "vitest";
import { read } from "@partial-mock/api";
import { projectContext } from "../../src/context.mjs";

declare const jest: { requireActual<T = any>(path: string): T };

it("applies a RegExp alias to a requireActual Node answers", () => {
  const actual = jest.requireActual<{ read: unknown }>("@partial-mock/api");
  expect(actual.read).toBe(read);
});

it("hands the workers one alias record, the resolver's", () => {
  const context = projectContext();
  expect(context?.requireAliases).toBeUndefined();
  expect(context?.requireAliasesSkipped).toBeUndefined();
  expect(context?.resolverInputs?.aliases).toHaveLength(2);
});
