// Baseline: jest re-requires the full module graph (incl. RN) per file, so both
// leakage classes must come back clean. This proves the corpus is correct — a
// faithful isolator passes every file.
module.exports = {
  preset: "react-native",
  rootDir: __dirname,
  testMatch: ["<rootDir>/leak/*.test.tsx"],
  transformIgnorePatterns: ["node_modules/.bun/(?!(.*react-native))"],
};
