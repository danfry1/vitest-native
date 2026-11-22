// A manual mock that loads its own package and changes one export, as many do. While it
// runs, Jest gives its require of the package the real module, not the mock (#566 review).
const real = require("dispatch-target-lib");
module.exports = { ...real, source: "the mock over the real module" };
