// The project's own src/api/mock (no package.json of its own: it is the project's).
module.exports = { isLibraryJest: typeof jest !== "undefined" && jest !== globalThis.jest };
