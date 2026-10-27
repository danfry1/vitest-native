// The project's own Vitest config. compare keeps it as written, adding only a
// snapshot directory of Vitest's own when it sets none.
export default {
  test: {
    globals: true,
    include: ["**/*.check.js"],
    exclude: ["**/node_modules/**", "src/jest-only.check.js"],
  },
};
