// Node-loaded CommonJS that calls what legacy.js exports.
const legacy = require("./legacy");

module.exports = () => legacy();
