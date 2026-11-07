// `value` as a JavaScript string literal for generated code: JSON's escaping, plus the
// characters JSON leaves as they are that could end a script tag or a line in the code
// around it. Every value generated code carries (a module name, a file path) goes through
// this, never through concatenation (lint rule vitest-native/escaped-code-templates).

const UNSAFE_IN_CODE = {
  "<": "\\u003C",
  ">": "\\u003E",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\0": "\\0",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

export function jsString(value) {
  return JSON.stringify(value).replace(
    /[<>\b\f\n\r\t\0\u2028\u2029]/g,
    (char) => UNSAFE_IN_CODE[char] ?? char,
  );
}
