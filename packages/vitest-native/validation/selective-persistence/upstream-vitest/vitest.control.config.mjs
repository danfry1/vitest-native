import selective from "./vitest.config.mjs";

export default {
  ...selective,
  test: {
    ...selective.test,
    runner: undefined,
  },
};
