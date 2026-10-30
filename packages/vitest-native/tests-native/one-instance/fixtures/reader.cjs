// A CommonJS project module, loaded by Node, that reads the store the test imported.
module.exports = () => require("./store").state.value;
