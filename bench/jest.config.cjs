module.exports = {
  preset: "@react-native/jest-preset",
  rootDir: __dirname,
  testMatch: ["<rootDir>/shared/*.test.tsx"],
  transformIgnorePatterns: ["node_modules/.bun/(?!(.*react-native))"],
};
