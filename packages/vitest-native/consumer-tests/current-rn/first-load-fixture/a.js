// Two entries in one directory re-export the same stateful leaf, and each is
// imported for the first time by a different test file (hot-c, hot-d). The second
// entry's first load goes through Node's CommonJS translator, which looks
// './leaf.js' up from this directory, where the first file's lookup was recorded.
// Without the hot reset's CJS lookup drain that lookup is stale after the per-file
// reset, and the entry's named exports or fresh state are lost.
module.exports = require("./leaf.js");
