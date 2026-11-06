// One of two modules that 14-mock-meta-a and 15-mock-meta-b mock in opposite ways:
// each file mocks one with a factory and automocks the other. A module mocked with a
// factory is kept as a placeholder node that remembers the factory, and the hot
// runtime keeps the module graph across files, so the second file to run must still
// get an automock where it asks for one, not the first file's factory. The pair is
// symmetric so the check holds whichever runs first.
//
// Only those two files import this module and mock-meta-y: a file that imports either
// without mocking it, run between the pair, refetches it and hides the leak from
// whichever of the pair runs next. 16-mock-meta-real has a module of its own for that
// reason (mock-meta-z).
export const owner = (): string => "real-x";
