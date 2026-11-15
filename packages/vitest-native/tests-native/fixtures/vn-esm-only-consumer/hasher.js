// An `import` condition whose own branch picks `module-sync`, which Node's ESM loader
// applies by default, over `default`.
export { source } from "vn-esm-only-lib/hasher";
