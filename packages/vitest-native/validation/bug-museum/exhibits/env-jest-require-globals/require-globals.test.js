// A CommonJS test requiring @jest/globals, as react-native-paper's src/babel/__tests__ does.
// The real package is not installed here: without jest-compat's shim the require fails
// with "Cannot find module", where with it installed it throws "Do not import
// @jest/globals outside of the Jest test environment".
test("require('@jest/globals') gives the jest-compat globals", () => {
  let outcome;
  try {
    const globals = require("@jest/globals");
    outcome = globals.jest === jest && typeof globals.expect === "function" ? "the shim" : "something else";
  } catch (error) {
    outcome = `throws: ${String(error.message).split("\n")[0]}`;
  }
  expect(outcome, "require('@jest/globals')").toBe("the shim");
});
