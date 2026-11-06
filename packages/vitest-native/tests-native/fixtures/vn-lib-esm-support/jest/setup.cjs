// A CommonJS support file in an ES module package: Node loads `.cjs` as CommonJS, so it
// gets the library's jest (whose built implementations survive a reset); and Node's module
// arguments reach it.
const built = jest.fn();
built.mockReturnValue("library jest");
module.exports = { sawJest: typeof jest, args: arguments.length, built };
