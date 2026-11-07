// vitest-native's own lint rules: mistakes that recurred here, written down where a
// review cannot miss them. Loaded by the root .oxlintrc.json (`jsPlugins`), applied to
// `src/` through its `overrides`. Each rule's passing and failing cases are in
// tests/lint-rules.test.ts; the sites that predate a rule are listed, with a reason
// each, in lint/baseline.json, which may only shrink (tests/lint-baseline.test.ts).
//
// Oxlint's JS plugins are an alpha API outside semver: the rule tests are what show an
// oxlint upgrade broke one.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASELINE = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL("./baseline.json", import.meta.url)), "utf8"),
);
const PACKAGE_DIR = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

/** The file as the baseline names it: relative to the package, forward slashes. */
function packagePath(filename) {
  return path.relative(PACKAGE_DIR, filename).split(path.sep).join("/");
}

/**
 * Report through the baseline: a file listed for a rule may keep exactly its listed
 * number of sites (counted in source order). Any beyond that, and every site in an
 * unlisted file, is reported. So is a count above the file's sites once some are fixed:
 * left in place, it would let a new site in unreported.
 */
function baselined(context, ruleName) {
  const allowed = BASELINE[ruleName]?.[packagePath(context.filename)]?.count ?? 0;
  let seen = 0;
  const report = (descriptor) => {
    seen++;
    if (seen > allowed) context.report(descriptor);
  };
  report.exit = (program) => {
    if (seen >= allowed) return;
    context.report({
      node: program,
      message: `lint/baseline.json lists ${allowed} ${ruleName} site(s) for this file, and it has ${seen}: lower the count to ${seen}${seen === 0 ? " (remove the entry)" : ""}.`,
    });
  };
  return report;
}

const memberName = (node) =>
  node?.type === "MemberExpression" && !node.computed ? node.property.name : null;
const nameOf = (node) =>
  node?.type === "Identifier"
    ? node.name
    : node?.type === "MemberExpression"
      ? memberName(node)
      : null;

// --------------------------------------------------------------------------------------

/**
 * Every real-path call names the spelling it needs. Node's module loader keys its cache
 * by fs.realpathSync's spelling; fs.realpathSync.native returns the OS's (8.3 names
 * expanded on Windows, letter case corrected on case-insensitive disks). Using the wrong
 * one made caches miss and directories fail to contain the files Node reported (see
 * native/root-spelling.mjs and native/match.mjs canonicalDir). A comment on the line
 * above, or on the same line, that mentions "spelling" says which one the call wants
 * and why.
 */
const realpathSpelling = {
  meta: {
    type: "problem",
    messages: {
      spelling:
        "Say which path spelling this {{call}} needs (Node's loader spelling or the OS's) in a comment mentioning 'spelling' on the line above, or use a helper from native/root-spelling.mjs.",
    },
  },
  create(context) {
    const report = baselined(context, "realpath-spelling");
    const source = context.sourceCode;
    const mentions = (comment) => /spelling/i.test(comment.value);
    // The comments directly above `node`: the block ending on the line before it, back
    // through every comment that touches the one after it.
    const blockAbove = (node) => {
      const comments = source.getCommentsBefore(node);
      const block = [];
      let line = node.loc.start.line;
      for (let i = comments.length - 1; i >= 0; i--) {
        if (comments[i].loc.end.line < line - 1) break;
        block.push(comments[i]);
        line = comments[i].loc.start.line;
      }
      return block;
    };
    const STATEMENT = /Statement$|Declaration$/;
    const FUNCTION = /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/;
    const nearestStatement = (node) => {
      for (let at = node.parent; at; at = at.parent) {
        if (STATEMENT.test(at.type) && at.type !== "BlockStatement") return at;
      }
      return null;
    };
    // Where a statement's comments sit: before its `export` if it is exported, and before
    // the statement it shares a first line with (a one-line `if` and its consequent).
    const commentAnchor = (statement) => {
      let at = statement;
      for (;;) {
        if (/^Export(Named|Default)Declaration$/.test(at.parent?.type ?? "")) {
          at = at.parent;
          continue;
        }
        const outer = nearestStatement(at);
        if (outer && outer.loc.start.line === at.loc.start.line) {
          at = outer;
          continue;
        }
        return at;
      }
    };
    // Explained by a comment mentioning "spelling": on the call's own line, in the comment
    // block directly above the statement holding it, or in the comment block (JSDoc
    // included) above a function enclosing it; oxlint has no getJSDocComment. Not by a
    // comment above some outer statement.
    const explained = (node) => {
      const line = node.loc.start.line;
      if (source.getAllComments().some((c) => mentions(c) && c.loc.start.line === line))
        return true;
      const statement = nearestStatement(node);
      if (statement && blockAbove(commentAnchor(statement)).some(mentions)) return true;
      for (let at = node.parent; at; at = at.parent) {
        if (!FUNCTION.test(at.type)) continue;
        const declaration = at.type === "FunctionDeclaration" ? at : nearestStatement(at);
        if (declaration && blockAbove(commentAnchor(declaration)).some(mentions)) return true;
      }
      return false;
    };
    return {
      "Program:exit": report.exit,
      CallExpression(node) {
        const callee = node.callee;
        const isRealpath =
          memberName(callee) === "realpathSync" ||
          (memberName(callee) === "native" && memberName(callee.object) === "realpathSync") ||
          (callee.type === "Identifier" && callee.name === "realpathSync");
        if (!isRealpath || explained(node)) return;
        report({
          node,
          messageId: "spelling",
          data: { call: memberName(callee) === "native" ? "realpathSync.native" : "realpathSync" },
        });
      },
    };
  },
};

