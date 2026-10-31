// CommonJS that requires the mocked module while its factory is still loading it.
let attempt;
try {
  attempt = { value: require("../requires-back") };
} catch (error) {
  attempt = { error };
}
exports.attempt = attempt;
