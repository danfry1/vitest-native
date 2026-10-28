// Which file Metro's platform resolution picks for `./platform`: `.native.js` on iOS and
// Android. The engine resolves it the same way unless a library's Jest resolver narrows
// the extensions, which worklets' does for any directory whose path contains its name.
exports.platform = require("./platform");
