// A runtime file of the package (not a support entry), first required by a later test
// file: once the package's support is active, its @jest/globals is the library's.
module.exports = { hasJest: require("@jest/globals").jest !== undefined };
