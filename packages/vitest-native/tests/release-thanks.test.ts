/**
 * Release notes thank everyone outside the maintainer whose issue was closed or whose pull
 * request was merged in the release. scripts/release-thanks.mjs prints that paragraph from
 * GitHub's issues endpoint; these cover who it credits and how it lists them.
 */
import { describe, expect, it } from "vitest";
import { credits, MAINTAINER, thankYou } from "../../../scripts/release-thanks.mjs";

const issue = (login: string, extra: Record<string, unknown> = {}) => ({
  user: { login, type: "User" },
  state: "closed",
  state_reason: "completed",
  ...extra,
});
const pull = (login: string, mergedAt: string | null) =>
  issue(login, { pull_request: { merged_at: mergedAt } });

describe("credits", () => {
  it("credits a closed issue and a merged pull request", () => {
    expect(credits(issue("octocat"))).toBe(true);
    expect(credits(pull("octocat", "2026-11-01T00:00:00Z"))).toBe(true);
  });

  it("does not credit a pull request closed without merging, or an open issue", () => {
    expect(credits(pull("octocat", null))).toBe(false);
    expect(credits(issue("octocat", { state: "open" }))).toBe(false);
  });

  it("does not credit an issue closed as not planned or as a duplicate", () => {
    expect(credits(issue("octocat", { state_reason: "not_planned" }))).toBe(false);
    expect(credits(issue("octocat", { state_reason: "duplicate" }))).toBe(false);
  });

  it("leaves out the maintainer, bots and deleted accounts", () => {
    expect(credits(issue(MAINTAINER))).toBe(false);
    expect(credits({ ...issue("dependabot[bot]"), user: { login: "dependabot[bot]" } })).toBe(
      false,
    );
    expect(credits({ ...issue("renovate"), user: { login: "renovate", type: "Bot" } })).toBe(false);
    expect(credits({ ...issue("x"), user: null })).toBe(false);
  });
});

describe("thankYou", () => {
  it("lists each handle once, alphabetically regardless of case, as links", () => {
    // By code point, "Zed" would come before "alice".
    const items = [issue("Zed"), pull("alice", "2026-11-01T00:00:00Z"), issue("Bob"), issue("Zed")];
    expect(thankYou(items)).toBe(
      "Thank you to [@alice](https://github.com/alice), [@Bob](https://github.com/Bob) and " +
        "[@Zed](https://github.com/Zed) for the issues and pull requests in this release.",
    );
  });

  it("names a single contributor without a list", () => {
    expect(thankYou([issue("octocat")])).toBe(
      "Thank you to [@octocat](https://github.com/octocat) for the issues and pull requests in this release.",
    );
  });

  it("is null when only the maintainer and bots took part", () => {
    expect(thankYou([issue(MAINTAINER), pull("octocat", null)])).toBeNull();
  });
});
