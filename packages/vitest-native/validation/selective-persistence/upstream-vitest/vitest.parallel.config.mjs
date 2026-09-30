import selective from "./vitest.config.mjs";

export default {
  ...selective,
  test: {
    ...selective.test,
    fileParallelism: true,
    maxWorkers: 2,
    minWorkers: 2,
    sequence: undefined,
  },
};
