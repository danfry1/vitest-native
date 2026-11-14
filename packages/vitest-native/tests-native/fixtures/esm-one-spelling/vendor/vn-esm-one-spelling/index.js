export const made = {};
export const meta = { url: import.meta.url, filename: import.meta.filename, dirname: import.meta.dirname };
export function boom() {
  throw new Error("boom from vn-esm-one-spelling");
}
// After the source-mapped lines: import.meta.resolve names real files (#725).
export const resolved = { self: import.meta.resolve("./index.js"), other: import.meta.resolve("./other.js") };
//# sourceMappingURL=index.js.map
