/**
 * scripts/check-closing-keywords.mjs: which references in a pull request's title and body
 * GitHub would close on a squash merge. The API lookup (issue or pull request) runs in CI.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error — runtime .mjs, no types
import { closingReferences } from "../scripts/check-closing-keywords.mjs";

const REPO = "acme/app";
const refs = (text: string) =>
  closingReferences(text, REPO).map(
    (r: { keyword: string; repo: string; number: number }) => `${r.keyword} ${r.repo}#${r.number}`,
  );

describe("closingReferences", () => {
  it("finds every keyword form GitHub honours, case-insensitive, with an optional colon", () => {
    for (const keyword of [
      "close",
      "closes",
      "closed",
      "fix",
      "fixes",
      "fixed",
      "resolve",
      "resolves",
      "resolved",
    ]) {
      expect(refs(`${keyword} #12`)).toEqual([`${keyword} acme/app#12`]);
    }
    expect(refs("Fixes: #7")).toEqual(["fixes acme/app#7"]);
  });

  it("reads other repositories, full URLs, and lists after one keyword", () => {
    expect(refs("Closes other/lib#3")).toEqual(["closes other/lib#3"]);
    expect(refs("Resolves https://github.com/acme/app/pull/40")).toEqual(["resolves acme/app#40"]);
    expect(refs("Fixes #1, #2 and #3")).toEqual([
      "fixes acme/app#1",
      "fixes acme/app#2",
      "fixes acme/app#3",
    ]);
  });

  it("ignores references without a closing keyword, and words that only contain one", () => {
    expect(
      refs("After #612. See #600; relates to #599. Prefixed #4, suffixes #5, unclosed #6."),
    ).toEqual([]);
  });
});
