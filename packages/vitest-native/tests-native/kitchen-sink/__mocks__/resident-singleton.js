// A root manual mock of an installed package: Jest applies it with no jest.mock() call.
let calls = 0;
module.exports = { count: () => ++calls, source: "root manual mock" };
