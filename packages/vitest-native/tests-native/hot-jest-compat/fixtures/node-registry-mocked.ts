// Mocked with jest.mock and read through require(), which jest-compat's per-file
// Node-side registry serves. Never imported, so only Node ever loads it.
export const value = () => "real-node-registry";
