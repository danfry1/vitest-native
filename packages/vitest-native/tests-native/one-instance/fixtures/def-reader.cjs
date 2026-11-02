// Babel's CommonJS interop: `__esModule` decides whether `default` is the export or the module.
module.exports = () => {
  const m = require("./def");
  const interop = m && m.__esModule ? m : { default: m };
  return { esModule: m.__esModule, named: m.named, call: interop.default() };
};
