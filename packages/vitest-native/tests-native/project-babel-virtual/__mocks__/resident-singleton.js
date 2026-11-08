// A root manual mock of an installed package: jest-compat applies it with no jest.mock()
// call, through a setup module that exists only as an id under this root (#566).
module.exports = { record: () => {}, count: () => -1 };