// --------------------------------------------------------------------------------------

const ROOTISH = /root|dir$/i;
const isSep = (node) =>
  (node?.type === "Literal" && (node.value === "/" || node.value === "\\")) ||
  (memberName(node) === "sep" && nameOf(node.object) === "path");

/**
 * "Is this file under that root" goes through native/root-spelling.mjs. A raw
 * `file.startsWith(root + path.sep)` or `path.relative(root, file)` compares two
 * spellings of the same directory as strings, and fails when one is the short or
 * differently-cased form (Windows 8.3 names, case-insensitive disks).
 */
const rootContainment = {
  meta: {
    type: "problem",
    messages: {
      startsWith:
        "Path containment by string prefix: use the helpers in native/root-spelling.mjs, which compare one spelling of each path.",
      relative:
        "path.relative against a root decides containment by spelling: use the helpers in native/root-spelling.mjs.",
    },
  },
  create(context) {
    if (packagePath(context.filename) === "src/native/root-spelling.mjs") return {};
    const report = baselined(context, "root-containment");
    const rootPrefix = (arg) => {
      if (arg?.type === "BinaryExpression" && arg.operator === "+") {
        return ROOTISH.test(nameOf(arg.left) ?? "") && isSep(arg.right);
      }
      if (arg?.type === "TemplateLiteral" && arg.expressions.length >= 1) {
        const first = arg.expressions[0];
        const after = arg.quasis[1]?.value.cooked ?? "";
        return (
          arg.quasis[0].value.cooked === "" &&
          ROOTISH.test(nameOf(first) ?? "") &&
          /^[\\/]/.test(after)
        );
      }
      return false;
    };
    return {
      "Program:exit": report.exit,
      CallExpression(node) {
        const callee = node.callee;
        if (memberName(callee) === "startsWith" && rootPrefix(node.arguments[0])) {
          report({ node, messageId: "startsWith" });
        } else if (
          memberName(callee) === "relative" &&
          nameOf(callee.object) === "path" &&
          ROOTISH.test(nameOf(node.arguments[0]) ?? "")
        ) {
          report({ node, messageId: "relative" });
        }
      },
    };
  },
};

// --------------------------------------------------------------------------------------

const TEST_GLOBALS = new Set(["vi", "expect", "jest"]);
const MOCK_METHODS = new Set([
  "mockClear",
  "mockReset",
  "mockRestore",
  "mockImplementation",
  "mockImplementationOnce",
  "withImplementation",
  "mockName",
  "mockReturnValue",
  "mockReturnValueOnce",
  "mockResolvedValue",
  "mockResolvedValueOnce",
  "mockRejectedValue",
  "mockRejectedValueOnce",
  "mockReturnThis",
  "mockThrow",
  "mockThrowOnce",
  "getMockImplementation",
]);

/**
 * No monkey-patching of Vitest. Replacing `vi.*`, `expect.*`, a global `jest`/`vi`/
 * `expect`, or a mock's own methods changes behaviour Vitest relies on elsewhere: a
 * wrapped `mockReset` that re-marked its spy as changed put it back into the set
 * `vi.resetAllMocks()` was iterating, and the loop never ended. Where a Jest semantic
 * needs it (jest-compat), the site is listed in lint/baseline.json with its reason.
 */
