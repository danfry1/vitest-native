// A node_modules package holding module-level state — a store, a client, a cache.
// Under a hot worker this is the state that used to survive from one test file into
// the next, where stock isolation gives every file a fresh copy.
const state = { writes: [] };
module.exports = {
  record: (value) => state.writes.push(value),
  count: () => state.writes.length,
};
