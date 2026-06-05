module.exports = {
  preset: "react-native",
  rootDir: __dirname,
  testMatch: ["<rootDir>/fidelity/*.test.tsx"],
  transformIgnorePatterns: ["node_modules/.bun/(?!(.*react-native))"],
};
