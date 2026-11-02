// tsc CommonJS output: exports.default is assigned after the require that cycles back.
Object.defineProperty(exports, "__esModule", { value: true });
const m = require("../m.js");
exports.default = function a() {
  return "a-default";
};
exports.viaM = () => m.callA();
