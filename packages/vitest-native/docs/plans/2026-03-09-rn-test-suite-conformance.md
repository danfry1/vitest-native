# RN Test Suite Conformance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port 5 React Native test files to run against vitest-native's mocks, proving behavioral parity with RN's own assertions.

**Architecture:** Install `flow-remove-types`, write a transform script that strips Flow + rewrites imports/jest→vi, then manually adapt each file. Ported tests live in `tests/rn-conformance/` and run as part of the normal test suite.

**Tech Stack:** flow-remove-types, vitest, TypeScript

---

### Task 1: Install flow-remove-types

**Files:**
- Modify: `package.json`

**Step 1: Install the dependency**

Run: `cd /Users/danielfry/dev/vitest-react-native && bun add -D flow-remove-types --filter vitest-native`

If that doesn't work with workspaces:
Run: `cd /Users/danielfry/dev/vitest-react-native/packages/vitest-native && bun add -D flow-remove-types`

**Step 2: Verify installation**

Run: `cd /Users/danielfry/dev/vitest-react-native/packages/vitest-native && npx flow-remove-types --version`
Expected: Version number printed

**Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore: add flow-remove-types dev dependency"
```

---

### Task 2: Create the transform script

**Files:**
- Create: `scripts/port-rn-tests.ts`

**Step 1: Write the script**

The script should:
1. Accept a source file path (RN test file) and output directory
2. Read the file
3. Strip Flow types using `flow-remove-types`
4. Replace `jest.fn()` → `vi.fn()`, `jest.spyOn()` → `vi.spyOn()`, `jest.mock()` → `vi.mock()`
5. Remove `'use strict';` directives
6. Remove Flow comment directives (`// @flow`, `// $FlowFixMe`, `// $FlowExpectedError`)
7. Add `import { describe, it, expect, vi } from "vitest";` at top
8. Write to output path

```typescript
#!/usr/bin/env node
/**
 * Ports React Native test files to Vitest format:
 * 1. Strips Flow type annotations
 * 2. Replaces jest.* → vi.*
 * 3. Cleans up Flow directives
 *
 * Usage: bun scripts/port-rn-tests.ts <input-file> <output-file>
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import flowRemoveTypes from "flow-remove-types";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error("Usage: bun scripts/port-rn-tests.ts <input> <output>");
  process.exit(1);
}

let source = readFileSync(inputPath, "utf-8");

// 1. Strip Flow types
source = flowRemoveTypes(source, { all: true }).toString();

// 2. Remove 'use strict' directives
source = source.replace(/^'use strict';\s*\n/gm, "");

// 3. Remove Flow comment directives
source = source.replace(/\s*\/\/\s*\$Flow\w+(\[[\w-]+\])?.*/g, "");
source = source.replace(/\s*\/\*\s*\$Flow\w+.*?\*\//g, "");
source = source.replace(/^\s*\*\s*@flow.*$/gm, "");
source = source.replace(/^\s*\*\s*@format.*$/gm, "");

// 4. Replace jest.* → vi.*
source = source.replace(/\bjest\.fn\b/g, "vi.fn");
source = source.replace(/\bjest\.spyOn\b/g, "vi.spyOn");
source = source.replace(/\bjest\.mock\b/g, "vi.mock");
source = source.replace(/\bjest\.resetModules\b/g, "vi.resetModules");
source = source.replace(/\bjest\.restoreAllMocks\b/g, "vi.restoreAllMocks");

// 5. Clean up empty comment blocks
source = source.replace(/\/\*\*\s*\*\s*Copyright.*?(?:\*\/)/s, "");
source = source.replace(/^\s*\n{3,}/gm, "\n\n");

// 6. Write output
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, source.trim() + "\n");
console.log(`Ported: ${inputPath} → ${outputPath}`);
```

**Step 2: Make it executable and test on a simple file**

Run: `cd /Users/danielfry/dev/vitest-react-native/packages/vitest-native && bun scripts/port-rn-tests.ts /tmp/rn-tests/packages/react-native/Libraries/Animated/__tests__/Easing-test.js /tmp/easing-test-output.ts`

Expected: File written, check output looks clean (no Flow types, vi.fn instead of jest.fn)

Run: `cat /tmp/easing-test-output.ts | head -30`

Expected: Clean TypeScript-compatible output with no Flow annotations

**Step 3: Commit**