const noMonkeyPatching = {
  meta: {
    type: "problem",
    messages: {
      patch:
        "Assigning to {{target}} replaces Vitest's own behaviour. Build the behaviour without patching Vitest, or list the site in lint/baseline.json with the reason.",
    },
  },
  create(context) {
    const report = baselined(context, "no-monkey-patching");
    const targetOf = (left) => {
      if (left?.type !== "MemberExpression") return null;
      const object = left.object;
      const property = memberName(left) ?? "[computed]";
      if (object.type === "Identifier" && TEST_GLOBALS.has(object.name))
        return `${object.name}.${property}`;
      if (
        nameOf(object) === "globalThis" &&
        object.type === "Identifier" &&
        TEST_GLOBALS.has(memberName(left) ?? "")
      ) {
        return `globalThis.${property}`;
      }
      if (MOCK_METHODS.has(memberName(left) ?? "")) return `a mock's ${property}`;
      return null;
    };
    return {
      "Program:exit": report.exit,
      AssignmentExpression(node) {
        const target = targetOf(node.left);
        if (target) report({ node, messageId: "patch", data: { target } });
      },
    };
  },
};

// --------------------------------------------------------------------------------------

const ESCAPE_HELPER = /^escape/i;
const safePart = (node) =>
  node?.type === "Literal" ||
  (node?.type === "TemplateLiteral" && node.expressions.every(safePart)) ||
  (node?.type === "CallExpression" && ESCAPE_HELPER.test(nameOf(node.callee) ?? "")) ||
  (node?.type === "BinaryExpression" &&
    node.operator === "+" &&
    safePart(node.left) &&
    safePart(node.right));

/**
 * A RegExp built from a value escapes that value. A path or package name with `.`, `+`
 * or `(` in it otherwise matches more than itself (the class CodeQL reports as
 * incomplete escaping). Every interpolated part goes through an `escape…` helper.
 */
const escapedRegExp = {
  meta: {
    type: "problem",
    messages: {
      unescaped:
        "This RegExp is built from a value that is not escaped: pass each interpolated part through an escape helper (escapeRe), or build it from literals.",
    },
  },
  create(context) {
    const report = baselined(context, "escaped-regexp");
    const check = (node) => {
      if (nameOf(node.callee) !== "RegExp" || node.callee.type !== "Identifier") return;
      const pattern = node.arguments[0];
      if (!pattern || safePart(pattern)) return;
      // `new RegExp(re.source, flags)` and `new RegExp(existingRegExp)` copy a pattern.
      if (
        memberName(pattern) === "source" ||
        (pattern.type === "Identifier" && /re$|pattern$|regexp?$/i.test(pattern.name))
      )
        return;
      report({ node, messageId: "unescaped" });
    };
    return { "Program:exit": report.exit, NewExpression: check, CallExpression: check };
  },
};

// --------------------------------------------------------------------------------------

const DOC_LINK = /github\.com\/[^/\s]+\/[^/\s]+\/blob\/|(^|[^\w/])docs\/[\w./-]+\.md\b/;

/**
 * Runtime messages link to the documentation site, not to repository files. A
 * `docs/*.md` path or a GitHub blob URL breaks when the file moves, points at `main`
 * rather than the installed version, and is not where users read the docs.
 */
const noDocUrlsInSrc = {
  meta: {
    type: "problem",
    messages: {
      link: "A repository file link in shipped source: link the documentation site instead (it is versioned with the package).",
    },
  },
  create(context) {
    const report = baselined(context, "no-doc-urls-in-src");
    return {
      "Program:exit": report.exit,
      Literal(node) {
        if (typeof node.value === "string" && DOC_LINK.test(node.value))
          report({ node, messageId: "link" });
      },
      TemplateElement(node) {
        if (DOC_LINK.test(node.value.cooked ?? "")) report({ node, messageId: "link" });
      },
    };
  },
};

export default {
  meta: { name: "vitest-native" },
  rules: {
    "realpath-spelling": realpathSpelling,
    "root-containment": rootContainment,
    "no-monkey-patching": noMonkeyPatching,
    "escaped-regexp": escapedRegExp,
    "no-doc-urls-in-src": noDocUrlsInSrc,
  },
};
