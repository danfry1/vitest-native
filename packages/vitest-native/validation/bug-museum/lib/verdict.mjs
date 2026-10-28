// How an exhibit's failure becomes "the bug" or "unexpected". The rules have one owner:
// the config-axis matrix's verdict.mjs (validation/config-axes/verdict.mjs). An exhibit is
// judged there as a probe with one known-failing entry: its `bugSignature` is the entry's
// `failure`, its `consequences` the entry's `consequences`. So:
//
//   - the signature may not match a generic line (a crash, a lost file, an unrelated
//     TypeError, a timeout: genericFailureLines, plus MUSEUM_GENERIC below);
//   - a consequence (a lost file, an unexplained exit code) is accepted only beside a line
//     the signature matched;
//   - EVERY failure line must be accounted for, or the verdict is "unexpected";
//   - an exhibit whose every file is lost is "unexpected", unless it declares
//     `bugPreventsEveryFile` (its bug rejects the configuration before any file runs; its
//     signature must then match the rejection itself).
//
// Failure lines carry the file and the message, never the test's title (lines.mjs), so a
// signature cannot match an exhibit's own wording of what it expects.
import { consequenceShapedLines, genericFailureLines, judge } from "../../config-axes/verdict.mjs";

// What the review used to show signatures matching unrelated failures, in the shapes the
// museum's lines take (file: message).
const MUSEUM_GENERIC = (file) => [
  `${file}: Error: Test timed out in 10000ms.`,
  `${file}: Error: Hook timed out in 10000ms.`,
  `${file}: TypeError: foo is not a function`,
  `${file}: TypeError: Cannot read properties of undefined (reading 'x')`,
  `${file}: AssertionError: expected undefined to be 'x' // Object.is equality`,
  `${file}: AssertionError: expected 1 to be 2 // Object.is equality`,
  `${file}: SyntaxError: Unexpected token '<'`,
  `${file}: Error: Unable to find an element with text: something`,
  `${file}: ReferenceError: something is not defined`,
  `${file}: __museumUnrelated.installTimersShim is not a function`,
  "check.mjs: something unrelated",
];

/** Every generic line for an exhibit with test files `files`, with and without a title. */
export function genericLines(files) {
  const lines = genericFailureLines({ files });
  const untitled = lines.map((line) => line.replace(/^([^:]+): a test: /, "$1: "));
  return [...new Set([...lines, ...untitled, ...files.flatMap(MUSEUM_GENERIC)])];
}

const errorOnly = (files) => {
  const consequences = new Set(consequenceShapedLines({ files }));
  return genericLines(files).filter((line) => !consequences.has(line));
};

/** Problems with an exhibit's signature fields, as lines (empty when it is sound). */
export function validateSignature(exhibit, files) {
  const at = `${exhibit.id}:`;
  const problems = [];
  if (typeof exhibit.bugSignature !== "string" || exhibit.bugSignature === "")
    return [`${at} every exhibit needs a bugSignature (a regex for its bug's own failure line)`];
  let signature;
  try {
    signature = new RegExp(exhibit.bugSignature);
  } catch (error) {
    return [`${at} bugSignature is not a regular expression: ${error.message}`];
  }
  const absorbs = genericLines(files).filter((line) => signature.test(line));
  if (absorbs.length > 0)
    problems.push(
      `${at} bugSignature also matches generic lines: ${absorbs.map((l) => JSON.stringify(l)).join(", ")}`,
    );
  if (exhibit.consequences !== undefined) {
    let consequences;
    try {
      consequences = new RegExp(exhibit.consequences);
    } catch (error) {
      return [...problems, `${at} consequences is not a regular expression: ${error.message}`];
    }
    const wide = errorOnly(files).filter((line) => consequences.test(line));
    if (wide.length > 0)
      problems.push(
        `${at} consequences may match only lost files and exit codes, not: ${wide.map((l) => JSON.stringify(l)).join(", ")}`,
      );
  }
  return problems;
}

/**
 * "bug" when every failure line is the exhibit's bug or its consequence, else
 * "unexpected", with the lines nothing accounts for.
 */
export function classify(exhibit, files, failures) {
  const entry = {
    probe: exhibit.id,
    failure: exhibit.bugSignature,
    consequences: exhibit.consequences,
    fixedBy: exhibit.fixedBy,
  };
  const verdict = judge(
    [entry],
    exhibit.id,
    {},
    {
      status: "fail",
      failures,
      files: exhibit.bugPreventsEveryFile ? [] : files,
    },
  );
  return verdict.outcome === "known"
    ? { matchesBug: true }
    : { matchesBug: false, why: verdict.message };
}