```bash
git add scripts/port-rn-tests.ts
git commit -m "feat: add RN test porting script (flow strip + jest→vi)"
```

---

### Task 3: Port Easing-test.js

**Files:**
- Create: `tests/rn-conformance/rn-Easing.test.ts`

**Step 1: Run the transform script**

Run: `cd /Users/danielfry/dev/vitest-react-native/packages/vitest-native && bun scripts/port-rn-tests.ts /tmp/rn-tests/packages/react-native/Libraries/Animated/__tests__/Easing-test.js tests/rn-conformance/rn-Easing.test.ts`

**Step 2: Manually fix the import**

Replace:
```typescript
import Easing from '../Easing';
```
With:
```typescript
import { describe, it, expect } from "vitest";
import { Easing } from "react-native";
```

Remove the helper function's Flow type annotation if any remain:
```typescript
// Change: function sampleEasingFunction(easing: number => number)
// To:     function sampleEasingFunction(easing: (t: number) => number)
```

**Step 3: Run the tests**

Run: `cd /Users/danielfry/dev/vitest-react-native/packages/vitest-native && bun vitest run tests/rn-conformance/rn-Easing.test.ts`

Expected: All tests pass. If any fail, investigate — each failure is either:
- A real behavioral gap in our Easing mock (fix the mock)
- A type annotation issue from Flow stripping (fix the test)

**Step 4: Commit**

```bash
git add tests/rn-conformance/rn-Easing.test.ts
git commit -m "feat: port RN Easing tests — all assertions pass against our mock"
```

---

### Task 4: Port bezier-test.js

**Files:**
- Create: `tests/rn-conformance/rn-bezier.test.ts`

**Step 1: Run the transform script**

Run: `cd /Users/danielfry/dev/vitest-react-native/packages/vitest-native && bun scripts/port-rn-tests.ts /tmp/rn-tests/packages/react-native/Libraries/Animated/__tests__/bezier-test.js tests/rn-conformance/rn-bezier.test.ts`

**Step 2: Manually fix the import**

Replace:
```typescript
import bezier from '../bezier';
```
With:
```typescript
import { describe, it, expect } from "vitest";
import { Easing } from "react-native";

const bezier = Easing.bezier;
```

Remove Flow type annotations from helper functions:
- `(x: number)` → `(x: number)` (these are valid TS, keep them)
- `$FlowFixMe` comments → remove
- `(assertion: $FlowFixMe)` → `(assertion?: any)`

**Step 3: Run the tests**

Run: `cd /Users/danielfry/dev/vitest-react-native/packages/vitest-native && bun vitest run tests/rn-conformance/rn-bezier.test.ts`

Expected: All tests pass — our bezier is the same implementation as RN's.

**Step 4: Commit**

```bash
git add tests/rn-conformance/rn-bezier.test.ts
git commit -m "feat: port RN bezier tests — validates our cubic bezier implementation"
```

---

### Task 5: Port flattenStyle-test.js

**Files:**
- Create: `tests/rn-conformance/rn-flattenStyle.test.ts`

**Step 1: Run the transform script**

Run: `cd /Users/danielfry/dev/vitest-react-native/packages/vitest-native && bun scripts/port-rn-tests.ts /tmp/rn-tests/packages/react-native/Libraries/StyleSheet/__tests__/flattenStyle-test.js tests/rn-conformance/rn-flattenStyle.test.ts`

**Step 2: Manually fix imports**

Replace:
```typescript
const flattenStyle = require('../flattenStyle').default;
const StyleSheet = require('../StyleSheet').default;
```
With:
```typescript
import { describe, it, expect } from "vitest";
import { StyleSheet } from "react-native";

const flattenStyle = StyleSheet.flatten;
```

**Step 3: Review test expectations**

Key behavioral checks from RN's tests:
- `flattenStyle(null)` returns `undefined` and is reference-stable (same object each time) — **our mock returns `undefined` for null, check reference stability**
- `flattenStyle(style)` where style is a plain object returns the same reference — **our mock does this**
- Override with `undefined` keeps the key: `{backgroundColor: undefined}` — **check this**
- Override with `null` keeps the key: `{width: null}` — **check this**

