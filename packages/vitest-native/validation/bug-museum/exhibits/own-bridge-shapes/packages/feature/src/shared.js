// A Node-loaded helper. Node records whoever loads it first as its parent (the test, here),
// which is not who calls it later.
exports.requireSx = () => require("@m/validator/sx");
