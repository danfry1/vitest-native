// Loaded only through Node: a trailing separator names the directory, and a directory
// with a package.json resolves through its main field, as under Node and Metro.
export const resolved = (): string[] => [require("./lib/").which, require("./pkgdir").which];