The test "should ignore invalid class names" passes a number (1234) as a style — skip this test (it's testing RN's internal style registry IDs which we don't have).

**Step 4: Run the tests**

Run: `cd /Users/danielfry/dev/vitest-react-native/packages/vitest-native && bun vitest run tests/rn-conformance/rn-flattenStyle.test.ts`

Expected: Most tests pass. The "not allocate an object when there is no style" test checks `flattenStyle(null) === flattenStyle(null)` — this may fail if our mock creates new `undefined` each time (which is fine since `undefined === undefined` is true). The "invalid class names" test should be skipped.

**Step 5: Fix any failures**

If `flattenStyle([style1, style2])` where style2 has `{width: null}` doesn't preserve `null`, fix `flattenImpl` in `src/mocks/apis/StyleSheet.ts` — `Object.assign` should handle this correctly.

**Step 6: Commit**

```bash
git add tests/rn-conformance/rn-flattenStyle.test.ts
# If mock was fixed:
git add src/mocks/apis/StyleSheet.ts
git commit -m "feat: port RN flattenStyle tests — validates style merging behavior"
```

---

### Task 6: Port processColor-test.js

**Files:**
- Create: `tests/rn-conformance/rn-processColor.test.ts`

**Step 1: Run the transform script**

Run: `cd /Users/danielfry/dev/vitest-react-native/packages/vitest-native && bun scripts/port-rn-tests.ts /tmp/rn-tests/packages/react-native/Libraries/StyleSheet/__tests__/processColor-test.js tests/rn-conformance/rn-processColor.test.ts`

**Step 2: Manually fix imports and skip platform tests**

Replace the entire import block:
```typescript
const {OS} = require('../../Utilities/Platform').default;
const PlatformColorAndroid = ...
const PlatformColorIOS = ...
const DynamicColorIOS = ...
const processColor = require('../processColor').default;
```
With:
```typescript
import { describe, it, expect } from "vitest";
import { processColor } from "react-native";
```

Remove the `platformSpecific` wrapper — our mock always returns unsigned (iOS behavior):
```typescript
// Remove this:
const platformSpecific = OS === 'android' ? (unsigned: number) => unsigned | 0 : x => x;

// In tests, replace platformSpecific(expectedInt) with just expectedInt >>> 0
```

Delete the entire `iOS` and `Android` describe blocks (lines ~97-124) — these test PlatformColor/DynamicColorIOS which we don't mock.

**Step 3: Verify our processColor returns the right format**

RN's tests expect:
- `processColor('red')` → `0xffff0000` (ARGB as unsigned 32-bit)
- `processColor('rgb(10, 20, 30)')` → `0xff0a141e`
- `processColor('rgba(10, 20, 30, 0.4)')` → `0x660a141e`
- `processColor('hsl(318, 69%, 55%)')` → `0xffdb3dac`
- `processColor('hsla(318, 69%, 55%, 0.25)')` → `0x40db3dac`
- `processColor('#1e83c9')` → `0xff1e83c9`

Check if our processColor handles HSL/HSLA — if not, this will be a gap to fix.

**Step 4: Run the tests**

Run: `cd /Users/danielfry/dev/vitest-react-native/packages/vitest-native && bun vitest run tests/rn-conformance/rn-processColor.test.ts`

Expected: Named colors, RGB, RGBA, hex pass. HSL/HSLA may fail if not implemented.

**Step 5: Fix any gaps**

If HSL/HSLA fails, add HSL support to `src/mocks/apis/processColor.ts`. The conversion formula:
1. Parse `hsl(h, s%, l%)` and `hsla(h, s%, l%, a)`
2. Convert HSL → RGB using standard algorithm
3. Pack as ARGB

**Step 6: Commit**

```bash
git add tests/rn-conformance/rn-processColor.test.ts
# If mock was fixed:
git add src/mocks/apis/processColor.ts
git commit -m "feat: port RN processColor tests — validates color format conversions"
```

---

### Task 7: Port Interpolation-test.js (adapted)

**Files:**
- Create: `tests/rn-conformance/rn-Interpolation.test.ts`

**Step 1: Run the transform script**

Run: `cd /Users/danielfry/dev/vitest-react-native/packages/vitest-native && bun scripts/port-rn-tests.ts /tmp/rn-tests/packages/react-native/Libraries/Animated/__tests__/Interpolation-test.js tests/rn-conformance/rn-Interpolation.test.ts`

**Step 2: Rewrite the createInterpolation helper**

RN's test creates an `AnimatedInterpolation` directly. We need to use our public API:

Replace:
```typescript
import AnimatedInterpolation from '../nodes/AnimatedInterpolation';
import Easing from '../Easing';
// ...
function createInterpolation(config) {
  let parentValue = null;
  const interpolation = new AnimatedInterpolation(
    {__getValue: () => parentValue},
    config,
  );
  return input => {
    parentValue = input;
    return interpolation.__getValue();
  };
}
```
With:
```typescript
import { describe, it, expect, vi } from "vitest";
import { Animated, Easing } from "react-native";

function createInterpolation(config: any) {
  return (input: number) => {
    const val = new Animated.Value(input);
    const interp = val.interpolate(config);
    return interp.getValue();
  };
}
```

**Step 3: Identify which tests to keep vs skip**

KEEP (numeric ranges, our mock supports):
- "should work with defaults"
- "should work with output range"
- "should work with input range"
- "should work with keyframes without extrapolate" (if our mock supports multi-segment)
- "should work with keyframes with extrapolate" (if our mock supports clamping)

SKIP (features our mock doesn't implement):
- "should throw for non monotonic input ranges" — we don't validate
- "should work with empty input range" — edge case with duplicate inputs
- "should work with easing" — our interpolation doesn't support easing param
- "should work with extrapolate" — our mock always clamps, doesn't support extend/identity
- "should throw for an infinite input range" — we don't validate
- "should work with negative/positive infinite" — we don't support Infinity ranges
- "should work with output ranges as string" — string interpolation not implemented
- All string/color/PlatformColor tests — not implemented
- "should convert %s to numbers in the native config" — uses `__getNativeConfig()` internal

Add `it.skip()` for tests that test features we don't support, with a comment:
```typescript
// Skip: our mock doesn't support string output range interpolation
it.skip("should work with output ranges as string", () => { ... });
```

**Step 4: Run the tests**

Run: `cd /Users/danielfry/dev/vitest-react-native/packages/vitest-native && bun vitest run tests/rn-conformance/rn-Interpolation.test.ts`

Expected: Kept tests pass, skipped tests are noted. If multi-segment interpolation fails, fix our interpolation implementation.

**Step 5: Commit**

```bash
git add tests/rn-conformance/rn-Interpolation.test.ts
# If mock was fixed:
git add src/mocks/apis/Animated.ts
git commit -m "feat: port RN Interpolation tests — validates numeric interpolation behavior"
```

---

### Task 8: Verify full suite and update README

**Files:**
- Modify: `README.md`

**Step 1: Run the full test suite**

Run: `cd /Users/danielfry/dev/vitest-react-native/packages/vitest-native && bun vitest run`

Expected: All tests pass, including the new rn-conformance tests.

**Step 2: Count the conformance tests**

Run: `cd /Users/danielfry/dev/vitest-react-native/packages/vitest-native && bun vitest run tests/rn-conformance/ --reporter=verbose 2>&1 | tail -5`

Note the number of passing tests from RN's own suite.

**Step 3: Add conformance section to README**

Add a section like:
```markdown
## React Native Test Suite Conformance

vitest-native ports tests directly from React Native's own test suite to validate mock behavioral parity. These tests are the same assertions Meta uses to verify React Native itself:

- **Easing** — all 20 easing curve tests with exact sample data
- **Bezier** — cubic bezier mathematical properties (symmetry, projection, boundary conditions)
- **flattenStyle** — style merging, override precedence, reference identity
- **processColor** — named colors, RGB, RGBA, HSL, HSLA, hex → ARGB conversion
- **Interpolation** — numeric range mapping, multi-segment, clamping
```

**Step 4: Commit**

```bash
git add README.md tests/rn-conformance/
git commit -m "feat: add RN test suite conformance section to README"
```

---

### Task 9: Lint and final verification

**Step 1: Run lint**

Run: `cd /Users/danielfry/dev/vitest-react-native/packages/vitest-native && bun run lint`

Expected: No errors. Fix any lint issues in the ported tests.

**Step 2: Run typecheck**

Run: `cd /Users/danielfry/dev/vitest-react-native/packages/vitest-native && bun run typecheck`

Expected: No errors.

**Step 3: Run full suite one final time**

Run: `cd /Users/danielfry/dev/vitest-react-native/packages/vitest-native && bun vitest run`

Expected: All tests pass.

**Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "chore: lint and typecheck fixes for RN conformance tests"
```
