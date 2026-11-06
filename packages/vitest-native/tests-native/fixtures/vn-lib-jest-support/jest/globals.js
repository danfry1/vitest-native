// The test API a support file reads from @jest/globals.
const globals = require("@jest/globals");
module.exports = {
  names: Object.keys(globals)
    .filter((k) => k !== "__esModule" && k !== "default")
    .sort(),
};
