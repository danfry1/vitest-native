# vitest-native Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform vitest-native 0.3.0 into a 10/10 production-grade, large-org-trusted package — the Vitest answer to `react-native/jest-preset`.

**Architecture:** Five pillars executed in order: Trust Foundation → Conformance Expansion → Documentation → CI Hardening → API Audit & 1.0 Prep. Each pillar is independently shippable. All work happens in `packages/vitest-native/` unless noted.

**Tech Stack:** TypeScript, Vitest 4+, Vite 5+, bun, oxlint, oxfmt, tsdown, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-03-22-production-readiness-design.md`

---

## ⚠️ Reconciliation (2026-06-05) — read this first

**This plan predates the dual-engine work and is no longer the primary planning doc.** The current
source of truth is **[`packages/vitest-native/docs/roadmap-to-confident-real-app-use.md`](../../../packages/vitest-native/docs/roadmap-to-confident-real-app-use.md)**.

**Strategic shift since this was written.** This plan framed the goal as making the *mock engine* a
10/10 "Vitest answer to `react-native/jest-preset`." The dual-engine findings reframed the product's
value as **unification + a fidelity choice**: a fast mock engine for the ~90% case, a real-RN
`engine: 'native'` for the ~10% that needs true fidelity (a11y, RN-API validation, integration,
mock-drift avoidance), and a cross-check to tell you which. Consequence: several Pillar-2 tasks here
(hand-mocking each RN API ever more faithfully) are **lower priority now** — the native engine runs
the *real* RN implementation of those APIs, so the long tail of mock fidelity matters less.

**Status of this plan's pillars (2026-06-05):**

- **Pillar 1 — Trust Foundation:** ✅ DONE. Community files (`SECURITY.md`, PR template) present;
  runtime peer-dependency validation shipped (`src/validate.ts`).
- **Pillar 2 — Conformance Expansion:** ◑ Largely landed / partly superseded. Interpolation tasks
  (string output ranges, color/hex → rgba, live derived values) are **DONE** (see roadmap P2 +
  `tests/rn-conformance/rn-Interpolation.test.ts`, mock suite ~1200 tests). Remaining per-API mock
  enhancements (LayoutAnimation/Alert/AccessibilityInfo deepening, parity tagging) are de-prioritized
  in favor of the native engine providing real behavior.
- **Pillar 3 — Documentation:** ◑ Partial. Jest **migration guide DONE**
  (`packages/vitest-native/docs/migrating-from-jest.md`); README extensively covers API/helpers/presets.
  Still open: standalone preset-authoring / testing-patterns / architecture guides.
- **Pillar 4 — CI Hardening:** ◑ Partial. **Multi-version matrix DONE** (Node matrix in `ci.yml`;
  RN-version matrix in `.github/workflows/native-rn-matrix.yml`); published-package smoke via
  `npm pack` + `@arethetypeswrong/cli` in `ci.yml`. Still open: coverage/Codecov, bundle-size
  tracking, security automation (Dependabot/CodeQL).
- **Pillar 5 — API Audit & 1.0 Prep:** ☐ Open. Still `0.3.0`. The supported RN range (0.81–0.84) is
  now established (see roadmap P2); a formal API audit + 1.0 cut remain.

**Net:** the trust + conformance-interpolation + multi-version-CI substance of this plan is done; the
mock-fidelity long tail is intentionally deferred; the open, still-valuable items are the remaining
docs guides and the CI-hardening/1.0 packaging tasks. Pull individual tasks from here as needed, but
prioritize against the roadmap.

---

## Pillar 1: Trust Foundation

### Task 1: Add community files

**Files:**
- Create: `SECURITY.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`

- [ ] **Step 1: Create SECURITY.md**

```markdown
# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in vitest-native, please report it through
[GitHub Security Advisories](https://github.com/danfry1/vitest-native/security/advisories/new).

**Do not open a public issue for security vulnerabilities.**

### What to expect

- **Acknowledgment** within 72 hours of your report
- **Fix timeline** communicated within 7 days
- **Credit** in the release notes (unless you prefer anonymity)

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |
| < Latest | Best-effort |
```

- [ ] **Step 2: Create CODE_OF_CONDUCT.md**

Use the Contributor Covenant v2.1 template. Set the contact method to GitHub Security Advisories / issue reporting.

- [ ] **Step 3: Create `.github/PULL_REQUEST_TEMPLATE.md`**

```markdown
## Description

<!-- What does this PR do? -->

## Checklist

- [ ] Tests pass (`bun run test`)
- [ ] Lint passes (`bun run lint`)
- [ ] Changeset added (if user-facing change): `bunx changeset`
- [ ] Docs updated (if API changed)
```

- [ ] **Step 4: Commit**

```bash
git add SECURITY.md CODE_OF_CONDUCT.md .github/PULL_REQUEST_TEMPLATE.md
git commit -m "chore: add SECURITY.md, CODE_OF_CONDUCT.md, and PR template"
```

---

### Task 2: Add runtime peer dependency validation

**Files:**
- Modify: `packages/vitest-native/src/plugin.ts:209-253` (inside `reactNative()`, before the return)

- [ ] **Step 1: Write the failing test**

Create `packages/vitest-native/tests/validation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test the validation logic by importing the plugin and checking behavior.
// The plugin runs in the Vite main process, so we test the exported function directly.

describe("plugin option validation", () => {
  it("should warn about unknown options", () => {
    // This test verifies the warning fires — we'll implement in step 3
  });
});
```

Note: Runtime peer dep validation is best tested via integration. The primary deliverable here is the implementation with manual verification. Write a focused unit test for the `validatePeerDependency` helper.

```typescript
import { describe, it, expect } from "vitest";
import { validatePeerDependency } from "../src/validate.js";

describe("validatePeerDependency", () => {
  it("returns null when package satisfies version range", () => {
    // Mock createRequire to return a package.json with matching version
    const result = validatePeerDependency("vitest", ">=4.0.0", process.cwd());
    // vitest is installed in this project at >=4, so this should pass
    expect(result).toBeNull();
  });

  it("returns error message when package version is too low", () => {
    const result = validatePeerDependency("nonexistent-pkg", ">=1.0.0", process.cwd());
    expect(result).toContain("not found");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/vitest-native && bun vitest run tests/validation.test.ts`
Expected: FAIL — `validatePeerDependency` does not exist yet

- [ ] **Step 3: Create the validation module**

Create `packages/vitest-native/src/validate.ts`:

```typescript
import { createRequire } from "node:module";
import path from "node:path";

const KNOWN_OPTIONS = ["platform", "presets", "mocks", "diagnostics", "assetExts"];

/**
 * Zero-dep version comparison. Returns true if `version` >= `minimum`.
 */
function satisfiesMinimum(version: string, minimum: string): boolean {
  const parse = (v: string) => v.replace(/^[^0-9]*/, "").split(".").map(Number);
  const [aMaj, aMin = 0, aPat = 0] = parse(version);
  const [bMaj, bMin = 0, bPat = 0] = parse(minimum);
  if (aMaj !== bMaj) return aMaj > bMaj;
  if (aMin !== bMin) return aMin > bMin;
  return aPat >= bPat;
}

/**
 * Check if a peer dependency is installed and meets the minimum version.
 * Returns null if OK, or an error message string if not.
 */
export function validatePeerDependency(
  pkgName: string,
  minimumVersion: string,
  projectRoot: string,
): string | null {
  const req = createRequire(path.join(projectRoot, "package.json"));
  try {
    const pkgJsonPath = req.resolve(`${pkgName}/package.json`);
    const { version } = req(pkgJsonPath) as { version: string };
    if (!satisfiesMinimum(version, minimumVersion)) {
      return `vitest-native requires ${pkgName} >= ${minimumVersion}, but found ${version}. Please upgrade.`;
    }
    return null;
  } catch {
    return `vitest-native requires ${pkgName} >= ${minimumVersion}, but it was not found. Please install it.`;
  }
}

/**
 * Warn about unknown options (likely typos).
 * Uses Levenshtein distance for "did you mean?" suggestions.
 */
export function warnUnknownOptions(options: Record<string, unknown>): void {
  for (const key of Object.keys(options)) {
    if (!KNOWN_OPTIONS.includes(key)) {
      const suggestion = findClosest(key, KNOWN_OPTIONS);
      const hint = suggestion ? ` Did you mean '${suggestion}'?` : "";
      console.warn(`[vitest-native] Unknown option '${key}'.${hint}`);
    }
  }
}

function findClosest(input: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(input.toLowerCase(), c.toLowerCase());
    if (d < bestDist && d <= 3) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
```

- [ ] **Step 4: Integrate validation into plugin.ts**

In `packages/vitest-native/src/plugin.ts`, inside `reactNative()` before the `return` statement (around line 209), add:

```typescript
import { validatePeerDependency, warnUnknownOptions } from "./validate.js";

// Inside reactNative():
if (options) {
  warnUnknownOptions(options as unknown as Record<string, unknown>);
}
```

In the `configResolved` hook (where we have `config.root`), add peer dep validation:

```typescript
async configResolved(config) {
  // Validate peer dependencies
  const peers = [
    { name: "vitest", range: "4.0.0" },
    { name: "vite", range: "5.0.0" },
    { name: "react", range: "18.0.0" },
  ];
  for (const { name, range } of peers) {
    const error = validatePeerDependency(name, range, config.root);
    if (error) {
      console.error(`[vitest-native] ${error}`);
    }
  }

  // Check optional RNTL version
  const rntlError = validatePeerDependency(
    "@testing-library/react-native", "12.0.0", config.root
  );
  if (rntlError && !rntlError.includes("not found")) {
    console.warn(`[vitest-native] ${rntlError}`);
  }

  // ... existing configResolved logic
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/vitest-native && bun vitest run tests/validation.test.ts`
Expected: PASS

Run: `cd packages/vitest-native && bun vitest run`
Expected: All existing tests still pass

- [ ] **Step 6: Add negative-path diagnostic logging for preset auto-detection**

In `packages/vitest-native/src/plugin.ts`, inside the `autoDetectPresets` function, add an else branch after the `if (installed)` block:

```typescript
if (installed) {
  // ... existing code
} else if (diagnostics) {
  console.log(`[vitest-native] Checked for ${pkgName}: not found, skipping preset`);
}
```

- [ ] **Step 7: Run lint and format**

```bash
cd packages/vitest-native && bun run lint && bun run format
```

- [ ] **Step 8: Commit**

```bash
git add packages/vitest-native/src/validate.ts packages/vitest-native/src/plugin.ts packages/vitest-native/tests/validation.test.ts
git commit -m "feat: add runtime peer dependency validation and unknown option warnings"
```

---

## Pillar 2: Conformance Expansion

### Task 3: Implement string output range interpolation

**Files:**
- Modify: `packages/vitest-native/src/mocks/apis/Animated.ts:8-68` (the `interpolateValue` function)
- Modify: `packages/vitest-native/tests/rn-conformance/rn-Interpolation.test.ts`

- [ ] **Step 1: Unskip the string interpolation tests**

In `packages/vitest-native/tests/rn-conformance/rn-Interpolation.test.ts`, unskip the following tests and add the expected assertions from RN's test suite:

```typescript
it("should work with output ranges as string", () => {
  const interpolation = createInterpolation({
    inputRange: [0, 1],
    outputRange: ["0deg", "100deg"],
  });

  expect(interpolation(0)).toBe("0deg");
  expect(interpolation(0.5)).toBe("50deg");
  expect(interpolation(1)).toBe("100deg");
});

it("should work with negative and decimal values in string ranges", () => {
  const interpolation = createInterpolation({
    inputRange: [0, 1],
    outputRange: ["-100deg", "100deg"],
  });

  expect(interpolation(0)).toBe("-100deg");
  expect(interpolation(0.5)).toBe("0deg");
  expect(interpolation(1)).toBe("100deg");
});

it("should interpolate values with arbitrary suffixes", () => {
  const interpolation = createInterpolation({
    inputRange: [0, 1],
    outputRange: ["M20,20L20,80", "M40,40L40,60"],
  });

  expect(interpolation(0)).toBe("M20,20L20,80");
  expect(interpolation(0.5)).toBe("M30,30L30,70");
  expect(interpolation(1)).toBe("M40,40L40,60");
});

it("should interpolate numeric values of arbitrary format", () => {
  const interpolation = createInterpolation({
    inputRange: [0, 1],
    outputRange: ["rgba(0, 100, 200, 0)", "rgba(50, 150, 250, 0.5)"],
  });

  expect(interpolation(0)).toBe("rgba(0, 100, 200, 0)");
  expect(interpolation(0.5)).toBe("rgba(25, 125, 225, 0.25)");
  expect(interpolation(1)).toBe("rgba(50, 150, 250, 0.5)");
});
```

Note: Update the `createInterpolation` helper at the top of the file to handle string return values:

```typescript
function createInterpolation(config: any) {
  return (input: number) => {
    const val = new Animated.Value(input);
    const interp = val.interpolate(config);
    return interp.getValue();
  };
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/vitest-native && bun vitest run tests/rn-conformance/rn-Interpolation.test.ts`
Expected: FAIL — string output ranges not supported

- [ ] **Step 3: Implement string interpolation in Animated.ts**

Add a new function `interpolateString` above `interpolateValue` in `packages/vitest-native/src/mocks/apis/Animated.ts`:

```typescript
/**
 * Extract numeric values from a string pattern like "rgba(0, 100, 200, 0.5)"
 * Returns the numbers and a template to reconstruct the string.
 */
function parseStringPattern(str: string): { numbers: number[]; template: string } {
  const numbers: number[] = [];
  const template = str.replace(/-?\d+\.?\d*/g, (match) => {
    numbers.push(parseFloat(match));
    return "\0";
  });
  return { numbers, template };
}

function interpolateString(
  value: number,
  inputRange: number[],
  outputRange: string[],
  extrapolate: string,
  extrapolateLeft?: string,
  extrapolateRight?: string,
  easing?: (t: number) => number,
): string {
  const startParsed = parseStringPattern(outputRange[0]);
  const endParsed = parseStringPattern(outputRange[outputRange.length - 1]);

  // For each numeric slot, create a numeric outputRange and interpolate independently
  const numericOutputRanges: number[][] = startParsed.numbers.map((_, idx) =>
    outputRange.map((str) => parseStringPattern(str).numbers[idx]),
  );

  const interpolatedNumbers = numericOutputRanges.map((numRange) =>
    interpolateValue(value, inputRange, numRange, extrapolate, extrapolateLeft, extrapolateRight, easing),
  );

  // Reconstruct the string using the template from the first output
  let result = startParsed.template;
  let idx = 0;
  result = result.replace(/\0/g, () => {
    const n = interpolatedNumbers[idx++];
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  });
  return result;
}
```

- [ ] **Step 4: Update the `interpolate` method on `AnimatedValue`**

In `AnimatedValue.interpolate()` (around line 103), detect string output ranges:

```typescript
interpolate(config: any) {
  const {
    inputRange,
    outputRange,
    extrapolate = "extend",
    extrapolateLeft,
    extrapolateRight,
    easing,
  } = config || {};
  if (!inputRange || !outputRange || inputRange.length < 2 || outputRange.length < 2) {
    return new AnimatedValue(this._value);
  }

  const isStringOutput = typeof outputRange[0] === "string";

  if (isStringOutput) {
    const source = this;
    return {
      getValue() {
        return interpolateString(
          source.getValue(), inputRange, outputRange,
          extrapolate, extrapolateLeft, extrapolateRight, easing,
        );
      },
      interpolate(innerConfig: any) {
        return new AnimatedValue(0).interpolate(innerConfig);
      },
    };
  }

  const result = interpolateValue(
    this._value, inputRange, outputRange,
    extrapolate, extrapolateLeft, extrapolateRight, easing,
  );
  return new AnimatedValue(result);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/vitest-native && bun vitest run tests/rn-conformance/rn-Interpolation.test.ts`
Expected: The unskipped string interpolation tests PASS

- [ ] **Step 6: Unskip and implement Infinity range tests**

Unskip the Infinity-related tests in `rn-Interpolation.test.ts`:

```typescript
it("should work with negative infinite", () => {
  const interpolation = createInterpolation({
    inputRange: [-Infinity, 0],
    outputRange: [-Infinity, 0],
    easing: Easing.quad,
  });
  expect(interpolation(-Infinity)).toBe(-Infinity);
  expect(interpolation(0)).toBe(0);
});

it("should work with positive infinite", () => {
  const interpolation = createInterpolation({
    inputRange: [0, Infinity],
    outputRange: [0, Infinity],
    easing: Easing.quad,
  });
  expect(interpolation(0)).toBe(0);
  expect(interpolation(Infinity)).toBe(Infinity);
});
```

In `interpolateValue`, add Infinity guards at the top of the function before the segment lookup:

```typescript
// Handle Infinity in ranges
if (value === -Infinity) return toNum(outputRange[0]);
if (value === Infinity) return toNum(outputRange[outputRange.length - 1]);
```

- [ ] **Step 7: Run full test suite**

Run: `cd packages/vitest-native && bun vitest run`
Expected: All tests pass (no regressions)

- [ ] **Step 8: Commit**

```bash
git add packages/vitest-native/src/mocks/apis/Animated.ts packages/vitest-native/tests/rn-conformance/rn-Interpolation.test.ts
git commit -m "feat: implement string output range and Infinity interpolation for Animated"
```

---

### Task 4: Implement color string interpolation

**Files:**
- Modify: `packages/vitest-native/src/mocks/apis/Animated.ts`
- Modify: `packages/vitest-native/tests/rn-conformance/rn-Interpolation.test.ts`

- [ ] **Step 1: Unskip color interpolation tests**

In `rn-Interpolation.test.ts`, unskip and implement:

```typescript
it("should work with output ranges as short hex string", () => {
  const interpolation = createInterpolation({
    inputRange: [0, 1],
    outputRange: ["#000", "#fff"],
  });

  expect(interpolation(0)).toBe("rgba(0, 0, 0, 1)");
  expect(interpolation(0.5)).toBe("rgba(128, 128, 128, 1)");
  expect(interpolation(1)).toBe("rgba(255, 255, 255, 1)");
});

it("should work with output ranges as long hex string", () => {
  const interpolation = createInterpolation({
    inputRange: [0, 1],
    outputRange: ["#ff0000", "#0000ff"],
  });

  expect(interpolation(0)).toBe("rgba(255, 0, 0, 1)");
  expect(interpolation(0.5)).toBe("rgba(128, 0, 128, 1)");
  expect(interpolation(1)).toBe("rgba(0, 0, 255, 1)");
});

it("should work with output ranges with mixed hex and rgba strings", () => {
  const interpolation = createInterpolation({
    inputRange: [0, 1],
    outputRange: ["rgba(0, 100, 200, 0)", "#ff0000"],
  });

  expect(interpolation(0)).toBe("rgba(0, 100, 200, 0)");
  expect(interpolation(1)).toBe("rgba(255, 0, 0, 1)");
});

it("should round the alpha channel of a color to the nearest thousandth", () => {
  const interpolation = createInterpolation({
    inputRange: [0, 1],
    outputRange: ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 1)"],
  });

  expect(interpolation(1 / 3)).toBe("rgba(0, 0, 0, 0.333)");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/vitest-native && bun vitest run tests/rn-conformance/rn-Interpolation.test.ts`
Expected: FAIL

- [ ] **Step 3: Add color parsing utility to Animated.ts**

Add before the `interpolateString` function:

```typescript
function parseColor(color: string): [number, number, number, number] {
  // #RGB
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const r = parseInt(color[1] + color[1], 16);
    const g = parseInt(color[2] + color[2], 16);
    const b = parseInt(color[3] + color[3], 16);
    return [r, g, b, 1];
  }
  // #RRGGBB
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return [r, g, b, 1];
  }
  // #RRGGBBAA
  if (/^#[0-9a-f]{8}$/i.test(color)) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const a = parseInt(color.slice(7, 9), 16) / 255;
    return [r, g, b, a];
  }
  // rgba(r, g, b, a) or rgb(r, g, b)
  const rgbaMatch = color.match(/rgba?\(\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*(?:,\s*(-?\d+\.?\d*))?\s*\)/);
  if (rgbaMatch) {
    return [
      parseFloat(rgbaMatch[1]),
      parseFloat(rgbaMatch[2]),
      parseFloat(rgbaMatch[3]),
      rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
    ];
  }
  return [0, 0, 0, 1];
}

function isColorString(str: string): boolean {
  return /^#[0-9a-f]{3,8}$/i.test(str) || /^rgba?\(/.test(str);
}

function interpolateColor(
  value: number,
  inputRange: number[],
  outputRange: string[],
  extrapolate: string,
  extrapolateLeft?: string,
  extrapolateRight?: string,
  easing?: (t: number) => number,
): string {
  const colors = outputRange.map(parseColor);
  const rRange = colors.map((c) => c[0]);
  const gRange = colors.map((c) => c[1]);
  const bRange = colors.map((c) => c[2]);
  const aRange = colors.map((c) => c[3]);

  const r = Math.round(interpolateValue(value, inputRange, rRange, extrapolate, extrapolateLeft, extrapolateRight, easing));
  const g = Math.round(interpolateValue(value, inputRange, gRange, extrapolate, extrapolateLeft, extrapolateRight, easing));
  const b = Math.round(interpolateValue(value, inputRange, bRange, extrapolate, extrapolateLeft, extrapolateRight, easing));
  const a = interpolateValue(value, inputRange, aRange, extrapolate, extrapolateLeft, extrapolateRight, easing);

  const roundedA = Math.round(a * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${roundedA})`;
}
```

- [ ] **Step 4: Update interpolate method to detect color strings**

In `AnimatedValue.interpolate()`, add color detection before the generic string path:

```typescript
if (isStringOutput) {
  if (isColorString(outputRange[0])) {
    const source = this;
    return {
      getValue() {
        return interpolateColor(
          source.getValue(), inputRange, outputRange,
          extrapolate, extrapolateLeft, extrapolateRight, easing,
        );
      },
      interpolate(innerConfig: any) {
        return new AnimatedValue(0).interpolate(innerConfig);
      },
    };
  }
  // ... existing string interpolation path
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/vitest-native && bun vitest run tests/rn-conformance/rn-Interpolation.test.ts`
Expected: PASS

- [ ] **Step 6: Run full test suite, lint, format**

```bash
cd packages/vitest-native && bun vitest run && bun run lint && bun run format
```

- [ ] **Step 7: Commit**

```bash
git add packages/vitest-native/src/mocks/apis/Animated.ts packages/vitest-native/tests/rn-conformance/rn-Interpolation.test.ts
git commit -m "feat: implement color string interpolation for Animated"
```

---

### Task 5: Make interpolate return live derived values

**Files:**
- Modify: `packages/vitest-native/src/mocks/apis/Animated.ts:103-125`
- Create: `packages/vitest-native/tests/interpolation-live.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/vitest-native/tests/interpolation-live.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { Animated } from "react-native";

describe("Animated.Value.interpolate - live derived values", () => {
  it("should update interpolated value when source value changes", () => {
    const source = new Animated.Value(0);
    const interp = source.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 100],
    });

    expect(interp.getValue()).toBe(0);
    source.setValue(0.5);
    expect(interp.getValue()).toBe(50);
    source.setValue(1);
    expect(interp.getValue()).toBe(100);
  });

  it("should update string interpolated value when source changes", () => {
    const source = new Animated.Value(0);
    const interp = source.interpolate({
      inputRange: [0, 1],
      outputRange: ["0deg", "360deg"],
    });

    expect(interp.getValue()).toBe("0deg");
    source.setValue(0.5);
    expect(interp.getValue()).toBe("180deg");
    source.setValue(1);
    expect(interp.getValue()).toBe("360deg");
  });

  it("should update color interpolated value when source changes", () => {
    const source = new Animated.Value(0);
    const interp = source.interpolate({
      inputRange: [0, 1],
      outputRange: ["#000000", "#ffffff"],
    });

    expect(interp.getValue()).toBe("rgba(0, 0, 0, 1)");
    source.setValue(1);
    expect(interp.getValue()).toBe("rgba(255, 255, 255, 1)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/vitest-native && bun vitest run tests/interpolation-live.test.ts`
Expected: FAIL — interpolation returns static snapshot, not live value

- [ ] **Step 3: Refactor interpolate to reference source value dynamically**

Replace the `interpolate` method in `AnimatedValue` to always reference `this` (the source) dynamically via a getter:

```typescript
interpolate(config: any) {
  const {
    inputRange,
    outputRange,
    extrapolate = "extend",
    extrapolateLeft,
    extrapolateRight,
    easing,
  } = config || {};
  if (!inputRange || !outputRange || inputRange.length < 2 || outputRange.length < 2) {
    return new AnimatedValue(this._value);
  }

  const source = this;
  const isStringOutput = typeof outputRange[0] === "string";
  const isColor = isStringOutput && isColorString(outputRange[0]);

  // Return an object that mirrors AnimatedValue's interface so existing
  // code that calls toJSON(), stopAnimation(), etc. on interpolation results
  // continues to work. The key difference: getValue() reads from the source
  // dynamically instead of returning a static snapshot.
  return {
    getValue() {
      const currentValue = source.getValue();
      if (isColor) {
        return interpolateColor(
          currentValue, inputRange, outputRange,
          extrapolate, extrapolateLeft, extrapolateRight, easing,
        );
      }
      if (isStringOutput) {
        return interpolateString(
          currentValue, inputRange, outputRange,
          extrapolate, extrapolateLeft, extrapolateRight, easing,
        );
      }
      return interpolateValue(
        currentValue, inputRange, outputRange,
        extrapolate, extrapolateLeft, extrapolateRight, easing,
      );
    },
    toJSON() {
      return this.getValue();
    },
    stopAnimation(callback?: Function) {
      callback?.(this.getValue());
    },
    resetAnimation(callback?: Function) {
      callback?.(this.getValue());
    },
    interpolate(innerConfig: any) {
      // Chaining — create a new AnimatedValue from current output and interpolate that
      const val = new AnimatedValue(
        typeof this.getValue() === "number" ? this.getValue() : 0,
      );
      return val.interpolate(innerConfig);
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/vitest-native && bun vitest run tests/interpolation-live.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `cd packages/vitest-native && bun vitest run`
Expected: All tests pass — no regressions in existing interpolation tests

- [ ] **Step 6: Commit**

```bash
git add packages/vitest-native/src/mocks/apis/Animated.ts packages/vitest-native/tests/interpolation-live.test.ts
git commit -m "feat: make interpolate return live derived values instead of static snapshots"
```

---

### Task 6: Enhance LayoutAnimation mock with lifecycle callbacks

**Files:**
- Modify: `packages/vitest-native/src/mocks/apis/LayoutAnimation.ts`
- Create: `packages/vitest-native/tests/rn-conformance/rn-LayoutAnimation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/vitest-native/tests/rn-conformance/rn-LayoutAnimation.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { LayoutAnimation } from "react-native";

describe("LayoutAnimation (RN conformance)", () => {
  it("configureNext calls onAnimationDidEnd callback", () => {
    const onEnd = vi.fn();
    LayoutAnimation.configureNext(
      LayoutAnimation.Presets.easeInEaseOut,
      onEnd,
    );
    // In test environment, animations complete synchronously
    expect(onEnd).toHaveBeenCalled();
  });

  it("configureNext calls onAnimationDidFail callback on error", () => {
    const onEnd = vi.fn();
    const onFail = vi.fn();
    LayoutAnimation.configureNext(
      LayoutAnimation.Presets.easeInEaseOut,
      onEnd,
      onFail,
    );
    // In test environment, success path is taken
    expect(onEnd).toHaveBeenCalled();
    expect(onFail).not.toHaveBeenCalled();
  });

  it("create returns a valid animation config", () => {
    const config = LayoutAnimation.create(500, "spring", "scaleXY");
    expect(config.duration).toBe(500);
    expect(config.create.type).toBe("spring");
    expect(config.create.property).toBe("scaleXY");
  });

  it("exposes Types, Properties, and Presets constants", () => {
    expect(LayoutAnimation.Types.spring).toBe("spring");
    expect(LayoutAnimation.Properties.opacity).toBe("opacity");
    expect(LayoutAnimation.Presets.easeInEaseOut.duration).toBe(300);
  });

  it("configureNext is callable as a vi.fn()", () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.linear);
    expect(LayoutAnimation.configureNext).toHaveBeenCalledWith(
      LayoutAnimation.Presets.linear,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/vitest-native && bun vitest run tests/rn-conformance/rn-LayoutAnimation.test.ts`
Expected: FAIL — `configureNext` is a plain `vi.fn()` stub, doesn't invoke callbacks

- [ ] **Step 3: Implement callback invocation**

Update `packages/vitest-native/src/mocks/apis/LayoutAnimation.ts`:

```typescript
import { vi } from "vitest";

export function createLayoutAnimationMock() {
  return {
    configureNext: vi.fn(
      (_config: any, onAnimationDidEnd?: () => void, _onAnimationDidFail?: () => void) => {
        // In test environment, animations complete synchronously
        onAnimationDidEnd?.();
      },
    ),
    create: vi.fn((duration: number, type?: string, creationProp?: string) => ({
      duration,
      create: { type: type ?? "easeInEaseOut", property: creationProp ?? "opacity" },
      update: { type: type ?? "easeInEaseOut" },
      delete: { type: type ?? "easeInEaseOut", property: creationProp ?? "opacity" },
    })),
    Types: {
      spring: "spring",
      linear: "linear",
      easeInEaseOut: "easeInEaseOut",
      easeIn: "easeIn",
      easeOut: "easeOut",
    },
    Properties: {
      opacity: "opacity",
      scaleX: "scaleX",
      scaleY: "scaleY",
      scaleXY: "scaleXY",
    },
    Presets: {
      easeInEaseOut: {
        duration: 300,
        create: { type: "easeInEaseOut", property: "opacity" },
        update: { type: "easeInEaseOut" },
        delete: { type: "easeInEaseOut", property: "opacity" },
      },
      linear: {
        duration: 500,
        create: { type: "linear", property: "opacity" },
        update: { type: "linear" },
        delete: { type: "linear", property: "opacity" },
      },
      spring: {
        duration: 700,
        create: { type: "linear", property: "opacity" },
        update: { type: "spring", springDamping: 0.4 },
        delete: { type: "linear", property: "opacity" },
      },
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/vitest-native && bun vitest run tests/rn-conformance/rn-LayoutAnimation.test.ts`
Expected: PASS

Run: `cd packages/vitest-native && bun vitest run`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add packages/vitest-native/src/mocks/apis/LayoutAnimation.ts packages/vitest-native/tests/rn-conformance/rn-LayoutAnimation.test.ts
git commit -m "feat: add LayoutAnimation lifecycle callbacks and conformance tests"
```

---

### Task 7: Enhance AccessibilityInfo with stateful screen reader

**Files:**
- Modify: `packages/vitest-native/src/mocks/apis/AccessibilityInfo.ts`
- Modify: `packages/vitest-native/src/helpers.ts` (add reset for AccessibilityInfo)
- Create: `packages/vitest-native/tests/rn-conformance/rn-AccessibilityInfo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/vitest-native/tests/rn-conformance/rn-AccessibilityInfo.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { AccessibilityInfo } from "react-native";

describe("AccessibilityInfo (RN conformance)", () => {
  it("isScreenReaderEnabled returns current state", async () => {
    expect(await AccessibilityInfo.isScreenReaderEnabled()).toBe(false);
  });

  it("_setScreenReaderEnabled updates state and fires listener", async () => {
    const handler = vi.fn();
    AccessibilityInfo.addEventListener("screenReaderChanged", handler);

    (AccessibilityInfo as any)._setScreenReaderEnabled(true);

    expect(await AccessibilityInfo.isScreenReaderEnabled()).toBe(true);
    expect(handler).toHaveBeenCalledWith(true);
  });

  it("addEventListener returns removable subscription", () => {
    const handler = vi.fn();
    const sub = AccessibilityInfo.addEventListener("screenReaderChanged", handler);

    (AccessibilityInfo as any)._setScreenReaderEnabled(true);
    expect(handler).toHaveBeenCalledTimes(1);

    sub.remove();
    (AccessibilityInfo as any)._setScreenReaderEnabled(false);
    expect(handler).toHaveBeenCalledTimes(1); // not called again
  });

  it("announceForAccessibility is callable", () => {
    AccessibilityInfo.announceForAccessibility("Hello");
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith("Hello");
  });

  it("_reset restores default state", async () => {
    (AccessibilityInfo as any)._setScreenReaderEnabled(true);
    (AccessibilityInfo as any)._reset();
    expect(await AccessibilityInfo.isScreenReaderEnabled()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/vitest-native && bun vitest run tests/rn-conformance/rn-AccessibilityInfo.test.ts`
Expected: FAIL — `_setScreenReaderEnabled` doesn't exist

- [ ] **Step 3: Implement stateful AccessibilityInfo**

Replace `packages/vitest-native/src/mocks/apis/AccessibilityInfo.ts`:

```typescript
import { vi } from "vitest";

export function createAccessibilityInfoMock() {
  let screenReaderEnabled = false;
  let boldTextEnabled = false;
  let reduceMotionEnabled = false;
  const listeners = new Map<string, Set<Function>>();

  function getListeners(event: string): Set<Function> {
    if (!listeners.has(event)) listeners.set(event, new Set());
    return listeners.get(event)!;
  }

  return {
    isScreenReaderEnabled: vi.fn(async () => screenReaderEnabled),
    isBoldTextEnabled: vi.fn(async () => boldTextEnabled),
    isGrayscaleEnabled: vi.fn(async () => false),
    isInvertColorsEnabled: vi.fn(async () => false),
    isReduceMotionEnabled: vi.fn(async () => reduceMotionEnabled),
    isReduceTransparencyEnabled: vi.fn(async () => false),
    prefersCrossFadeTransitions: vi.fn(async () => false),
    addEventListener: vi.fn((eventName: string, handler: Function) => {
      getListeners(eventName).add(handler);
      return {
        remove: vi.fn(() => {
          getListeners(eventName).delete(handler);
        }),
      };
    }),
    announceForAccessibility: vi.fn(),
    announceForAccessibilityWithOptions: vi.fn(),
    setAccessibilityFocus: vi.fn(),
    sendAccessibilityEvent: vi.fn(),
    getRecommendedTimeoutMillis: vi.fn(async (originalTimeout: number) => originalTimeout),

    // Test backdoors
    _setScreenReaderEnabled(enabled: boolean) {
      screenReaderEnabled = enabled;
      for (const fn of getListeners("screenReaderChanged")) fn(enabled);
    },
    _setBoldTextEnabled(enabled: boolean) {
      boldTextEnabled = enabled;
      for (const fn of getListeners("boldTextChanged")) fn(enabled);
    },
    _setReduceMotionEnabled(enabled: boolean) {
      reduceMotionEnabled = enabled;
      for (const fn of getListeners("reduceMotionChanged")) fn(enabled);
    },
    _reset() {
      screenReaderEnabled = false;
      boldTextEnabled = false;
      reduceMotionEnabled = false;
      listeners.clear();
    },
  };
}
```

- [ ] **Step 4: Add AccessibilityInfo reset to helpers.ts**

In `packages/vitest-native/src/helpers.ts`, inside `resetAllMocks()`, add after the DeviceEventEmitter reset:

```typescript
if (mock.AccessibilityInfo._reset) mock.AccessibilityInfo._reset();
```

- [ ] **Step 5: Run tests**

Run: `cd packages/vitest-native && bun vitest run tests/rn-conformance/rn-AccessibilityInfo.test.ts`
Expected: PASS

Run: `cd packages/vitest-native && bun vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add packages/vitest-native/src/mocks/apis/AccessibilityInfo.ts packages/vitest-native/src/helpers.ts packages/vitest-native/tests/rn-conformance/rn-AccessibilityInfo.test.ts
git commit -m "feat: make AccessibilityInfo stateful with screen reader tracking and conformance tests"
```

---

### Task 8: Enhance Alert mock with testable button callbacks

**Files:**
- Modify: `packages/vitest-native/src/mocks/apis/Alert.ts`
- Create: `packages/vitest-native/tests/rn-conformance/rn-Alert.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/vitest-native/tests/rn-conformance/rn-Alert.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { Alert } from "react-native";

describe("Alert (RN conformance)", () => {
  it("alert records the call arguments", () => {
    const onPress = vi.fn();
    Alert.alert("Title", "Message", [{ text: "OK", onPress }]);
    expect(Alert.alert).toHaveBeenCalledWith("Title", "Message", [
      { text: "OK", onPress },
    ]);
  });

  it("_pressButton invokes the button callback by index", () => {
    const onCancel = vi.fn();
    const onOk = vi.fn();
    Alert.alert("Title", "Message", [
      { text: "Cancel", onPress: onCancel, style: "cancel" },
      { text: "OK", onPress: onOk },
    ]);

    (Alert as any)._pressButton(1);
    expect(onOk).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("_pressButton with no index presses the last button (default)", () => {
    const onOk = vi.fn();
    Alert.alert("Confirm", "Are you sure?", [
      { text: "Cancel" },
      { text: "OK", onPress: onOk },
    ]);

    (Alert as any)._pressButton();
    expect(onOk).toHaveBeenCalled();
  });

  it("prompt records the call arguments", () => {
    Alert.prompt("Title", "Message");
    expect(Alert.prompt).toHaveBeenCalledWith("Title", "Message");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/vitest-native && bun vitest run tests/rn-conformance/rn-Alert.test.ts`
Expected: FAIL — `_pressButton` doesn't exist

- [ ] **Step 3: Implement enhanced Alert mock**

Replace `packages/vitest-native/src/mocks/apis/Alert.ts`:

```typescript
import { vi } from "vitest";

export function createAlertMock() {
  let lastButtons: Array<{ text?: string; onPress?: () => void; style?: string }> = [];

  return {
    alert: vi.fn(
      (
        _title: string,
        _message?: string,
        buttons?: Array<{ text?: string; onPress?: () => void; style?: string }>,
      ) => {
        lastButtons = buttons ?? [];
      },
    ),
    prompt: vi.fn(),
    _pressButton(index?: number) {
      if (lastButtons.length === 0) return;
      const idx = index ?? lastButtons.length - 1;
      lastButtons[idx]?.onPress?.();
    },
    _reset() {
      lastButtons = [];
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/vitest-native && bun vitest run tests/rn-conformance/rn-Alert.test.ts`
Expected: PASS

Run: `cd packages/vitest-native && bun vitest run`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add packages/vitest-native/src/mocks/apis/Alert.ts packages/vitest-native/tests/rn-conformance/rn-Alert.test.ts
git commit -m "feat: add testable button callbacks to Alert mock with conformance tests"
```

---

### Task 9: Add conformance tests for Linking, Share, Vibration, BackHandler, DeviceEventEmitter

These APIs already have adequate mocks — they just need test coverage.

**Files:**
- Create: `packages/vitest-native/tests/rn-conformance/rn-Linking.test.ts`
- Create: `packages/vitest-native/tests/rn-conformance/rn-Share.test.ts`
- Create: `packages/vitest-native/tests/rn-conformance/rn-Vibration.test.ts`
- Create: `packages/vitest-native/tests/rn-conformance/rn-BackHandler.test.ts`
- Create: `packages/vitest-native/tests/rn-conformance/rn-DeviceEventEmitter.test.ts`

- [ ] **Step 1: Write Linking conformance tests**

Create `packages/vitest-native/tests/rn-conformance/rn-Linking.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { Linking } from "react-native";

describe("Linking (RN conformance)", () => {
  it("openURL is callable and returns a promise", async () => {
    await expect(Linking.openURL("https://example.com")).resolves.not.toThrow();
  });

  it("canOpenURL returns a promise", async () => {
    const result = await Linking.canOpenURL("https://example.com");
    expect(typeof result).toBe("boolean");
  });

  it("getInitialURL returns a promise", async () => {
    const result = await Linking.getInitialURL();
    expect(result === null || typeof result === "string").toBe(true);
  });

  it("addEventListener returns a subscription with remove", () => {
    const sub = Linking.addEventListener("url", () => {});
    expect(sub).toHaveProperty("remove");
    expect(typeof sub.remove).toBe("function");
  });
});
```

- [ ] **Step 2: Write BackHandler conformance tests**

Create `packages/vitest-native/tests/rn-conformance/rn-BackHandler.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BackHandler } from "react-native";
import { resetAllMocks } from "vitest-native/helpers";

describe("BackHandler (RN conformance)", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("addEventListener returns subscription with remove", () => {
    const handler = vi.fn(() => true);
    const sub = BackHandler.addEventListener("hardwareBackPress", handler);
    expect(sub).toHaveProperty("remove");
    expect(typeof sub.remove).toBe("function");
  });

  it("_simulateBackPress calls handlers in LIFO order", () => {
    const order: number[] = [];
    BackHandler.addEventListener("hardwareBackPress", () => {
      order.push(1);
      return false;
    });
    BackHandler.addEventListener("hardwareBackPress", () => {
      order.push(2);
      return false;
    });

    (BackHandler as any)._simulateBackPress();
    expect(order).toEqual([2, 1]); // LIFO — last registered called first
  });

  it("_simulateBackPress stops when handler returns true", () => {
    const first = vi.fn(() => false);
    const second = vi.fn(() => true);

    BackHandler.addEventListener("hardwareBackPress", first);
    BackHandler.addEventListener("hardwareBackPress", second);

    (BackHandler as any)._simulateBackPress();
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled(); // stopped by second
  });

  it("remove() prevents handler from being called", () => {
    const handler = vi.fn(() => true);
    const sub = BackHandler.addEventListener("hardwareBackPress", handler);
    sub.remove();

    (BackHandler as any)._simulateBackPress();
    expect(handler).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Write DeviceEventEmitter conformance tests**

Create `packages/vitest-native/tests/rn-conformance/rn-DeviceEventEmitter.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeviceEventEmitter } from "react-native";
import { resetAllMocks } from "vitest-native/helpers";

describe("DeviceEventEmitter (RN conformance)", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("addListener returns a subscription with remove", () => {
    const sub = DeviceEventEmitter.addListener("test", () => {});
    expect(sub).toHaveProperty("remove");
    expect(typeof sub.remove).toBe("function");
  });

  it("emit fires registered listeners", () => {
    const handler = vi.fn();
    DeviceEventEmitter.addListener("myEvent", handler);
    DeviceEventEmitter.emit("myEvent", { data: 42 });
    expect(handler).toHaveBeenCalledWith({ data: 42 });
  });

  it("listeners fire in registration order", () => {
    const order: number[] = [];
    DeviceEventEmitter.addListener("order", () => order.push(1));
    DeviceEventEmitter.addListener("order", () => order.push(2));
    DeviceEventEmitter.addListener("order", () => order.push(3));
    DeviceEventEmitter.emit("order");
    expect(order).toEqual([1, 2, 3]);
  });

  it("remove() stops listener from being called", () => {
    const handler = vi.fn();
    const sub = DeviceEventEmitter.addListener("test", handler);
    sub.remove();
    DeviceEventEmitter.emit("test");
    expect(handler).not.toHaveBeenCalled();
  });

  it("removeAllListeners clears all for a given event", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    DeviceEventEmitter.addListener("event", handler1);
    DeviceEventEmitter.addListener("event", handler2);
    DeviceEventEmitter.removeAllListeners("event");
    DeviceEventEmitter.emit("event");
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Write Share conformance tests**

Create `packages/vitest-native/tests/rn-conformance/rn-Share.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { Share } from "react-native";

describe("Share (RN conformance)", () => {
  it("share returns a promise with action and activityType", async () => {
    const result = await Share.share({ message: "Hello" });
    expect(result).toHaveProperty("action");
  });

  it("share is callable with message and url", async () => {
    await Share.share({ message: "Check this out", url: "https://example.com" });
    expect(Share.share).toHaveBeenCalled();
  });

  it("sharedAction and dismissedAction constants are defined", () => {
    expect(Share.sharedAction).toBeDefined();
    expect(Share.dismissedAction).toBeDefined();
  });
});
```

- [ ] **Step 5: Write Vibration conformance tests**

Create `packages/vitest-native/tests/rn-conformance/rn-Vibration.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { Vibration } from "react-native";

describe("Vibration (RN conformance)", () => {
  it("vibrate is callable with no args", () => {
    Vibration.vibrate();
    expect(Vibration.vibrate).toHaveBeenCalled();
  });

  it("vibrate accepts a pattern array", () => {
    Vibration.vibrate([100, 200, 300]);
    expect(Vibration.vibrate).toHaveBeenCalledWith([100, 200, 300]);
  });

  it("vibrate accepts a repeat flag", () => {
    Vibration.vibrate([100, 200], true);
    expect(Vibration.vibrate).toHaveBeenCalledWith([100, 200], true);
  });

  it("cancel is callable", () => {
    Vibration.cancel();
    expect(Vibration.cancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run all new conformance tests**

Run: `cd packages/vitest-native && bun vitest run tests/rn-conformance/`
Expected: All PASS

- [ ] **Step 7: Run full test suite**

Run: `cd packages/vitest-native && bun vitest run`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add packages/vitest-native/tests/rn-conformance/rn-Linking.test.ts packages/vitest-native/tests/rn-conformance/rn-Share.test.ts packages/vitest-native/tests/rn-conformance/rn-Vibration.test.ts packages/vitest-native/tests/rn-conformance/rn-BackHandler.test.ts packages/vitest-native/tests/rn-conformance/rn-DeviceEventEmitter.test.ts
git commit -m "test: add conformance tests for Linking, Share, Vibration, BackHandler, DeviceEventEmitter"
```

---

### Task 10: Enhance compat-check workflow for multi-version tracking

**Files:**
- Modify: `.github/workflows/compat-check.yml`

- [ ] **Step 1: Update the workflow to test multiple RN versions**

Replace `.github/workflows/compat-check.yml` with:

```yaml
name: Compatibility Check

on:
  schedule:
    - cron: '0 9 * * 1'
  workflow_dispatch:

jobs:
  check-rn-compat:
    name: Check against React Native ${{ matrix.rn-version }}
    runs-on: ubuntu-latest

    strategy:
      fail-fast: false
      matrix:
        rn-version: [latest, "0.84", "0.83"]

    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install with react-native@${{ matrix.rn-version }}
        run: |
          bun install --frozen-lockfile
          bun add -d react-native@${{ matrix.rn-version }} --cwd packages/vitest-native

      - name: Build
        run: bun run --filter vitest-native build

      - name: Run tests
        run: bun run --filter vitest-native test

      - name: Check API compatibility
        run: bun run --filter vitest-native check-compat

      - name: Create issue on failure
        if: failure()
        uses: actions/github-script@v7
        env:
          RN_VERSION: ${{ matrix.rn-version }}
          RUN_URL: "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
        with:
          script: |
            const rnVersion = process.env.RN_VERSION;
            const { data: issues } = await github.rest.issues.listForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              state: 'open',
              labels: 'compat-check',
            });
            const existing = issues.find(i => i.title.includes(rnVersion));
            if (!existing) {
              await github.rest.issues.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title: `Compatibility gap detected with react-native@${rnVersion}`,
                body: [
                  `The weekly compatibility check found issues with React Native ${rnVersion}.`,
                  '',
                  `See the [failed run](${process.env.RUN_URL}) for details.`,
                  '',
                  'Run `bun run --filter vitest-native check-compat` locally to see the gaps.',
                ].join('\n'),
                labels: ['compat-check'],
              });
            }
```

Note: Update the RN versions in the matrix as new versions are released. The versions here (0.83, 0.84, latest) reflect the current ecosystem as of March 2026.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/compat-check.yml
git commit -m "ci: expand compat check to test against multiple React Native versions"
```

---

### Task 11: Add conformance test tagging and parity reporting

**Files:**
- Modify: `packages/vitest-native/package.json` (add script)
- Modify: `packages/vitest-native/tests/rn-conformance/` (ensure consistent naming)

- [ ] **Step 1: Add a script to run just the conformance suite**

Add to `packages/vitest-native/package.json` scripts:

```json
"test:conformance": "vitest run tests/rn-conformance/ --reporter=verbose"
```

- [ ] **Step 2: Verify all conformance tests follow the naming convention**

All files in `tests/rn-conformance/` should be prefixed with `rn-` and use the format `rn-<APIName>.test.ts`. Verify the new files from Tasks 6-9 follow this convention. Existing files already do.

- [ ] **Step 3: Run the conformance suite and verify output**

```bash
cd packages/vitest-native && bun run test:conformance
```

Expected: All conformance tests run with verbose output showing pass/fail/skip counts — this is the "parity score."

- [ ] **Step 4: Commit**

```bash
git add packages/vitest-native/package.json
git commit -m "chore: add test:conformance script for running RN parity suite"
```

---

## Pillar 3: Documentation

### Task 12: Write API reference

**Files:**
- Create: `packages/vitest-native/docs/api-reference.md`

- [ ] **Step 1: Write the API reference document**

This document should cover every public export across all 5 entrypoints. Structure:

```markdown
# API Reference

## Plugin: `vitest-native`

### `reactNative(options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `platform` | `"ios" \| "android"` | `"ios"` | Target platform |
| `presets` | `Preset[]` | auto-detect | Third-party library presets |
| `mocks` | `Record<string, any>` | `{}` | JSON-serializable mock overrides |
| `diagnostics` | `boolean` | `false` | Enable verbose logging |
| `assetExts` | `string[]` | `[]` | Additional asset file extensions to stub |

[... full documentation for each option with examples ...]

## Helpers: `vitest-native/helpers`

### `setPlatform(os)`
### `setDimensions(dims)`
### `setColorScheme(scheme)`
### `setInsets(insets)`
### `mockNativeModule(name, impl)`
### `resetAllMocks()`

[... each with signature, description, example ...]

## Mock Behavioral Notes

### Platform
[... what the mock does, how Version differs by platform ...]

### Animated
[... note about synchronous timing, value tracking, interpolation ...]

[... etc for each major mock API ...]

## Environment Compatibility

Tested with Vitest environments: `node` (default), `jsdom`, `happy-dom`.

## Known Divergences from React Native

[... list each known difference with its skip annotation from conformance tests ...]
```

Write the full document with concrete code examples for each helper function and behavioral notes for every major mock API. Read the source files to get exact signatures and behavior.

- [ ] **Step 2: Commit**

```bash
git add packages/vitest-native/docs/api-reference.md
git commit -m "docs: add comprehensive API reference"
```

---

### Task 13: Write migration guide from Jest

**Files:**
- Create: `packages/vitest-native/docs/migration-from-jest.md`

- [ ] **Step 1: Write the migration guide**

Structure:

```markdown
# Migrating from Jest to Vitest with vitest-native

## Step 1: Install

## Step 2: Replace jest.config.js with vitest.config.ts

Before (Jest):
[... jest.config.js example with moduleNameMapper, transform, setupFiles ...]

After (Vitest):
[... vitest.config.ts with reactNative() plugin ...]

## Step 3: Update test files

### Import changes
- `jest.fn()` → `vi.fn()`
- `jest.mock()` → `vi.mock()`
- `jest.spyOn()` → `vi.spyOn()`
[... with before/after code ...]

### Timer mocking
[... differences between jest.useFakeTimers and vi.useFakeTimers ...]

### Snapshot differences
[... format differences, update command (`vitest --update` vs `jest --updateSnapshot`) ...]

## Common Gotchas

1. Global setup files
2. Module resolution order differences
3. ESM vs CJS default behavior

## Full Before/After Example
[... complete test file transformation ...]
```

- [ ] **Step 2: Commit**

```bash
git add packages/vitest-native/docs/migration-from-jest.md
git commit -m "docs: add Jest to Vitest migration guide"
```

---

### Task 14: Write preset authoring guide

**Files:**
- Create: `packages/vitest-native/docs/preset-authoring.md`

- [ ] **Step 1: Write the guide**

Cover:
- The `Preset` and `PresetModule` interfaces with annotated type definitions
- How auto-detection works (read `preset-map.ts` for the exact mechanism)
- Step-by-step example: creating a preset for `react-native-biometrics`
- How to register custom presets via the `presets` option
- How preset exports become virtual modules

Read `packages/vitest-native/src/presets/reanimated.ts` as the reference implementation to show a real example.

- [ ] **Step 2: Commit**

```bash
git add packages/vitest-native/docs/preset-authoring.md
git commit -m "docs: add preset authoring guide"
```

---

### Task 15: Write testing patterns guide

**Files:**
- Create: `packages/vitest-native/docs/testing-patterns.md`

- [ ] **Step 1: Write the guide with practical recipes**

Cover these patterns with complete code examples:
- Testing platform-specific behavior with `setPlatform`
- Testing responsive layouts with `setDimensions`
- Testing dark mode with `setColorScheme`
- Testing animated components (asserting `getValue()` after `start()`)
- Testing components that use native modules with `mockNativeModule`
- Testing navigation flows (with `@react-navigation` preset)
- Testing hooks (`useColorScheme`, `useWindowDimensions`)
- Using `resetAllMocks` in `beforeEach` for test isolation

Read the example app tests at `apps/example/__tests__/` for realistic usage patterns to reference.

- [ ] **Step 2: Commit**

```bash
git add packages/vitest-native/docs/testing-patterns.md
git commit -m "docs: add testing patterns and recipes guide"
```

---

### Task 16: Write architecture overview

**Files:**
- Create: `packages/vitest-native/docs/architecture.md`

- [ ] **Step 1: Write the architecture doc**

Read these files to document the architecture accurately:
- `src/plugin.ts` — plugin lifecycle, virtual modules, resolution
- `src/setup.ts` — initialization phases
- `src/mocks/registry.ts` — mock construction
- `src/cjs-bridge.ts` — CJS interop
- `src/preset-map.ts` — auto-detection

Cover:
- How `reactNative()` intercepts imports via Vite's `resolveId`/`load` hooks
- The virtual module strategy (`\0virtual:react-native`, `\0virtual:preset:*`)
- How options cross the process boundary (Vite main → Vitest worker via `process.env`)
- How `globalThis.__vitest_native_mock` bridges setup and runtime
- How presets compose: factory functions → export name discovery → virtual module generation
- The initialization phases in `setup.ts`
- The CJS bridge for `require('react-native')` compatibility

- [ ] **Step 2: Commit**

```bash
git add packages/vitest-native/docs/architecture.md
git commit -m "docs: add architecture overview for contributors"
```

---

### Task 17: Overhaul README

**Files:**
- Modify: `packages/vitest-native/README.md`
- Modify: `README.md` (root)

- [ ] **Step 1: Update the package README**

Transform the current monolithic README into a landing page that routes to docs:

- Add badges at top: CI status, npm version, license, latest tested RN version (use a static badge pointing to the compat-check workflow or a shields.io endpoint badge)
- Keep Quick Start section (it's the hook)
- Keep Plugin Options table (concise)
- Keep Test Helpers table (concise)
- Replace detailed sections with links: "See [API Reference](docs/api-reference.md) for complete documentation"
- Replace inline migration content with link to `docs/migration-from-jest.md`
- Add "Conformance Testing" section explaining the approach (2-3 sentences + link to architecture doc)
- Add "Third-Party Presets" section (keep the table, link to preset authoring guide)

- [ ] **Step 2: Update root README**

Keep it as a brief overview that links to the package README and docs.

- [ ] **Step 3: Commit**

```bash
git add packages/vitest-native/README.md README.md
git commit -m "docs: overhaul README into landing page with links to detailed docs"
```

---

## Pillar 4: CI Hardening

### Task 18: Add coverage reporting with Codecov

**Files:**
- Modify: `packages/vitest-native/vitest.config.ts`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add coverage config to vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import { reactNative } from './src/index.js';

export default defineConfig({
  plugins: [reactNative({ diagnostics: true })],
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/**/index.ts'],
      thresholds: {
        // Set after measuring baseline — use ratchet approach
        // lines: 80,
        // branches: 70,
        // functions: 85,
      },
    },
  },
});
```

- [ ] **Step 2: Install coverage dependency**

```bash
cd packages/vitest-native && bun add -d @vitest/coverage-v8
```

- [ ] **Step 3: Run coverage to get baseline**

```bash
cd packages/vitest-native && bun vitest run --coverage
```

Record the baseline numbers and set thresholds to baseline minus 2%.

- [ ] **Step 4: Add coverage step to CI**

In `.github/workflows/ci.yml`, add after the Test step (only on one node version to avoid duplicate uploads):

```yaml
      - name: Run tests with coverage
        if: matrix.node-version == 22
        run: cd packages/vitest-native && bun vitest run --coverage

      - name: Upload coverage to Codecov
        if: matrix.node-version == 22
        uses: codecov/codecov-action@v4
        with:
          directory: packages/vitest-native/coverage
          token: ${{ secrets.CODECOV_TOKEN }}
          fail_ci_if_error: false
```

Note: The `CODECOV_TOKEN` secret needs to be configured in the GitHub repo settings after signing up at codecov.io.

- [ ] **Step 5: Add coverage badge to README**

Add to `packages/vitest-native/README.md` badge section:

```markdown
[![codecov](https://codecov.io/gh/danfry1/vitest-native/branch/main/graph/badge.svg)](https://codecov.io/gh/danfry1/vitest-native)
```

- [ ] **Step 6: Commit**

```bash
git add packages/vitest-native/vitest.config.ts packages/vitest-native/package.json .github/workflows/ci.yml packages/vitest-native/README.md bun.lockb
git commit -m "ci: add coverage reporting with Codecov integration"
```

---

### Task 19: Add multi-version test matrix to CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add matrix dimensions for React and Vitest versions**

Expand the matrix in `.github/workflows/ci.yml`:

```yaml
    strategy:
      fail-fast: false
      matrix:
        node-version: [20, 22]
        include:
          # Primary: latest everything (the supported configuration)
          - node-version: 22
            react: "19"
            vitest: "latest"
          # Secondary: React 18 compatibility
          - node-version: 22
            react: "18"
            vitest: "latest"
          # Tertiary: Vitest 4 minimum
          - node-version: 20
            react: "19"
            vitest: "4"
```

Add installation override steps:

```yaml
      - name: Override versions for matrix
        if: matrix.react || matrix.vitest
        run: |
          if [ "${{ matrix.react }}" = "18" ]; then
            bun add -d react@18 react-test-renderer@18 @types/react@18 --cwd packages/vitest-native
          fi
          if [ "${{ matrix.vitest }}" = "4" ]; then
            bun add -d vitest@4 --cwd packages/vitest-native
          fi
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add multi-version test matrix for React 18/19 and Vitest 4/latest"
```

---

### Task 20: Add bundle size tracking

**Files:**
- Modify: `packages/vitest-native/package.json` (add size-limit config)
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Install size-limit**

```bash
bun add -d size-limit @size-limit/file
```

- [ ] **Step 2: Add size-limit config to package.json**

Add to `packages/vitest-native/package.json`:

```json
"size-limit": [
  {
    "path": "dist/index.mjs",
    "limit": "50 kB"
  }
]
```

Add script:

```json
"size": "size-limit"
```

- [ ] **Step 3: Add size check to CI**

In `.github/workflows/ci.yml`, add after the Build step:

```yaml
      - name: Check bundle size
        run: cd packages/vitest-native && bun run size
```

- [ ] **Step 4: Run locally to verify**

```bash
cd packages/vitest-native && bun run build && bun run size
```

Adjust the limit based on actual size (set to actual + 20% buffer).

- [ ] **Step 5: Commit**

```bash
git add packages/vitest-native/package.json .github/workflows/ci.yml bun.lockb
git commit -m "ci: add bundle size tracking with size-limit"
```

---

### Task 21: Add security automation

**Files:**
- Create: `.github/dependabot.yml`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Create Dependabot config**

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      dev-dependencies:
        patterns:
          - "*"
        dependency-type: "development"
    open-pull-requests-limit: 5

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
```

- [ ] **Step 2: Add npm audit to CI**

In `.github/workflows/ci.yml`, add a step after install:

```yaml
      - name: Security audit
        run: npm audit --omit=dev || true
```

- [ ] **Step 3: Add OpenSSF Scorecard workflow**

Create `.github/workflows/scorecard.yml`:

```yaml
name: OpenSSF Scorecard
on:
  branch_protection_rule:
  schedule:
    - cron: '0 6 * * 1'
  push:
    branches: [main]

permissions: read-all

jobs:
  analysis:
    name: Scorecard analysis
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: ossf/scorecard-action@v2
        with:
          results_file: results.sarif
          results_format: sarif
          publish_results: true
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
```

- [ ] **Step 4: Add package validation with publint**

```bash
bun add -d publint
```

In `.github/workflows/ci.yml`, add after the existing `@arethetypeswrong/cli` step:

```yaml
      - name: Check package with publint
        run: cd packages/vitest-native && npx publint
```

- [ ] **Step 5: Commit**

```bash
git add .github/dependabot.yml .github/workflows/ci.yml .github/workflows/scorecard.yml packages/vitest-native/package.json bun.lockb
git commit -m "ci: add Dependabot, npm audit, publint, and OpenSSF Scorecard"
```

---

### Task 22: Add smoke test for published package

**Files:**
- Create: `packages/vitest-native/scripts/smoke-test.sh`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the smoke test script**

Create `packages/vitest-native/scripts/smoke-test.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Pack the package
cd packages/vitest-native
TARBALL=$(npm pack --pack-destination /tmp 2>/dev/null | tail -1)

# Create temp project
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"
npm init -y > /dev/null

# Install the tarball and peer deps
npm install "/tmp/$TARBALL" react react-native vitest vite > /dev/null 2>&1

# Test: all entrypoints are importable
node -e "require('vitest-native')" || { echo "FAIL: require('vitest-native')"; exit 1; }
node -e "require('vitest-native/helpers')" || { echo "FAIL: require('vitest-native/helpers')"; exit 1; }
node -e "require('vitest-native/serializer')" || { echo "FAIL: require('vitest-native/serializer')"; exit 1; }
node -e "require('vitest-native/presets')" || { echo "FAIL: require('vitest-native/presets')"; exit 1; }

# Test: ESM imports work
node --input-type=module -e "import { reactNative } from 'vitest-native'" || { echo "FAIL: ESM import"; exit 1; }

echo "Smoke test PASSED"

# Cleanup
rm -rf "$TEMP_DIR" "/tmp/$TARBALL"
```

- [ ] **Step 2: Add to CI**

In `.github/workflows/ci.yml`, add after the existing package exports check:

```yaml
      - name: Smoke test published package
        run: bash packages/vitest-native/scripts/smoke-test.sh
```

- [ ] **Step 3: Test locally**

```bash
bash packages/vitest-native/scripts/smoke-test.sh
```

- [ ] **Step 4: Commit**

```bash
chmod +x packages/vitest-native/scripts/smoke-test.sh
git add packages/vitest-native/scripts/smoke-test.sh .github/workflows/ci.yml
git commit -m "ci: add smoke test for published package entrypoints"
```

---

## Pillar 5: API Audit & 1.0 Prep

### Task 23: Audit public API surface

**Files:**
- Read: all `src/index.ts`, `src/helpers.ts`, `src/serializer.ts`, `src/presets/index.ts`
- Modify: `packages/vitest-native/src/index.ts` (if changes needed)
- Modify: `packages/vitest-native/src/types.ts` (export `PresetModule` if needed)

- [ ] **Step 1: Enumerate every export from every entrypoint**

Read each entrypoint and list all exports:
- `vitest-native` (index.ts): `reactNative`, `VitestNativeOptions`, `Preset`, `ReactNativeMock`, preset factories
- `vitest-native/helpers`: `setPlatform`, `setDimensions`, `setColorScheme`, `setInsets`, `mockNativeModule`, `resetAllMocks`
- `vitest-native/serializer`: snapshot serializer
- `vitest-native/presets`: preset factory functions
- `vitest-native/setup`: (auto-injected, not user-facing)

- [ ] **Step 2: Verify internal APIs are not exposed**

Confirm that `buildReactNativeMock`, `getMock`, `interpolateValue`, `parseColor`, and other implementation details are NOT reachable from any entrypoint. Check by tracing export chains.

- [ ] **Step 3: Evaluate PresetModule export**

If the preset authoring guide (Task 13) references `PresetModule`, export it from `src/types.ts` → `src/index.ts`:

```typescript
export type { VitestNativeOptions, Preset, PresetModule, ReactNativeMock } from "./types.js";
```

- [ ] **Step 4: Run typecheck and tests**

```bash
cd packages/vitest-native && bun run typecheck && bun vitest run
```

- [ ] **Step 5: Commit**

```bash
git add packages/vitest-native/src/index.ts packages/vitest-native/src/types.ts
git commit -m "chore: audit public API surface, export PresetModule type"
```

---

### Task 24: Write version compatibility matrix and upgrading guide

**Files:**
- Create: `packages/vitest-native/docs/upgrading-to-1.0.md`

- [ ] **Step 1: Write the upgrading guide**

```markdown
# Upgrading to vitest-native 1.0

## Version Compatibility

| vitest-native | Vitest | Vite | React | React Native |
|---------------|--------|------|-------|-------------|
| 1.0.x         | >= 4   | >= 5 | >= 18 | >= 0.83     |

## Breaking Changes from 0.x

[... document any API renames or removals discovered in the audit ...]

## Stability Guarantee

Post-1.0, semver applies:
- **Covered by semver:** Plugin options, helper function signatures, preset interface, serializer output format
- **Not covered:** Internal mock implementation details, undocumented `_prefixed` test backdoors, snapshot output format (may change between minors)
```

- [ ] **Step 2: Commit**

```bash
git add packages/vitest-native/docs/upgrading-to-1.0.md
git commit -m "docs: add version compatibility matrix and upgrading guide"
```

---

### Task 25: Prepare and cut 1.0.0

**Files:**
- Modify: `packages/vitest-native/package.json` (version bump)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run the full validation suite**

```bash
cd packages/vitest-native && bun run build && bun vitest run && bun run lint && bun run format:check && bun run typecheck
```

All must pass.

- [ ] **Step 2: Run the smoke test**

```bash
bash packages/vitest-native/scripts/smoke-test.sh
```

Must pass.

- [ ] **Step 3: Bump version with changeset**

```bash
bunx changeset
```

Select major version bump to 1.0.0. Write the changeset summary describing the 1.0 milestone.

- [ ] **Step 4: Apply changeset and update CHANGELOG**

```bash
bunx changeset version
```

- [ ] **Step 5: Review CHANGELOG.md**

Verify the 1.0.0 entry includes:
- Summary of all pillar improvements
- Link to upgrading guide
- Stability commitment statement

- [ ] **Step 6: Commit and tag**

```bash
git add .
git commit -m "chore: release vitest-native v1.0.0"
git tag v1.0.0
```

- [ ] **Step 7: Push (with user confirmation)**

```bash
git push origin main --follow-tags
```

This triggers the release workflow which publishes to npm with provenance.

---

## Summary

| Pillar | Tasks | Commits |
|--------|-------|---------|
| 1. Trust Foundation | 1-2 | 2 |
| 2. Conformance Expansion | 3-11 | 9 |
| 3. Documentation | 12-17 | 6 |
| 4. CI Hardening | 18-22 | 5 |
| 5. API Audit & 1.0 Prep | 23-25 | 3 |
| **Total** | **25 tasks** | **~25 commits** |
