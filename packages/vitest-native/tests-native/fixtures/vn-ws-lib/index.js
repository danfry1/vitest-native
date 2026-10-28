// A workspace library, linked from outside node_modules, whose directory is not named
// after the package.
exports.read = () => require("./native").read();
