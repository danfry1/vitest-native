// What a workspace assembled from this package's own install (run.mjs --link-deps, and the
// bug museum's exhibits) leaves out, so that it holds what a registry install of the
// workspace would hold.
//
// Expo's packages: this package installs expo for its own Expo tests (#426). A workspace
// that does not declare expo would not have it after an install, and with Expo in
// node_modules the engine detects it, so every build before #432 fails on Expo's runtime
// instead of what the run measures.
export const isExpoPackage = (name) => name === "expo" || /^(expo-|@expo\/)/.test(name);
