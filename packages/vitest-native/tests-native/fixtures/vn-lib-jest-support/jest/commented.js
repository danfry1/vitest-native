/*
export of the library's helpers, for tests; import them from here.
*/
module.exports = { isLibraryJest: typeof jest !== "undefined" && jest !== globalThis.jest };
