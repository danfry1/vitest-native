// 14-mock-meta-a and 15-mock-meta-b both mock this module with a factory, and
// 16-mock-meta-real imports it unmocked: the placeholder a factory mock leaves in the
// module graph is empty code, and must not be served as the module itself to a later
// file that mocks nothing. See mock-meta-x.ts for why this is not mock-meta-x itself.
export const owner = (): string => "real-z";
