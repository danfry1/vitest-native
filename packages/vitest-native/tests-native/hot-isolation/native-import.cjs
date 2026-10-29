// Node's own import(), for a test that must reach the engine's ESM loader rather than
// Vite's module runner: a file Node loads as CommonJS keeps Node's dynamic import.
module.exports = (url) => import(url);
