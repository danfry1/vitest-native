// tslib's Node ESM wrapper shape: an ES module default-importing CommonJS that sets
// __esModule and has no `default`. Node gives the import the whole module.exports.
import tslib from "./cjs/tslib.js";

export const callExtends = () => tslib.__extends();
