// A support file of an ES module package ("type": "module") that mentions jest but has no
// import or export: Node loads it as an ES module, where `module` is undefined.
globalThis.__vnEsmSupportFormat = typeof module === "undefined" ? "esm" : "cjs";
globalThis.__vnEsmSupportSawJest = typeof jest;
